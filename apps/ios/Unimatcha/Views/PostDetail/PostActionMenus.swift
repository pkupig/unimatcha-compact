import SwiftUI
import UIKit

// MARK: - Post / comment action menus, share sheet, report flow
// (h5-square.md §1.5 "Action menus" + "Report flow", §2 "Post detail"; h5-design-system.md §8.14) — WP-09

// MARK: Share (`sharePdPost` / `sharePdComment`)

/// `navigator.share({title, text, url})` → `UIActivityViewController`; when no scene can present it
/// the payload is copied to the clipboard with the H5 toast. A user cancel is silent (AbortError).
enum ShareSheet {
    static let appURL = "https://app.unimatcha.ai"

    @MainActor
    static func present(title: String, text: String, url: String, clipboardFallback: String? = nil) {
        let items: [Any] = [ShareTitleSource(title: title, text: text), URL(string: url) as Any].compactMap { $0 }
        guard let presenter = topViewController() else {
            copy(clipboardFallback ?? "\(title)\n\(text)\n\(url)")
            return
        }
        let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
        if let pop = vc.popoverPresentationController {
            pop.sourceView = presenter.view
            pop.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY - 40, width: 0, height: 0)
            pop.permittedArrowDirections = []
        }
        vc.completionWithItemsHandler = { _, _, _, error in
            guard error != nil else { return }
            Task { @MainActor in ToastCenter.shared.show(L10n.pick("Share failed", "分享失败")) }
        }
        presenter.present(vc, animated: true)
    }

    @MainActor
    static func copy(_ payload: String) {
        UIPasteboard.general.string = payload
        ToastCenter.shared.show(L10n.pick("Copied to clipboard", "已复制到剪贴板"))
    }

    @MainActor
    static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow } ?? scenes.first?.windows.first
        var vc = window?.rootViewController
        while let presented = vc?.presentedViewController { vc = presented }
        return vc
    }
}

/// Carries the share title (subject) alongside the shared text, like `navigator.share`'s `title`.
private final class ShareTitleSource: NSObject, UIActivityItemSource {
    let title: String
    let text: String

    init(title: String, text: String) {
        self.title = title
        self.text = text
    }

    func activityViewControllerPlaceholderItem(_ controller: UIActivityViewController) -> Any { text }
    func activityViewController(_ controller: UIActivityViewController, itemForActivityType type: UIActivity.ActivityType?) -> Any? { text }
    func activityViewController(_ controller: UIActivityViewController, subjectForActivityType type: UIActivity.ActivityType?) -> String { title }
}

// MARK: Two-step report flow (`askReportReason` + `reportDoneToast`)

enum ReportPrompt {
    enum Target {
        case post, comment

        var confirmTitle: String {
            switch self {
            case .post: return L10n.pick("Report this post?", "举报这条帖子？")
            case .comment: return L10n.pick("Report this comment?", "举报这条评论？")
            }
        }
    }

    /// Confirm (danger) → reason prompt. Returns `nil` when either step is cancelled; an empty
    /// reason becomes "No reason given" / "未填写原因".
    @MainActor
    static func ask(_ target: Target) async -> String? {
        let ok = await DialogCenter.shared.confirm(
            title: target.confirmTitle,
            body: L10n.pick("Reports are reviewed by our moderators. Repeated false reports may limit your account.",
                            "举报会交由管理员人工审核。恶意或重复的虚假举报可能影响你的账号。"),
            confirmLabel: L10n.pick("Continue", "继续举报"),
            cancelLabel: L10n.t("Cancel"),
            danger: true)
        guard ok == true else { return nil }
        let reason = await DialogCenter.shared.prompt(
            title: L10n.pick("Report reason", "举报原因"),
            label: L10n.pick("Spam · Harassment · Explicit · False info", "垃圾广告 / 骚扰辱骂 / 不适内容 / 虚假信息"),
            placeholder: L10n.pick("Briefly describe the issue (optional)", "简单说明原因（可留空）"),
            confirmLabel: L10n.pick("Submit report", "提交举报"),
            cancelLabel: L10n.t("Cancel"),
            multiline: true)
        guard let reason = reason else { return nil }
        let trimmed = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? L10n.pick("No reason given", "未填写原因") : trimmed
    }

    @MainActor
    static func doneToast(_ error: Error?) {
        if let error = error {
            let msg = APIError.message(of: error).trimmingCharacters(in: .whitespacesAndNewlines)
            ToastCenter.shared.show(msg.isEmpty ? L10n.pick("Failed to report", "举报失败，请重试") : msg)
        } else {
            ToastCenter.shared.show(L10n.pick("Report submitted — thanks for flagging", "举报已提交，我们会尽快处理"))
        }
    }
}

// MARK: Menus (`.pd-cm-menu` popovers)

enum PostActionMenus {
    static let postMenuId = "post-action-menu"
    static let commentMenuId = "comment-action-menu"

