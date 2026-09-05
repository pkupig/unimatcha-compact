import SwiftUI

// MARK: - FriendCandidatesView (h5-match.md §1.6, §1.14, §2.7) — friend matched list — WP-06
//
// `max-w-xl py-4`; caption "Friend Candidates · N" (10/700/+0.3em outline-variant, px 2, mb 4);
// grid gap 12 of ≤5 cards, each: r10, 1 pt outline-variant/15 border, cover/blurred-avatar bg under
// gradient `.4 → .7 @55% → .94 @85%`, p 16: header (56 pt avatar with 2 pt neon ring + 2 pt pad,
// name 14/700, school 12 outline), optional bio (11, 2 lines), ≤5 outline chips (9/700/widest),
// status row (Friends / pink timer HH:MM:SS / Pending), "Enter Chat" (neon, py 12, 11/700/+0.15em),
// "Cancel connection" (9 pink underline) → dissolve confirm, footnote when not confirmed.

struct FriendCandidatesView: View {
    let matches: [FriendMatch]
    let deadlines: [String: Date]
    let now: Date
    let onExpired: () -> Void

    @State private var expiredKeys = Set<String>()

    private var shown: [FriendMatch] { Array(matches.prefix(5)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L10n.t("Friend Candidates") + " · \(matches.count)")
                .font(Theme.font(10, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.hero, size: 10))
                .foregroundColor(Theme.C.outlineVariantText)
                .padding(.horizontal, 8)
                .padding(.bottom, 16)

            VStack(spacing: 12) {
                ForEach(shown) { c in
                    FriendCandidateCard(candidate: c, deadline: deadlines[c.matchId], now: now)
                }
            }
        }
        .frame(maxWidth: 576)
        .padding(.vertical, 16)
        .onChange(of: now) { t in
            // Any temp card hitting 0 triggers one status reload (H5 `startFriendRemainingTick`).
            for (id, d) in deadlines where d.timeIntervalSince(t) <= 0 && !expiredKeys.contains(id) {
                expiredKeys.insert(id)
                onExpired()
            }
        }
    }
}

struct FriendCandidateCard: View {
    let candidate: FriendMatch
    let deadline: Date?
    let now: Date

    @State private var busy = false

    private var partner: PublicProfile { candidate.partner ?? PublicProfile() }

    var body: some View {
        ZStack {
            MatchCoverBackground(coverUrl: partner.coverUrl, avatarUrl: partner.avatarUrl,
                                 stops: [(0.40, 0), (0.70, 0.55), (0.94, 0.85)])
            VStack(alignment: .leading, spacing: 0) {
                header
                    .padding(.bottom, 12)

                if let bio = partner.bio?.trimmingCharacters(in: .whitespacesAndNewlines), !bio.isEmpty {
                    Text(bio)
                        .font(Theme.font(11))
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .lineLimit(2)
                        .padding(.bottom, 12)
                }

                if !chips.isEmpty {
                    FlowLayout(spacing: 6) {
                        ForEach(chips, id: \.self) { c in
                            Text(c)
                                .font(Theme.font(9, weight: .bold))
                                .tracking(Theme.tracking(Theme.Tracking.widest, size: 9))
                                .foregroundColor(Theme.C.onSurface)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 2)
                                .background(RoundedRectangle(cornerRadius: Theme.R.chip, style: .continuous).fill(Theme.C.card.opacity(0.6)))
                                .overlay(RoundedRectangle(cornerRadius: Theme.R.chip, style: .continuous).stroke(Theme.C.onSurface.opacity(0.2), lineWidth: 1))
                        }
                    }
                    .padding(.bottom, 12)
                }

                statusRow
                    .frame(minHeight: 18)
                    .padding(.bottom, 12)

                Button {
                    AppActions.shared.openChat(candidate.matchId)
                } label: {
                    Text(L10n.t("Enter Chat"))
                        .font(Theme.font(11, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.label, size: 11))
                        .foregroundColor(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous).fill(Theme.C.neon))
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleWide))

                Button {
                    guard !busy else { return }
                    busy = true
                    let id = candidate.matchId
                    Task {
                        _ = await MatchStore.shared.dissolve(matchId: id, reason: nil)
                        busy = false
                    }
                } label: {
                    Text(L10n.t("Cancel connection"))
                        .font(Theme.font(9))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 9))
                        .foregroundColor(Theme.C.neonPink)
                        .underline()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(busy)
                .opacity(busy ? 0.5 : 1)
                .padding(.top, 4)

                if !candidate.isConfirmed {
                    Text(L10n.t("Both must tap \"Confirm Friend\" in chat within 48 hours"))
                        .font(Theme.font(9))
                        .foregroundColor(Theme.C.outlineVariantText)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 4)
                }
            }
            .padding(16)
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous).stroke(Theme.C.outlineVariant.opacity(0.15), lineWidth: 1))
    }

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().stroke(Theme.C.neon, lineWidth: 2)
                Circle().fill(Color.white).padding(2)
                if SafeURL.isSafe(partner.avatarUrl) {
                    RemoteImage(url: partner.avatarUrl, contentMode: .fill)
                        .clipShape(Circle())
                        .padding(4)
                } else {
                    Image(systemName: Theme.Icon.sf("person", filled: true))
                        .font(.system(size: 18, weight: .light))
                        .foregroundColor(Theme.C.outline)
                }
            }
            .frame(width: 56, height: 56)

            VStack(alignment: .leading, spacing: 2) {
                Text(partner.nickname ?? "")
                    .font(Theme.font(14, weight: .bold))
                    .foregroundColor(Theme.C.onSurface)
                    .lineLimit(1)
                if let s = L10n.metaLabel(partner.school), !s.isEmpty {
                    Text(s)
                        .font(Theme.font(12))
                        .foregroundColor(Theme.C.outline)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private var statusRow: some View {
        HStack {
            if candidate.isConfirmed {
                HStack(spacing: 4) {
                    Image(systemName: Theme.Icon.sf("group"))
                        .font(.system(size: 12, weight: .light))
                        .frame(width: 14, height: 14)
                    Text(L10n.t("Friends"))
                        .font(Theme.font(10, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                }
                .foregroundColor(Theme.C.neon)
            } else if let d = deadline {
                HStack(spacing: 4) {
                    Image(systemName: Theme.Icon.sf("timer"))
                        .font(.system(size: 11, weight: .light))
                        .frame(width: 13, height: 13)
                    Text(Formatters.countdown(ms: d.timeIntervalSince(now) * 1000))
                        .font(Theme.mono(10, weight: .bold))
                        .monospacedDigit()
                }
                .foregroundColor(Theme.C.neonPink)
            } else {
                Text(L10n.t("Pending"))
                    .font(Theme.font(10, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                    .foregroundColor(Theme.C.outline)
            }
            Spacer(minLength: 0)
        }
    }

    private var chips: [String] {
        let source = (partner.interests?.isEmpty == false) ? (partner.interests ?? []) : (partner.tags ?? [])
        return Array(source.filter { !$0.isEmpty }.prefix(5))
    }
}
