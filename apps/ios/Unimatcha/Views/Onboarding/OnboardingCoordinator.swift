import SwiftUI

/// Post-login gate. Decides where a freshly-authenticated user lands:
///   • no profile yet            → first-run `ProfileSetupView`
///   • profile exists            → `MainTabView` (the 5-tab shell)
///
/// The questionnaire is intentionally OPTIONAL here — a user can reach the
/// main app without answering either mode's survey. Entering a match mode
/// later is what prompts the questionnaire (see the match tab). We still let
/// the user knock it out right after profile setup via an optional step, but
/// they can always skip straight through.
struct OnboardingCoordinator: View {
    @EnvironmentObject var authVM: AuthViewModel

    /// Owned here so ProfileSetupView + the optional questionnaire step share it.
    @StateObject private var profileVM = ProfileViewModel()
    @StateObject private var questionnaireVM = QuestionnaireViewModel()

    /// Local route state. Seeded from `currentUser` on appear, then advanced
    /// explicitly as each step completes.
    @State private var phase: Phase = .checking

    private enum Phase {
        case checking            // pulling profile status
        case profile             // first-run profile form
        case questionnaire       // optional survey right after setup
        case main                // into the app
    }

    var body: some View {
        Group {
            switch phase {
            case .checking:
                LoadingView(message: "正在准备…")
                    .themedScreen()
                    .task { await decideInitialPhase() }

            case .profile:
                ProfileSetupView {
                    // Profile saved + authVM refreshed inside the view.
                    // Offer the romantic questionnaire as an optional next step.
                    Task { await questionnaireVM.load(mode: .romantic) }
                    phase = .questionnaire
                }
                .environmentObject(profileVM)
                .environmentObject(authVM)

            case .questionnaire:
                QuestionnaireView(mode: .romantic, allowSkip: true) {
                    Task { await authVM.refresh() }
                    phase = .main
                }
                .environmentObject(questionnaireVM)

            case .main:
                MainTabView()
                    .environmentObject(authVM)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: phase)
    }

    /// Trust the server-authoritative `hasProfile` flag from /users/me first,
    /// falling back to a fresh profile fetch if the user object is thin
    /// (login/register returns a lighter user than /users/me).
    private func decideInitialPhase() async {
        if authVM.currentUser?.hasProfile == true {
            phase = .main
            return
        }

        // Thin user or unknown — load the profile and re-check completeness.
        await profileVM.loadProfile()
        if authVM.currentUser?.hasProfile == true || profileVM.profile != nil {
            phase = .main
        } else {
            phase = .profile
        }
    }
}

// MARK: - Shared loading placeholder (themed)

/// Centered spinner + caption on the dark brand background. Reused across the
/// onboarding flow.
struct LoadingView: View {
    let message: String

    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(Theme.accent)
                .scaleEffect(1.2)
            Text(message)
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
