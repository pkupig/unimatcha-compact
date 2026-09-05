import SwiftUI

// MARK: - EventTicketBlock (square.js `eventDetailBlock`, h5-square.md §1.7)
//
// Rendered under the article of an event post (`postType == 'event'`). Card `mt-6 rounded-[14px]
// border outline-variant/30 bg-surface-container-lowest p-5`:
//   row `gap-2 mb-3`:      EVENT chip + school (10 px outline, tracking widest, `metaLabel`)
//   lines `space-y-1.5`:   18 px outline icon + 14 px text —
//                          schedule  `M/D HH:mm – M/D HH:mm`
//                          location_on venue (only when set)
//                          confirmation_number `<price> · N left · N sold`
//   CTA `.btn-cta mt-5`:   Sales closed / Event ended / Sold out (disabled, opacity .5) or
//                          `Get Ticket · <price>` → `TicketPurchaseViewModel.buy`
// The block owns its top margin (24 pt) like the H5 markup, so the post-detail article just appends it.

struct EventTicketBlock: View {
    let event: EventSummary
    let onPurchased: () -> Void

    @StateObject private var vm = TicketPurchaseViewModel()
    @State private var now = Date()

    init(event: EventSummary, onPurchased: @escaping () -> Void) {
        self.event = event
        self.onPurchased = onPurchased
    }

    var body: some View {
        let cta = EventCTAState.resolve(event, now: now)
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Badge.event
                if let school = event.school, !school.isEmpty {
                    Text(L10n.metaLabel(school) ?? school)
                        .font(Theme.font(10))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                        .foregroundColor(Theme.C.outline)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.bottom, 12)

            VStack(alignment: .leading, spacing: 6) {
                infoLine(icon: "schedule", text: EventCopy.scheduleLine(for: event))
                if let venue = event.venue, !venue.isEmpty {
                    infoLine(icon: "location_on", text: venue)
                }
                infoLine(icon: "confirmation_number", text: EventCopy.availabilityLine(for: event))
            }

            CTAButton(title: cta.label, style: .neon, busy: vm.isPurchasing, disabled: cta.isDisabled) {
                Task { await vm.buy(event: event, onPurchased: onPurchased) }
            }
            .padding(.top, 20)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: Theme.R.menu, style: .continuous)
                .fill(Theme.C.card)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.R.menu, style: .continuous)
                .stroke(Theme.C.outlineVariant.opacity(0.3), lineWidth: 1)
        )
        .padding(.top, 24)
        .onAppear { now = Date() }
    }

    private func infoLine(icon: String, text: String) -> some View {
        HStack(alignment: .center, spacing: 8) {
            MaterialIcon(name: icon, size: 18, color: Theme.C.outline)
            Text(text)
                .font(Theme.font(14))
                .foregroundColor(Theme.C.onSurface)
                .multilineTextAlignment(.leading)
        }
    }
}
