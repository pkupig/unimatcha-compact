import SwiftUI

// MARK: - Notification list pieces (h5-notifications.md §B3)

/// 44×44 (list) / 48×48 (detail) rounded plate: bg `notifPlate`, glyph `notifPlateFg`,
/// FILL 1 only for `like` / `match_result`.
struct NotificationIconPlate: View {
    let type: String
    var size: CGFloat = 44
    var radius: CGFloat = Theme.R.plate
    var iconSize: CGFloat = 20

    var body: some View {
        let spec = NotificationL10n.icon(for: type)
        ZStack {
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(Theme.C.notifPlate)
            Image(systemName: spec.sf)
                .font(.system(size: iconSize * 0.82, weight: spec.filled ? .regular : .light))
                .foregroundColor(Theme.C.notifPlateFg)
                .frame(width: iconSize, height: iconSize)
        }
        .frame(width: size, height: size)
    }
}

/// `h3.notif-section-label`: 11/700, tracking .2em, `neutral-400`, 16 pt below.
struct NotificationSectionLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Theme.font(11, weight: .bold))
            .tracking(Theme.tracking(Theme.Tracking.section, size: 11))
            .foregroundColor(Theme.C.neutral400)
            .padding(.bottom, 16)
    }
}

/// `div.notif-item`: [plate 44 + unread dot] gap 16 [title 15/700 `onSurface` (D21) · time 10 · body 14 ×2 lines].
/// Read rows render at 60 % opacity (0.3 s).
struct NotificationRow: View {
    let item: AppNotification
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 16) {
                NotificationIconPlate(type: item.type, size: 44, radius: Theme.R.plate, iconSize: 20)
                    .overlay(alignment: .topTrailing) {
                        if !item.isRead {
                            Circle()
                                .fill(Theme.C.neon)
                                .frame(width: 8, height: 8)
                                .offset(x: 2, y: -2)
                        }
                    }
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .top, spacing: 12) {
                        Text(NotificationL10n.title(item))
                            .font(Theme.font(15, weight: .bold))
                            .lineSpacing(15 * 0.375)
                            .foregroundColor(Theme.C.onSurface)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        Text(Formatters.relativeTime(item.createdAt))
                            .font(Theme.font(10))
                            .tracking(Theme.tracking(Theme.Tracking.tighter, size: 10))
                            .foregroundColor(Theme.C.onSurfaceVariant)
                            .lineLimit(1)
                            .fixedSize(horizontal: true, vertical: false)
                            .padding(.top, 2)
                    }
                    Text(NotificationL10n.body(item))
                        .font(Theme.font(14))
                        .lineSpacing(14 * 0.625)
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 2)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressOpacityButtonStyle(opacity: 0.7))
        .opacity(item.isRead ? 0.6 : 1)
        .animation(.easeInOut(duration: 0.3), value: item.isRead)
        .accessibilityLabel(NotificationL10n.title(item))
    }
}

/// `#notif-load-more`: pill px-8 py-3, `containerLow`, 10/700 tracking .2em `onSurfaceVariant`;
/// "Loading..." + disabled while fetching. Container `pt-2 pb-8`, centred.
struct NotificationLoadMoreButton: View {
    let busy: Bool
    let action: () -> Void

    var body: some View {
        HStack {
            Spacer(minLength: 0)
            Button(action: action) {
                Text(busy ? L10n.t("Loading...") : L10n.t("Load More"))
                    .font(Theme.font(10, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.section, size: 10))
                    .foregroundColor(Theme.C.onSurfaceVariant)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 12)
                    .background(Theme.C.containerLow)
                    .clipShape(Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleIcon))
            .disabled(busy)
            .opacity(busy ? 0.6 : 1)
            Spacer(minLength: 0)
        }
        .padding(.top, 8)
        .padding(.bottom, 32)
    }
}
