import SwiftUI

// MARK: - Partner profile overlay `partner-profile` (h5-match.md §1.15, h5-profile.md §1.6) — WP-17
//
// Full-page overlay (fade + swipe-back) opened from the chat header avatar, the friend-hub
// contact rows and the couple space. Layout top-to-bottom (H5 `renderPartnerProfile`):
//
//   hero 240 pt: cover (or the avatar blurred `blur-2xl scale-125`) + the black→transparent→
//                surface gradient; 36 pt `black/35` back circle at 16 + safe-top / 16
//   px-6 -mt-12: 96 pt avatar in a 3 pt black ring with a 2 pt white inner ring
//   name row:    nickname 24/800 tight · verified 20 pt (else "UNVERIFIED" pill) · note pill ·
//                28 pt add/edit button → note prompt
//   realName 12 · school 14 (metaLabel, `school` icon 16) · grade · age · city 12 ·
//   "Known for N day(s)" with `calendar_month` 14
//   facts grid 2-col (Major / MBTI / Zodiac / Nationality, present values only)
//   neon interest chips · About (bio) · Photo Portfolio (12-col 8/4 + 3-col rest) · 24 pt spacer
//
// The back control is rendered on every state (loading / error / hidden) and pinned above the
// scroller, so the H5 trap (fetch failure → blank page with no exit) cannot happen (D14).

struct PartnerProfileView: View {
    static let overlayId = "partner-profile"

    @StateObject private var vm: PartnerProfileViewModel
    @Environment(\.overlaySafeInsets) private var envInsets

    init(userId: String, matchId: String? = nil) {
        _vm = StateObject(wrappedValue: PartnerProfileViewModel(userId: userId, matchId: matchId))
    }

