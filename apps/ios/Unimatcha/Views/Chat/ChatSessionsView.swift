import SwiftUI

/// Chat tab root — list of active conversations synthesized from matches.
/// Each session keys on `matchId` (no sessionId). Temp sessions show a 48h countdown.
struct ChatSessionsView: View {
    @EnvironmentObject var sessionsVM: ChatSessionsViewModel
    @EnvironmentObject var authVM: AuthViewModel

    var body: some View {
        NavigationStack {
            Group {
                if sessionsVM.sessions.isEmpty && !sessionsVM.isLoading {
                    emptyState
                } else {
                    sessionList
                }
            }
            .navigationTitle("聊天")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(Theme.surfaceLo, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .themedScreen()
            .task { await sessionsVM.load() }
            .refreshable { await sessionsVM.load() }
        }
        .tint(Theme.accent)
    }

    // MARK: - List

    private var sessionList: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                if let err = sessionsVM.errorMessage {
                    errorBanner(err)
                }
                ForEach(sessionsVM.sessions) { session in
                    NavigationLink {
                        ChatView(
                            matchId: session.matchId,
                            partnerName: session.partner?.nickname ?? "对方"
                        )
                    } label: {
                        SessionRow(session: session)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(Theme.warning)
            Text(message)
                .font(.system(size: 13))
                .foregroundColor(Theme.textSecondary)
            Spacer()
        }
        .padding(12)
        .background(Theme.surfaceHi)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            ZStack {
                Circle()
                    .fill(Theme.surfaceHi)
                    .frame(width: 96, height: 96)
                Image(systemName: "bubble.left.and.bubble.right")
                    .font(.system(size: 40, weight: .light))
                    .foregroundColor(Theme.accent)
            }
            Text("还没有聊天")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
            Text("匹配成功后就能在这里和 TA 聊天啦")
                .font(.system(size: 14))
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 40)
    }
}

// MARK: - Session Row

private struct SessionRow: View {
    let session: ChatSession

    private var isTemp: Bool { session.sessionType == "temp" }
    private var isRomantic: Bool { session.mode == "romantic" }

    var body: some View {
        Card(padding: 14) {
            HStack(spacing: 12) {
                avatar
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(session.partner?.nickname ?? "对方")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(Theme.textPrimary)
                            .lineLimit(1)
                        modeBadge
                        Spacer(minLength: 4)
                        if isTemp, let remaining = countdownText {
                            HStack(spacing: 3) {
                                Image(systemName: "timer")
                                    .font(.system(size: 10, weight: .semibold))
                                Text(remaining)
                                    .font(.system(size: 11, weight: .semibold))
                            }
                            .foregroundColor(Theme.warning)
                        }
                    }
                    HStack(spacing: 8) {
                        Text(session.lastMessage?.isEmpty == false ? session.lastMessage! : "打个招呼吧～")
                            .font(.system(size: 13))
                            .foregroundColor(Theme.textSecondary)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        unreadBadge
                    }
                }
            }
        }
    }

    private var avatar: some View {
        ZStack(alignment: .bottomTrailing) {
            AsyncImage(url: URL(string: session.partner?.avatarUrl ?? "")) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    ZStack {
                        Theme.surfaceHi
                        Text(String((session.partner?.nickname ?? "?").prefix(1)))
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(Theme.accent)
                    }
                }
            }
            .frame(width: 52, height: 52)
            .clipShape(Circle())
            .overlay(Circle().stroke(Theme.outline, lineWidth: 1))
        }
    }

    private var modeBadge: some View {
        Text(isRomantic ? "恋爱" : "交友")
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(isRomantic ? Theme.onAccent : Theme.textPrimary)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(isRomantic ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(Theme.surfaceHi))
            .clipShape(Capsule())
    }

    @ViewBuilder
    private var unreadBadge: some View {
        if let count = session.unreadCount, count > 0 {
            Text(count > 99 ? "99+" : "\(count)")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(Theme.onAccent)
                .padding(.horizontal, 6)
                .frame(minWidth: 20, minHeight: 20)
                .background(Theme.accent)
                .clipShape(Capsule())
        }
    }

    private var countdownText: String? {
        guard let ms = session.remainingMs, ms > 0 else { return nil }
        let totalSeconds = Int(ms / 1000)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        if hours >= 1 {
            return "剩 \(hours)h"
        }
        return "剩 \(minutes)m"
    }
}
