// Interface outline: implementation bodies removed.
import Foundation
import SwiftUI
    @Published var space: CoupleSpace?
    @Published var isLoading = false
    @Published var errorMessage: String?
    let matchId: String
    init(matchId: String)
    func load() async
    func loveYou() async
    func setStatus(_ s: String) async
    func setCraving(_ text: String) async
    func addBucket(_ text: String) async
    func toggleBucket(_ item: CoupleBucketItem) async
    func addAnniversary(title: String, date: String) async
