import SwiftUI

// MARK: - Profile hero (h5-profile.md §1.2 layer 0 + `.profile-hero-text`; design §7.2 tab-profile)
//
// `ProfileHeroCover`   — the fixed cover layer behind the scroller: `#profile-bg` (cover or the
//                        grey placeholder, never blank) + `.profile-blur-mask` (12 pt blur whose
//                        strength ramps 0.4 → 0.72 at 42 % → 1.0 toward the bottom; opacity 1→0
//                        as the pull grows 0→140). Height = 400 + inset + pull distance.
// `ProfileHeroText`    — white text block with `0 1px 6px rgba(0,0,0,.45)` shadow: 92 pt avatar
//                        (3 pt white/90 ring), 28/800 name + verify badge, neon school line,
//                        facts rows, 2-line signature. No photo strip (hidden by product decision).
// `VerifyBadgeView`    — verified (22 pt neon check) / pending (frosted pill) / verify (tappable pill).

struct ProfileHeroCover: View {
    var coverUrl: String?
    var height: CGFloat
    var blurOpacity: Double

    private var hasCover: Bool { SafeURL.isSafe(coverUrl) }

    var body: some View {
        ZStack(alignment: .top) {
            base
            // Progressive blur: a blurred copy masked so the blur strength grows toward the bottom.
            base
                .blur(radius: ProfileTabViewModel.blurRadius)
                .mask(
                    LinearGradient(
                        gradient: Gradient(stops: [
                            .init(color: Color.black.opacity(0.4), location: 0),
                            .init(color: Color.black.opacity(0.72), location: 0.42),
                            .init(color: Color.black, location: 1),
                        ]),
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .opacity(blurOpacity)
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .clipped()
        .accessibilityHidden(true)
    }

    @ViewBuilder private var base: some View {
        if hasCover {
            RemoteImage(url: coverUrl, contentMode: .fill, placeholderColor: Theme.C.surfaceDim)
                .frame(maxWidth: .infinity)
                .frame(height: height)
        } else {
            // 8×8 grey SVG placeholder in H5 — a flat grey ground here.
            Theme.C.surfaceDim
                .frame(maxWidth: .infinity)
                .frame(height: height)
        }
    }
}

// MARK: - Hero text block

struct ProfileHeroText: View {
    var user: User?
    var onVerifyTap: () -> Void

    private var profile: UserProfile { user?.profile ?? UserProfile() }
    private var facts: ProfileFacts { ProfileFactsBuilder.facts(user: user) }
    private var badge: VerifyBadgeState { VerifyBadgeState.from(status: user?.verificationStatus) }

    private static let shadowColor = Color.black.opacity(0.45)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .bottom, spacing: 16) {
                avatar
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .center, spacing: 8) {
                        Text(displayName)
                            .font(Theme.font(28, weight: .heavy))
                            .tracking(Theme.tracking(Theme.Tracking.tight, size: 28))
                            .foregroundColor(.white)
                            .lineLimit(1)
                            .truncationMode(.tail)
                        VerifyBadgeView(state: badge, action: onVerifyTap)
                    }
                    Text(schoolLine)
                        .font(Theme.font(13, weight: .bold))
                        .tracking(Theme.tracking(0.02, size: 13))
                        .foregroundColor(Theme.C.neon)
                        .lineLimit(1)
                }
                .padding(.bottom, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            factsBlock
                .padding(.top, 24)
        }
        .shadow(color: Self.shadowColor, radius: 3, x: 0, y: 1)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var displayName: String {
        let n = (profile.nickname ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return n.isEmpty ? ProfileTabCopy.yourName : n
    }

    private var schoolLine: String {
        let s = (profile.school ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return ProfileTabCopy.university }
        return L10n.metaLabel(s) ?? s
    }

    /// `#profile-avatar`: 92 circle, white ground, 3 pt white/90 ring, `0 6px 20px rgba(0,0,0,.3)`.
    private var avatar: some View {
        let size = ProfileTabViewModel.avatarSize
        return ZStack {
            Circle().fill(Color.white)
            if SafeURL.isSafe(profile.avatarUrl) {
                RemoteImage(url: profile.avatarUrl, contentMode: .fill, placeholderColor: Color.white)
                    .frame(width: size, height: size)
                    .clipShape(Circle())
            } else {
                MaterialIcon(name: "person", size: 48, color: Theme.C.outlineVariantText)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.white.opacity(0.9), lineWidth: ProfileTabViewModel.avatarRing))
        .shadow(color: Color.black.opacity(0.3), radius: 10, x: 0, y: 6)
    }

    @ViewBuilder private var factsBlock: some View {
        let f = facts
        if !f.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                if !f.primary.isEmpty {
                    Self.joined(f.primary, size: 14)
                        .font(Theme.font(14, weight: .semibold))
                        .lineSpacing(14 * 0.75)
                        .foregroundColor(Color.white.opacity(0.95))
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !f.secondary.isEmpty {
                    Self.joined(f.secondary, size: 12)
                        .font(Theme.font(12, weight: .medium))
                        .lineSpacing(12 * 0.75)
                        .foregroundColor(Color.white.opacity(0.72))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, f.primary.isEmpty ? 0 : 5)
                }
                if let s = f.signature {
                    Text(s)
                        .font(Theme.font(13))
                        .lineSpacing(13 * 0.65)
                        .foregroundColor(Color.white.opacity(0.88))
                        .lineLimit(2)
                        .truncationMode(.tail)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, (f.primary.isEmpty && f.secondary.isEmpty) ? 0 : 14)
                }
            }
        }
    }

    /// Items joined by `.pf-sep` "·" (8 pt side margins ≈ an en space each side, 45 % opacity),
    /// concatenated so the row wraps like inline text.
    private static func joined(_ items: [String], size: CGFloat) -> Text {
        var out = Text("")
        for (i, item) in items.enumerated() {
            if i > 0 {
                out = out + Text("\u{2002}·\u{2002}").foregroundColor(Color.white.opacity(0.45))
            }
            out = out + Text(item)
        }
        return out
    }
}

// MARK: - Verify badge

struct VerifyBadgeView: View {
    var state: VerifyBadgeState
    var action: () -> Void

    var body: some View {
        switch state {
        case .verified:
            ZStack {
                Circle().fill(Theme.C.neon)
                Image(systemName: Theme.Icon.sf("check"))
                    .font(.system(size: 15 * 0.82, weight: .bold))
                    .foregroundColor(.black)
                    .frame(width: 15, height: 15)
            }
            .frame(width: 22, height: 22)
            .accessibilityLabel(ProfileTabCopy.titleVerified)
        case .pending:
            pill(material: "hourglass_top", text: ProfileTabCopy.badgePending)
                .accessibilityLabel(ProfileTabCopy.titlePending)
        case .verify:
            Button(action: action) {
                pill(material: "verified_user", text: ProfileTabCopy.badgeVerify)
            }
            .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleIcon))
            .accessibilityLabel(ProfileTabCopy.titleVerify)
        }
    }

    /// `bg-white/22 backdrop-blur-md text-white rounded-full px-2.5 py-1`: 13 pt icon + 10/700 wider.
    private func pill(material: String, text: String) -> some View {
        HStack(spacing: 4) {
            MaterialIcon(name: material, size: 13, color: .white)
            Text(text)
                .font(Theme.font(10, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.wider, size: 10))
                .foregroundColor(.white)
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(
            ZStack {
                Capsule().fill(.ultraThinMaterial)
                Capsule().fill(Color.white.opacity(0.22))
            }
        )
        .clipShape(Capsule())
        .contentShape(Capsule())
    }
}
