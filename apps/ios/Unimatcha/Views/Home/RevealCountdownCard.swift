import SwiftUI

// MARK: - RevealCountdownCard (h5-match.md §1.3 item 3, design §9 item 3) — WP-06
//
// Bleeding neon card (`.mp-card`, `--alt` mirrored corners when searching): bg neon, text black in
// BOTH colour schemes, padding 14/18/16, hand-drawn irregular corners
//   idle      radius 24 28 22 28 / 28 22 28 24
//   searching radius 28 24 28 22 / 22 28 24 28
// Contents: label "NEXT REVEAL IN" (10/800/+0.3em black 50 %), the Mon–Sun week row (44 pt cells,
// today = white pill r11, reveal day = "REVEAL" badge + hand-drawn white ring — only when the reveal
// falls inside this Mon–Sun row, date-based), and the four-pair countdown line (digits
// min(48, 12vw) / 800 / −0.02em black with a white 8-direction outline; units 12/700 black 50 %,
// margins 0 10 0 5). Values zero-padded to two digits, days included; ticks every second from
// the pane's `now`; the week row re-derives from `now` so it rolls over at midnight.

struct RevealCountdownCard: View {
    let mode: MatchMode
    let searching: Bool
    let revealDate: Date
    let now: Date

    private var dayNames: [String] {
        L10n.isZh ? ["一", "二", "三", "四", "五", "六", "日"] : ["M", "T", "W", "T", "F", "S", "S"]
    }

    private var units: [String] {
        L10n.isZh ? ["天", "时", "分", "秒"] : ["d", "h", "m", "s"]
    }

    private var corners: IrregularCorners {
        searching
            ? IrregularCorners(tl: (28, 22), tr: (24, 28), br: (28, 24), bl: (22, 28))
            : IrregularCorners(tl: (24, 28), tr: (28, 22), br: (22, 28), bl: (28, 24))
    }

    /// Card width (measured) → digit size `min(48px, 12vw)`; 375 pt screen → 359 pt card → 43 pt digits.
    @State private var cardWidth: CGFloat = 359

    var body: some View {
        let digitSize = min(48, cardWidth * 0.12)
        VStack(alignment: .leading, spacing: 0) {
            Text(L10n.pick("NEXT REVEAL IN", "距下轮公布"))
                .font(Theme.font(10, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.hero, size: 10))
                .foregroundColor(Color.black.opacity(0.5))

            weekRow
                .padding(.top, 8)

            countdownLine(digitSize: digitSize)
                .padding(.top, 14)
        }
        .padding(.top, 14)
        .padding(.horizontal, 18)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(IrregularRoundedRect(corners: corners).fill(Theme.C.neon))
        .background(GeometryReader { geo in
            Color.clear.preference(key: CardWidthKey.self, value: geo.size.width)
        })
        .onPreferenceChange(CardWidthKey.self) { w in
            if w > 0 { cardWidth = w }
        }
    }

    // MARK: Week row

    private var weekRow: some View {
        let numbers = RevealSchedule.weekDayNumbers(now: now)
        let today = RevealSchedule.todayIndex(now: now)
        let reveal = RevealSchedule.revealIndexInWeek(reveal: revealDate, now: now)
        return HStack(spacing: 0) {
            ForEach(0..<7, id: \.self) { i in
                dayCell(name: dayNames[i], number: numbers[i], isToday: i == today, isReveal: i == reveal)
                if i < 6 { Spacer(minLength: 0) }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func dayCell(name: String, number: String, isToday: Bool, isReveal: Bool) -> some View {
        VStack(spacing: 4) {
            Text(name)
                .font(Theme.font(11, weight: .bold))
                .foregroundColor(Color.black.opacity(isToday ? 0.55 : 0.45))
            Text(number)
                .font(Theme.font(16, weight: .heavy))
                .monospacedDigit()
                .foregroundColor(isToday ? .black : Color.black.opacity(0.9))
        }
        .frame(width: 44)
        .padding(.top, 7)
        .padding(.bottom, 6)
        .background(
            RoundedRectangle(cornerRadius: Theme.R.dayToday, style: .continuous)
                .fill(isToday ? Color.white : Color.clear)
        )
        .overlay(alignment: .top) {
            if isReveal {
                Text(L10n.pick("REVEAL", "公布日"))
                    .font(Theme.font(9, weight: .heavy))
                    .tracking(Theme.tracking(0.06, size: 9))
                    .foregroundColor(.black)
                    .padding(.top, 2)
                    .padding(.bottom, 2.5)
                    .padding(.horizontal, 6)
                    .background(RoundedRectangle(cornerRadius: Theme.R.dayBadge, style: .continuous).fill(Color.white))
                    .fixedSize()
                    .offset(y: -12)
                    .zIndex(1)
            }
        }
        .overlay(alignment: .top) {
            if isReveal {
                HandDrawnRing()
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 2.8, lineCap: .round, lineJoin: .round))
                    .frame(width: 40, height: 28)
                    .offset(y: 21)
                    .allowsHitTesting(false)
            }
        }
    }

    // MARK: Countdown line

    private func countdownLine(digitSize: CGFloat) -> some View {
        let ms = revealDate.timeIntervalSince(now) * 1000
        let parts = Formatters.countdownParts(ms: ms)
        let values = [parts.d, parts.h, parts.m, parts.s]
        return HStack(alignment: .lastTextBaseline, spacing: 0) {
            ForEach(0..<4, id: \.self) { i in
                OutlinedDigits(text: values[i], size: digitSize)
                Text(units[i])
                    .font(Theme.font(12, weight: .bold))
                    .foregroundColor(Color.black.opacity(0.5))
                    .padding(.leading, 5)
                    .padding(.trailing, i == 3 ? 0 : 10)
            }
        }
    }
}

// MARK: - Outlined digits (`.mp-num` white 8-direction text-shadow on neon)

private struct OutlinedDigits: View {
    let text: String
    let size: CGFloat

