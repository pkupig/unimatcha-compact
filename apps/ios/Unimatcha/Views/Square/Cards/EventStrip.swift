import SwiftUI

// MARK: - EventStrip (`eventStrip` — h5-square.md §1.3, api-square §1.3) — WP-08
//
// Cards of `postType === 'event'` with an `event`: `flex items-center gap-2 flex-wrap mt-1` →
// EVENT chip (neon/black 9/700 widest, radius 8, px-2 py-0.5) · `M/D HH:mm` (+ ` · venue`) 11 onSurfaceVariant
// medium · price 11/700 = "Sold out" | "Free" | "{cells} energy cell(s)" / "{cells} 格能量".

struct EventStrip: View {
    var event: EventSummary

    static func timeLine(for event: EventSummary) -> String {
        let when = event.startDate.map { Formatters.eventStrip($0) } ?? event.startAt
        if let v = event.venue?.trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty {
            return when + " · " + v
        }
        return when
    }

    static func priceLabel(for event: EventSummary) -> String {
        if event.isSoldOut { return L10n.t("Sold out") }
        if event.isFree { return L10n.t("Free") }
        let n = event.cells
        return L10n.pick("\(n) energy cell\(n == 1 ? "" : "s")", "\(n) 格能量")
    }

    var body: some View {
        FlowLayout(spacing: 8) {
            Badge.event
            Text(EventStrip.timeLine(for: event))
                .font(Theme.font(11, weight: .medium))
                .foregroundColor(Theme.C.onSurfaceVariant)
                .lineLimit(1)
            Text(EventStrip.priceLabel(for: event))
                .font(Theme.font(11, weight: .bold))
                .foregroundColor(Theme.C.onSurface)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }
}
