// Interface outline: implementation bodies removed.
import SwiftUI
struct ProfileEditView: View {
    var body: some View {
    private func sectionCard<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View
    private func fieldRow<Content: View>(label: String?, @ViewBuilder content: () -> Content) -> some View
    private func themedTextField(_ placeholder: String, text: Binding<String>) -> some View
    private func pickerNavRow(label: String, value: String, title: String,
    private func inlineMenuRow<Content: View>(label: String, value: String,
    private func socialRow(icon: String, placeholder: String, text: Binding<String>) -> some View
    private func searchablePicker(title: String, items: [String],
    private func toggleTag(_ tag: String)
    private func genderLabel(_ raw: String) -> String
    private func genderPrefLabel(_ raw: String) -> String
