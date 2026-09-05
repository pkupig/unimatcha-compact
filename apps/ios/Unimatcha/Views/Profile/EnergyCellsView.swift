import SwiftUI

// MARK: - Energy cells (h5-design-system.md §8.8, h5-profile.md §1.2 `renderEnergyDisplay`)
//
// `.energy-cell` 14×14, radius 3, neon fill = available; `--empty` transparent with a 1 pt
// `outlineVariant` border = used. At most 5 squares: `filled = min(avail, 5)`,
// `empty = min(max(total − avail, 0), 5 − filled)`; `total > 5` appends "+N" (10 pt `outline`);
// nothing at all → a muted "0". The layout maths is `EnergyCells` (WP-01); this is only the paint.

struct EnergyCellsView: View {
    var cells: EnergyCells

    init(cells: EnergyCells) {
        self.cells = cells
    }

    init(balance: EnergyBalance?) {
        self.cells = (balance ?? .zero).cells
    }

    static let cellSize: CGFloat = 14

    var body: some View {
        HStack(spacing: 4) {
            if cells.isZero {
                Text("0")
                    .font(Theme.font(12, weight: .medium))
                    .foregroundColor(Theme.C.outline)
            } else {
                ForEach(0..<cells.filled, id: \.self) { _ in
                    cell(filled: true)
                }
                ForEach(0..<cells.empty, id: \.self) { _ in
                    cell(filled: false)
                }
                if cells.extra > 0 {
                    Text("+\(cells.extra)")
                        .font(Theme.font(10))
                        .foregroundColor(Theme.C.outline)
                        .padding(.leading, 4)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.t("Energy"))
        .accessibilityValue(cells.isZero ? "0" : "\(cells.filled)")
    }

    private func cell(filled: Bool) -> some View {
        RoundedRectangle(cornerRadius: Theme.R.energyCell, style: .continuous)
            .fill(filled ? Theme.C.neon : Color.clear)
            .frame(width: Self.cellSize, height: Self.cellSize)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.R.energyCell, style: .continuous)
                    .stroke(filled ? Color.clear : Theme.C.outlineVariantFill, lineWidth: 1)
            )
    }
}
