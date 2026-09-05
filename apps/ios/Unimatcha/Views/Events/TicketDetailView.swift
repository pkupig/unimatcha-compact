import SwiftUI

// MARK: - Ticket detail / pass card (`#ticket-detail-overlay`, h5-square.md §1.8, h5-profile.md §1.10)
//
// Full-page overlay id `ticket-detail` (swipe-back). Bar: back + "Ticket". Content `pt-24 pb-20 px-5`.
// `.pass-card max-w-sm rounded-[20px] bg-white overflow-hidden`, shadow `0 18px 48px rgba(0,0,0,.18)`,
// `opacity-70` when used / cancelled:
//   neon head `px-6 pt-6 pb-5` (black text): "UNIMATCHA · TICKET" 10/700/+0.25em 70 % · title 20/800/tight
//   · school 11 px 70 %
//   tear line
//   `px-6 pt-5 pb-4 gap-4`: DATE `YYYY-MM-DD` / TIME `HH:mm` (label 9/+0.2em outline, value 14/700 truncate)
//   optional VENUE row `px-6 pb-4`
//   `px-6 pb-6` centred: 200 pt white QR box (p-2.5, r14) with a 180 pt QR of `code`; code mono 16/700/+0.15em
//   selectable; caption 11 px outline "Show this QR at the entrance" / "This ticket has been used".
// No Apple Wallet button (backend has no signed pass endpoint — `api-square §3.1`).

struct TicketDetailView: View {
    let ticket: Ticket

    init(ticket: Ticket) {
        self.ticket = ticket
    }

    var body: some View {
        VStack(spacing: 0) {
            FullPageBar.backTitle(L10n.t("Ticket"), onBack: { TicketsViewModel.shared.closeDetail() })
            ScrollView(.vertical, showsIndicators: false) {
                TicketPassCard(ticket: ticket)
                    .frame(maxWidth: OverlayChrome.cardMaxWidthSm)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 20)
                    .padding(.top, 32)
                    .padding(.bottom, 80)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.C.surface)
    }
}

struct TicketPassCard: View {
    let ticket: Ticket

    private var event: EventSummary? { ticket.event }
    private var dateText: String { ticket.startDate.map { Formatters.ticketDate($0) } ?? "" }
    private var timeText: String { ticket.startDate.map { Formatters.ticketTime($0) } ?? "" }
    private var venueText: String { event?.venue ?? "" }

    var body: some View {
        VStack(spacing: 0) {
            head
            TicketTearLine()
            fields
            code
        }
        .frame(maxWidth: .infinity)
        .background(Theme.C.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.pass, style: .continuous))
        .shadow(color: Color.black.opacity(0.18), radius: 24, x: 0, y: 18)
        .opacity(ticket.isValid ? 1 : 0.7)
    }

    // Neon head — neon always carries black text.
    private var head: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("UNIMATCHA · TICKET")
                .font(Theme.font(10, weight: .bold))
                .tracking(Theme.tracking(0.25, size: 10))
                .foregroundColor(Color.black.opacity(0.7))
            Text(ticket.displayTitle)
                .font(Theme.font(20, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 20))
                .lineSpacing(3)
                .foregroundColor(Color.black)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
            if let school = event?.school, !school.isEmpty {
                Text(L10n.metaLabel(school) ?? school)
                    .font(Theme.font(11))
                    .foregroundColor(Color.black.opacity(0.7))
                    .lineLimit(1)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .padding(.bottom, 20)
        .background(Theme.C.neon)
    }

    private var fields: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 16) {
                if !dateText.isEmpty {
                    field(label: L10n.pick("DATE", "日期"), value: dateText)
                }
                if !timeText.isEmpty {
                    field(label: L10n.pick("TIME", "时间"), value: timeText)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
            .padding(.top, 20)
            .padding(.bottom, 16)

            if !venueText.isEmpty {
                field(label: L10n.pick("VENUE", "地点"), value: venueText)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 16)
            }
        }
    }

    private func field(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .font(Theme.font(9))
                .tracking(Theme.tracking(Theme.Tracking.section, size: 9))
                .foregroundColor(Theme.C.outline)
                .padding(.bottom, 4)
            Text(value)
                .font(Theme.font(14, weight: .bold))
                .foregroundColor(Theme.C.onSurface)
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var code: some View {
        VStack(spacing: 0) {
            TicketQRBox(payload: ticket.code, boxSize: 200, padding: 10, radius: Theme.R.menu)
            Text(ticket.code)
                .font(Theme.mono(16, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.label, size: 16))
                .foregroundColor(Theme.C.onSurface)
                .textSelection(.enabled)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.top, 16)
            Text(EventCopy.passCaption(valid: ticket.isValid))
                .font(Theme.font(11))
                .foregroundColor(Theme.C.outline)
                .multilineTextAlignment(.center)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.bottom, 24)
    }
}
