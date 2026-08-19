// Interface outline: implementation bodies removed.
import SwiftUI
struct ChatView: View {
    init(matchId: String, partnerName: String)
    init(matchId: String, currentUserId: String, partner: PublicProfile?)
    var body: some View {
    init(matchId: String, currentUserId: String, partnerName: String, partner: PublicProfile?)
    var body: some View {
    private func messageRow(_ msg: ChatMessage) -> some View
    let text: String?
    var body: some View {
    let message: ChatMessage
    let isMine: Bool
    let partnerInitial: String
    let partnerAvatarUrl: String?
    var body: some View {
    private func formattedTime(_ date: Date) -> String
