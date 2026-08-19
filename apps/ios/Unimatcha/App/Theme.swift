// Interface outline: implementation bodies removed.
import SwiftUI
enum Theme {
extension Color {
    init(hex: UInt, alpha: Double = 1)
struct NeonButtonStyle: ButtonStyle {
    var enabled: Bool = true
    func makeBody(configuration: Configuration) -> some View
struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View
struct Card<Content: View>: View {
    var padding: CGFloat = 16
    var body: some View {
extension View {
    func themedScreen() -> some View
