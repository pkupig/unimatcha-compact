import Foundation
import Combine

// MARK: - PreferencesViewModel (h5-match.md §1.12, §2.10, §3 #3/#4, gotchas 8–11) — WP-17
//
// Form state of the `filter-overlay` bottom sheet, i.e. the H5 scratch fields
// `S.prefMode / S.filterGender / S.filterStages / S.friendGender / S.friendPrefInterests`
// plus the shared controls (`#filter-age-min/max/any`, `#filter-same-school`,
// `#filter-same-city`, `#match-extra-info`) that live in a single DOM instance and are
// back-filled per mode.
//
// Everything that is *not* form state stays in `MatchStore`: the preference cache and its
// per-mode sequence token (`loadPrefs`), the PUT + merge (`savePrefs`), the client-only
// enhanced intent (`setEnhanced` / `setFriendCells`) and the locked rule (`isPoolActive`).
// The sheet therefore never talks to `MatchingService` directly.
//
// Two guards carried over verbatim (gotcha 9):
//   • `prefsLoadFailed` — when the GET failed the shared controls may still show the OTHER
//     mode's values, so the whole Save is refused (a stale value would be written into the
//     wrong mode).
//   • `extraLoadFailed && !extraDirty` — `extraMatchInfo` is omitted from the payload so a
//     blank textarea never overwrites the server's text.

@MainActor
final class PreferencesViewModel: ObservableObject {
    static let genderOptions = ["male", "female", "all"]

    let mode: MatchMode

    // MARK: Form state (H5 `S.*` sheet scratch)

    /// `'male' | 'female' | 'all'` — `all` (or empty) is sent as JSON `null`.
    @Published var gender: String = "all"
    /// Romantic multi-select, whitelisted to `undergraduate,master,doctor`.
    @Published var stages: [String] = []
    /// Friend priority interests (≤3), drawn from the current user's profile.
    @Published var friendInterests: [String] = []
    /// Options for the friend chips = profile `interests` (fallback `tags`), trimmed + de-duplicated.
    @Published private(set) var interestOptions: [String] = []

    @Published var ageAny: Bool = false
    @Published var ageMin: Int = MatchPreferencesWrite.defaultAgeMin
    @Published var ageMax: Int = MatchPreferencesWrite.defaultAgeMax
    @Published var sameSchool: Bool = false
    @Published var sameCity: Bool = false
    @Published var extraInfo: String = "" {
        didSet {
            // H5 attaches `oninput → dataset.dirty = 1`; back-filling assigns the value without
            // the input event, so the flag is suppressed while `applyingBackfill` is set.
            if !applyingBackfill && extraInfo != oldValue { extraDirty = true }
        }
    }

    // MARK: Load / save bookkeeping

    /// Whole-card refusal marker (H5 `prefsLoadFailed`).
    @Published private(set) var prefsLoadFailed = false
    @Published private(set) var isSaving = false
    /// The enhanced switch is forced back to the store's value and disabled while the
    /// balance check awaits (H5 audit #11 — no "shown on but state off" window).
    @Published private(set) var enhanceBusy = false

    private var extraDirty = false
    private var extraLoadFailed = false
    private var applyingBackfill = false
    /// Sheet-local sequence token (H5 `loadPrefsForMode._seq`).
    private var generation = 0

    private var store: MatchStore { MatchStore.shared }

    init(mode: MatchMode) {
        self.mode = mode
    }

    // MARK: Derived

    /// `isMatchPoolActive(mode)` — only `searching` locks the sheet; matched / confirming /
    /// relationship stay editable because the changes apply to the next round (gotcha 8).
    var readOnly: Bool { store.isPoolActive(mode) }

    var enhancedOn: Bool { store.enhanced.isEnabled(mode) }

    var friendCells: Int { store.friendCells }

    /// Cost of the enhanced round: 3 (romantic) or the friend cells slider.
    var enhancedCost: Int { mode == .romantic ? EnhancedPrefs.romanticCost : friendCells }

    /// `#age-range-display` — "Any" while the checkbox is on, else "18 — 24".
    var ageDisplay: String {
        ageAny ? L10n.pick("Any", "不限") : "\(ageMin) — \(ageMax)"
    }

    var genderIndex: Int {
        PreferencesViewModel.genderOptions.firstIndex(of: gender) ?? 2
    }

    /// `extraMatchInfo` for the payload: omitted (nil) only when the load failed and the user
    /// never touched the field.
    var extraInfoPayload: String? {
        (extraLoadFailed && !extraDirty) ? nil : extraInfo
    }

    // MARK: Open (`openFilterSheet` → `switchPrefMode` → `loadPrefsForMode`)

    func onOpen() {
        generation &+= 1
        let gen = generation
        prefsLoadFailed = false
        applyingBackfill = true
        extraInfo = ""
        applyingBackfill = false
        extraDirty = false
        extraLoadFailed = false
        refreshInterestOptions()
        // Energy freshness for the enhanced toggle's balance check (H5 `loadEnergyBar()`).
        Task { await EnergyStore.shared.refresh() }
        Task { await self.loadPrefs(generation: gen) }
    }

    private func loadPrefs(generation gen: Int) async {
        do {
            let p = try await store.loadPrefs(mode: mode)
            guard gen == generation else { return }
            apply(p)
        } catch MatchStoreError.superseded {
            return
        } catch let e as APIError where e.isUnauthorized {
            return                              // session torn down; the overlay is dismissed for us
        } catch {
            guard gen == generation else { return }
            // Do not treat any residual form value as authoritative: refuse the whole Save.
            prefsLoadFailed = true
            extraLoadFailed = true
            ToastCenter.shared.show(L10n.pick("Preferences failed to load", "偏好加载失败"))
        }
    }

