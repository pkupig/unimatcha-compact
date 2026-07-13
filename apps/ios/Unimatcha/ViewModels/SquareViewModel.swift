import Foundation
import SwiftUI

enum SquareBoard: String, CaseIterable, Identifiable {
    case recommend, campusWall
    var id: String { rawValue }
    var title: String { self == .recommend ? "推荐" : "校园墙" }
}

@MainActor
final class SquareViewModel: ObservableObject {
    @Published var board: SquareBoard = .recommend
    @Published var cards: [SquareCard] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var needProfileSchool = false
    private var page = 1
    private var hasMore = true

    func switchBoard(_ b: SquareBoard) async { board = b; await reload() }

    func reload() async {
        page = 1; hasMore = true; cards = []
        await loadMore()
    }

    func loadMore() async {
        guard hasMore, !isLoading else { return }
        isLoading = true; errorMessage = nil
        do {
            let resp = board == .recommend
                ? try await SquareService.recommend(page: page)
                : try await SquareService.campusWall(page: page)
            needProfileSchool = resp.needProfileSchool ?? false
            cards.append(contentsOf: resp.items)
            hasMore = resp.hasMore ?? false
            page += 1
        } catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    func like(_ id: String) async {
        guard let idx = cards.firstIndex(where: { $0.id == id }) else { return }
        do {
            let r = try await SquareService.like(id: id)
            let old = cards[idx]
            let delta = r.liked ? 1 : -1
            cards[idx] = old.withLike((old.likeCount ?? 0) + delta)
        } catch { /* ignore */ }
    }
}

private extension SquareCard {
    func withLike(_ n: Int) -> SquareCard {
        SquareCard(id: id, board: board, authorType: authorType, cardType: cardType, title: title,
                   content: content, images: images, anonymous: anonymous, isSponsored: isSponsored,
                   school: school, sameSchool: sameSchool, likeCount: n, commentCount: commentCount,
                   createdAt: createdAt, authorUser: authorUser, anonymousAuthor: anonymousAuthor,
                   tags: tags, isMine: isMine)
    }
}
