// Interface outline: implementation bodies removed.
import Foundation
import SwiftUI
    @Published var sessions: [ChatSession] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    func load() async
