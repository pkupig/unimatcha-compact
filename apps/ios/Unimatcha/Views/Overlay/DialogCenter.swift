import SwiftUI

// MARK: - DialogCenter (h5-core.md §1.6, h5-design-system.md §8.11 — WP-03a)
//
// Port of `confirmCard` / `promptCard`. Cards are NOT overlays (H5 appends them to <body>;
// `closeAllOverlays` leaves them alone) — `DialogHost` renders them in its own layer above
// `OverlayHost`, below `ToastHost`. Semantics:
//   confirm → true (OK) / false (Cancel) / nil (backdrop tap = abort, distinct from Cancel)
//   prompt  → String (raw, untrimmed) / nil (Cancel or backdrop)
//   custom  → free content (couple popups), dismissed via `dismissCustom(id)`; may stack
//   dismissAll → every pending confirm/prompt resolves nil (AppRouter: sessionDidReset,
//                language switch)

struct ConfirmSpec {
    var title: String
    var body: String?
    var confirmLabel: String
    var cancelLabel: String
    var danger: Bool
}

struct PromptSpec {
    var title: String
    var label: String?
    var placeholder: String
    var value: String
    var confirmLabel: String
    var cancelLabel: String
    var multiline: Bool
    var secure: Bool
}

@MainActor
final class DialogCenter: ObservableObject {
    static let shared = DialogCenter()

    enum Kind {
        case confirm(ConfirmSpec)
        case prompt(PromptSpec)
        case custom(dismissOnBackdrop: Bool, content: () -> AnyView)
    }

    struct Item: Identifiable {
        let id: String
        let kind: Kind
    }

    @Published private(set) var items: [Item] = []

    private var confirmWaiters: [String: CheckedContinuation<Bool?, Never>] = [:]
    private var promptWaiters: [String: CheckedContinuation<String?, Never>] = [:]
    private var counter = 0

    init() {}

    var isAnyPresented: Bool { !items.isEmpty }

    private func nextId(_ prefix: String) -> String {
        counter += 1
        return "\(prefix)-\(counter)"
    }

    /// H5 `confirmCard`. Defaults: title "Are you sure?", OK "Confirm", Cancel "Cancel"
    /// (all through `L10n.t`). Returns `nil` on backdrop tap (abort), `false` on Cancel.
    func confirm(title: String,
                 body: String? = nil,
                 confirmLabel: String? = nil,
                 cancelLabel: String? = nil,
                 danger: Bool = false) async -> Bool? {
        let spec = ConfirmSpec(
            title: title.isEmpty ? L10n.t("Are you sure?") : title,
            body: (body?.isEmpty ?? true) ? nil : body,
            confirmLabel: confirmLabel ?? L10n.t("Confirm"),
            cancelLabel: cancelLabel ?? L10n.t("Cancel"),
            danger: danger
        )
        let id = nextId("confirm")
        return await withCheckedContinuation { (c: CheckedContinuation<Bool?, Never>) in
            confirmWaiters[id] = c
            withAnimation(Theme.Motion.fade) {
                items.append(Item(id: id, kind: .confirm(spec)))
            }
        }
    }

    /// H5 `promptCard`. Defaults: title "Enter a value", OK "Save", Cancel "Cancel".
    /// Single-line: the return key submits. `secure` renders a `SecureField`.
    func prompt(title: String,
                label: String? = nil,
                placeholder: String = "",
                value: String = "",
                confirmLabel: String? = nil,
                cancelLabel: String? = nil,
                multiline: Bool = false,
                secure: Bool = false) async -> String? {
        let spec = PromptSpec(
            title: title.isEmpty ? L10n.t("Enter a value") : title,
            label: (label?.isEmpty ?? true) ? nil : label,
            placeholder: placeholder,
            value: value,
            confirmLabel: confirmLabel ?? L10n.t("Save"),
            cancelLabel: cancelLabel ?? L10n.t("Cancel"),
            multiline: multiline,
            secure: secure
        )
        let id = nextId("prompt")
        return await withCheckedContinuation { (c: CheckedContinuation<String?, Never>) in
            promptWaiters[id] = c
            withAnimation(Theme.Motion.fade) {
                items.append(Item(id: id, kind: .prompt(spec)))
            }
        }
    }

