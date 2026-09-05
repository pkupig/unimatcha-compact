import SwiftUI

// MARK: - Photo Portfolio grid (`#edit-photo-grid`, h5-profile.md §1.3 item 4)
//
// 3 columns, gap 8, always 6 slots. Filled slot = square, r10, 1 pt `outlineVariant/40` border,
// image `object-cover`, 20×20 `primary/70` white "×" at top-1 right-1 (remove — immediate, no
// confirm). Empty slot = square, dashed `outlineVariant` border, centred `add` icon in `outline`
// (tap → picker; the parent guards the 6-photo cap and the in-flight upload).

struct PhotoGridView: View {
    var photos: [String]
    var slots: Int = ProfileRules.realPhotosMax
    var busy: Bool = false
    var onAdd: () -> Void
    var onRemove: (Int) -> Void

    private let columns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
    ]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(0..<max(slots, photos.count), id: \.self) { i in
                if i < photos.count {
                    filledSlot(index: i, url: photos[i])
                } else {
                    emptySlot
                }
            }
        }
        .opacity(busy ? 0.7 : 1)
    }

    private func filledSlot(index: Int, url: String) -> some View {
        ZStack(alignment: .topTrailing) {
            RemoteImage(url: url, contentMode: .fill, placeholderColor: Theme.C.containerLow)
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                        .stroke(Theme.C.outlineVariant.opacity(0.4), lineWidth: 1)
                )
            Button {
                guard !busy else { return }
                onRemove(index)
            } label: {
                ZStack {
                    Circle().fill(Theme.C.primary.opacity(0.7))
                    Text("×")
                        .font(Theme.font(14, weight: .medium))
                        .foregroundColor(Theme.C.onPrimary)
                }
                .frame(width: 20, height: 20)
                .contentShape(Circle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleSmallIcon))
            .disabled(busy)
            .padding(4)
            .accessibilityLabel(L10n.t("Close"))
        }
    }

    private var emptySlot: some View {
        Button(action: onAdd) {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                    .stroke(style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                    .foregroundColor(Theme.C.outlineVariantText)
                MaterialIcon(name: "add", size: 24, color: Theme.C.outline)
            }
            .aspectRatio(1, contentMode: .fit)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleWide))
        .disabled(busy)
        .accessibilityLabel(L10n.t("Add"))
    }
}