    /// `viewPartnerProfile(userId, matchId)` — WP-16 implements `AppActions.openPartnerProfile`
    /// with this. The `openedProfile` behaviour event is reported before the overlay opens
    /// (session-deduped inside `MatchStore`).
    @MainActor
    static func present(userId: String, matchId: String? = nil) {
        if let m = matchId, !m.isEmpty {
            MatchStore.shared.reportEvent(matchId: m, type: .openedProfile)
        }
        OverlayRouter.shared.present(AppOverlay(id: overlayId, style: .fullPage, swipeBack: true) {
            PartnerProfileView(userId: userId, matchId: matchId).id(userId)
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    var body: some View {
        let insets = OverlayChrome.resolvedInsets(envInsets)
        ZStack(alignment: .topLeading) {
            Theme.C.surface.ignoresSafeArea()
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    hero()
                    content
                    Color.clear.frame(height: 24 + insets.bottom)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            backButton
                .padding(.leading, 16)
                .padding(.top, 16 + insets.top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .task { await vm.load() }
    }

    // MARK: Hero

    private func hero() -> some View {
        // `h-60` — the H5 overlay is `inset-0`, so the cover starts under the status bar and
        // measures 240 pt in total; only the back circle is offset by the safe-area inset.
        let height: CGFloat = 240
        return ZStack {
            Theme.C.containerLow
            if let cover = vm.coverSource {
                RemoteImage(url: cover, contentMode: .fill, placeholderColor: Theme.C.containerLow)
                    .frame(maxWidth: .infinity)
                    .frame(height: height)
                    .blur(radius: vm.coverIsBlurredAvatar ? 24 : 0)
                    .scaleEffect(vm.coverIsBlurredAvatar ? 1.25 : 1)
                    .clipped()
            }
            LinearGradient(
                gradient: Gradient(stops: [
                    .init(color: Color.black.opacity(0.28), location: 0),
                    .init(color: Color.black.opacity(0), location: 0.38),
                    .init(color: Theme.C.surface.opacity(0), location: 0.68),
                    .init(color: Theme.C.surface, location: 1),
                ]),
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .clipped()
    }

    private var backButton: some View {
        Button {
            PartnerProfileView.dismiss()
        } label: {
            ZStack {
                Circle().fill(Color.black.opacity(0.35))
                Image(systemName: Theme.Icon.sf("arrow_back"))
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(.white)
            }
            .frame(width: 36, height: 36)
            .contentShape(Circle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleIcon))
        .accessibilityLabel(L10n.pick("Back", "返回"))
    }

    // MARK: Body states

    @ViewBuilder private var content: some View {
        if vm.loadFailed && vm.profile == nil {
            EmptyState.loadFailed(title: L10n.pick("Failed to load profile", "资料加载失败")) {
                Task { await vm.load() }
            }
            .padding(.horizontal, Theme.Space.page)
        } else if vm.profile == nil {
            LoadingLine(topPadding: 48, bottomPadding: 96)
        } else if vm.isHidden {
            identityBlock
            hiddenNotice
        } else {
            identityBlock
            factGrid
            interestChips
            aboutBlock
            portfolio
        }
    }

    // MARK: Identity (avatar / name / meta lines)

    private var identityBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            avatar
            nameRow
                .padding(.top, 12)
            // A `hidden: true` projection is documented as "name + avatar only". The server builds
            // it literally, so these fields arrive nil anyway — gate them explicitly rather than
            // relying on that, so a future server change (or a VM seeded from a cached full
            // profile) cannot turn this screen into a privacy bypass.
            if !vm.isHidden {
                identityMetaLines
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.Space.page)
        .padding(.top, -48)                     // `-mt-12` over the hero
    }

    @ViewBuilder private var identityMetaLines: some View {
        Group {
            if let real = vm.profile?.realName, !real.isEmpty {
                Text(real)
                    .font(Theme.font(12))
                    .foregroundColor(Theme.C.onSurfaceVariant)
                    .padding(.top, 2)
            }
            if let school = vm.profile?.school, !school.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: Theme.Icon.sf("school"))
                        .font(.system(size: 16, weight: .light))
                    // Stored English metadata, displayed via META_ZH; never dictionary-translated.
                    Text(L10n.metaLabel(school) ?? school)
                        .font(Theme.font(14, weight: .medium))
                }
                .foregroundColor(Theme.C.onSurfaceVariant)
                .padding(.top, 6)
            }
            if let info = vm.infoLine {
                Text(info)
                    .font(Theme.font(12))
                    .tracking(Theme.tracking(Theme.Tracking.wider, size: 12))
                    .foregroundColor(Theme.C.outline)
                    .padding(.top, 6)
            }
            if let days = vm.daysKnownLine {
                HStack(spacing: 4) {
                    Image(systemName: Theme.Icon.sf("calendar_month"))
                        .font(.system(size: 14, weight: .light))
                    Text(days)
                        .font(Theme.font(12))
                        .tracking(Theme.tracking(Theme.Tracking.wider, size: 12))
                }
                .foregroundColor(Theme.C.outline)
                .padding(.top, 6)
            }
        }
    }

    private var avatar: some View {
        ZStack {
            Circle()
                .fill(Theme.C.primary)
                .frame(width: 96, height: 96)
                .shadow(color: Color.black.opacity(0.18), radius: 12, x: 0, y: 6)
            Group {
                if SafeURL.isSafe(vm.profile?.avatarUrl) {
                    RemoteImage(url: vm.profile?.avatarUrl, contentMode: .fill, placeholderColor: Theme.C.containerHigh)
                } else {
                    ZStack {
                        Theme.C.containerHigh
                        Image(systemName: Theme.Icon.sf("person"))
                            .font(.system(size: 30, weight: .light))
                            .foregroundColor(Theme.C.outline)
                    }
                }
            }
            .frame(width: 90, height: 90)
            .clipShape(Circle())
            .overlay(Circle().stroke(Color.white, lineWidth: 2))
        }
        .frame(width: 96, height: 96)
    }

    private var nameRow: some View {
        FlowLayout(spacing: 8) {
            // User content — never translated.
            Text(vm.displayName)
                .font(Theme.font(24, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 24))
                .foregroundColor(Theme.C.onSurface)
                .lineLimit(2)

            if vm.isVerified {
                Image(systemName: Theme.Icon.sf("verified"))
                    .font(.system(size: 20, weight: .regular))
                    .foregroundColor(Theme.C.primary)
                    .accessibilityLabel(L10n.pick("Campus verified", "已认证"))
            } else {
                Text(L10n.pick("UNVERIFIED", "未认证"))
                    .font(Theme.font(9, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 9))
                    .foregroundColor(Theme.C.outline)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: Theme.R.chip, style: .continuous).fill(Theme.C.container))
            }

            if let note = vm.note {
                Text(note)
                    .font(Theme.font(10, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                    .foregroundColor(Theme.C.onSurfaceVariant)
                    .lineLimit(1)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: Theme.R.chip, style: .continuous).fill(Theme.C.container))
            }

            Button {
                Task { await vm.promptSetNote() }
            } label: {
                ZStack {
                    Circle().stroke(Theme.C.outlineVariant.opacity(0.4), lineWidth: 1)
                    Image(systemName: Theme.Icon.sf(vm.note == nil ? "add" : "edit"))
                        .font(.system(size: 16, weight: .light))
                        .foregroundColor(Theme.C.onSurfaceVariant)
                }
                .frame(width: 28, height: 28)
                .contentShape(Circle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleIcon))
            .accessibilityLabel(vm.note == nil ? L10n.pick("Add note", "添加备注") : L10n.pick("Edit note", "编辑备注"))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Hidden projection (`{nickname, avatarUrl, hidden:true}`)

    private var hiddenNotice: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: Theme.Icon.sf("lock"))
                .font(.system(size: 17, weight: .light))
                .foregroundColor(Theme.C.outline)
            Text(L10n.pick("This profile is private.", "这份资料已设为私密。"))
                .font(Theme.font(13))
                .foregroundColor(Theme.C.onSurfaceVariant)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: Theme.R.plate, style: .continuous).fill(Theme.C.containerLow))
        .padding(.horizontal, Theme.Space.page)
        .padding(.top, 32)
    }

    // MARK: Facts grid

    @ViewBuilder private var factGrid: some View {
        let facts = vm.facts
        if !facts.isEmpty {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
                      alignment: .leading, spacing: 12) {
                ForEach(facts, id: \.label) { fact in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(fact.label.uppercased())
                            .font(Theme.font(9, weight: .bold))
                            .tracking(Theme.tracking(Theme.Tracking.section, size: 9))
                            .foregroundColor(Theme.C.outline)
                        Text(fact.value)
                            .font(Theme.font(14, weight: .bold))
                            .tracking(Theme.tracking(Theme.Tracking.tight, size: 14))
                            .foregroundColor(Theme.C.onSurface)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous).fill(Theme.C.card))
                    .overlay(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                        .stroke(Theme.C.hairline20, lineWidth: 1))
                }
            }
            .padding(.horizontal, Theme.Space.page)
            .padding(.top, 32)
        }
    }

    // MARK: Interests

    @ViewBuilder private var interestChips: some View {
        let list = vm.interests
        if !list.isEmpty {
            FlowLayout(spacing: 8) {
                ForEach(list, id: \.self) { t in
                    Text(t)
                        .font(Theme.font(10, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                        .foregroundColor(.black)
                        .lineLimit(1)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(RoundedRectangle(cornerRadius: Theme.R.chip, style: .continuous).fill(Theme.C.neon))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.Space.page)
            .padding(.top, 20)
        }
    }

    // MARK: About

    @ViewBuilder private var aboutBlock: some View {
        if let bio = vm.bio {
            VStack(alignment: .leading, spacing: 12) {
                PartnerSectionHeading(text: L10n.pick("About", "关于"))
                Text(bio)
                    .font(Theme.font(14))
                    .lineSpacing(14 * 0.625)
                    .foregroundColor(Theme.C.onSurfaceVariant)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, Theme.Space.page)
            .padding(.top, 32)
        }
    }

    // MARK: Photo Portfolio (connections only)

    @ViewBuilder private var portfolio: some View {
        let photos = vm.photos
        if !photos.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .bottom) {
                    PartnerSectionHeading(text: L10n.t("Photo Portfolio"))
                    Spacer(minLength: 8)
                    Text(vm.photoCountLine)
                        .font(Theme.font(10, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                        .foregroundColor(Theme.C.outline)
                }
                .padding(.bottom, 16)

                PortfolioTopGrid(photos: photos)

                let rest = Array(photos.dropFirst(3))
                if !rest.isEmpty {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                        ForEach(Array(rest.enumerated()), id: \.offset) { pair in
                            PortfolioCell(url: pair.element)
                                .aspectRatio(1, contentMode: .fill)
                        }
                    }
                    .padding(.top, 8)
                }
            }
            .padding(.horizontal, Theme.Space.page)
            .padding(.top, 40)
        }
    }
}

