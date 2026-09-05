import SwiftUI
import UIKit

// MARK: - Couple Space hub sections (h5-couple.md §1.1 State C) — WP-12
//
// Design rule from `couple.js`: **no emoji anywhere** — Material Symbols only (via `Theme.Icon`).
// Every geometry value below is the Tailwind class from the map (p-6 → 24, mb-5 → 20, text-[9px]
// → 9 pt, tracking-widest → 0.1em, …).

// MARK: - (1) Hero / cover card

struct CoupleHeroCard: View {
    let space: CoupleSpace
    @ObservedObject var vm: CoupleViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            if !space.partner.bio.isEmpty {
                Text(space.partner.bio)
                    .font(Theme.font(12))
                    .lineSpacing(12 * 0.625)                       // leading-relaxed
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(2)                                   // -webkit-line-clamp: 2
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let days = space.daysTogether {
                daysRow(days).padding(.top, 16)
            }
            statusGrid
        }
        .padding(CoupleLayout.heroPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(background)
        .overlay(alignment: .topTrailing) {
            // Non-interactive "editable" hint (the whole card opens the cover popup).
            MaterialIcon(name: "edit", size: 18, color: .white.opacity(0.55))
                .padding(12)
                .allowsHitTesting(false)
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture { vm.openCoverPopup() }
        .accessibilityAddTraits(.isButton)
    }

    // Cover image under a 50 %→60 % black gradient, else solid plum (#2e1a3a).
    @ViewBuilder
    private var background: some View {
        if SafeURL.isSafe(space.cover) {
            ZStack {
                Theme.C.coupleHeroPlum
                RemoteImage(url: space.cover, contentMode: .fill)
                LinearGradient(colors: [Color.black.opacity(0.5), Color.black.opacity(0.6)],
                               startPoint: .top, endPoint: .bottom)
            }
        } else {
            Theme.C.coupleHeroPlum
        }
    }

    private var header: some View {
        HStack(spacing: 16) {
            Button {
                vm.openPartnerProfile()
            } label: {
                partnerAvatar
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.95))
            .accessibilityLabel(space.partnerDisplayName)

            VStack(alignment: .leading, spacing: 0) {
                Text(L10n.pick("IN A RELATIONSHIP", "恋爱中"))
                    .font(Theme.font(10, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.section, size: 10))
                    .foregroundColor(Theme.C.neon)
                Text(L10n.pick("You & ", "你和 ") + space.partnerDisplayName)
                    .font(Theme.font(20, weight: .heavy))
                    .tracking(Theme.tracking(Theme.Tracking.tight, size: 20))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var partnerAvatar: some View {
        ZStack {
            Theme.C.container
            if SafeURL.isSafe(space.partner.avatarUrl) {
                RemoteImage(url: space.partner.avatarUrl, contentMode: .fill)
            } else {
                MaterialIcon(name: "person", size: 24, color: Theme.C.outline)
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(Circle())
        .overlay(Circle().stroke(Theme.C.neon, lineWidth: 2).padding(-1))   // ring-2 ring-neon
    }

    private func daysRow(_ days: Int) -> some View {
        HStack(alignment: .bottom, spacing: 8) {
            Text("\(days)")
                .font(Theme.font(48, weight: .heavy))
                .foregroundColor(Theme.C.neon)
            Text(days == 1
                 ? L10n.pick("DAY TOGETHER", "天在一起")
                 : L10n.pick("DAYS TOGETHER", "天在一起"))
                .font(Theme.font(12))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 12))
                .foregroundColor(.white.opacity(0.7))
                .padding(.bottom, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // `grid-cols-2 gap-3 mt-5 pt-4 border-t border-white/15`
    private var statusGrid: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(Color.white.opacity(0.15))
                .frame(height: 1)
                .padding(.top, 20)
            HStack(alignment: .top, spacing: CoupleLayout.columnGap) {
                Button {
                    vm.openStatusPopup()
                } label: {
                    statusCell(label: L10n.pick("YOU · TODAY", "我 · 今天"),
                               labelColor: Theme.C.neon,
                               value: space.status.me,
                               emptyText: L10n.pick("Set your status", "设置今日状态"),
                               emptyColor: .white.opacity(0.5))
                }
                .buttonStyle(PressOpacityButtonStyle(opacity: 0.7))

                statusCell(label: space.partnerNameUpper + L10n.pick(" · TODAY", " · 今天"),
                           labelColor: .white.opacity(0.6),
                           value: space.status.partner,
                           emptyText: L10n.t("No update"),
                           emptyColor: .white.opacity(0.4))
            }
            .padding(.top, 16)
        }
    }

    private func statusCell(label: String, labelColor: Color, value: String,
                            emptyText: String, emptyColor: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(Theme.font(9, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 9))
                .foregroundColor(labelColor)
                .lineLimit(1)
            HStack(spacing: 4) {
                if let icon = CoupleStatus.icon(for: value) {
                    MaterialIcon(name: icon, size: 16, color: .white)
                }
                Text(value.isEmpty ? emptyText : CoupleStatus.display(value))
                    .font(Theme.font(14))
                    .coupleItalic(value.isEmpty)
                    .foregroundColor(value.isEmpty ? emptyColor : .white)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

// MARK: - Section shell

/// `section(title, addBtn, body)`: 11/800 uppercase title with 0.2em tracking, `mb-3` to the body.
struct CoupleSection<Trailing: View, Inner: View>: View {
    let title: String
    @ViewBuilder var trailing: () -> Trailing
    @ViewBuilder var content: () -> Inner

    var body: some View {
        VStack(alignment: .leading, spacing: CoupleLayout.headerGap) {
            HStack(alignment: .center, spacing: 8) {
                Text(title.uppercased())
                    .font(Theme.font(11, weight: .heavy))
                    .tracking(Theme.tracking(Theme.Tracking.section, size: 11))
                    .foregroundColor(Theme.C.onSurface)
                Spacer(minLength: 0)
                trailing()
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// 20 pt Material icon button used in section headers (`text-on-surface`).
struct CoupleHeaderIconButton: View {
    let material: String
    var size: CGFloat = 20
    var tint: Color = Theme.C.onSurface
    var accessibilityLabel: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            MaterialIcon(name: material, size: size, color: tint)
                .frame(width: max(size, 28), height: max(size, 28))
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.9))
        .accessibilityLabel(accessibilityLabel ?? material)
    }
}

// MARK: - (2) Anniversaries

struct CoupleAnniversariesSection: View {
    let space: CoupleSpace
    @ObservedObject var vm: CoupleViewModel

    var body: some View {
        CoupleSection(title: L10n.t("Anniversaries")) {
            HStack(spacing: 4) {
                if !space.anniversaries.isEmpty {
                    CoupleHeaderIconButton(material: "list", accessibilityLabel: L10n.t("View all")) {
                        vm.openAllAnniversaries()
                    }
                }
                CoupleHeaderIconButton(material: "add", accessibilityLabel: L10n.t("Add anniversary")) {
                    vm.openAddAnniversaryPopup()
                }
            }
        } content: {
            if space.anniversaries.isEmpty {
                Text(L10n.t("No anniversaries yet."))
                    .font(Theme.font(14))
                    .italic()
                    .foregroundColor(Theme.C.outline)
            } else {
                VStack(spacing: CoupleLayout.columnGap) {
                    ForEach(space.anniversariesForHub) { anniversary in
                        CoupleAnniversaryCard(anniversary: anniversary) {
                            vm.openAnniversaryDetail(id: anniversary.id)
                        }
                    }
                }
            }
        }
    }
}

struct CoupleAnniversaryCard: View {
    let anniversary: CoupleSpace.Anniversary
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                CoupleAnniversaryTile(anniversary: anniversary)
                if let first = anniversary.images.first, SafeURL.isSafe(first) {
                    thumb(first)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(anniversary.title)
                        .font(Theme.font(14, weight: .bold))
                        .foregroundColor(Theme.C.onSurface)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Text(CoupleCopy.countdownLabel(daysUntil: anniversary.daysUntil)
                         + (anniversary.note.isEmpty ? "" : L10n.pick(" · note", " · 备注")))
                        .font(Theme.font(10))
                        .tracking(Theme.tracking(Theme.Tracking.wider, size: 10))
                        .foregroundColor(Theme.C.outline)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                MaterialIcon(name: "chevron_right", size: 18, color: Theme.C.outlineVariantText)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.C.card)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Theme.C.outlineVariant.opacity(0.25), lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.99))
    }

    private func thumb(_ url: String) -> some View {
        ZStack(alignment: .bottomTrailing) {
            Theme.C.container
            RemoteImage(url: url, contentMode: .fill)
            if anniversary.images.count > 1 {
                Text("\(anniversary.images.count)")
                    .font(Theme.font(9, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 4)
                    .background(Color.black.opacity(0.65))
                    .clipShape(CoupleRoundedCorners(radius: 6, corners: [.topLeft]))
            }
        }
        .frame(width: 44, height: 44)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

/// Tear-off calendar tile: 56 pt wide, month band (neon when upcoming) over a 2-digit day + year.
struct CoupleAnniversaryTile: View {
    let anniversary: CoupleSpace.Anniversary

    var body: some View {
        let parts = anniversary.tileDate.map { Formatters.anniversaryTile($0) }
        return VStack(spacing: 0) {
            Text(parts?.month ?? "--")
                .font(Theme.font(9, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 9))
                .foregroundColor(anniversary.isFuture ? .black : Theme.C.outline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 2)
                .background(anniversary.isFuture ? Theme.C.neon : Theme.C.container)
            VStack(spacing: 2) {
                Text(parts?.day ?? "--")
                    .font(Theme.font(20, weight: .heavy))
                    .foregroundColor(Theme.C.onSurface)
                Text(parts?.year ?? "")
                    .font(Theme.font(8))
                    .foregroundColor(Theme.C.outline)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
        }
        .frame(width: 56)
        .background(Theme.C.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(Theme.C.outlineVariant.opacity(0.3), lineWidth: 1)
        )
    }
}

// MARK: - (3) Craving today

struct CoupleCravingSection: View {
    let space: CoupleSpace
    @ObservedObject var vm: CoupleViewModel

    var body: some View {
        CoupleSection(title: L10n.t("Craving today")) {
            EmptyView()
        } content: {
            HStack(alignment: .top, spacing: CoupleLayout.columnGap) {
                CoupleCell {
                    HStack(spacing: 8) {
                        CoupleMicroLabel(text: L10n.pick("YOU", "我"))
                        Spacer(minLength: 0)
                        Button {
                            Task { await vm.editCraving() }
                        } label: {
                            MaterialIcon(name: "edit", size: 15, color: Theme.C.outline)
                                .frame(width: 24, height: 24)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(PressScaleButtonStyle(scale: 0.9))
                        .accessibilityLabel(L10n.t("Craving today"))
                    }
                    .padding(.bottom, 4)

                    valueText(space.craving.me.current, empty: L10n.t("Tap edit"))

                    if !space.cravingQuickPicks.isEmpty {
                        FlowLayout(spacing: 4) {
                            ForEach(space.cravingQuickPicks, id: \.self) { item in
                                Button {
                                    Task { await vm.quickCraving(item) }
                                } label: {
                                    Text(item)
                                        .font(Theme.font(10))
                                        .foregroundColor(Theme.C.onSurfaceVariant)
                                        .lineLimit(1)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 2)
                                        .background(Theme.C.container)
                                        .clipShape(RoundedRectangle(cornerRadius: Theme.R.chip, style: .continuous))
                                }
                                .buttonStyle(PressScaleButtonStyle(scale: 0.95))
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 8)
                    }
                }

                CoupleCell {
                    CoupleMicroLabel(text: space.partnerNameUpper)
                        .padding(.bottom, 4)
                    valueText(space.craving.partner.current, empty: L10n.t("No update"))
                }
            }
        }
    }

    private func valueText(_ value: String, empty: String) -> some View {
        Text(value.isEmpty ? empty : value)
            .font(Theme.font(14))
            .coupleItalic(value.isEmpty)
            .foregroundColor(value.isEmpty ? Theme.C.outline : Theme.C.onSurface)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - (4) What I'm up to (schedule)

struct CoupleScheduleSection: View {
    let space: CoupleSpace
    @ObservedObject var vm: CoupleViewModel

    var body: some View {
        CoupleSection(title: L10n.t("What I'm up to")) {
            EmptyView()
        } content: {
            HStack(alignment: .top, spacing: CoupleLayout.columnGap) {
                CoupleCell {
                    HStack(spacing: 8) {
                        CoupleMicroLabel(text: L10n.pick("YOU", "我"))
                        Spacer(minLength: 0)
                        Button {
                            vm.openSchedulePopup()
                        } label: {
                            MaterialIcon(name: "add", size: 16, color: Theme.C.outline)
                                .frame(width: 24, height: 24)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(PressScaleButtonStyle(scale: 0.9))
                        .accessibilityLabel(L10n.pick("What are you up to?", "你在忙什么？"))
                    }
                    .padding(.bottom, 8)
                    column(space.schedule.me, mine: true)
                }

                CoupleCell {
                    CoupleMicroLabel(text: space.partnerNameUpper)
                        .padding(.bottom, 8)
                    column(space.schedule.partner, mine: false)
                }
            }
        }
    }

    @ViewBuilder
    private func column(_ list: [CoupleSpace.ScheduleEntry], mine: Bool) -> some View {
        if list.isEmpty {
            Text(mine ? L10n.t("Add what you're up to") : L10n.t("No update"))
                .font(Theme.font(11))
                .italic()
                .foregroundColor(Theme.C.outline)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else if list.count > CoupleLayout.scheduleScrollThreshold {
            ScrollView(.vertical, showsIndicators: false) {
                entries(list, mine: mine)
                    .padding(.trailing, 4)                      // pr-1
            }
            .frame(maxHeight: CoupleLayout.scheduleMaxHeight)   // max-h-64
        } else {
            entries(list, mine: mine)
        }
    }

    private func entries(_ list: [CoupleSpace.ScheduleEntry], mine: Bool) -> some View {
        VStack(spacing: 8) {                                    // mb-2 between entries
            ForEach(list) { entry in
                CoupleScheduleEntryRow(entry: entry, mine: mine) {
                    Task { await vm.deleteSchedule(id: entry.id) }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CoupleScheduleEntryRow: View {
    let entry: CoupleSpace.ScheduleEntry
    let mine: Bool
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .top, spacing: 4) {
                Text(entry.text)
                    .font(Theme.font(12, weight: .bold))
                    .strikethrough(entry.expired)
                    .foregroundColor(entry.expired ? Theme.C.outline : Theme.C.onSurface)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if mine && !entry.expired {
                    // No confirmation on delete (h5-couple gotcha 9).
                    Button(action: onDelete) {
                        MaterialIcon(name: "close", size: 14, color: Theme.C.outline)
                            .frame(width: 20, height: 20)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PressScaleButtonStyle(scale: 0.9))
                    .accessibilityLabel(L10n.t("Delete"))
                }
            }
            Text(entry.rangeLabel + (entry.expired ? L10n.pick(" · record", " · 记录") : ""))
                .font(Theme.font(10))
                .tracking(Theme.tracking(Theme.Tracking.wider, size: 10))
                .foregroundColor(entry.expired ? Theme.C.outline : Theme.C.onSurfaceVariant)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(entry.expired ? Theme.C.container : Theme.C.neonTint10)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(entry.expired ? Theme.C.outlineVariant.opacity(0.2) : Theme.C.neon, lineWidth: 1)
        )
    }
}

// MARK: - (5) Plans & checklist (bucket)

struct CoupleBucketSection: View {
    let space: CoupleSpace
    @ObservedObject var vm: CoupleViewModel

    var body: some View {
        CoupleSection(title: L10n.t("Plans & checklist")) {
            CoupleHeaderIconButton(material: "add", accessibilityLabel: L10n.pick("Add to checklist", "添加到清单")) {
                Task { await vm.openAddBucketPrompt() }
            }
        } content: {
            Group {
                if space.bucket.isEmpty {
                    Text(L10n.t("Nothing planned yet."))
                        .font(Theme.font(14))
                        .italic()
                        .foregroundColor(Theme.C.outline)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    VStack(spacing: 8) {                          // mb-2 / last:mb-0
                        ForEach(space.bucket) { item in
                            CoupleBucketRow(
                                item: item,
                                onToggle: { Task { await vm.tickBucket(id: item.id, currentDone: item.done) } },
                                onOpenRecord: { vm.openBucketRecord(id: item.id) },
                                onDelete: { Task { await vm.deleteBucket(id: item.id) } })
                        }
                    }
                }
            }
            .padding(4)                                            // p-1 body wrapper
        }
    }
}

struct CoupleBucketRow: View {
    let item: CoupleSpace.BucketItem
    let onToggle: () -> Void
    let onOpenRecord: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onToggle) {
                ZStack {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(item.done ? Theme.C.neon : Color.clear)
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(item.done ? Theme.C.neon : Theme.C.outline, lineWidth: 1)
                    if item.done {
                        // Always BLACK on neon, in dark mode too (h5-couple gotcha 15).
                        MaterialIcon(name: "check", size: 16, color: .black)
                    }
                }
                .frame(width: 20, height: 20)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.9))
            .accessibilityLabel(item.text)

            Button(action: onOpenRecord) {
                HStack(spacing: 4) {
                    Text(item.text)
                        .font(Theme.font(14))
                        .strikethrough(item.done)
                        .foregroundColor(item.done ? Theme.C.outline : Theme.C.onSurface)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                    if item.hasRecord {
                        MaterialIcon(name: "photo", size: 14, color: Theme.C.outline)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressOpacityButtonStyle(opacity: 0.7))
            .allowsHitTesting(item.done)                           // `pointer-events:none` while undone

            if !item.done {
                Button(action: onDelete) {
                    MaterialIcon(name: "close", size: 18, color: Theme.C.outline)
                        .frame(width: 24, height: 24)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleButtonStyle(scale: 0.9))
                .accessibilityLabel(L10n.t("Delete"))
            }
        }
        .padding(.vertical, 10)                                    // py-2.5
        .padding(.leading, 12)                                     // pl-3
        .padding(.trailing, 8)                                     // pr-2
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.card)
        .overlay(alignment: .leading) {
            Rectangle().fill(Theme.C.neon).frame(width: 4)         // .bookmark-item left rail
        }
        .clipShape(CoupleRoundedCorners(radius: Theme.R.base, corners: [.topRight, .bottomRight]))
        .shadow(color: Color.black.opacity(0.04), radius: 1, x: 0, y: 1)
    }
}

// MARK: - (6) Gift jar row

struct CoupleGiftJarRow: View {
    let space: CoupleSpace
    @ObservedObject var vm: CoupleViewModel

    var body: some View {
        Button {
            vm.openGiftJar()
        } label: {
            HStack(spacing: 0) {
                HStack(spacing: 12) {
                    MaterialIcon(name: "redeem", size: 24, color: Theme.C.onSurface)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(L10n.t("Gift jar"))
                            .font(Theme.font(14, weight: .bold))
                            .foregroundColor(Theme.C.onSurface)
                        Text(L10n.pick("See what \(space.partnerDisplayName) wants",
                                       "看看 \(space.partnerDisplayName) 想要什么"))
                            .font(Theme.font(10))
                            .foregroundColor(Theme.C.outline)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                MaterialIcon(name: "chevron_right", size: 24, color: Theme.C.outline)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.C.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                    .stroke(Theme.C.outlineVariant.opacity(0.2), lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.99))
    }
}

// MARK: - (7) Actions

struct CoupleActions: View {
    let space: CoupleSpace
    @ObservedObject var vm: CoupleViewModel

    private var sentToday: Bool { space.loveYou.me.sentToday }

    var body: some View {
        VStack(spacing: 0) {
            Button {
                Task { await vm.sendLoveYou() }
            } label: {
                Text(sentToday
                     ? L10n.t("Sent today — see you tomorrow")
                     : L10n.t("Send I love you"))
                    .font(Theme.font(14, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 14))
                    .foregroundColor(sentToday ? Theme.C.outline : .black)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .padding(.vertical, 20)                       // .btn-cta padding 1.25rem
                    .padding(.horizontal, 24)                     // 1.5rem
                    .frame(maxWidth: .infinity)
                    .background(sentToday ? Theme.C.container : Theme.C.neon)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.98))
            .disabled(sentToday || vm.loveYouInFlight)
            .opacity(sentToday || vm.loveYouInFlight ? 0.5 : 1)   // .btn-cta:disabled
            .shadow(color: Color.black.opacity(0.1), radius: 15, x: 0, y: 10)   // shadow-lg

            Button {
                Task { await vm.endRelationship() }
            } label: {
                Text(L10n.t("End Relationship"))
                    .font(Theme.font(10, weight: .medium))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                    .foregroundColor(Theme.C.neonPink)
                    .underline()
                    .padding(.vertical, 8)                        // py-2
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressOpacityButtonStyle(opacity: 0.7))
            .padding(.top, 12)                                    // mt-3
        }
    }
}

// MARK: - Small shared pieces

/// `bg-surface-container-lowest border border-outline-variant/20 rounded-[10px] p-3` column cell.
struct CoupleCell<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content()
        }
        .padding(CoupleLayout.cellPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(Theme.C.outlineVariant.opacity(0.2), lineWidth: 1)
        )
    }
}

/// `text-[9px] font-bold tracking-widest text-outline` column label.
struct CoupleMicroLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Theme.font(9, weight: .bold))
            .tracking(Theme.tracking(Theme.Tracking.widest, size: 9))
            .foregroundColor(Theme.C.outline)
            .lineLimit(1)
    }
}

/// `rounded-r-[10px]` / thumbnail badge corner helper (iOS 16 has no `UnevenRoundedRectangle`).
struct CoupleRoundedCorners: Shape {
    var radius: CGFloat
    var corners: UIRectCorner

    func path(in rect: CGRect) -> Path {
        Path(UIBezierPath(roundedRect: rect,
                          byRoundingCorners: corners,
                          cornerRadii: CGSize(width: radius, height: radius)).cgPath)
    }
}

// MARK: - Copy helpers

enum CoupleCopy {
    /// Anniversary card sub-line: `{n} day(s) to go` / `Today` / `{n} day(s) ago`.
    static func countdownLabel(daysUntil: Int) -> String {
        if daysUntil > 0 {
            return L10n.pick(daysUntil == 1 ? "1 day to go" : "\(daysUntil) days to go", "还有 \(daysUntil) 天")
        }
        if daysUntil == 0 { return L10n.pick("Today", "今天") }
        let n = -daysUntil
        return L10n.pick(n == 1 ? "1 day ago" : "\(n) days ago", "\(n) 天前")
    }

    /// "All anniversaries" row: `{n}d` / `Today` / `{n}d ago`.
    static func shortCountdownLabel(daysUntil: Int) -> String {
        if daysUntil > 0 { return L10n.pick("\(daysUntil)d", "\(daysUntil) 天") }
        if daysUntil == 0 { return L10n.pick("Today", "今天") }
        return L10n.pick("\(-daysUntil)d ago", "\(-daysUntil) 天前")
    }
}


// MARK: - iOS 16 helper (`italic(_ isActive:)` is iOS 17)

extension Text {
    /// Conditional italics that stays at the `Text` level, so it composes with `.font()`
    /// (the `View.italic()` environment modifier does not affect a Text with an explicit font).
    func coupleItalic(_ isActive: Bool) -> Text {
        isActive ? self.italic() : self
    }
}
