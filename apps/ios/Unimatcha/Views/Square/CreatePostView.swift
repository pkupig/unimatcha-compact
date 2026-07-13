import SwiftUI

/// Compose a new Square v2 post — board picker (推荐 / 校园墙), optional title,
/// required content, anonymous toggle. Submits via SquareService.createPost.
struct CreatePostView: View {
    /// Board pre-selected from the feed the user came from.
    var initialBoard: SquareBoard = .recommend
    /// Called after a successful post so the feed can refresh.
    var onPosted: () -> Void = {}

    @Environment(\.dismiss) private var dismiss

    @State private var board: SquareBoard
    @State private var title = ""
    @State private var content = ""
    @State private var anonymous = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    init(board: SquareBoard = .recommend, onPosted: @escaping () -> Void = {}) {
        self.initialBoard = board
        self.onPosted = onPosted
        _board = State(initialValue: board)
    }

    /// Request payload uses lowercase board strings.
    private var boardParam: String {
        board == .recommend ? "recommend" : "campus_wall"
    }

    private var canSubmit: Bool {
        !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSubmitting
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    boardPicker

                    field(label: "标题（可选）") {
                        TextField("给动态起个标题", text: $title)
                            .font(.system(size: 15))
                            .foregroundColor(Theme.textPrimary)
                            .padding(12)
                            .background(Theme.surfaceHi)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.radiusSm).stroke(Theme.outline, lineWidth: 1))
                    }

                    field(label: "内容") {
                        ZStack(alignment: .topLeading) {
                            if content.isEmpty {
                                Text("分享你的想法…")
                                    .font(.system(size: 15))
                                    .foregroundColor(Theme.textMuted)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 16)
                            }
                            TextEditor(text: $content)
                                .font(.system(size: 15))
                                .foregroundColor(Theme.textPrimary)
                                .scrollContentBackground(.hidden)
                                .frame(minHeight: 160)
                                .padding(8)
                        }
                        .background(Theme.surfaceHi)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.radiusSm).stroke(Theme.outline, lineWidth: 1))
                    }

                    Toggle(isOn: $anonymous) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("匿名发布")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(Theme.textPrimary)
                            Text("其他人看不到你的昵称和头像")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.textMuted)
                        }
                    }
                    .tint(Theme.accent)
                    .padding(14)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))

                    if let errorMessage = errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 13))
                            .foregroundColor(Theme.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(16)
            }
            .themedScreen()
            .navigationTitle("发布动态")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                        .foregroundColor(Theme.textSecondary)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSubmitting {
                            ProgressView().tint(Theme.accent)
                        } else {
                            Text("发布").fontWeight(.bold)
                                .foregroundColor(canSubmit ? Theme.accent : Theme.textMuted)
                        }
                    }
                    .disabled(!canSubmit)
                }
            }
        }
    }

    // MARK: - Board picker

    private var boardPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("发布到")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Theme.textSecondary)

            HStack(spacing: 6) {
                ForEach(SquareBoard.allCases) { b in
                    Button {
                        board = b
                    } label: {
                        Text(b.title)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(board == b ? Theme.onAccent : Theme.textSecondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(
                                board == b
                                    ? AnyShapeStyle(Theme.accentGradient)
                                    : AnyShapeStyle(Color.clear)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)
            .background(Theme.surfaceLo)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
        }
    }

    private func field<Content: View>(label: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Theme.textSecondary)
            content()
        }
    }

    // MARK: - Submit

    private func submit() async {
        let trimmedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedContent.isEmpty else { return }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)

        isSubmitting = true
        errorMessage = nil
        let req = CreatePostRequest(
            board: boardParam,
            title: trimmedTitle.isEmpty ? nil : trimmedTitle,
            content: trimmedContent,
            images: nil,
            anonymous: anonymous,
            tags: nil
        )
        do {
            _ = try await SquareService.createPost(req)
            onPosted()
            dismiss()
        } catch let e as APIError {
            errorMessage = e.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}
