import SwiftUI

// MARK: - FullPageBar (h5-design-system.md §7.4 "Overlay page bar" — WP-03a)
//
// The `64 + safe-top` glass bar every full-page overlay uses. Full-page overlay content
// ignores the top inset (see `OverlayHost`), so the bar pads itself by the inset it reads
// from the `overlaySafeInsets` environment (window insets when used outside the host).
//
//   .backTitle(title, onBack, trailing?)   px-6 gap-4: `arrow_back` 24 pt + title 20/700/tight
//                                          (notifications, settings, content, tickets, hub, energy…)
//   .cancelTitleAction(cancel, title, action)  px-6 justify-between: Cancel 16/500 variant —
//                                          centred title 18/800/tight — neon pill (Save / Publish)
//   .centeredTitle(title, onBack)          milestone: back + centred 14/700 title
//
// Ground: `glassBar` over a thin material, 1 pt hairline below (`hairline: false` for the
// "1 px div" pages — visually identical, kept as a switch).

struct FullPageBar: View {
    /// Trailing pill button of the Cancel / Title / Action variant.
    struct BarAction {
        var label: String
        var enabled: Bool = true
        /// Shows `busyLabel` ("Saving…") and disables the pill while a request is in flight.
        var busy: Bool = false
        var busyLabel: String? = nil
        /// `nil` → rounded-full (Save); `Theme.R.base` → new-post "Publish" `rounded-[10px]`.
        var cornerRadius: CGFloat? = nil
        /// `px-5` (Save) vs `px-6` (Publish).
        var horizontalPadding: CGFloat = 20
        var action: () -> Void

        init(label: String,
             enabled: Bool = true,
             busy: Bool = false,
             busyLabel: String? = nil,
             cornerRadius: CGFloat? = nil,
             horizontalPadding: CGFloat = 20,
             action: @escaping () -> Void) {
            self.label = label
            self.enabled = enabled
            self.busy = busy
            self.busyLabel = busyLabel
            self.cornerRadius = cornerRadius
            self.horizontalPadding = horizontalPadding
            self.action = action
        }
    }

    enum Variant {
        case backTitle(title: String, onBack: () -> Void, trailing: AnyView?)
        case cancelTitleAction(cancel: () -> Void, cancelLabel: String, title: String, action: BarAction)
        case centeredTitle(title: String, onBack: () -> Void, trailing: AnyView?)
    }

    static var height: CGFloat { Theme.Bar.overlay }

    let variant: Variant
    var hairline: Bool = true

    @Environment(\.overlaySafeInsets) private var envInsets

    init(variant: Variant, hairline: Bool = true) {
        self.variant = variant
        self.hairline = hairline
    }

    // MARK: factories

    static func backTitle(_ title: String, onBack: @escaping () -> Void) -> FullPageBar {
        FullPageBar(variant: .backTitle(title: title, onBack: onBack, trailing: nil))
    }

    static func backTitle<T: View>(_ title: String,
                                   onBack: @escaping () -> Void,
                                   @ViewBuilder trailing: () -> T) -> FullPageBar {
        FullPageBar(variant: .backTitle(title: title, onBack: onBack, trailing: AnyView(trailing())))
    }

    static func cancelTitleAction(cancel: @escaping () -> Void,
                                  cancelLabel: String? = nil,
                                  title: String,
                                  action: BarAction) -> FullPageBar {
        FullPageBar(variant: .cancelTitleAction(
            cancel: cancel,
            cancelLabel: cancelLabel ?? L10n.t("Cancel"),
            title: title,
            action: action
        ))
    }

    static func centeredTitle(_ title: String, onBack: @escaping () -> Void) -> FullPageBar {
        FullPageBar(variant: .centeredTitle(title: title, onBack: onBack, trailing: nil))
    }

    static func centeredTitle<T: View>(_ title: String,
                                       onBack: @escaping () -> Void,
                                       @ViewBuilder trailing: () -> T) -> FullPageBar {
        FullPageBar(variant: .centeredTitle(title: title, onBack: onBack, trailing: AnyView(trailing())))
    }

    // MARK: body

    var body: some View {
        let top = OverlayChrome.resolvedInsets(envInsets).top
        ZStack {
            switch variant {
            case .backTitle(let title, let onBack, let trailing):
                HStack(spacing: 16) {
                    BackArrowButton(action: onBack)
                    Text(title)
                        .font(Theme.font(20, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.tight, size: 20))
                        .foregroundColor(Theme.C.onSurface)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if let trailing = trailing { trailing }
                }
            case .cancelTitleAction(let cancel, let cancelLabel, let title, let action):
                Text(title)
                    .font(Theme.font(18, weight: .heavy))
                    .tracking(Theme.tracking(Theme.Tracking.tight, size: 18))
                    .foregroundColor(Theme.C.onSurface)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 88)
                HStack {
                    Button(action: cancel) {
                        Text(cancelLabel)
                            .font(Theme.font(16, weight: .medium))
                            .foregroundColor(Theme.C.onSurfaceVariant)
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Spacer(minLength: 0)
                    BarPill(action: action)
                }
            case .centeredTitle(let title, let onBack, let trailing):
                Text(title)
                    .font(Theme.font(14, weight: .bold))
                    .foregroundColor(Theme.C.onSurface)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 56)
                HStack(spacing: 16) {
                    BackArrowButton(action: onBack)
                    Spacer(minLength: 0)
                    if let trailing = trailing { trailing }
                }
            }
        }
        .padding(.horizontal, Theme.Space.page)
        .frame(height: Self.height)
        .padding(.top, top)
        .frame(maxWidth: .infinity)
        .background(
            ZStack {
                Rectangle().fill(.ultraThinMaterial)
                Theme.C.glassBar
            }
            .ignoresSafeArea(edges: .top)
        )
        .overlay(alignment: .bottom) {
            if hairline {
                Rectangle().fill(Theme.C.hairline).frame(height: 1)
            }
        }
    }
}

// MARK: - Pieces

/// 24 pt `arrow_back` glyph inside a 40 pt hit area whose glyph sits on the px-6 line.
struct BackArrowButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: Theme.Icon.sf("arrow_back"))
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(Theme.C.onSurface)
                .frame(width: 24, height: 24)
                .padding(8)
                .contentShape(Rectangle())
        }
        .buttonStyle(BarPressStyle(scale: Theme.Motion.pressScaleIcon))
        .padding(.leading, -8)
        .padding(.vertical, -8)
    }
}

private struct BarPill: View {
    let action: FullPageBar.BarAction

    var body: some View {
        let disabled = !action.enabled || action.busy
        let label = action.busy ? (action.busyLabel ?? L10n.t("Saving…")) : action.label
        Button(action: action.action) {
            Text(label)
                .font(Theme.font(12, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 12))
                .foregroundColor(Color.black)
                .lineLimit(1)
                .padding(.horizontal, action.horizontalPadding)
                .padding(.vertical, 8)
                .background(Theme.C.neon)
                .clipShape(RoundedRectangle(cornerRadius: action.cornerRadius ?? Theme.R.full, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(BarPressStyle(scale: Theme.Motion.pressScaleWide))
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
    }
}

private struct BarPressStyle: ButtonStyle {
    let scale: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(Theme.Motion.press, value: configuration.isPressed)
    }
}
