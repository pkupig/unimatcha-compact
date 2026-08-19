// Interface outline: implementation bodies removed.
import SwiftUI
struct CreatePostView: View {
    var initialBoard: SquareBoard = .recommend
    var onPosted: () -> Void = {}
    init(board: SquareBoard = .recommend, onPosted: @escaping () -> Void =
    var body: some View {
    private func field<Content: View>(label: String, @ViewBuilder _ content: () -> Content) -> some View
    private func submit() async
