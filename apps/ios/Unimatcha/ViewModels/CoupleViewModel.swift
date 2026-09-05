import Foundation
import SwiftUI
import Combine

// MARK: - CoupleViewModel (h5-couple.md §1.1, §2, §3, §4) — WP-12
//
// The Couple Space is not an overlay: it is the content of the Romantic pane once the romantic
// match reaches `relationship` (PLAN §A.2.5). This view model owns the whole module's state
// (H5 `S.coupleMatchId` / `S.coupleSpace`) and every write.
//
// Rules ported verbatim:
//  * every mutation returns the **full space** → replace the model, never patch, never re-GET
//    (h5-couple §2.11, gotcha 6);
//  * failures toast `Failed: {message}` and leave the previous space on screen;
//  * "Send I love you" is guarded by an in-flight flag *and* the disabled CTA (§2.9);
//  * `sentToday` is server-UTC — never derived locally (gotcha 3);
//  * photos upload at pick time (orphans on cancel are accepted, gotcha 8), sequentially, with an
//    exact partial-failure count;
//  * H5 leaks `S.coupleMatchId` / `S.coupleSpace` across accounts (§4 "Cleanup") — iOS clears
//    everything on `.sessionDidReset`.

@MainActor
final class CoupleViewModel: ObservableObject {
    static let shared = CoupleViewModel()

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed
    }

    @Published private(set) var space: CoupleSpace?
    @Published private(set) var phase: Phase = .idle
    /// Mirrors the H5 `disabled` CTA while `POST /love-you` is in flight.
    @Published private(set) var loveYouInFlight = false

    private(set) var matchId: String = ""
    /// `/matching/status` partner — dead state in H5 (gotcha 20); iOS uses it only as the
    /// fall-back user id for the avatar tap before the space has loaded.
    private(set) var fallbackPartner: PublicProfile?

    private var generation = 0
    private var resetObserver: NSObjectProtocol?

    init() {
        resetObserver = NotificationCenter.default.addObserver(forName: .sessionDidReset, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.reset() }
        }
    }

    // MARK: Lifecycle

    /// Entering the Romantic pane in `relationship` state (H5 `renderCoupleSpace`). A different
    /// match clears the cache first; an already-loaded space is kept (no redundant fetch).
    func activate(matchId newId: String, partner: PublicProfile?) async {
        fallbackPartner = partner
        if newId != matchId {
            matchId = newId
            space = nil
            phase = .idle
        }
        guard !matchId.isEmpty else {
            phase = .failed
            return
        }
        if space == nil && phase != .loading {
            await load()
        }
    }

    /// `loadCoupleSpace()` — also the `Retry` link in the error state.
    func load() async {
        guard !matchId.isEmpty else {
            phase = .failed
            return
        }
        generation += 1
        let gen = generation
        let id = matchId
        if space == nil { phase = .loading }
        do {
            let fresh = try await CoupleService.space(matchId: id)
            guard gen == generation, id == matchId else { return }
            space = fresh
            phase = .loaded
        } catch {
            guard gen == generation, id == matchId else { return }
            if let api = error as? APIError, api.isUnauthorized { return }   // session teardown follows
            phase = .failed
        }
    }

    /// Re-entering the Romantic pane. H5 rebuilds the pane on every `switchHomeView('romantic')`
    /// (`ensureQuestionnaireThenMatch → loadMatchTab → renderCoupleSpace → loadCoupleSpace`), so the
    /// partner's status / craving / schedule are re-read each time. iOS keeps all three panes mounted,
    /// so the pane entry has to ask for it explicitly — silently, keeping the current hub on screen
    /// (H5 flashes `Loading your space…`; a flash on every horizontal swipe would be strictly worse).
    func refreshOnPaneEnter() async {
        guard !matchId.isEmpty, space != nil, phase != .loading else { return }
        await load()
    }

    func reset() {
        generation += 1
        space = nil
        phase = .idle
        matchId = ""
        fallbackPartner = nil
        loveYouInFlight = false
    }

    // MARK: Derived

    var partnerName: String { space?.partnerDisplayName ?? L10n.t("Partner") }

    /// Public profile target for the hero avatar tap.
    var partnerUserId: String? {
        let fromSpace = space?.partner.userId ?? ""
        if !fromSpace.isEmpty { return fromSpace }
        let fromMatch = fallbackPartner?.userId ?? ""
        return fromMatch.isEmpty ? nil : fromMatch
    }

    // MARK: Write plumbing (`coupleApi`)

    /// Runs a mutation and replaces the space with its response; on failure toasts
    /// `Failed: {message}` (H5 fallback text `try again`) and keeps the current render.
    @discardableResult
    func run(_ op: @escaping (String) async throws -> CoupleSpace) async -> Bool {
        let id = matchId
        guard !id.isEmpty else { return false }
        do {
            let fresh = try await op(id)
            guard id == matchId else { return false }
            space = fresh
            phase = .loaded
            return true
        } catch {
            guard id == matchId else { return false }
            if let api = error as? APIError, api.isUnauthorized { return false }
            ToastCenter.shared.show(L10n.t("Failed: ") + failureText(error))
            return false
        }
    }

    private func failureText(_ error: Error) -> String {
        if let api = error as? APIError { return api.message }
        let m = (error as NSError).localizedDescription
        return m.isEmpty ? L10n.pick("try again", "请重试") : m
    }

    // MARK: Uploads (`pickAndUploadImages`)

    /// Single-image cover pick: `Uploading…` → URL, or `Upload failed` (the popup stays open).
    func uploadCoverImage(_ photo: PickedPhoto) async -> String? {
        ToastCenter.shared.show(L10n.pick("Uploading…", "上传中…"))
        do {
            return try await UploadService.upload(jpegData: photo.jpeg)
        } catch {
            ToastCenter.shared.show(L10n.t("Upload failed"))
            return nil
        }
    }

    /// Multi-image pick: sequential uploads, individual failures skipped. Empty result →
    /// `Upload failed`; partial → `Uploaded {n} of {m} ({k} failed)`.
    func uploadImages(_ photos: [PickedPhoto]) async -> [String] {
        guard !photos.isEmpty else { return [] }
        ToastCenter.shared.show(L10n.pick("Uploading…", "上传中…"))
        var urls: [String] = []
        for photo in photos {
            if let url = try? await UploadService.upload(jpegData: photo.jpeg) {
                urls.append(url)
            }
        }
        if urls.isEmpty {
            ToastCenter.shared.show(L10n.t("Upload failed"))
            return []
        }
        if urls.count < photos.count {
            let failed = photos.count - urls.count
            ToastCenter.shared.show(L10n.pick("Uploaded \(urls.count) of \(photos.count) (\(failed) failed)",
                                              "已上传 \(urls.count)/\(photos.count)（\(failed) 张失败）"))
        }
        return urls
    }

    // MARK: Hero — cover (P1) & status (P2)

    func openCoverPopup() {
        CouplePopups.presentCover(vm: self, hasCover: !(space?.cover.isEmpty ?? true))
    }

    func setCover(url: String?) async {
        await run { try await CoupleService.setCover(matchId: $0, imageUrl: url) }
    }

    func openStatusPopup() {
        CouplePopups.presentStatus(vm: self, current: space?.status.me ?? "")
    }

    func setStatus(_ status: String) async {
        await run { try await CoupleService.setStatus(matchId: $0, status: status) }
    }

    // MARK: Craving (P3)

    /// `promptCard` — Enter submits; empty/cancel does nothing.
    func editCraving() async {
        let value = await DialogCenter.shared.prompt(
            title: L10n.t("Craving today"),
            label: L10n.pick("What do you want to eat?", "今天想吃什么？"),
            placeholder: L10n.pick("e.g. Ramen", "例如：拉面"),
            confirmLabel: L10n.t("Save"),
            cancelLabel: L10n.t("Cancel"))
        guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return }
        await postCraving(text)
    }

    /// Quick-pick chip: re-posts a history entry verbatim (it becomes `current` again).
    func quickCraving(_ text: String) async {
        await postCraving(text)
    }

    private func postCraving(_ text: String) async {
        await run { try await CoupleService.addCraving(matchId: $0, text: text) }
    }

    // MARK: Schedule (P4)

    func openSchedulePopup() {
        CouplePopups.presentAddSchedule(vm: self)
    }

    func addSchedule(text: String, startAt: Date, endAt: Date) async {
        await run { try await CoupleService.addSchedule(matchId: $0, text: text, startAt: startAt, endAt: endAt) }
    }

    /// Own, non-expired entries only — no confirmation (gotcha 9).
    func deleteSchedule(id: String) async {
        await run { try await CoupleService.deleteSchedule(matchId: $0, id: id) }
    }

    // MARK: Anniversaries (P5 / P6 / P7)

    func openAddAnniversaryPopup() {
        CouplePopups.presentAddAnniversary(vm: self)
    }

    func addAnniversary(title: String, date: Date) async {
        await run { try await CoupleService.addAnniversary(matchId: $0, title: title, date: ISODate.day(date)) }
    }

    func openAnniversaryDetail(id: String) {
        guard let anniversary = space?.anniversary(id: id) else { return }
        CouplePopups.presentAnniversaryDetail(vm: self, anniversary: anniversary)
    }

    func openAllAnniversaries() {
        CouplePopups.presentAllAnniversaries(vm: self)
    }

    func saveAnniversary(id: String, title: String, date: Date, note: String, images: [String]) async {
        await run {
            try await CoupleService.updateAnniversary(matchId: $0, id: id, title: title,
                                                      date: ISODate.day(date), note: note, images: images)
        }
    }

    /// Pink `danger` confirm before the DELETE (P6).
    func confirmDeleteAnniversary(id: String) async -> Bool {
        let ok = await DialogCenter.shared.confirm(
            title: L10n.pick("Delete anniversary?", "删除这个纪念日？"),
            confirmLabel: L10n.t("Delete"),
            cancelLabel: L10n.t("Cancel"),
            danger: true)
        return ok == true
    }

    func deleteAnniversary(id: String) async {
        await run { try await CoupleService.deleteAnniversary(matchId: $0, id: id) }
    }

    // MARK: Gift jar (P8)

    func openGiftJar() {
        CouplePopups.presentGiftJar(vm: self)
    }

    // MARK: Plans & checklist (P9 / P10 / P11 / C1 / C2)

    func openAddBucketPrompt() async {
        let value = await DialogCenter.shared.prompt(
            title: L10n.pick("Add to checklist", "添加到清单"),
            label: L10n.pick("Plan", "计划"),
            placeholder: L10n.pick("e.g. Watch the sunrise together", "例如：一起看日出"),
            confirmLabel: L10n.t("Save"),
            cancelLabel: L10n.t("Cancel"))
        guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return }
        await run { try await CoupleService.addBucket(matchId: $0, text: text) }
    }

    /// Checkbox tap. Done → C1 confirm (`Yes`, neon) → un-done (wipes note + photos).
    /// Not done → P10 "Mark done" popup.
    func tickBucket(id: String, currentDone: Bool) async {
        if currentDone {
            let ok = await DialogCenter.shared.confirm(
                title: L10n.pick("Mark as not done?", "取消完成标记？"),
                confirmLabel: L10n.pick("Yes", "确定"),
                cancelLabel: L10n.t("Cancel"),
                danger: false)
            guard ok == true else { return }
            await run { try await CoupleService.uncompleteBucket(matchId: $0, id: id) }
            return
        }
        let text = space?.bucketItem(id: id)?.text ?? ""
        CouplePopups.presentCompleteBucket(vm: self, id: id, text: text)
    }

    func completeBucket(id: String, note: String, images: [String]) async {
        await run { try await CoupleService.completeBucket(matchId: $0, id: id, note: note, images: images) }
    }

    /// Tapping the text of a **done** item opens the read-only record (P11).
    func openBucketRecord(id: String) {
        guard let item = space?.bucketItem(id: id), item.done else { return }
        CouplePopups.presentBucketRecord(item: item)
    }

    /// `×` on an undone item → pink `danger` confirm → DELETE (C2).
    func deleteBucket(id: String) async {
        let ok = await DialogCenter.shared.confirm(
            title: L10n.pick("Delete this plan?", "删除这条计划？"),
            confirmLabel: L10n.t("Delete"),
            cancelLabel: L10n.t("Cancel"),
            danger: true)
        guard ok == true else { return }
        await run { try await CoupleService.deleteBucket(matchId: $0, id: id) }
    }

    // MARK: Love you (§2.9)

    func sendLoveYou() async {
        guard !loveYouInFlight else { return }
        loveYouInFlight = true
        defer { loveYouInFlight = false }
        let id = matchId
        guard !id.isEmpty else { return }
        do {
            let fresh = try await CoupleService.sendLoveYou(matchId: id)
            guard id == matchId else { return }
            space = fresh
            phase = .loaded
            ToastCenter.shared.show(L10n.pick("Sent I love you", "已发送「我爱你」"))
        } catch {
            guard id == matchId else { return }
            if let api = error as? APIError, api.isUnauthorized { return }
            // Server text wins ("Already sent today, come back tomorrow"); H5 fallback otherwise.
            let msg = (error as? APIError)?.message ?? ""
            ToastCenter.shared.show(msg.isEmpty ? L10n.pick("Already sent today", "今天已经发送过了") : msg)
        }
    }

    // MARK: End relationship (C3)

    /// `MatchStore.dissolve` owns the confirm card (`End this relationship?` / `End`, pink),
    /// the `Relationship ended` toast and the status reload; the pane is then rebuilt.
    func endRelationship() async {
        let id = matchId
        guard !id.isEmpty else { return }
        let ended = await MatchStore.shared.dissolve(matchId: id, reason: nil)
        guard ended else { return }
        reset()
        AppActions.shared.reloadMatchTab()
    }

    // MARK: Partner profile

    func openPartnerProfile() {
        guard let userId = partnerUserId else { return }
        AppActions.shared.openPartnerProfile(userId, matchId.isEmpty ? nil : matchId)
    }
}
