import SwiftUI

/// 消息 tab — 通知列表。由 MainTabView 注入 NotificationViewModel。
/// 列表项含图标 / 标题 / 正文 / 时间 / 未读圆点；工具栏「全部已读」。
struct NotificationsView: View {
    @EnvironmentObject var notifVM: NotificationViewModel

    var body: some View {
        NavigationStack {
            Group {
                if notifVM.isLoading && notifVM.items.isEmpty {
                    ProgressView().tint(Theme.accent)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if notifVM.items.isEmpty {
                    emptyState
                } else {
                    list
                }
            }
            .themedScreen()
            .navigationTitle("消息")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await notifVM.markAllRead() }
                    } label: {
                        Text("全部已读")
                            .font(.system(size: 14, weight: .medium))
                    }
                    .tint(Theme.accent)
                    .disabled(notifVM.unread == 0)
                }
            }
        }
        .task { await notifVM.load() }
    }

    // MARK: - List
    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(notifVM.items) { item in
                    row(item)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .refreshable { await notifVM.load() }
    }

    private func row(_ item: AppNotification) -> some View {
        let unread = !(item.isRead ?? false)
        return Card {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    Circle()
                        .fill(unread ? Theme.accent.opacity(0.15) : Theme.surfaceHi)
                        .frame(width: 40, height: 40)
                    Image(systemName: icon(for: item.type))
                        .font(.system(size: 17))
                        .foregroundColor(unread ? Theme.accent : Theme.textSecondary)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title ?? "通知")
                        .font(.system(size: 15, weight: unread ? .semibold : .medium))
                        .foregroundColor(Theme.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if let body = item.body, !body.isEmpty {
                        Text(body)
                            .font(.system(size: 13))
                            .foregroundColor(Theme.textSecondary)
                            .lineLimit(3)
                    }

                    if let created = item.createdAt {
                        Text(relativeTime(created))
                            .font(.system(size: 11))
                            .foregroundColor(Theme.textMuted)
                    }
                }

                if unread {
                    Circle()
                        .fill(Theme.accent)
                        .frame(width: 8, height: 8)
                        .padding(.top, 6)
                }
            }
        }
    }

    // MARK: - Empty
    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "bell.slash")
                .font(.system(size: 44))
                .foregroundColor(Theme.textMuted)
            Text("暂无消息")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(Theme.textSecondary)
            Text("匹配结果、聊天与广场互动都会出现在这里")
                .font(.system(size: 13))
                .foregroundColor(Theme.textMuted)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Helpers
    private func icon(for type: String?) -> String {
        switch type {
        case "match", "MATCH": return "sparkles"
        case "message", "chat", "MESSAGE": return "bubble.left.fill"
        case "like", "LIKE": return "heart.fill"
        case "comment", "COMMENT": return "text.bubble.fill"
        case "system", "SYSTEM": return "gearshape.fill"
        case "energy", "ENERGY": return "bolt.fill"
        default: return "bell.fill"
        }
    }

    private func relativeTime(_ iso: String) -> String {
        guard let date = ISODate.parse(iso) else { return String(iso.prefix(10)) }
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "zh_CN")
        f.unitsStyle = .short
        return f.localizedString(for: date, relativeTo: Date())
    }
}
