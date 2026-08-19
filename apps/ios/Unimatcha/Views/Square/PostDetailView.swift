// Interface outline: implementation bodies removed.
import SwiftUI
struct PostDetailView: View {
    let postId: String
    var body: some View {
    private func content(_ d: SquarePostDetail) -> some View
    private func authorHeader(_ d: SquarePostDetail) -> some View
    private func commentRow(_ c: SquareComment, isReply: Bool) -> some View
    private func errorState(_ message: String) -> some View
    private func load() async
    private func toggleLike() async
    private func sendComment() async
    private func submitReport() async
    private func deletePost() async