    /// H5 card width floor (`min-w-[148px]`) used by the anchor maths.
    static let menuWidth: CGFloat = 148
    /// `left = clamp(btn.left - 100, 8, innerWidth - 164)`, `top = btn.bottom + 6`.
    static let postMenuLeftShift: CGFloat = 100
    static let postMenuGap: CGFloat = 6
    /// Comment menu: `left = clamp(x, …)`, `top = clamp(y + 8, …)`.
    static let commentMenuGap: CGFloat = 8

    /// Header "more" → Share / Report post.
    @MainActor
    static func presentPostMenu(anchorFrame: CGRect) {
        let vm = PostDetailViewModel.shared
        let left = anchorFrame.minX - postMenuLeftShift
        let anchor = CGRect(x: left, y: anchorFrame.minY, width: 0, height: anchorFrame.height)
        OverlayRouter.shared.present(AppOverlay(
            id: postMenuId,
            style: .popover(anchor: anchor, alignment: .leading(gap: postMenuGap, dim: false)),
            swipeBack: false
        ) {
            ActionMenu(rows: [
                ActionMenu.Row(id: "share", sf: Theme.Icon.sf("ios_share"), label: L10n.pick("Share", "分享")) {
                    vm.sharePost()
                },
                ActionMenu.Row(id: "report", sf: Theme.Icon.sf("flag"), label: L10n.pick("Report post", "举报帖子")) {
                    vm.reportPost()
                },
            ])
        })
    }

    /// Comment long-press → Share / Like|Unlike / Report, anchored at the touch point.
    @MainActor
    static func presentCommentMenu(commentId: String, at point: CGPoint, liked: Bool) {
        let vm = PostDetailViewModel.shared
        let anchor = CGRect(x: point.x, y: point.y, width: 0, height: 0)
        OverlayRouter.shared.present(AppOverlay(
            id: commentMenuId,
            style: .popover(anchor: anchor, alignment: .leading(gap: commentMenuGap, dim: false)),
            swipeBack: false
        ) {
            ActionMenu(rows: [
                ActionMenu.Row(id: "share", sf: Theme.Icon.sf("ios_share"), label: L10n.pick("Share", "分享")) {
                    vm.shareComment(id: commentId)
                },
                // H5 rows are outline glyphs (`material-symbols-outlined`): `heart_minus` when the
                // comment is already liked, the plain outline `favorite` otherwise.
                ActionMenu.Row(id: "like",
                               sf: liked ? Theme.Icon.sf("heart_minus") : Theme.Icon.sf("favorite"),
                               label: liked ? L10n.pick("Unlike", "取消点赞") : L10n.pick("Like", "点赞")) {
                    vm.likeComment(id: commentId)
                },
                ActionMenu.Row(id: "report", sf: Theme.Icon.sf("flag"), label: L10n.pick("Report", "举报")) {
                    vm.reportComment(id: commentId)
                },
            ])
        })
    }
}

// MARK: - Long press with a touch point (600 ms, cancels beyond 10 pt)

/// UIKit long-press recognizer hosted behind a row so it never swallows the row's own buttons
/// ("not on a button" in H5) and never fights the scroll view. Reports the point in screen space,
/// which is what `OverlayStyle.popover(anchor:)` expects. Light haptic on fire (`navigator.vibrate(15)`).
struct LongPressPointCatcher: UIViewRepresentable {
    var minimumDuration: TimeInterval = 0.6
    var allowableMovement: CGFloat = 10
    var onLongPress: (CGPoint) -> Void

    func makeUIView(context: Context) -> CatcherView {
        let v = CatcherView()
        v.backgroundColor = .clear
        v.isUserInteractionEnabled = true
        let g = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.fire(_:)))
        g.minimumPressDuration = minimumDuration
        g.allowableMovement = allowableMovement
        g.cancelsTouchesInView = false
        g.delaysTouchesBegan = false
        g.delaysTouchesEnded = false
        v.addGestureRecognizer(g)
        context.coordinator.onLongPress = onLongPress
        return v
    }

    func updateUIView(_ uiView: CatcherView, context: Context) {
        context.coordinator.onLongPress = onLongPress
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject {
        var onLongPress: ((CGPoint) -> Void)?

        @objc func fire(_ g: UILongPressGestureRecognizer) {
            guard g.state == .began, let view = g.view else { return }
            let local = g.location(in: view)
            let point = view.convert(local, to: nil)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onLongPress?(point)
        }
    }

    /// Transparent to hit-testing everywhere except for the gesture itself (`hitTest` returns nil so
    /// taps continue to the views above/below; the recognizer still sees the touches).
    final class CatcherView: UIView {
        override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
            let hit = super.hitTest(point, with: event)
            return hit === self ? self : hit
        }
    }
}

extension View {
    /// `.longPressPoint { screenPoint in … }` — placed as a background so row buttons keep priority.
    func longPressPoint(minimumDuration: TimeInterval = 0.6,
                        allowableMovement: CGFloat = 10,
                        perform: @escaping (CGPoint) -> Void) -> some View {
        background(
            LongPressPointCatcher(minimumDuration: minimumDuration,
                                  allowableMovement: allowableMovement,
                                  onLongPress: perform)
        )
    }
}