    /// Free-form centred card (couple popups). Re-using an id replaces the content in place.
    func custom<V: View>(_ id: String, dismissOnBackdrop: Bool, @ViewBuilder content: () -> V) {
        let view = AnyView(content())
        let item = Item(id: id, kind: .custom(dismissOnBackdrop: dismissOnBackdrop, content: { view }))
        if let idx = items.firstIndex(where: { $0.id == id }) {
            items[idx] = item
        } else {
            withAnimation(Theme.Motion.fade) {
                items.append(item)
            }
        }
    }

    func dismissCustom(_ id: String) {
        guard let idx = items.firstIndex(where: { $0.id == id }) else { return }
        withAnimation(Theme.Motion.fade) {
            _ = items.remove(at: idx)
        }
    }

    /// Resolves every pending confirm/prompt with `nil` and removes every card.
    func dismissAll() {
        let confirms = confirmWaiters
        let prompts = promptWaiters
        confirmWaiters.removeAll()
        promptWaiters.removeAll()
        withAnimation(Theme.Motion.fade) {
            items.removeAll()
        }
        confirms.values.forEach { $0.resume(returning: nil) }
        prompts.values.forEach { $0.resume(returning: nil) }
    }

    // MARK: resolution (called by DialogHost)

    func resolveConfirm(id: String, _ result: Bool?) {
        let waiter = confirmWaiters.removeValue(forKey: id)
        if let idx = items.firstIndex(where: { $0.id == id }) {
            withAnimation(Theme.Motion.fade) {
                _ = items.remove(at: idx)
            }
        }
        waiter?.resume(returning: result)
    }

    func resolvePrompt(id: String, _ result: String?) {
        let waiter = promptWaiters.removeValue(forKey: id)
        if let idx = items.firstIndex(where: { $0.id == id }) {
            withAnimation(Theme.Motion.fade) {
                _ = items.remove(at: idx)
            }
        }
        waiter?.resume(returning: result)
    }

    /// Backdrop tap: confirm/prompt → nil; custom → dismissed only when allowed.
    func backdropTapped(id: String) {
        guard let item = items.first(where: { $0.id == id }) else { return }
        switch item.kind {
        case .confirm: resolveConfirm(id: id, nil)
        case .prompt: resolvePrompt(id: id, nil)
        case .custom(let dismissOnBackdrop, _):
            if dismissOnBackdrop { dismissCustom(id) }
        }
    }
}

// MARK: - DialogHost

struct DialogHost: View {
    @ObservedObject private var center = DialogCenter.shared

    init() {}

    var body: some View {
        ZStack {
            ForEach(Array(center.items.enumerated()), id: \.element.id) { pair in
                DialogLayer(item: pair.element)
                    .zIndex(Double(pair.offset))
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .allowsHitTesting(center.isAnyPresented)
    }
}

private struct DialogLayer: View {
    let item: DialogCenter.Item
    @ObservedObject private var center = DialogCenter.shared

    var body: some View {
        ZStack {
            Theme.C.backdrop
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { center.backdropTapped(id: item.id) }
            switch item.kind {
            case .confirm(let spec):
                ConfirmCardView(spec: spec) { result in
                    center.resolveConfirm(id: item.id, result)
                }
                .padding(.horizontal, Theme.Space.page)
            case .prompt(let spec):
                PromptCardView(spec: spec) { result in
                    center.resolvePrompt(id: item.id, result)
                }
                .padding(.horizontal, Theme.Space.page)
            case .custom(_, let content):
                content()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Card chrome shared by confirm / prompt

private struct DialogCard<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .padding(Theme.Space.page)
            .frame(maxWidth: OverlayChrome.cardMaxWidthSm)
            .background(Theme.C.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
            .shadow(color: Color.black.opacity(0.25), radius: 25, x: 0, y: 20)
    }
}

/// Buttons row: both `flex-1 py-3 rounded-[10px] 12/700/widest active:scale(.98)`.
private struct DialogButtons: View {
    let cancelLabel: String
    let confirmLabel: String
    let danger: Bool
    let onCancel: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onCancel) {
                Text(cancelLabel)
                    .font(Theme.font(12, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 12))
                    .foregroundColor(Theme.C.onSurface)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                            .stroke(Theme.C.outlineVariant, lineWidth: 1)
                    )
                    .contentShape(Rectangle())
            }
            .buttonStyle(DialogPressStyle())

            Button(action: onConfirm) {
                Text(confirmLabel)
                    .font(Theme.font(12, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 12))
                    .foregroundColor(danger ? Color.white : Color.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(danger ? Theme.C.neonPink : Theme.C.neon)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                    .contentShape(Rectangle())
            }
            .buttonStyle(DialogPressStyle())
        }
    }
}

private struct DialogPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? Theme.Motion.pressScaleWide : 1)
            .animation(Theme.Motion.press, value: configuration.isPressed)
    }
}

