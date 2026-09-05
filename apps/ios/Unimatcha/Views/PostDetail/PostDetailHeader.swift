import SwiftUI

// MARK: - PostDetailHeader (`#pd-header` — h5-square.md §1.5) — WP-09
//
// `h-16` (64) + top inset, glass ground (`bg-surface/80 backdrop-blur-xl`), 1 pt hairline below,
// `px-3` with `justify-between gap-2`:
//   left  36 pt round back button (`-ml-1.5` so the 24 pt `arrow_back` glyph lands on the 12 pt
//         content margin) + the author block: 32 pt avatar chip, name 13/700 truncate,
//         school 10 onSurfaceVariant truncate (`metaLabel`), official / Sponsored badge
//   right 36 pt `more_horiz` 22 pt onSurfaceVariant → post action menu
// The author block is EMPTY until the post is loaded (the previous post's author must never flash).

struct PostDetailHeader: View {
    var detail: SquarePostDetail?
    var safeTop: CGFloat
    var onBack: () -> Void
    var onMore: (CGRect) -> Void

    @State private var moreFrame: CGRect = .zero

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Button(action: onBack) {
                    Image(systemName: Theme.Icon.sf("arrow_back"))
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(Theme.C.onSurface)
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleIcon))
                .padding(.leading, -6)
                .accessibilityLabel(Text(L10n.t("Cancel")))

                if let post = detail?.post {
                    authorBlock(post)
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                onMore(moreFrame)
            } label: {
                Image(systemName: Theme.Icon.sf("more_horiz"))
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(Theme.C.onSurfaceVariant)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PostDetailPressStyle(scale: Theme.Motion.pressScaleIcon))
            .padding(.trailing, -6)
            .background(
                GeometryReader { g in
                    Color.clear.preference(key: MoreButtonFrameKey.self, value: g.frame(in: .global))
                }
            )
            .onPreferenceChange(MoreButtonFrameKey.self) { moreFrame = $0 }
            .accessibilityLabel(Text(L10n.pick("More", "更多")))
        }
        .padding(.horizontal, Theme.Space.postDetail)
        .frame(height: Theme.Bar.overlay)
        .padding(.top, safeTop)
        .frame(maxWidth: .infinity)
        .background(
            ZStack {
                Rectangle().fill(.ultraThinMaterial)
                Theme.C.glassBar
            }
            .ignoresSafeArea(edges: .top)
        )
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.C.hairline20).frame(height: 1)
        }
    }

    @ViewBuilder
    private func authorBlock(_ post: SquarePostCard) -> some View {
        let d = AuthorDisplay.of(post)
        // Anonymous posts take the school from `post.school` only — `AuthorDisplay` already enforces it.
        let school = d.school ?? post.school
        HStack(spacing: 8) {
            PostAvatar(display: d, size: 32)
            VStack(alignment: .leading, spacing: 1) {
                Text(d.name)
                    .font(Theme.font(13, weight: .bold))
                    .foregroundColor(Theme.C.onSurface)
                    .lineLimit(1)
                    .truncationMode(.tail)
                if let s = school?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty {
                    Text(L10n.metaLabel(s) ?? s)
                        .font(Theme.font(10))
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
            .frame(minWidth: 0, alignment: .leading)
            if post.isOfficial {
                OfficialBadgeIfAny(post: post)
            }
        }
    }
}

struct MoreButtonFrameKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) { value = nextValue() }
}

/// `active:scale-*` press feedback for the detail's bare icon buttons.
struct PostDetailPressStyle: ButtonStyle {
    var scale: CGFloat = Theme.Motion.pressScaleIcon

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(Theme.Motion.press, value: configuration.isPressed)
    }
}
