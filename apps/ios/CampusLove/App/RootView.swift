import SwiftUI

struct RootView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var showSplash = true

    var body: some View {
        ZStack {
            if showSplash {
                SplashView()
                    .transition(.opacity)
            } else {
                Group {
                    if authVM.isLoggedIn {
                        OnboardingCoordinator()
                            .environmentObject(authVM)
                    } else {
                        AuthView()
                            .environmentObject(authVM)
                    }
                }
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.4), value: showSplash)
        .animation(.easeInOut, value: authVM.isLoggedIn)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
                showSplash = false
            }
        }
    }
}
