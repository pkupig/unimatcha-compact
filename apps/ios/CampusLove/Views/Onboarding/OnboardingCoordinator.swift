import SwiftUI

enum OnboardingStep {
    case checkingStatus
    case fillProfile
    case fillQuestionnaire
    case main
}

struct OnboardingCoordinator: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var step: OnboardingStep = .checkingStatus
    @StateObject private var profileVM = ProfileViewModel()
    @StateObject private var questionnaireVM = QuestionnaireViewModel()
    @StateObject private var matchingVM = MatchingViewModel()
    
    var body: some View {
        Group {
            switch step {
            case .checkingStatus:
                LoadingView(message: "正在初始化...")
                    .task { await checkOnboardingStatus() }
                
            case .fillProfile:
                ProfileSetupView(onComplete: {
                    Task { await questionnaireVM.loadQuestionnaire() }
                    step = .fillQuestionnaire
                })
                .environmentObject(profileVM)
                
            case .fillQuestionnaire:
                QuestionnaireView(onComplete: { step = .main })
                    .environmentObject(questionnaireVM)
                
            case .main:
                MainMatchingView()
                    .environmentObject(authVM)
                    .environmentObject(matchingVM)
            }
        }
    }
    
    private func checkOnboardingStatus() async {
        await profileVM.loadProfile()
        
        if profileVM.profile == nil || profileVM.completeness < 50 {
            step = .fillProfile
            return
        }
        
        // Check if questionnaire submitted
        await questionnaireVM.loadQuestionnaire()
        // For MVP: if profile is complete, proceed to main
        // (In production, check if current version questionnaire was submitted)
        step = .main
    }
}

struct LoadingView: View {
    let message: String
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text(message).font(.subheadline).foregroundColor(.secondary)
        }
    }
}
