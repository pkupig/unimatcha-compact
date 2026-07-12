import SwiftUI

struct ChatView: View {
    @StateObject private var vm: ChatViewModel
    @Environment(\.dismiss) private var dismiss
    @FocusState private var isInputFocused: Bool
    @State private var scrollProxy: ScrollViewProxy? = nil

    private let partner: PublicProfile?
    private let primaryColor = Color(red: 1, green: 0.4, blue: 0.5)

    init(matchId: String, currentUserId: String, partner: PublicProfile?) {
        self.partner = partner
        _vm = StateObject(wrappedValue: ChatViewModel(
            matchId: matchId,
            currentUserId: currentUserId,
            partnerName: partner?.nickname ?? "对方"
        ))
    }

    var body: some View {
        VStack(spacing: 0) {
            // ─── Header ───────────────────────────────────
            headerBar

            Divider()

            // ─── Messages ─────────────────────────────────
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(vm.messages) { msg in
                            MessageBubble(
                                message: msg,
                                isMine: msg.senderId == vm.currentUserId,
                                partnerInitial: String(vm.partnerName.prefix(1))
                            )
                            .id(msg.id)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .onAppear { scrollProxy = proxy }
                .onChange(of: vm.messages.count) { _ in
                    if let last = vm.messages.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }
            .background(Color(.systemGroupedBackground))

            Divider()

            // ─── Input Bar ────────────────────────────────
            inputBar
        }
        .navigationBarHidden(true)
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .task {
            await vm.loadHistory()
            vm.startPolling()
        }
        .onDisappear { vm.stopPolling() }
        .alert("发送失败", isPresented: .init(
            get: { vm.errorMessage != nil },
            set: { if !$0 { vm.errorMessage = nil } }
        )) {
            Button("好的") { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
    }

    // MARK: - Header
    private var headerBar: some View {
        HStack(spacing: 12) {
            Button(action: { dismiss() }) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(primaryColor)
                    .frame(width: 36, height: 36)
            }

            // Avatar
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [primaryColor, Color(red: 1, green: 0.55, blue: 0.6)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
                    .frame(width: 38, height: 38)
                Text(String(vm.partnerName.prefix(1)))
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.white)
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(vm.partnerName)
                    .font(.system(size: 16, weight: .semibold))
                Text("恋爱模式")
                    .font(.caption).foregroundColor(.secondary)
            }

            Spacer()

            if let userId = partner?.userId {
                NavigationLink(destination: PartnerProfileView(userId: userId)) {
                    Text("主页")
                        .font(.caption.weight(.medium))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Color(.systemGray6))
                        .cornerRadius(14)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(.systemBackground))
    }

    // MARK: - Input Bar
    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("说点什么...", text: $vm.inputText, axis: .vertical)
                .focused($isInputFocused)
                .lineLimit(1...5)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(Color(.systemGray6))
                .cornerRadius(20)
                .onSubmit { Task { await vm.sendMessage() } }

            Button(action: { Task { await vm.sendMessage() } }) {
                ZStack {
                    Circle()
                        .fill(vm.inputText.trimmingCharacters(in: .whitespaces).isEmpty
                              ? Color(.systemGray4) : primaryColor)
                        .frame(width: 40, height: 40)
                    Image(systemName: "arrow.up")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .disabled(vm.inputText.trimmingCharacters(in: .whitespaces).isEmpty || vm.isSending)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .padding(.bottom, max(0, (UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first?.safeAreaInsets.bottom ?? 0) - 10))
        .background(Color(.systemBackground))
    }
}

// MARK: - Message Bubble
private struct MessageBubble: View {
    let message: ChatMessage
    let isMine: Bool
    let partnerInitial: String

    private let primaryColor = Color(red: 1, green: 0.4, blue: 0.5)

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if !isMine {
                // Partner avatar
                ZStack {
                    Circle()
                        .fill(LinearGradient(colors: [primaryColor, Color(red: 1, green: 0.55, blue: 0.6)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 32, height: 32)
                    Text(partnerInitial).font(.caption.weight(.semibold)).foregroundColor(.white)
                }
                .alignmentGuide(.bottom) { d in d[.bottom] }
            } else {
                Spacer()
            }

            VStack(alignment: isMine ? .trailing : .leading, spacing: 3) {
                // Bubble
                Text(message.content)
                    .font(.system(size: 15))
                    .foregroundColor(isMine ? .white : .primary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(isMine ? primaryColor : Color(.systemGray6))
                    .cornerRadius(isMine ? 18 : 18)
                    .clipShape(
                        ChatBubbleShape(isMine: isMine)
                    )
                    .frame(maxWidth: UIScreen.main.bounds.width * 0.7, alignment: isMine ? .trailing : .leading)

                // Time + read indicator
                HStack(spacing: 3) {
                    Text(formattedTime(message.createdDate))
                        .font(.system(size: 10)).foregroundColor(.secondary)
                    if isMine {
                        Image(systemName: message.isRead ? "checkmark.message.fill" : "checkmark.message")
                            .font(.system(size: 9)).foregroundColor(message.isRead ? primaryColor : .secondary)
                    }
                }
            }

            if isMine {
                // My avatar placeholder (optional, can remove)
            } else {
                Spacer()
            }
        }
    }

    private func formattedTime(_ date: Date) -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "HH:mm"
        return fmt.string(from: date)
    }
}

// MARK: - Bubble Shape
private struct ChatBubbleShape: Shape {
    let isMine: Bool

    func path(in rect: CGRect) -> Path {
        let r: CGFloat = 18
        let tailR: CGFloat = 4
        var path = Path()
        if isMine {
            path.addRoundedRect(in: CGRect(x: rect.minX, y: rect.minY, width: rect.width - tailR, height: rect.height),
                                cornerSize: CGSize(width: r, height: r))
        } else {
            path.addRoundedRect(in: CGRect(x: tailR, y: rect.minY, width: rect.width - tailR, height: rect.height),
                                cornerSize: CGSize(width: r, height: r))
        }
        return path
    }
}
