import SwiftUI

/// Branded splash — Unimatcha neon-green wordmark on near-black.
struct SplashView: View {
    @State private var logoScale: CGFloat = 0.6
    @State private var logoOpacity: Double = 0
    @State private var textOpacity: Double = 0
    @State private var glowPulse: Bool = false

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            // Subtle neon glow behind the mark
            Circle()
                .fill(Theme.accent.opacity(0.18))
                .frame(width: 260, height: 260)
                .blur(radius: 60)
                .scaleEffect(glowPulse ? 1.08 : 0.92)
                .opacity(logoOpacity)

            VStack(spacing: 20) {
                ZStack {
                    Circle()
                        .fill(Theme.accentGradient)
                        .frame(width: 104, height: 104)
                        .shadow(color: Theme.accent.opacity(0.45), radius: 24, y: 8)

                    Image(systemName: "sparkles")
                        .font(.system(size: 46, weight: .bold))
                        .foregroundColor(Theme.onAccent)
                }
                .scaleEffect(logoScale)
                .opacity(logoOpacity)

                VStack(spacing: 8) {
                    Text("Unimatcha")
                        .font(.system(size: 32, weight: .heavy, design: .rounded))
                        .foregroundColor(Theme.textPrimary)

                    Text("遇见最合适的 TA")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(Theme.textSecondary)
                }
                .opacity(textOpacity)
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.8, dampingFraction: 0.6)) {
                logoScale = 1.0
                logoOpacity = 1.0
            }
            withAnimation(.easeIn(duration: 0.6).delay(0.4)) {
                textOpacity = 1.0
            }
            withAnimation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true)) {
                glowPulse = true
            }
        }
    }
}

#if DEBUG
struct SplashView_Previews: PreviewProvider {
    static var previews: some View { SplashView() }
}
#endif
