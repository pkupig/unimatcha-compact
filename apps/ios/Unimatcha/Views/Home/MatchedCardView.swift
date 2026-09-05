import SwiftUI

// MARK: - MatchedCardView (h5-match.md §1.4, design §8.23) — romantic matched / confirming — WP-06
//
// `max-w-xl py-4`; eyebrow "This Week's Match" (10/700/+0.3em outline-variant, px 2, mb 4); card
// r10 with 1 pt outline-variant/10 border, cover (or blurred avatar) under the surface gradient
// `.3 → .62 @48% → .92 @82%`; inner p 24: pulsing 112 pt avatar (4 pt black ring, 4 pt white pad),
// nickname 24/700/tight + verified 16, school[ · grade] 14 outline, "Shared Interests" chips (≤6,
// black / #e2e2e2 10/700/widest), remaining-time block (mono 24/300/widest ticking HH:MM:SS),
// "Enter Chat" `.btn-cta`, footnote 10 outline-variant (+ " · You have confirmed…" when only I did).

struct MatchedCardView: View {
    let match: RomanticMatch
    let partner: PublicProfile
    let deadline: Date?
    let now: Date
    let onExpired: () -> Void

    @State private var expiredFired = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L10n.t("This Week's Match"))
                .font(Theme.font(10, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.hero, size: 10))
                .foregroundColor(Theme.C.outlineVariantText)
                .padding(.horizontal, 8)
                .padding(.bottom, 16)

            card
        }
        .frame(maxWidth: 576)
        .padding(.vertical, 16)
        .onChange(of: remainingMs) { ms in
            if ms <= 0, deadline != nil, !expiredFired {
                expiredFired = true
                onExpired()
            }
        }
    }

    private var remainingMs: Double {
        guard let d = deadline else { return -1 }
        return d.timeIntervalSince(now) * 1000
    }

    private var card: some View {
        ZStack {
            MatchCoverBackground(coverUrl: partner.coverUrl, avatarUrl: partner.avatarUrl,
                                 stops: [(0.30, 0), (0.62, 0.48), (0.92, 0.82)])
            VStack(spacing: 0) {
                VStack(spacing: 0) {
                    PulsingAvatar(url: partner.avatarUrl, name: partner.nickname)
                        .padding(.bottom, 12)
                    HStack(spacing: 6) {
                        Text(partner.nickname ?? "")
                            .font(Theme.font(24, weight: .bold))
                            .tracking(Theme.tracking(Theme.Tracking.tight, size: 24))
                            .foregroundColor(Theme.C.onSurface)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        if partner.isVerified {
                            Image(systemName: Theme.Icon.sf("verified", filled: true))
                                .font(.system(size: 14, weight: .regular))
                                .foregroundColor(Theme.C.primary)
                                .frame(width: 16, height: 16)
                                .accessibilityLabel(L10n.pick("Campus verified", "校园认证"))
                        }
                    }
                    if let line = schoolLine {
                        Text(line)
                            .font(Theme.font(14))
                            .foregroundColor(Theme.C.outline)
                            .lineLimit(1)
                            .padding(.top, 2)
                    }
                }
                .padding(.top, 8)
                .padding(.bottom, 24)

                if !chips.isEmpty {
                    VStack(spacing: 8) {
                        Text(L10n.t("Shared Interests"))
                            .font(Theme.font(10))
                            .tracking(Theme.tracking(Theme.Tracking.section, size: 10))
                            .foregroundColor(Theme.C.outline)
                        FlowLayout(spacing: 8) {
                            ForEach(chips, id: \.self) { c in
                                Text(c)
                                    .font(Theme.font(10, weight: .bold))
                                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                                    .foregroundColor(Theme.C.onPrimary)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 4)
                                    .background(RoundedRectangle(cornerRadius: Theme.R.chip, style: .continuous).fill(Theme.C.primary))
                            }
                        }
                    }
                    .padding(.bottom, 24)
                }

                if deadline != nil {
                    VStack(spacing: 4) {
                        Text(L10n.pick("Open the chat and both confirm within this time", "打开聊天，在此时间内双方确认"))
                            .font(Theme.font(10))
                            .tracking(Theme.tracking(Theme.Tracking.label, size: 10))
                            .foregroundColor(Theme.C.outline)
                            .multilineTextAlignment(.center)
                        Text(Formatters.countdown(ms: remainingMs))
                            .font(Theme.mono(24, weight: .light))
                            .tracking(Theme.tracking(Theme.Tracking.widest, size: 24))
                            .monospacedDigit()
                            .foregroundColor(Theme.C.primary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .overlay(alignment: .top) { Rectangle().fill(Theme.C.hairline20).frame(height: 1) }
                    .overlay(alignment: .bottom) { Rectangle().fill(Theme.C.hairline20).frame(height: 1) }
                    .padding(.bottom, 12)
                }

                CTAButton(title: L10n.t("Enter Chat"), style: .neon) {
                    if let id = match.id, !id.isEmpty {
                        AppActions.shared.openChat(id)
                    } else {
                        AppActions.shared.switchHomeView(.chat)
                    }
                }
                .shadow(color: Color.black.opacity(0.1), radius: 15, x: 0, y: 10)
                .padding(.top, 8)

                Text(footnote)
                    .font(Theme.font(10))
                    .lineSpacing(10 * 0.6)
                    .foregroundColor(Theme.C.outlineVariantText)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)
            }
            .padding(24)
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous).stroke(Theme.C.outlineVariant.opacity(0.1), lineWidth: 1))
    }

    private var schoolLine: String? {
        var parts: [String] = []
        if let s = L10n.metaLabel(partner.school), !s.isEmpty { parts.append(s) }
        if let g = partner.grade, !g.isEmpty { parts.append(L10n.grade(g)) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var chips: [String] {
        let source = (partner.interests?.isEmpty == false) ? (partner.interests ?? []) : (partner.tags ?? [])
        return Array(source.filter { !$0.isEmpty }.prefix(6))
    }

    private var footnote: String {
        var s = L10n.t("Both of you must tap \"Confirm Partner\" in chat within 48 hours")
        if match.myConfirmed && !match.partnerConfirmed {
            s += " · " + L10n.t("You have confirmed, waiting for their response")
        }
        return s
    }
}

// MARK: - Cover background shared by the matched card and friend candidate cards

struct MatchCoverBackground: View {
    let coverUrl: String?
    let avatarUrl: String?
    /// (alpha, location) stops of the `#f9f9f9` gradient laid over the image.
    let stops: [(Double, Double)]

    private var imageUrl: String? {
        if SafeURL.isSafe(coverUrl) { return coverUrl }
        if SafeURL.isSafe(avatarUrl) { return avatarUrl }
        return nil
    }

    private var isAvatarFallback: Bool { !SafeURL.isSafe(coverUrl) && SafeURL.isSafe(avatarUrl) }

    var body: some View {
        ZStack {
            if let u = imageUrl {
                RemoteImage(url: u, contentMode: .fill, placeholderColor: Theme.C.card)
                    .blur(radius: isAvatarFallback ? 40 : 0)
                    .scaleEffect(isAvatarFallback ? 1.25 : 1)
                LinearGradient(
                    stops: stops.map { Gradient.Stop(color: Theme.C.surface.opacity($0.0), location: $0.1) }
                        + [Gradient.Stop(color: Theme.C.surface.opacity(stops.last?.0 ?? 0.92), location: 1)],
                    startPoint: .top, endPoint: .bottom)
            } else {
                Theme.C.card
            }
        }
        .clipped()
    }
}

// MARK: - Pulsing 112 pt avatar (`.cl-pulse`: scale 1→1.12, opacity 1→.55, 1.8 s ease-in-out)

struct PulsingAvatar: View {
    let url: String?
    let name: String?
    @State private var pulsing = false

    var body: some View {
        ZStack {
            Circle().fill(Theme.C.primary)
            Circle().fill(Color.white).padding(4)
            if SafeURL.isSafe(url) {
                RemoteImage(url: url, contentMode: .fill)
                    .clipShape(Circle())
                    .padding(8)
            } else {
                Circle().fill(Theme.C.container).padding(8)
                Image(systemName: Theme.Icon.sf("person", filled: true))
                    .font(.system(size: 34, weight: .light))
                    .foregroundColor(Theme.C.outline)
            }
        }
        .frame(width: 112, height: 112)
        .scaleEffect(pulsing ? 1.12 : 1)
        .opacity(pulsing ? 0.55 : 1)
        .animation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true), value: pulsing)
        .onAppear { pulsing = true }
    }
}
