import SwiftUI

// MARK: - `.ink-range` sliders (h5-design-system.md §8.3, h5-match.md §1.12)
//
// `InkSlider`: 2 pt track `#e2e2e2` (square ends), 14 pt round neon thumb; disabled → opacity .3 with a
// grey (`outline`) thumb. Used for the friend "cells" slider (1–5) and as the two halves of `RangeSlider`.
//
// `RangeSlider`: the Age Range pair — "Min" (18–30, default 18) / "Max" (18–30, default 24) with
// 9 pt widest `stone400` labels and "18 / 30" end labels; dragging Min above Max pushes Max up,
// dragging Max below Min pulls Min down (H5 `onAgeMinInput` / `onAgeMaxInput`).

struct InkSlider: View {
    @Binding var value: Int
    var range: ClosedRange<Int> = 18...30
    var disabled: Bool = false
    var onChange: ((Int) -> Void)? = nil

    private let thumb: CGFloat = 14
    private let trackHeight: CGFloat = 2

    var body: some View {
        GeometryReader { geo in
            let width = max(1, geo.size.width - thumb)
            let span = CGFloat(max(1, range.upperBound - range.lowerBound))
            let clamped = min(max(value, range.lowerBound), range.upperBound)
            let x = CGFloat(clamped - range.lowerBound) / span * width
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(Theme.C.inkTrack)
                    .frame(height: trackHeight)
                    .padding(.horizontal, thumb / 2)
                Circle()
                    .fill(disabled ? Theme.C.outline : Theme.C.neon)
                    .frame(width: thumb, height: thumb)
                    .offset(x: x)
            }
            .frame(height: geo.size.height)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { g in
                        guard !disabled else { return }
                        let px = min(max(0, g.location.x - thumb / 2), width)
                        let v = range.lowerBound + Int((px / width * span).rounded())
                        if v != value {
                            value = v
                            onChange?(v)
                        }
                    }
            )
        }
        .frame(height: 24)
        .opacity(disabled ? 0.3 : 1)
        .accessibilityValue("\(value)")
    }
}

struct RangeSlider: View {
    @Binding var minValue: Int
    @Binding var maxValue: Int
    var range: ClosedRange<Int> = 18...30
    var disabled: Bool = false
    var minLabel: String = "Min"
    var maxLabel: String = "Max"
    var onChange: ((Int, Int) -> Void)? = nil

    var body: some View {
        VStack(spacing: 14) {
            row(label: minLabel, value: $minValue) { v in
                if v > maxValue { maxValue = v }
                onChange?(minValue, maxValue)
            }
            row(label: maxLabel, value: $maxValue) { v in
                if v < minValue { minValue = v }
                onChange?(minValue, maxValue)
            }
        }
        .onAppear {
            // Normalise out-of-range / crossed defaults once (raw defaults 18 / 24 in H5).
            minValue = min(max(minValue, range.lowerBound), range.upperBound)
            maxValue = min(max(maxValue, range.lowerBound), range.upperBound)
            if minValue > maxValue { maxValue = minValue }
        }
    }

    private func row(label: String, value: Binding<Int>, onChange: @escaping (Int) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(Theme.font(9, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 9))
                .foregroundColor(Theme.C.stone400)
            HStack(spacing: 10) {
                Text("\(range.lowerBound)")
                    .font(Theme.font(9, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 9))
                    .foregroundColor(Theme.C.stone400)
                InkSlider(value: value, range: range, disabled: disabled, onChange: onChange)
                Text("\(range.upperBound)")
                    .font(Theme.font(9, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 9))
                    .foregroundColor(Theme.C.stone400)
            }
        }
    }
}
