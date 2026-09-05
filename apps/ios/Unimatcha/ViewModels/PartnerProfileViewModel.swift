import Foundation
import Combine

// MARK: - PartnerProfileViewModel (h5-match.md §1.15, h5-profile.md §1.6, api-auth §3.9–3.10) — WP-17
//
// `viewPartnerProfile(userId, matchId)`: report the `openedProfile` behaviour event (only when
// a matchId is known — session-deduped by `MatchStore`), open the overlay immediately, then
// `GET /users/:id/public-profile`.
//
// Divergences from H5, both deliberate (PLAN D14 / api §8.4):
//   • a failed fetch keeps the overlay with a back control and an EmptyState + Retry instead of
//     trapping the user on a blank page,
//   • `hidden: true` renders an explicit "profile is private" state instead of an almost-empty page.
//
// The note pill is private data owned by the chat domain; it is read through
// `AppActions.noteForUser` (WP-17 must not import WP-07) and kept locally so the pill updates
// the moment the PUT returns, before `loadSessions()` round-trips.

@MainActor
final class PartnerProfileViewModel: ObservableObject {
    /// Server cap (`note.trim().slice(0, 30)`).
    static let noteMaxLength = 30

    let userId: String
    let matchId: String?

    @Published private(set) var profile: PublicProfile?
    @Published private(set) var isLoading = false
    @Published private(set) var loadFailed = false
    /// Private note for this user (`session.partner.note`), nil / empty = none.
    @Published private(set) var note: String?

    private var generation = 0

    init(userId: String, matchId: String? = nil) {
        self.userId = userId
        self.matchId = matchId
        self.note = PartnerProfileViewModel.normalized(AppActions.shared.noteForUser(userId))
    }

    // MARK: Derived projections

    /// `privacy.showProfile == false` → `{nickname, avatarUrl, hidden:true}`.
    var isHidden: Bool { profile?.isHidden == true }

    var displayName: String {
        let n = profile?.nickname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return n.isEmpty ? L10n.pick("User", "用户") : n
    }

    var isVerified: Bool { profile?.isVerified == true }

    var coverSource: String? {
        guard let p = profile else { return nil }
        if let c = p.coverUrl, SafeURL.isSafe(c) { return c }
        return SafeURL.isSafe(p.avatarUrl) ? p.avatarUrl : nil
    }

    /// True when the hero image is the avatar standing in for a missing cover (`blur-2xl scale-125`).
    var coverIsBlurredAvatar: Bool {
        guard let p = profile else { return false }
        return !(p.coverUrl.map { SafeURL.isSafe($0) } ?? false)
    }

    /// `grade · age · city`, each through `metaLabel`, empty parts omitted.
    var infoLine: String? {
        guard let p = profile else { return nil }
        var parts: [String] = []
        if let g = p.grade, !g.isEmpty { parts.append(L10n.grade(g)) }
        if let a = p.age { parts.append("\(a)") }
        if let c = p.city, !c.isEmpty { parts.append(L10n.metaLabel(c) ?? c) }
        return parts.isEmpty ? nil : parts.joined(separator: "  ·  ")
    }

    /// Facts grid — only the present values among Major / MBTI / Zodiac / Nationality.
    var facts: [(label: String, value: String)] {
        guard let p = profile else { return [] }
        var out: [(String, String)] = []
        func add(_ label: String, _ value: String?) {
            guard let v = value?.trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty else { return }
            out.append((label, L10n.metaLabel(v) ?? v))
        }
        add(L10n.t("Major"), p.major)
        add("MBTI", p.mbti)
        add(L10n.pick("Zodiac", "星座"), p.zodiac)
        add(L10n.t("Nationality"), p.nationality)
        return out.map { (label: $0.0, value: $0.1) }
    }

    var interests: [String] {
        (profile?.interests ?? []).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    /// Only confirmed connections receive `realPhotos` (server-enforced).
    var photos: [String] {
        (profile?.realPhotos ?? []).filter { SafeURL.isSafe($0) }
    }

    var bio: String? {
        let b = profile?.bio?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return b.isEmpty ? nil : b
    }

    /// "Known for N day(s)" — connections only.
    var daysKnownLine: String? {
        guard let d = profile?.daysKnown else { return nil }
        if L10n.isZh { return "已相识 \(d) 天" }
        return "Known for \(d) day\(d == 1 ? "" : "s")"
    }

    var photoCountLine: String {
        let n = photos.count
        if L10n.isZh { return "\(n) 张照片" }
        return "\(n) Photo\(n == 1 ? "" : "s")"
    }

    // MARK: Load

    func load() async {
        generation &+= 1
        let gen = generation
        isLoading = true
        loadFailed = false
        // The note may have arrived with a session reload since `init`.
        note = PartnerProfileViewModel.normalized(AppActions.shared.noteForUser(userId))
        do {
            let p = try await ProfileService.publicProfile(userId: userId)
            guard gen == generation else { return }
            profile = p
            isLoading = false
        } catch let e as APIError where e.isUnauthorized {
            guard gen == generation else { return }
            isLoading = false
        } catch {
            guard gen == generation else { return }
            isLoading = false
            // H5 only toasts and leaves a blank page; iOS also renders a retryable state (D14).
            loadFailed = true
            ToastCenter.shared.show(L10n.pick("Failed to load profile", "资料加载失败"))
        }
    }

    // MARK: Note (`promptSetNote` → `PUT /users/me/notes`)

    func promptSetNote() async {
        guard !userId.isEmpty else {
            ToastCenter.shared.show(L10n.pick("No user selected", "未选择用户"))
            return
        }
        let current = note ?? ""
        let entered = await DialogCenter.shared.prompt(
            title: L10n.pick("Set a note", "设置备注"),
            label: L10n.pick("Note", "备注"),
            placeholder: L10n.pick("Leave blank to clear", "留空即清除"),
            value: current)
        guard let raw = entered else { return }          // cancel / backdrop → no-op
        do {
            let result = try await ProfileService.setNote(targetUserId: userId, note: raw)
            let saved = PartnerProfileViewModel.normalized(result.note)
                ?? PartnerProfileViewModel.normalized(String(raw.trimmingCharacters(in: .whitespacesAndNewlines)
                                                                .prefix(PartnerProfileViewModel.noteMaxLength)))
            note = saved
            ToastCenter.shared.show(raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                    ? L10n.pick("Note cleared", "备注已清除")
                                    : L10n.pick("Note saved", "备注已保存"))
            // Refresh the chat list so its row (and `AppActions.noteForUser`) picks the note up.
            AppActions.shared.loadSessions()
        } catch let e as APIError where e.isUnauthorized {
            return
        } catch {
            ToastCenter.shared.show(L10n.t("Failed: ") + APIError.message(of: error))
        }
    }

    private static func normalized(_ s: String?) -> String? {
        guard let v = s?.trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty else { return nil }
        return v
    }
}
