import SwiftUI

/// Public entry to a conversation. Resolves the current user id from the
/// injected `AuthViewModel`, then hands a concrete id to the inner screen that
/// owns the `ChatViewModel` (an @EnvironmentObject can't be read inside init()).
///
/// Two constructors:
///  • `ChatView(matchId:partnerName:)`         — from the chat sessions list.
///  • `ChatView(matchId:currentUserId:partner:)` — from the match screen (id already known).
struct ChatView: View {
    @EnvironmentObject private var authVM: AuthViewModel

    private let matchId: String
    private let partnerName: String
    private let partner: PublicProfile?
    private let explicitUserId: String?

    init(matchId: String, partnerName: String) {
        self.matchId = matchId
        self.partnerName = partnerName
        self.partner = nil
        self.explicitUserId = nil
    }

    init(matchId: String, currentUserId: String, partner: PublicProfile?) {
        self.matchId = matchId
        self.partnerName = partner?.nickname ?? "对方"
        self.partner = partner
        self.explicitUserId = currentUserId
    }

    var body: some View {
        ChatScreen(
            matchId: matchId,
            currentUserId: explicitUserId ?? authVM.currentUser?.id ?? "",
            partnerName: partnerName,
            partner: partner
        )
    }
}

// MARK: - Conversation screen

private struct ChatScreen: View {
    @StateObject private var vm: ChatViewModel
    @Environment(\.dismiss) private var dismiss
    @FocusState private var isInputFocused: Bool

    private let partner: PublicProfile?

    init(matchId: String, currentUserId: String, partnerName: String, partner: PublicProfile?) {
        self.partner = partner
        _vm = StateObject(wrappedValue: ChatViewModel(
            matchId: matchId,
            currentUserId: currentUserId,
            partnerName: partnerName
        ))
    }

    var body: some View {
        VStack(spacing: 0) {
            messagesScroll
            inputBar
        }
        .background(Theme.bg.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) { headerTitle }
            ToolbarItem(placement: .navigationBarTrailing) { profileLink }
        }
        .toolbarBackground(Theme.surfaceLo, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .task {
            await vm.loadHistory()
            vm.startPolling()
        }
        .onDisappear { vm.stopPolling() }
        .alert("发送失败", isPresented: Binding(
            get: { vm.errorMessage != nil },
            set: { if !$0 { vm.errorMessage = nil } }
        )) {
            Button("好的", role: .cancel) { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
    }

    // MARK: Header

    private var headerTitle: some View {
        VStack(spacing: 1) {
            Text(vm.partnerName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private var profileLink: some View {
        if let userId = partner?.userId {
            NavigationLink(destination: PartnerProfileView(userId: userId)) {
                Text("主页")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.accent)
            }
        }
    }

    // MARK: Messages

    private var messagesScroll: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(vm.messages) { msg in
                        messageRow(msg)
                            .id(msg.id)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: vm.messages.count) { _ in
                guard let last = vm.messages.last else { return }
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
            .onAppear {
                if let last = vm.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
            }
        }
    }

    @ViewBuilder
    private func messageRow(_ msg: ChatMessage) -> some View {
        if msg.kind == "nudge" {
            NudgeLine(text: msg.content)
        } else {
            MessageBubble(
                message: msg,
                isMine: msg.senderId == vm.currentUserId,
                partnerInitial: String(vm.partnerName.prefix(1)),
                partnerAvatarUrl: partner?.avatarUrl
            )
        }
    }

    // MARK: Input bar

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 10) {
            Button {
                Task { await vm.nudge() }
            } label: {
                Image(systemName: "hand.wave.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(Theme.accent)
                    .frame(width: 40, height: 40)
                    .background(Theme.surfaceHi)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)

            TextField("说点什么…", text: $vm.inputText, axis: .vertical)
                .font(.system(size: 15))
                .foregroundColor(Theme.textPrimary)
                .tint(Theme.accent)
                .focused($isInputFocused)
                .lineLimit(1...5)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(Theme.surfaceHi)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(Theme.outline, lineWidth: 1))

            Button {
                Task { await vm.sendMessage() }
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(canSend ? Theme.onAccent : Theme.textMuted)
                    .frame(width: 40, height: 40)
                    .background(canSend ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(Theme.surfaceHi))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(!canSend || vm.isSending)
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .background(Theme.surfaceLo.ignoresSafeArea(edges: .bottom))
        .overlay(Divider().background(Theme.outline), alignment: .top)
    }

    private var canSend: Bool {
        !vm.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

// MARK: - Nudge system line

private struct NudgeLine: View {
    let text: String?

    var body: some View {
        HStack {
            Spacer()
            HStack(spacing: 5) {
                Image(systemName: "hand.wave.fill")
                    .font(.system(size: 11))
                Text(text?.isEmpty == false ? text! : "戳了戳对方")
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundColor(Theme.textSecondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Theme.surfaceHi)
            .clipShape(Capsule())
            Spacer()
        }
    }
}

// MARK: - Message bubble

private struct MessageBubble: View {
    let message: ChatMessage
    let isMine: Bool
    let partnerInitial: String
    let partnerAvatarUrl: String?

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isMine {
                Spacer(minLength: 40)
            } else {
                partnerAvatar
            }

            VStack(alignment: isMine ? .trailing : .leading, spacing: 3) {
                bubbleContent
                Text(formattedTime(message.createdDate))
                    .font(.system(size: 10))
                    .foregroundColor(Theme.textMuted)
            }

            if isMine {
                // no trailing avatar for my messages
            } else {
                Spacer(minLength: 40)
            }
        }
    }

    @ViewBuilder
    private var bubbleContent: some View {
        if let url = message.imageUrl, !url.isEmpty {
            AsyncImage(url: URL(string: url)) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    Theme.surfaceHi
                }
            }
            .frame(width: 180, height: 180)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.outline, lineWidth: 1))
        } else {
            Text(message.content ?? "")
                .font(.system(size: 15))
                .foregroundColor(isMine ? Theme.onAccent : Theme.textPrimary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    isMine
                        ? AnyShapeStyle(Theme.accentGradient)
                        : AnyShapeStyle(Theme.surface)
                )
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(isMine ? Color.clear : Theme.outline, lineWidth: 1)
                )
        }
    }

    private var partnerAvatar: some View {
        AsyncImage(url: URL(string: partnerAvatarUrl ?? "")) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            default:
                ZStack {
                    Theme.surfaceHi
                    Text(partnerInitial)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Theme.accent)
                }
            }
        }
        .frame(width: 32, height: 32)
        .clipShape(Circle())
        .overlay(Circle().stroke(Theme.outline, lineWidth: 1))
    }

    private func formattedTime(_ date: Date) -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "HH:mm"
        return fmt.string(from: date)
    }
}
