// Interface outline: implementation bodies removed.
import Foundation
import SwiftUI
    @Published var mode: MatchMode = .romantic
    @Published var status: MatchStatus?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var actionMessage: String?
    var state: MatchState { status?.state ?? .idle }
    func load() async
    func switchMode(_ m: MatchMode) async
    func start(enhanced: Bool = false, cells: Int? = nil) async
    func stop() async
    func confirm(matchId: String) async
    func dissolve(matchId: String, reason: String? = nil) async
