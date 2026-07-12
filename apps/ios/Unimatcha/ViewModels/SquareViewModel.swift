import Foundation
import SwiftUI

@MainActor
final class SquareViewModel: ObservableObject {
    @Published var posts: [CouplePost] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var page = 1
    @Published var total = 0

    // New post
    @Published var newPostContent = ""
    @Published var isPosting = false
    @Published var showNewPost = false

    func loadPosts() async {
        isLoading = true
        errorMessage = nil
        do {
            let resp = try await SquareService.listPosts(page: page)
            self.posts = resp.posts
            self.total = resp.total
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func createPost() async {
        guard !newPostContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        isPosting = true
        do {
            let post = try await SquareService.createPost(content: newPostContent)
            posts.insert(post, at: 0)
            newPostContent = ""
            showNewPost = false
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isPosting = false
    }

    func likePost(_ postId: String) async {
        do {
            _ = try await SquareService.likePost(id: postId)
            if let idx = posts.firstIndex(where: { $0.id == postId }) {
                // Optimistic update — create new post with incremented like
                let old = posts[idx]
                let updated = CouplePost(
                    id: old.id, matchId: old.matchId, authorUserId: old.authorUserId,
                    content: old.content, imageUrl: old.imageUrl,
                    likeCount: old.likeCount + 1, commentCount: old.commentCount,
                    createdAt: old.createdAt, author: old.author, match: old.match, comments: old.comments
                )
                posts[idx] = updated
            }
        } catch {}
    }

    func addComment(postId: String, content: String) async {
        do {
            let comment = try await SquareService.createComment(postId: postId, content: content)
            if let idx = posts.firstIndex(where: { $0.id == postId }) {
                let old = posts[idx]
                var comments = old.comments ?? []
                comments.append(comment)
                let updated = CouplePost(
                    id: old.id, matchId: old.matchId, authorUserId: old.authorUserId,
                    content: old.content, imageUrl: old.imageUrl,
                    likeCount: old.likeCount, commentCount: old.commentCount + 1,
                    createdAt: old.createdAt, author: old.author, match: old.match, comments: comments
                )
                posts[idx] = updated
            }
        } catch {}
    }
}