// MARK: - ConfirmCardView

struct ConfirmCardView: View {
    let spec: ConfirmSpec
    /// true = OK, false = Cancel (backdrop nil is handled by the host).
    let onResult: (Bool) -> Void

    var body: some View {
        DialogCard {
            VStack(alignment: .leading, spacing: 0) {
                Text(spec.title)
                    .font(Theme.font(18, weight: .heavy))
                    .tracking(Theme.tracking(Theme.Tracking.tight, size: 18))
                    .foregroundColor(Theme.C.onSurface)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 8)
                if let body = spec.body {
                    Text(body)
                        .font(Theme.font(14))
                        .lineSpacing(14 * 0.625)
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, Theme.Space.page)
                } else {
                    Spacer().frame(height: Theme.Space.page)
                }
                DialogButtons(
                    cancelLabel: spec.cancelLabel,
                    confirmLabel: spec.confirmLabel,
                    danger: spec.danger,
                    onCancel: { onResult(false) },
                    onConfirm: { onResult(true) }
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - PromptCardView

struct PromptCardView: View {
    let spec: PromptSpec
    /// The raw string on OK (not trimmed); nil on Cancel.
    let onResult: (String?) -> Void

    @State private var text: String
    @FocusState private var focused: Bool

    init(spec: PromptSpec, onResult: @escaping (String?) -> Void) {
        self.spec = spec
        self.onResult = onResult
        _text = State(initialValue: spec.value)
    }

    var body: some View {
        DialogCard {
            VStack(alignment: .leading, spacing: 0) {
                Text(spec.title)
                    .font(Theme.font(18, weight: .heavy))
                    .tracking(Theme.tracking(Theme.Tracking.tight, size: 18))
                    .foregroundColor(Theme.C.onSurface)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 12)
                if let label = spec.label {
                    Text(label.uppercased())
                        .font(Theme.font(10, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.section, size: 10))
                        .foregroundColor(Theme.C.outline)
                        .padding(.bottom, 8)
                }
                field
                DialogButtons(
                    cancelLabel: spec.cancelLabel,
                    confirmLabel: spec.confirmLabel,
                    danger: false,
                    onCancel: { onResult(nil) },
                    onConfirm: { onResult(text) }
                )
                .padding(.top, Theme.Space.page)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .onAppear {
            // H5 focuses the field 30 ms after the card is inserted.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) { focused = true }
        }
    }

    @ViewBuilder
    private var field: some View {
        Group {
            if spec.multiline {
                ZStack(alignment: .topLeading) {
                    if text.isEmpty && !spec.placeholder.isEmpty {
                        Text(spec.placeholder)
                            .font(Theme.font(14))
                            .foregroundColor(Theme.C.outlineVariantText)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 8)
                    }
                    TextEditor(text: $text)
                        .font(Theme.font(14))
                        .foregroundColor(Theme.C.onSurface)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 14 * 1.5 * 3 + 16)   // rows=3
                        .focused($focused)
                }
                .padding(.horizontal, 5)
            } else if spec.secure {
                SecureField(spec.placeholder, text: $text)
                    .font(Theme.font(14))
                    .foregroundColor(Theme.C.onSurface)
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit { onResult(text) }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 12)
            } else {
                TextField(spec.placeholder, text: $text)
                    .font(Theme.font(14))
                    .foregroundColor(Theme.C.onSurface)
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit { onResult(text) }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 12)
            }
        }
        .frame(maxWidth: .infinity)
        .background(Theme.C.containerLow)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(focused ? Theme.C.neon : Color.clear, lineWidth: 1)
        )
    }
}