// MARK: - Pieces

/// `font-headline font-bold text-xs tracking-[0.2em] text-on-surface` (About / Photo Portfolio).
struct PartnerSectionHeading: View {
    var text: String
    var body: some View {
        Text(text)
            .font(Theme.font(12, weight: .bold))
            .tracking(Theme.tracking(Theme.Tracking.section, size: 12))
            .foregroundColor(Theme.C.onSurface)
    }
}

/// The 12-column top block: first photo `col-span-8` (12 when alone), the next two stacked in
/// `col-span-4`; height 260 (220 when there is only one photo), gap 8.
struct PortfolioTopGrid: View {
    var photos: [String]

    private var side: [String] { Array(photos.dropFirst().prefix(2)) }
    private var height: CGFloat { side.isEmpty ? 220 : 260 }
    private let gap: CGFloat = 8

    var body: some View {
        GeometryReader { geo in
            // 12 equal columns with 11 gaps: span8 + gap + span4 == total width.
            let column = max(0, (geo.size.width - 11 * gap) / 12)
            let span8 = column * 8 + gap * 7
            HStack(spacing: gap) {
                PortfolioCell(url: photos.first ?? "")
                    .frame(width: side.isEmpty ? geo.size.width : span8, height: geo.size.height)
                if !side.isEmpty {
                    VStack(spacing: gap) {
                        ForEach(Array(side.enumerated()), id: \.offset) { pair in
                            PortfolioCell(url: pair.element)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                    }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .leading)
        }
        .frame(height: height)
    }
}

/// One portfolio tile: rounded 10, `surface-container` ground, tap → shared image viewer.
struct PortfolioCell: View {
    var url: String

    var body: some View {
        Button {
            guard SafeURL.isSafe(url) else { return }
            AppActions.shared.openImageViewer(url)
        } label: {
            RemoteImage(url: url, contentMode: .fill, placeholderColor: Theme.C.container)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(Theme.C.container)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
    }
}