    private static let offsets: [(CGFloat, CGFloat)] = [
        (2, 0), (-2, 0), (0, 2), (0, -2), (1.5, 1.5), (-1.5, 1.5), (1.5, -1.5), (-1.5, -1.5),
    ]

    var body: some View {
        ZStack {
            ForEach(0..<Self.offsets.count, id: \.self) { i in
                digit.foregroundColor(.white).offset(x: Self.offsets[i].0, y: Self.offsets[i].1)
            }
            digit.foregroundColor(.black)
        }
        .fixedSize()
    }

    private var digit: some View {
        Text(text)
            .font(Theme.font(size, weight: .heavy))
            .tracking(Theme.tracking(-0.02, size: size))
            .monospacedDigit()
            .lineLimit(1)
    }
}

// MARK: - Hand-drawn ring (`.mp-day-ring` SVG 40×28)
//
// `M20 3 C30 2.5 37 8 37 14 C37 21.5 29 26 19 25.5 C10 25 3 21 3 14.5 C3 8 11 4 23 3.2`

struct HandDrawnRing: Shape {
    func path(in rect: CGRect) -> Path {
        let sx = rect.width / 40
        let sy = rect.height / 28
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * sx, y: rect.minY + y * sy) }
        var path = Path()
        path.move(to: p(20, 3))
        path.addCurve(to: p(37, 14), control1: p(30, 2.5), control2: p(37, 8))
        path.addCurve(to: p(19, 25.5), control1: p(37, 21.5), control2: p(29, 26))
        path.addCurve(to: p(3, 14.5), control1: p(10, 25), control2: p(3, 21))
        path.addCurve(to: p(23, 3.2), control1: p(3, 8), control2: p(11, 4))
        return path
    }
}

// MARK: - Irregular rounded rectangle (`border-radius: a b c d / e f g h`)

struct IrregularCorners: Equatable {
    /// (horizontal radius, vertical radius) per corner.
    var tl: (CGFloat, CGFloat)
    var tr: (CGFloat, CGFloat)
    var br: (CGFloat, CGFloat)
    var bl: (CGFloat, CGFloat)

    static func == (l: IrregularCorners, r: IrregularCorners) -> Bool {
        l.tl == r.tl && l.tr == r.tr && l.br == r.br && l.bl == r.bl
    }
}

struct IrregularRoundedRect: Shape {
    var corners: IrregularCorners

    func path(in rect: CGRect) -> Path {
        // Elliptical corners approximated with cubic Béziers (kappa ≈ 0.5523).
        let k: CGFloat = 0.5523
        let w = rect.width, h = rect.height
        let maxR = min(w, h) / 2
        func c(_ r: (CGFloat, CGFloat)) -> (CGFloat, CGFloat) { (min(r.0, maxR), min(r.1, maxR)) }
        let tl = c(corners.tl), tr = c(corners.tr), br = c(corners.br), bl = c(corners.bl)
        let x0 = rect.minX, y0 = rect.minY, x1 = rect.maxX, y1 = rect.maxY

        var p = Path()
        p.move(to: CGPoint(x: x0 + tl.0, y: y0))
        p.addLine(to: CGPoint(x: x1 - tr.0, y: y0))
        p.addCurve(to: CGPoint(x: x1, y: y0 + tr.1),
                   control1: CGPoint(x: x1 - tr.0 + tr.0 * k, y: y0),
                   control2: CGPoint(x: x1, y: y0 + tr.1 - tr.1 * k))
        p.addLine(to: CGPoint(x: x1, y: y1 - br.1))
        p.addCurve(to: CGPoint(x: x1 - br.0, y: y1),
                   control1: CGPoint(x: x1, y: y1 - br.1 + br.1 * k),
                   control2: CGPoint(x: x1 - br.0 + br.0 * k, y: y1))
        p.addLine(to: CGPoint(x: x0 + bl.0, y: y1))
        p.addCurve(to: CGPoint(x: x0, y: y1 - bl.1),
                   control1: CGPoint(x: x0 + bl.0 - bl.0 * k, y: y1),
                   control2: CGPoint(x: x0, y: y1 - bl.1 + bl.1 * k))
        p.addLine(to: CGPoint(x: x0, y: y0 + tl.1))
        p.addCurve(to: CGPoint(x: x0 + tl.0, y: y0),
                   control1: CGPoint(x: x0, y: y0 + tl.1 - tl.1 * k),
                   control2: CGPoint(x: x0 + tl.0 - tl.0 * k, y: y0))
        p.closeSubpath()
        return p
    }
}

private struct CardWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}
