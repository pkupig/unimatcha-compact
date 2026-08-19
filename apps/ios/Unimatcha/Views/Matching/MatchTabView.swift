// Interface outline: implementation bodies removed.
import SwiftUI
struct MatchTabView: View {
    var body: some View {
    private func confirmDissolveButtons(matchId: String?) -> some View
    private func sectionHeader(title: String, subtitle: String) -> some View
    private func heroCircle(icon: String, dim: Bool = false) -> some View
    private func shortTime(_ iso: String) -> String
    var body: some View {
    let partner: PublicProfile
    let score: Double?
    var body: some View {
struct AvatarCircle: View {
    let urlString: String?
    let fallback: String?
    var size: CGFloat = 56
    var body: some View {
struct TagChip: View {
    let text: String
    var body: some View {
