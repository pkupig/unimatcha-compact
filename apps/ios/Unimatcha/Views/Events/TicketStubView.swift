import SwiftUI

// MARK: - Ticket stub (profile.js `loadMyTickets` article, h5-design-system.md §8.22)
//
// `.ticket-card mb-5 rounded-[14px] bg-white border outline-variant/20 active:scale(.99)`, `opacity-60`
// unless valid; whole card tappable.
//   upper `p-5 pb-4`:  title 16/800/tight + status chip (row `gap-3 mb-1.5`, items-start)
//                      `YYYY-MM-DD HH:mm · venue` 12 px on-surface-variant
//                      paid line (only when `pricePaidCents > 0`) 12 px `mt-0.5`
//                      school 10 px outline tracking widest `mt-1` (metaLabel)
//   tear line:         two 22 pt page-coloured notches at −11 / +11 over a 2 pt dashed divider inset 22
//   lower `p-5 pt-4 gap-5`: 86 pt white QR box (p-1.5, r10, border /30) holding a 74 pt QR of `code`;
//                      "TICKET CODE" 10/+0.2em outline, code mono 14/700 wider, `touch_app` 13 + "Tap to open"

struct TicketStubView: View {
    let ticket: Ticket
    let onTap: () -> Void

    init(ticket: Ticket, onTap: @escaping () -> Void) {
        self.ticket = ticket
        self.onTap = onTap
    }

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 0) {
                upper
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, 16)
                TicketTearLine()
                lower
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 20)
            }
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: Theme.R.menu, style: .continuous)
                    .fill(Theme.C.card)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.R.menu, style: .continuous)
                            .stroke(Theme.C.hairline20, lineWidth: 1)
                    )
            )
            .contentShape(RoundedRectangle(cornerRadius: Theme.R.menu, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleCard))
        .opacity(ticket.isValid ? 1 : 0.6)
        .accessibilityLabel(ticket.displayTitle)
    }

    private var upper: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                Text(ticket.displayTitle)
                    .font(Theme.font(16, weight: .heavy))
                    .tracking(Theme.tracking(Theme.Tracking.tight, size: 16))
                    .foregroundColor(Theme.C.onSurface)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                TicketStatusChip(status: ticket.status)
            }
            .padding(.bottom, 6)

            Text(ticket.stubLine)
                .font(Theme.font(12))
                .foregroundColor(Theme.C.onSurfaceVariant)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            if let paid = ticket.paidLine {
                Text(paid)
                    .font(Theme.font(12))
                    .foregroundColor(Theme.C.onSurfaceVariant)
                    .padding(.top, 2)
            }

            if let school = ticket.event?.school, !school.isEmpty {
                Text(L10n.metaLabel(school) ?? school)
                    .font(Theme.font(10))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                    .foregroundColor(Theme.C.outline)
                    .lineLimit(1)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var lower: some View {
        HStack(alignment: .center, spacing: 20) {
            TicketQRBox(payload: ticket.code, boxSize: 86, padding: 6, radius: Theme.R.base)
            VStack(alignment: .leading, spacing: 0) {
                Text(L10n.t("TICKET CODE"))
                    .font(Theme.font(10))
                    .tracking(Theme.tracking(Theme.Tracking.section, size: 10))
                    .foregroundColor(Theme.C.outline)
                    .padding(.bottom, 4)
                Text(ticket.code)
                    .font(Theme.mono(14, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.wider, size: 14))
                    .foregroundColor(Theme.C.onSurface)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                HStack(spacing: 4) {
                    MaterialIcon(name: "touch_app", size: 13, color: Theme.C.outline)
                    Text(L10n.t("Tap to open"))
                        .font(Theme.font(10))
                        .foregroundColor(Theme.C.outline)
                }
                .padding(.top, 8)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Pieces shared with the pass card

/// VALID (neon / black) · USED / CANCELLED (container-high / on-surface-variant); 9/700 widest, px-2 py-0.5, r8.
struct TicketStatusChip: View {
    let status: TicketStatus

    var body: some View {
        Text(status.chipLabel)
            .font(Theme.font(9, weight: .bold))
            .tracking(Theme.tracking(Theme.Tracking.widest, size: 9))
            .foregroundColor(status == .valid ? Color.black : Theme.C.onSurfaceVariant)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(status == .valid ? Theme.C.neon : Theme.C.containerHigh)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.eventChip, style: .continuous))
    }
}

/// The perforation: 2 pt dashed divider inset 22 pt with two 22 pt page-coloured notches punched at the
/// card edges (`left/right −11px`). The row itself is 2 pt tall; the notches overflow into the halves.
struct TicketTearLine: View {
    var body: some View {
        ZStack {
            TicketDashLine()
                .stroke(style: StrokeStyle(lineWidth: 2, lineCap: .butt, dash: [6, 6]))
                .foregroundColor(Theme.C.ticketDivider)
                .frame(height: 2)
                .padding(.horizontal, 22)
            HStack(spacing: 0) {
                Circle()
                    .fill(Theme.C.surface)
                    .frame(width: 22, height: 22)
                    .offset(x: -11)
                Spacer(minLength: 0)
                Circle()
                    .fill(Theme.C.surface)
                    .frame(width: 22, height: 22)
                    .offset(x: 11)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 2)
        .zIndex(1)
        .allowsHitTesting(false)
    }
}

struct TicketDashLine: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}

/// White QR box (`bg-white p-* rounded-* border outline-variant/30`) with a QR of `payload` filling the
/// inner square: 86/6/r10 → 74 pt QR on the stub, 200/10/r14 → 180 pt QR on the pass card. The plate
/// stays white in dark mode so the code scans.
struct TicketQRBox: View {
    var payload: String
    var boxSize: CGFloat
    var padding: CGFloat
    var radius: CGFloat

    var body: some View {
        ZStack {
            Color.white
            QRCodeView(payload: payload, size: max(1, boxSize - 2 * padding))
        }
        .frame(width: boxSize, height: boxSize)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .stroke(Theme.C.outlineVariant.opacity(0.3), lineWidth: 1)
        )
    }
}
