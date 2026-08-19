// Interface outline: implementation bodies removed.
import Foundation
import SwiftUI
enum SquareBoard: String, CaseIterable, Identifiable {
    var id: String { rawValue }
    var title: String { self == .recommend ? "推荐" : "校园墙" }
    @Published var board: SquareBoard = .recommend
    @Published var cards: [SquareCard] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var needProfileSchool = false
    func switchBoard(_ b: SquareBoard) async
    func reload() async
    func loadMore() async
    func like(_ id: String) async
    func withLike(_ n: Int) -> SquareCard
