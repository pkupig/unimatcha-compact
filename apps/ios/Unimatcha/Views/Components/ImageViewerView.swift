import SwiftUI

// MARK: - ImageViewerView (h5-core.md §1.8 `#chat-image-viewer`)
//
// Lightbox content for overlay id `image-viewer`: `rgba(0,0,0,.9)` ground, image `max-width 92 %`,
// `max-height 85 %`, `object-fit: contain`; tapping anywhere closes. H5 has no zoom/pan; a pinch-to-zoom
// is added here as a harmless native affordance (double-tap resets). Not swipe-back-able.

struct ImageViewerView: View {
    var url: String
    var onClose: () -> Void

    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    @State private var failed = false

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black.opacity(0.9)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture { onClose() }

                if failed {
                    VStack(spacing: 12) {
                        Image(systemName: Theme.Icon.sf("image"))
                            .font(.system(size: 36, weight: .light))
                            .foregroundColor(.white.opacity(0.7))
                        Text(L10n.t("Failed to load"))
                            .font(Theme.font(14))
                            .foregroundColor(.white.opacity(0.7))
                    }
                    .onTapGesture { onClose() }
                } else {
                    RemoteImage(url: url, contentMode: .fit, placeholder: AnyView(Color.clear), onFailure: { failed = true })
                        .frame(width: geo.size.width * 0.92, height: geo.size.height * 0.85)
                        .scaleEffect(scale)
                        .offset(offset)
                        .gesture(
                            MagnificationGesture()
                                .onChanged { v in scale = min(4, max(1, lastScale * v)) }
                                .onEnded { _ in
                                    lastScale = scale
                                    if scale <= 1.02 { reset() }
                                }
                        )
                        .simultaneousGesture(
                            DragGesture(minimumDistance: 8)
                                .onChanged { g in
                                    guard scale > 1 else { return }
                                    offset = CGSize(width: lastOffset.width + g.translation.width,
                                                    height: lastOffset.height + g.translation.height)
                                }
                                .onEnded { _ in lastOffset = offset }
                        )
                        .onTapGesture(count: 2) {
                            withAnimation(Theme.Motion.snap) {
                                if scale > 1 { reset() } else { scale = 2.2; lastScale = 2.2 }
                            }
                        }
                        .onTapGesture(count: 1) { onClose() }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .ignoresSafeArea()
    }

    private func reset() {
        scale = 1
        lastScale = 1
        offset = .zero
        lastOffset = .zero
    }
}
