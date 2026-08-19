// Interface outline: implementation bodies removed.
import SwiftUI
struct ProfileSetupView: View {
    let onComplete: () -> Void
    var body: some View {
    private func fieldLabel(_ text: String) -> some View
    private func metadataPicker(for field: PickerField) -> some View
    private func saveAndContinue() async
struct FormSection<Content: View>: View {
    let title: String
    var body: some View {
struct OnboardTextField: View {
    let label: String
    let placeholder: String
    var body: some View {
struct PickerRow: View {
    let label: String?
    let value: String
    let placeholder: String
    let action: () -> Void
    var body: some View {
struct NeonTag: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    var body: some View {
struct FlexTagRow: View {
    let items: [String]
    let values: [String]
    let selected: String
    let onSelect: (String) -> Void
    var body: some View {
struct TagFlowGrid: View {
    let tags: [String]
    let selected: [String]
    let onToggle: (String) -> Void
    var body: some View {
struct MetadataPickerSheet: View {
    let title: String
    let options: [String]
    let selected: String
    let allowFreeText: Bool
    let onPick: (String) -> Void
    var body: some View {
    private func commit(_ value: String)
