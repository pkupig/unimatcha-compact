import SwiftUI

// MARK: - SplashView (h5-core §1.1, h5-auth §1.1, design §7.1)
//
// Full-screen `surface` ground. Skip top-right (32 + safe-top / 32); centered logo 76 r22
// (bob 6 pt / 2.6 s) → "UNIMATCHA" 34/800 +0.18em → tagline 13 (+16); bottom 64: 120×3 track
// with a sweeping 40 % neon fill + "BETA" 9/700 +0.35em. Entrance fade + rise 14 pt over 0.7 s.
// Routing: `SessionStore.completeSplash()` after 3 s or on Skip (idempotent — a single routing
// call even when both fire, h5-auth gotcha 16). The /users/me check already runs in parallel.

struct SplashView: View {
    @ObservedObject private var session = SessionStore.shared

    @State private var entered = false
    @State private var bobbing = false
    @State private var sweeping = false

    private let entrance = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.7)

    var body: some View {
        GeometryReader { geo in
            // `.ignoresSafeArea()` is applied to this GeometryReader, so its proxy reports
            // zero insets — fall back to the window's (same rule as ProfileTabView/OverlayHost).
            let insets = OverlayChrome.resolvedInsets(geo.safeAreaInsets)
            ZStack {
                Theme.C.surface

                // Center brand block (.splash-in)
                VStack(spacing: 0) {
                    Image("SplashLogo")
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 76, height: 76)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.R.splashLogo, style: .continuous))
                        .offset(y: bobbing ? -6 : 0)
                        .animation(.easeInOut(duration: 1.3).repeatForever(autoreverses: true), value: bobbing)
                        .padding(.bottom, 32)
                    Text("UNIMATCHA")
                        .font(Theme.font(34, weight: .heavy))
                        .tracking(Theme.tracking(Theme.Tracking.cta, size: 34))
                        .foregroundColor(Theme.C.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(L10n.t("One thoughtful match, every week."))
                        .font(Theme.font(13))
                        .tracking(Theme.tracking(Theme.Tracking.wide, size: 13))
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .multilineTextAlignment(.center)
                        .padding(.top, 16)
                }
                .padding(.horizontal, Theme.Space.page)
                .opacity(entered ? 1 : 0)
                .offset(y: entered ? 0 : 14)
                .animation(entrance, value: entered)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                // Skip (absolute top-right: 32 + safe-top, right 32)
                VStack {
                    HStack {
                        Spacer(minLength: 0)
                        Button {
                            session.completeSplash()
                        } label: {
                            Text(L10n.t("Skip").uppercased())
                                .font(Theme.font(10, weight: .bold))
                                .tracking(Theme.tracking(Theme.Tracking.hero, size: 10))
                                .foregroundColor(Theme.C.outline)
                                .padding(8)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(L10n.t("Skip"))
                    }
                    .padding(.top, 32 + insets.top - 8)
                    .padding(.trailing, 32 - 8)
                    Spacer(minLength: 0)
                }

                // Bottom block (bottom 64, gap 20)
                VStack(spacing: 20) {
                    Spacer(minLength: 0)
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(Theme.C.splashTrack)
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(Theme.C.neon)
                            .frame(width: 48)
                            .offset(x: sweeping ? 48 * 3.2 : -48 * 1.1)
                            .animation(.easeInOut(duration: 1.4).repeatForever(autoreverses: false), value: sweeping)
                    }
                    .frame(width: 120, height: 3)
                    .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
                    Text("BETA")
                        .font(Theme.font(9, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.beta, size: 9))
                        .foregroundColor(Theme.C.outline)
                }
                .padding(.bottom, 64)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .ignoresSafeArea()
        .onAppear {
            entered = true
            bobbing = true
            sweeping = true
        }
        .task {
            // 3.0 s minimum display (D11). `completeSplash()` is idempotent with Skip.
            let ns = UInt64(Theme.Motion.splashMinimumSeconds * 1_000_000_000)
            try? await Task.sleep(nanoseconds: ns)
            if !Task.isCancelled {
                session.completeSplash()
            }
        }
    }
}
