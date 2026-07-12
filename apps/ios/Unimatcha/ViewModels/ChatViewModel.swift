import Foundation
import SwiftUI

@MainActor
final class ChatViewModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var inputText: String = ""
    @Published var isSending = false
    @Published var errorMessage: String?

    let matchId: String
    let currentUserId: String
    let partnerName: String

    private var lastMessageId: String?
    private var pollTask: Task<Void, Never>?

    init(matchId: String, currentUserId: String, partnerName: String) {
        self.matchId = matchId
        self.currentUserId = currentUserId
        self.partnerName = partnerName
    }

    // ─── 加载历史消息 ──────────────────────────────────────
    func loadHistory() async {
        do {
            let res = try await ChatService.getMessages(matchId: matchId, limit: 50)
            self.messages = res.messages
            self.lastMessageId = res.messages.last?.id
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // ─── 发送消息 ─────────────────────────────────────────
    func sendMessage() async {
        let content = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }
        inputText = ""
        isSending = true
        do {
            let msg = try await ChatService.sendMessage(matchId: matchId, content: content)
            messages.append(msg)
            lastMessageId = msg.id
        } catch let e as APIError {
            errorMessage = e.errorDescription
            inputText = content // restore
        } catch {
            errorMessage = error.localizedDescription
            inputText = content
        }
        isSending = false
    }

    // ─── 开始轮询 ─────────────────────────────────────────
    func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                guard !Task.isCancelled else { break }
                await self?.poll()
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    private func poll() async {
        do {
            let res = try await ChatService.pollMessages(matchId: matchId, afterId: lastMessageId)
            if !res.messages.isEmpty {
                messages.append(contentsOf: res.messages)
                lastMessageId = res.messages.last?.id
            }
        } catch { /* silently ignore poll errors */ }
    }

    deinit {
        pollTask?.cancel()
    }
}
