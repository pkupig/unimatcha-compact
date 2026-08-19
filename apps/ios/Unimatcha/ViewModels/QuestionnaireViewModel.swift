// Interface outline: implementation bodies removed.
import Foundation
import SwiftUI
    @Published var mode: MatchMode = .romantic
    @Published var questionnaire: QuestionnaireVersion?
    @Published var isLoading = false
    @Published var isSubmitting = false
    @Published var isSubmitted = false
    @Published var errorMessage: String?
    @Published var currentIndex = 0
    @Published var answers: [String: Any] = [:]
    func load(mode: MatchMode) async
    func setAnswer(questionId: String, value: Any)
    func getStringAnswer(_ q: String) -> String
    func getArrayAnswer(_ q: String) -> [String]
    func getScaleAnswer(_ q: String) -> Int
    func isCurrentQuestionAnswered() -> Bool
    var currentQuestion: Question? {
    var progress: Double {
    var isLastQuestion: Bool {
    func submitAnswers() async
