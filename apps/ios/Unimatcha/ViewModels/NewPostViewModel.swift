import Foundation
import Combine
import SwiftUI

// MARK: - NewPostViewModel (`#overlay-new-post` — h5-square.md §1.6, §2 "New post", §3 #12) — WP-09
//
// Shared instance (H5 keeps the compose state in `S.*`): `open(board:)` resets everything, exactly
// like `openNewPost`. The destination is fixed to the page the FAB was tapped on and is not user
// switchable; enabling the poll forces Campus Wall and disabling it restores the origin board.

@MainActor
final class NewPostViewModel: ObservableObject {
    static let shared = NewPostViewModel()

    static let overlayId = "new-post"

    // MARK: Published state

    /// Destination actually sent (`recommend` | `campus_wall`).
    @Published private(set) var board: SquareBoardKind = .recommend
    /// The page the composer was opened from — restored when the poll switch goes off.
    @Published private(set) var originBoard: SquareBoardKind = .recommend
    @Published var title: String = ""
    @Published var content: String = ""
    @Published private(set) var images: [PickedPhoto] = []
    @Published var anonymous = false
    @Published private(set) var poll = false
    @Published private(set) var pollOptions: [String] = ["", ""]
    @Published private(set) var submitting = false

    private var cancellables: Set<AnyCancellable> = []

    init() {
        NotificationCenter.default.publisher(for: .sessionDidReset)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.reset() }
            .store(in: &cancellables)
    }

    // MARK: Lifecycle

    /// `openNewPost`: images cleared, destination = current page, origin remembered, anonymous off,
    /// poll off, title/content cleared, two empty option rows.
    func open(board origin: SquareBoardKind) {
        let dest: SquareBoardKind = origin == .campus_wall ? .campus_wall : .recommend
        board = dest
        originBoard = dest
        title = ""
        content = ""
        images = []
        anonymous = false
        poll = false
        pollOptions = ["", ""]
        submitting = false
    }

    func reset() {
        open(board: .recommend)
    }

    // MARK: Destination

    /// Only Campus Wall origins show the poll row (`#newpost-poll-row` is hidden otherwise).
    var showsPollRow: Bool { originBoard == .campus_wall }

    var boardLabel: String {
        board == .campus_wall ? L10n.t("Campus Wall") : L10n.t("Recommend")
    }

    /// Poll on → destination forced to Campus Wall; off → back to the origin board.
    func setPoll(_ on: Bool) {
        poll = on
        if on {
            board = .campus_wall
            if pollOptions.count < CreatePostRequest.minPollOptions {
                pollOptions = ["", ""]
            }
        } else {
            board = originBoard
        }
    }

    // MARK: Poll options (2…6, remove only above the minimum, placeholders renumber)

    var canRemovePollOption: Bool { pollOptions.count > CreatePostRequest.minPollOptions }

    func addPollOption() {
        guard pollOptions.count < CreatePostRequest.maxPollOptions else {
            ToastCenter.shared.show(L10n.t("Up to 6 options"))
            return
        }
        pollOptions.append("")
    }

    func removePollOption(at index: Int) {
        guard pollOptions.count > CreatePostRequest.minPollOptions else {
            ToastCenter.shared.show(L10n.t("At least 2 options"))
            return
        }
        guard pollOptions.indices.contains(index) else { return }
        pollOptions.remove(at: index)
    }

    func bindingForOption(_ index: Int) -> Binding<String> {
        Binding(
            get: { [weak self] in
                guard let self = self, self.pollOptions.indices.contains(index) else { return "" }
                return self.pollOptions[index]
            },
            set: { [weak self] value in
                guard let self = self, self.pollOptions.indices.contains(index) else { return }
                self.pollOptions[index] = String(value.prefix(CreatePostRequest.maxPollOptionLength))
            }
        )
    }

    // MARK: Images (≤4, uploaded sequentially at publish time)

    func addImages(_ picked: [PickedPhoto]) {
        guard !picked.isEmpty else { return }
        guard images.count + picked.count <= CreatePostRequest.maxImages else {
            ToastCenter.shared.show(L10n.pick("Maximum 4 images", "最多 4 张图片"))
            return
        }
        images.append(contentsOf: picked)
    }

    func removeImage(at index: Int) {
        guard images.indices.contains(index) else { return }
        images.remove(at: index)
    }

    var canAddImages: Bool { images.count < CreatePostRequest.maxImages }

    // MARK: Publish (`submitNewPost`)

    func submit() {
        guard !submitting else { return }
        let trimmedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedContent.isEmpty else {
            ToastCenter.shared.show(L10n.pick("Please write something", "请先写点什么"))
            return
        }
        var options: [String] = []
        if poll {
            options = pollOptions
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            guard options.count >= CreatePostRequest.minPollOptions else {
                ToastCenter.shared.show(L10n.t("A poll needs at least 2 options"))
                return
            }
        }
        let isPoll = poll
        let target: SquareBoardKind = isPoll ? .campus_wall : board
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let payloadImages = images
        let anon = anonymous
        submitting = true

        Task { [weak self] in
            guard let self = self else { return }
            do {
                var urls: [String] = []
                for photo in payloadImages {
                    urls.append(try await UploadService.upload(jpegData: photo.jpeg))
                }
                let request = CreatePostRequest(
                    board: target.rawValue,
                    content: String(trimmedContent.prefix(CreatePostRequest.maxContent)),
                    images: urls,
                    anonymous: anon,
                    title: trimmedTitle.isEmpty ? nil : String(trimmedTitle.prefix(CreatePostRequest.maxTitle)),
                    postType: isPoll ? "poll" : nil,
                    pollOptions: isPoll ? options : nil
                )
                try await SquareDetailService.createPost(request)
                await MainActor.run {
                    self.submitting = false
                    ToastCenter.shared.show(isPoll
                        ? L10n.pick("Poll submitted — it goes live after review", "投票已提交，审核通过后展示")
                        : L10n.pick("Posted!", "已发布！"))
                    NewPostView.dismiss()
                    self.open(board: self.originBoard)
                }
                // D16: force-reload the board we just posted to (H5 only switches to it).
                await SquareStore.shared.switchTo(target)
                await SquareStore.shared.load(target)
            } catch {
                await MainActor.run {
                    self.submitting = false
                    let msg = APIError.message(of: error).trimmingCharacters(in: .whitespacesAndNewlines)
                    ToastCenter.shared.show(L10n.pick("Post failed: ", "发布失败：") + msg)
                }
            }
        }
    }
}
