// Interface outline: implementation bodies removed.
import SwiftUI
struct QuestionnaireView: View {
    let mode: MatchMode
    var allowSkip: Bool = false
    let onComplete: () -> Void
    var body: some View {
    private func questionHeader(_ q: Question) -> some View
    private func answerInput(for q: Question) -> some View
    private func errorState(_ message: String) -> some View
    private func handleNext()
struct SingleChoiceInput: View {
    let question: Question
    let answer: String
    let onSelect: (String) -> Void
    var body: some View {
struct MultipleChoiceInput: View {
    let question: Question
    let answers: [String]
    let onToggle: (String) -> Void
    var body: some View {
struct ScaleInput: View {
    let answer: Int
    let onSelect: (Int) -> Void
    var body: some View {
struct QuestionTextInput: View {
    let answer: String
    let onChange: (String) -> Void
    init(answer: String, onChange: @escaping (String) -> Void)
    var body: some View {