    /// `fillRomanticPrefs` / `fillFriendPrefs` — shared controls first, then the mode section.
    private func apply(_ p: MatchPreferencesRead) {
        if !extraDirty {
            applyingBackfill = true
            extraInfo = p.extraMatchInfo ?? ""
            applyingBackfill = false
        }
        ageAny = (p.ageMin == nil && p.ageMax == nil)
        ageMin = p.ageMin ?? MatchPreferencesWrite.defaultAgeMin
        ageMax = p.ageMax ?? MatchPreferencesWrite.defaultAgeMax
        sameSchool = p.requireSameUniversity
        sameCity = p.requireSameCity

        let raw = p.preferredGender ?? ""
        gender = PreferencesViewModel.genderOptions.contains(raw) ? raw : "all"

        switch mode {
        case .romantic:
            stages = p.stages
        case .friend:
            refreshInterestOptions()
            // H5: `preferredInterests.slice(0,3)` then dropped to the options still in the profile.
            friendInterests = Array(p.preferredInterests.prefix(MatchPreferencesWrite.maxPriorityInterests))
                .filter { interestOptions.contains($0) }
        }
    }

    // MARK: Controls

    func selectGender(index: Int) {
        guard PreferencesViewModel.genderOptions.indices.contains(index) else { return }
        gender = PreferencesViewModel.genderOptions[index]
    }

    /// `toggleStage` — multi-select, whitelisted; empty selection means "any".
    func toggleStage(_ value: String) {
        guard MatchPreferencesWrite.stageWhitelist.contains(value) else { return }
        if let i = stages.firstIndex(of: value) {
            stages.remove(at: i)
        } else {
            stages.append(value)
        }
    }

    /// `toggleFriendPriorityInterest` — a 4th selection toasts and is ignored.
    func toggleInterest(_ value: String) {
        let v = value.trimmingCharacters(in: .whitespaces)
        guard !v.isEmpty else { return }
        if let i = friendInterests.firstIndex(of: v) {
            friendInterests.remove(at: i)
            return
        }
        guard friendInterests.count < MatchPreferencesWrite.maxPriorityInterests else {
            ToastCenter.shared.show(L10n.pick("Pick up to 3 priority interests", "最多选择 3 个优先兴趣"))
            return
        }
        friendInterests.append(v)
    }

    /// `getProfileInterestOptions` — profile `interests`, else `tags`; trimmed, de-duplicated,
    /// order preserved. Selections that no longer exist in the profile are dropped.
    func refreshInterestOptions() {
        let profile = SessionStore.shared.currentUser?.profile
        let raw: [String] = {
            if let list = profile?.interests, !list.isEmpty { return list }
            return profile?.tags ?? []
        }()
        var seen = Set<String>()
        var out: [String] = []
        for item in raw {
            let v = item.trimmingCharacters(in: .whitespaces)
            if !v.isEmpty && !seen.contains(v) {
                seen.insert(v)
                out.append(v)
            }
        }
        interestOptions = out
        let kept = friendInterests.filter { out.contains($0) }
        friendInterests = Array(kept.prefix(MatchPreferencesWrite.maxPriorityInterests))
    }

    // MARK: Enhanced (client-only intent, never part of the PUT — api gotcha 1)

    func toggleEnhance() async {
        guard !enhanceBusy else { return }
        enhanceBusy = true
        defer { enhanceBusy = false }
        let turningOn = !store.enhanced.isEnabled(mode)
        // Balance refresh, shortfall toast + top-up, persist and summary resync all live in the store.
        _ = await store.setEnhanced(mode: mode, enabled: turningOn)
    }

    /// 1…5; updates the "GUARANTEE / Cost" labels and the summary sub-line immediately.
    func setFriendCells(_ n: Int) {
        store.setFriendCells(n)
    }

    // MARK: Save (`saveFilterPrefs`)

    func save() async {
        // The state can flip to `searching` while the sheet is open (polling / another device).
        if store.isPoolActive(mode) {
            store.showLockedToast()
            close()
            return
        }
        if prefsLoadFailed {
            ToastCenter.shared.show(L10n.pick("Preferences failed to load — close and retry",
                                              "偏好还没加载成功，请关闭后重试"))
            return
        }
        isSaving = true
        defer { isSaving = false }

        let write: MatchPreferencesWrite
        switch mode {
        case .romantic:
            write = .romantic(gender: gender,
                              stages: stages,
                              ageAny: ageAny,
                              ageMin: ageMin,
                              ageMax: ageMax,
                              requireSameUniversity: sameSchool,
                              requireSameCity: sameCity,
                              extraMatchInfo: extraInfoPayload)
        case .friend:
            write = .friend(gender: gender,
                            interests: friendInterests,
                            ageAny: ageAny,
                            ageMin: ageMin,
                            ageMax: ageMax,
                            requireSameUniversity: sameSchool,
                            requireSameCity: sameCity,
                            extraMatchInfo: extraInfoPayload)
        }

        do {
            try await store.savePrefs(mode: mode, write: write)
            ToastCenter.shared.show(L10n.pick("Preferences saved", "偏好已保存"))
            close()
        } catch MatchStoreError.locked {
            // The store already showed the locked toast.
            close()
        } catch let e as APIError where e.isUnauthorized {
            return
        } catch {
            ToastCenter.shared.show(L10n.t("Failed: ") + APIError.message(of: error))
        }
    }

    // MARK: Exits

    /// Every close path runs the overlay's `onDismiss` → `MatchStore.resyncSummary()` (gotcha 11).
    func close() {
        PreferencesSheet.dismiss()
    }

    /// `retakeQuestionnaire()` — leave the sheet, then open the questionnaire for this mode.
    func retakeQuestionnaire() {
        close()
        AppActions.shared.openQuestionnaire(mode)
    }
}
