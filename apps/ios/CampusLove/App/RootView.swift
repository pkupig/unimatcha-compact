import SwiftUI

struct RootView: View {
    @EnvironmentObject var authVM: AuthViewModel
    
    var body: some View {
        Group {
            if authVM.isLoggedIn {
                OnboardingCoordinator()
                    .environmentObject(authVM)
            } else {
                AuthView()
                    .environmentObject(authVM)
            }
        }
        .animation(.easeInOut, value: authVM.isLoggedIn)
    }
}
