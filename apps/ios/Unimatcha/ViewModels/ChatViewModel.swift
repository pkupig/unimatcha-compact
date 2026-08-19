// Interface outline: implementation bodies removed.
import Foundation
import SwiftUI
    @Published var messages: [ChatMessage] = []
    @Published var inputText: String = ""
    @Published var isSending = false
    @Published var errorMessage: String?
    let matchId: String
    let currentUserId: String
    let partnerName: String
    init(matchId: String, currentUserId: String, partnerName: String)
    func loadHistory() async
    func sendMessage() async
    func nudge() async
    func startPolling()
    func stopPolling()
    private func poll() async
