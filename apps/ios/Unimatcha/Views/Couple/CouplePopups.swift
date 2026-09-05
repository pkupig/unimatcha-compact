import SwiftUI

// MARK: - Couple Space popups (h5-couple.md §1.2 — P1…P11 + C1…C3) — WP-12
//
// H5 builds these with `couplePopup(innerHtml)`: a `z-[120]` backdrop (`bg-black/40` + 2 px blur,
// tap to dismiss) around a `max-w-sm` card (`bg-surface-container-lowest`, r10, `p-6`, shadow-2xl,
// `max-h-[85vh]` scrolling). On iOS they are `DialogCenter.custom(id, dismissOnBackdrop: true)`
// cards — NOT overlays — so they stack above `OverlayHost` exactly like the H5 body-appended nodes.
//
// C1 (`Mark as not done?`), C2 (`Delete this plan?`), C3 (`End this relationship?`) and the
// anniversary delete are `DialogCenter.confirm` cards; P3 (craving) and P9 (add plan) are
// `DialogCenter.prompt` cards. Both live in `CoupleViewModel`.

enum CouplePopups {

    // Popup ids (own package → presented directly, PLAN §A.2.6 note).
    static let coverId = "couple-cover"
    static let statusId = "couple-status"
    static let scheduleId = "couple-schedule"
    static let anniversaryAddId = "couple-anniversary-add"
    static let anniversaryDetailId = "couple-anniversary-detail"
    static let anniversaryAllId = "couple-anniversary-all"
    static let giftJarId = "couple-gift-jar"
    static let bucketDoneId = "couple-bucket-done"
    static let bucketRecordId = "couple-bucket-record"

    @MainActor
    static func presentCover(vm: CoupleViewModel, hasCover: Bool) {
        DialogCenter.shared.custom(coverId, dismissOnBackdrop: true) {
            CoupleCoverPopup(vm: vm, hasCover: hasCover)
        }
    }

    @MainActor
    static func presentStatus(vm: CoupleViewModel, current: String) {
        DialogCenter.shared.custom(statusId, dismissOnBackdrop: true) {
            CoupleStatusPopup(vm: vm, current: current)
        }
    }

    @MainActor
    static func presentAddSchedule(vm: CoupleViewModel) {
        DialogCenter.shared.custom(scheduleId, dismissOnBackdrop: true) {
            CoupleAddSchedulePopup(vm: vm)
        }
    }

    @MainActor
    static func presentAddAnniversary(vm: CoupleViewModel) {
        DialogCenter.shared.custom(anniversaryAddId, dismissOnBackdrop: true) {
            CoupleAddAnniversaryPopup(vm: vm)
        }
    }

    @MainActor
    static func presentAnniversaryDetail(vm: CoupleViewModel, anniversary: CoupleSpace.Anniversary) {
        DialogCenter.shared.custom(anniversaryDetailId, dismissOnBackdrop: true) {
            CoupleAnniversaryDetailPopup(vm: vm, anniversary: anniversary)
        }
    }

    @MainActor
    static func presentAllAnniversaries(vm: CoupleViewModel) {
        DialogCenter.shared.custom(anniversaryAllId, dismissOnBackdrop: true) {
            CoupleAllAnniversariesPopup(vm: vm)
        }
    }

    @MainActor
    static func presentGiftJar(vm: CoupleViewModel) {
        DialogCenter.shared.custom(giftJarId, dismissOnBackdrop: true) {
            CoupleGiftJarPopup(vm: vm)
        }
    }

    @MainActor
    static func presentCompleteBucket(vm: CoupleViewModel, id: String, text: String) {
        DialogCenter.shared.custom(bucketDoneId, dismissOnBackdrop: true) {
            CoupleCompleteBucketPopup(vm: vm, itemId: id, itemText: text)
        }
    }

    @MainActor
    static func presentBucketRecord(item: CoupleSpace.BucketItem) {
        DialogCenter.shared.custom(bucketRecordId, dismissOnBackdrop: true) {
            CoupleBucketRecordPopup(item: item)
        }
    }

    @MainActor
    static func dismiss(_ id: String) {
        DialogCenter.shared.dismissCustom(id)
    }
}

// MARK: - Shared chrome

/// `w-full max-w-sm bg-surface-container-lowest rounded-[10px] shadow-2xl p-6 max-h-[85vh] overflow-y-auto`
/// inside a `px-6` backdrop.
struct CouplePopupCard<Content: View>: View {
    @ViewBuilder var content: () -> Content

    /// Measured content height — a `ScrollView` is greedy, so the card is sized to its content and
    /// only starts scrolling past `max-h-[85vh]`.
    @State private var measured: CGFloat = 0

    private var cap: CGFloat { max(240, OverlayChrome.screenSize.height * 0.85) }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Theme.Space.page)                       // p-6
            .background(
                GeometryReader { geo in
                    Color.clear.preference(key: CouplePopupHeightKey.self, value: geo.size.height)
                }
            )
        }
        .onPreferenceChange(CouplePopupHeightKey.self) { height in
            if abs(height - measured) > 0.5 { measured = height }
        }
        .frame(maxWidth: OverlayChrome.cardMaxWidthSm)
        .frame(height: measured > 0 ? min(measured, cap) : nil)
        .opacity(measured > 0 ? 1 : 0)                       // one invisible measuring pass
        .background(Theme.C.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .shadow(color: Color.black.opacity(0.25), radius: 25, x: 0, y: 20)
        .padding(.horizontal, Theme.Space.page)              // backdrop px-6
    }
}

private struct CouplePopupHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// `font-headline font-extrabold text-lg` popup title.
struct CouplePopupTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Theme.font(18, weight: .heavy))
            .tracking(Theme.tracking(Theme.Tracking.tight, size: 18))
            .foregroundColor(Theme.C.onSurface)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// `text-[9px] font-bold tracking-widest text-outline` field label (`START`, `END`, `DATE`, …).
struct CouplePopupFieldLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Theme.font(9, weight: .bold))
            .tracking(Theme.tracking(Theme.Tracking.widest, size: 9))
            .foregroundColor(Theme.C.outline)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Popup button tiers: primary neon, secondary (outline-variant), outline (darker `border-outline`).
/// All are `py-3 rounded-[10px] text-xs font-bold tracking-widest`.
struct CouplePopupButton: View {
    enum Style { case primary, secondary, outline }

    let title: String
    var style: Style = .primary
    var fullWidth: Bool = true
    var horizontalPadding: CGFloat? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Theme.font(12, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 12))
                .foregroundColor(style == .primary ? .black : Theme.C.onSurface)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.vertical, 12)
                .padding(.horizontal, horizontalPadding ?? 0)
                .frame(maxWidth: fullWidth ? .infinity : nil)
                .background(style == .primary ? Theme.C.neon : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                .overlay(border)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.98))
    }

    @ViewBuilder
    private var border: some View {
        switch style {
        case .primary:
            EmptyView()
        case .secondary:
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(Theme.C.outlineVariant, lineWidth: 1)
        case .outline:
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(Theme.C.outline, lineWidth: 1)
        }
    }
}

/// Plain `Close` link (`w-full mt-3 text-[10px] text-outline tracking-widest`) — P6 only.
struct CouplePopupCloseLink: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(L10n.t("Close"))
                .font(Theme.font(10))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                .foregroundColor(Theme.C.outline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressOpacityButtonStyle(opacity: 0.7))
    }
}

/// `add_a_photo` + `Add photos` underlined link (11/700, tracking-widest).
struct CoupleAddPhotosLink: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                MaterialIcon(name: "add_a_photo", size: 16, color: Theme.C.onSurface)
                Text(L10n.pick("Add photos", "添加照片"))
                    .font(Theme.font(11, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 11))
                    .foregroundColor(Theme.C.onSurface)
                    .underline()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressOpacityButtonStyle(opacity: 0.7))
    }
}

/// Editable thumbnail strip (`renderThumbStrip`): 80×80 cells, `×` badge at (-6, -6).
/// Removals are LOCAL until the popup is saved (h5-couple gotcha 8).
struct CoupleThumbStrip: View {
    @Binding var urls: [String]

    var body: some View {
        if urls.isEmpty {
            // `#cp-*-preview` is an empty div that still carries `mb-3` in H5.
            Color.clear.frame(height: 0)
        } else {
            FlowLayout(spacing: 8) {
                ForEach(Array(urls.enumerated()), id: \.offset) { pair in
                    ZStack(alignment: .topTrailing) {
                        RemoteImage(url: pair.element, contentMode: .fill)
                            .frame(width: 80, height: 80)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                                    .stroke(Theme.C.outlineVariant.opacity(0.4), lineWidth: 1)
                            )
                        Button {
                            let index = pair.offset
                            guard urls.indices.contains(index) else { return }
                            urls.remove(at: index)
                        } label: {
                            ZStack {
                                Circle().fill(Color.black.opacity(0.7))
                                Image(systemName: Theme.Icon.sf("close"))
                                    .font(.system(size: 13 * 0.82, weight: .bold))
                                    .foregroundColor(.white)
                            }
                            .frame(width: 20, height: 20)
                            .contentShape(Circle())
                        }
                        .buttonStyle(PressScaleButtonStyle(scale: 0.9))
                        .offset(x: 6, y: -6)
                        .accessibilityLabel(L10n.t("Remove"))
                    }
                    .frame(width: 80, height: 80)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Read-only gallery (`renderThumbGallery`): 3 columns, gap 8, each cell 96 pt tall. Not zoomable.
struct CoupleThumbGallery: View {
    let urls: [String]

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
            ForEach(Array(urls.enumerated()), id: \.offset) { pair in
                RemoteImage(url: pair.element, contentMode: .fill)
                    .frame(height: 96)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                            .stroke(Theme.C.outlineVariant.opacity(0.4), lineWidth: 1)
                    )
            }
        }
    }
}

/// Soft-fill date (and optionally time) field with a "nothing chosen yet" state, so the H5
/// validation toasts (`Fill in activity and times`, `Title and date required`) stay reachable.
struct CoupleDateField: View {
    @Binding var value: Date?
    var includeTime: Bool = false
    var placeholder: String

    @State private var expanded = false

    private var display: String {
        guard let v = value else { return placeholder }
        return includeTime ? Formatters.coupleSchedule(v) : ISODate.day(v)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                if value == nil { value = CoupleDateField.defaultValue(includeTime: includeTime) }
                withAnimation(Theme.Motion.snap) { expanded.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Text(display)
                        .font(Theme.font(14))
                        .foregroundColor(value == nil ? Theme.C.outlineVariantText : Theme.C.onSurface)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    MaterialIcon(name: expanded ? "expand_less" : "calendar_month",
                                 size: 18, color: Theme.C.outline)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(Theme.C.containerLow)
                .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                .contentShape(Rectangle())
            }
            .buttonStyle(PressOpacityButtonStyle(opacity: 0.85))

            if expanded {
                DatePicker("",
                           selection: Binding(get: { value ?? CoupleDateField.defaultValue(includeTime: includeTime) },
                                              set: { value = $0 }),
                           displayedComponents: includeTime ? [.date, .hourAndMinute] : [.date])
                    .datePickerStyle(.wheel)
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
            }
        }
    }

    /// A fresh picker opens on the current hour (times) or today (dates).
    static func defaultValue(includeTime: Bool) -> Date {
        let now = Date()
        guard includeTime else { return Calendar.current.startOfDay(for: now) }
        var comps = Calendar.current.dateComponents([.year, .month, .day, .hour], from: now)
        comps.minute = 0
        return Calendar.current.date(from: comps) ?? now
    }
}

// MARK: - P1 · Couple cover

struct CoupleCoverPopup: View {
    @ObservedObject var vm: CoupleViewModel
    let hasCover: Bool

    @State private var pickerPresented = false

    var body: some View {
        CouplePopupCard {
            CouplePopupTitle(text: L10n.pick("Couple cover", "情侣封面"))
                .padding(.bottom, 4)
            Text(L10n.pick("Set your own cover for this space — your partner sets theirs separately.",
                           "为这个空间设置你的封面 —— 对方的封面由他们自己设置。"))
                .font(Theme.font(14))
                .lineSpacing(14 * 0.5)
                .foregroundColor(Theme.C.onSurfaceVariant)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 20)
            VStack(spacing: 12) {
                CouplePopupButton(title: L10n.pick("Choose photo", "选择照片"), style: .primary) {
                    pickerPresented = true
                }
                if hasCover {
                    CouplePopupButton(title: L10n.t("Remove"), style: .outline) {
                        CouplePopups.dismiss(CouplePopups.coverId)
                        Task { await vm.setCover(url: nil) }
                    }
                }
                CouplePopupButton(title: L10n.t("Cancel"), style: .secondary) {
                    CouplePopups.dismiss(CouplePopups.coverId)
                }
            }
        }
        .photoPicker(isPresented: $pickerPresented, limit: 1) { photos in
            guard let photo = photos.first else { return }
            Task {
                // Upload first; the popup stays open when it fails (H5 parity).
                guard let url = await vm.uploadCoverImage(photo) else { return }
                CouplePopups.dismiss(CouplePopups.coverId)
                await vm.setCover(url: url)
            }
        }
    }
}

// MARK: - P2 · Today's status

struct CoupleStatusPopup: View {
    @ObservedObject var vm: CoupleViewModel
    let current: String

    @State private var customText: String

    init(vm: CoupleViewModel, current: String) {
        self.vm = vm
        self.current = current
        // Pre-filled only when the current status is NOT a preset (gotcha 11).
        _customText = State(initialValue: CoupleStatus.isPreset(current) ? "" : current)
    }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 4)

    var body: some View {
        CouplePopupCard {
            CouplePopupTitle(text: L10n.t("Today's status"))
                .padding(.bottom, 16)

            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(CoupleStatus.presets, id: \.label) { preset in
                    presetChip(preset)
                }
            }
            .padding(.bottom, 20)

            CouplePopupFieldLabel(text: L10n.pick("OR WRITE YOUR OWN", "或自己写一句"))
                .padding(.bottom, 4)
            SoftField(text: $customText,
                      placeholder: L10n.pick("Custom status…", "自定义状态…"),
                      autocap: .sentences)

            HStack(spacing: 12) {
                CouplePopupButton(title: L10n.t("Cancel"), style: .secondary) {
                    CouplePopups.dismiss(CouplePopups.statusId)
                }
                CouplePopupButton(title: L10n.t("Save"), style: .primary) {
                    let value = customText.trimmingCharacters(in: .whitespacesAndNewlines)
                    CouplePopups.dismiss(CouplePopups.statusId)
                    Task { await vm.setStatus(value) }      // "" clears the status
                }
            }
        }
    }

    private func presetChip(_ preset: CoupleStatusPreset) -> some View {
        let selected = current == preset.label
        return Button {
            CouplePopups.dismiss(CouplePopups.statusId)      // saves instantly on tap
            Task { await vm.setStatus(preset.label) }
        } label: {
            VStack(spacing: 4) {
                MaterialIcon(name: preset.icon, size: 22, color: Theme.C.onSurface)
                Text(CoupleStatus.display(preset.label))
                    .font(Theme.font(10, weight: .bold))
                    .foregroundColor(Theme.C.onSurface)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity)
            .padding(8)
            .background(selected ? Theme.C.neonTint10 : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                    .stroke(selected ? Theme.C.neon : Theme.C.outlineVariant.opacity(0.3), lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.95))
    }
}

// MARK: - P4 · What are you up to? (add schedule)

struct CoupleAddSchedulePopup: View {
    @ObservedObject var vm: CoupleViewModel

    @State private var text = ""
    @State private var start: Date?
    @State private var end: Date?

    var body: some View {
        CouplePopupCard {
            CouplePopupTitle(text: L10n.pick("What are you up to?", "你在忙什么？"))
                .padding(.bottom, 16)

            SoftField(text: $text,
                      placeholder: L10n.pick("e.g. Library then gym", "例如：先去图书馆再去健身房"),
                      autocap: .sentences)
                .padding(.bottom, 16)

            CouplePopupFieldLabel(text: L10n.pick("START", "开始"))
                .padding(.bottom, 4)
            CoupleDateField(value: $start, includeTime: true,
                            placeholder: L10n.pick("Select start time", "选择开始时间"))
                .padding(.bottom, 16)

            CouplePopupFieldLabel(text: L10n.pick("END", "结束"))
                .padding(.bottom, 4)
            CoupleDateField(value: $end, includeTime: true,
                            placeholder: L10n.pick("Select end time", "选择结束时间"))
                .padding(.bottom, 24)

            HStack(spacing: 12) {
                CouplePopupButton(title: L10n.t("Cancel"), style: .secondary) {
                    CouplePopups.dismiss(CouplePopups.scheduleId)
                }
                CouplePopupButton(title: L10n.t("Add"), style: .primary) { submit() }
            }
        }
    }

    private func submit() {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, let startAt = start, let endAt = end else {
            // The popup stays open (H5 parity).
            ToastCenter.shared.show(L10n.pick("Fill in activity and times", "请填写内容和时间"))
            return
        }
        CouplePopups.dismiss(CouplePopups.scheduleId)
        Task { await vm.addSchedule(text: value, startAt: startAt, endAt: endAt) }
    }
}

// MARK: - P5 · New anniversary

struct CoupleAddAnniversaryPopup: View {
    @ObservedObject var vm: CoupleViewModel

    @State private var title = ""
    @State private var date: Date?

    var body: some View {
        CouplePopupCard {
            CouplePopupTitle(text: L10n.pick("New anniversary", "新的纪念日"))
                .padding(.bottom, 16)

            SoftField(text: $title,
                      placeholder: L10n.pick("e.g. First date", "例如：第一次约会"),
                      autocap: .sentences)
                .padding(.bottom, 16)

            CouplePopupFieldLabel(text: L10n.pick("DATE", "日期"))
                .padding(.bottom, 4)
            CoupleDateField(value: $date, placeholder: L10n.pick("Select a date", "选择日期"))
                .padding(.bottom, 24)

            HStack(spacing: 12) {
                CouplePopupButton(title: L10n.t("Cancel"), style: .secondary) {
                    CouplePopups.dismiss(CouplePopups.anniversaryAddId)
                }
                CouplePopupButton(title: L10n.t("Add"), style: .primary) { submit() }
            }
        }
    }

    private func submit() {
        let value = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, let day = date else {
            ToastCenter.shared.show(L10n.pick("Title and date required", "请填写标题和日期"))
            return
        }
        CouplePopups.dismiss(CouplePopups.anniversaryAddId)
        Task { await vm.addAnniversary(title: value, date: day) }
    }
}

// MARK: - P6 · Anniversary detail

struct CoupleAnniversaryDetailPopup: View {
    @ObservedObject var vm: CoupleViewModel
    let anniversary: CoupleSpace.Anniversary

    @State private var title: String
    @State private var date: Date?
    @State private var note: String
    @State private var images: [String]
    @State private var pickerPresented = false

    init(vm: CoupleViewModel, anniversary: CoupleSpace.Anniversary) {
        self.vm = vm
        self.anniversary = anniversary
        _title = State(initialValue: anniversary.title)
        _date = State(initialValue: anniversary.tileDate)
        _note = State(initialValue: anniversary.note)
        _images = State(initialValue: anniversary.images)
    }

    var body: some View {
        CouplePopupCard {
            CouplePopupTitle(text: L10n.pick("Anniversary", "纪念日"))
                .padding(.bottom, 16)

            SoftField(text: $title, placeholder: "", autocap: .sentences)
                .padding(.bottom, 16)

            CouplePopupFieldLabel(text: L10n.pick("DATE", "日期"))
                .padding(.bottom, 4)
            CoupleDateField(value: $date, placeholder: L10n.pick("Select a date", "选择日期"))
                .padding(.bottom, 16)

            SoftTextArea(text: $note,
                         placeholder: L10n.pick("Add a note (optional)", "添加备注（可选）"),
                         rows: 2)
                .padding(.bottom, 12)

            CoupleThumbStrip(urls: $images)
                .padding(.bottom, 12)

            CoupleAddPhotosLink { pickerPresented = true }
                .padding(.bottom, 20)

            HStack(spacing: 12) {
                CouplePopupButton(title: L10n.t("Delete"), style: .outline,
                                  fullWidth: false, horizontalPadding: 16) {
                    Task {
                        guard await vm.confirmDeleteAnniversary(id: anniversary.id) else { return }
                        CouplePopups.dismiss(CouplePopups.anniversaryDetailId)
                        await vm.deleteAnniversary(id: anniversary.id)
                    }
                }
                CouplePopupButton(title: L10n.t("Save"), style: .primary) { save() }
            }

            CouplePopupCloseLink {
                CouplePopups.dismiss(CouplePopups.anniversaryDetailId)
            }
            .padding(.top, 12)
        }
        .photoPicker(isPresented: $pickerPresented, limit: 0) { photos in
            Task {
                let urls = await vm.uploadImages(photos)
                guard !urls.isEmpty else { return }
                images.append(contentsOf: urls)
            }
        }
    }

    private func save() {
        let value = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, let day = date else {
            ToastCenter.shared.show(L10n.pick("Title and date required", "请填写标题和日期"))
            return
        }
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let payload = images
        CouplePopups.dismiss(CouplePopups.anniversaryDetailId)
        // Image removals only reach the server here (gotcha 8).
        Task { await vm.saveAnniversary(id: anniversary.id, title: value, date: day, note: trimmedNote, images: payload) }
    }
}

// MARK: - P7 · All anniversaries

struct CoupleAllAnniversariesPopup: View {
    @ObservedObject var vm: CoupleViewModel

    private var rows: [CoupleSpace.Anniversary] { vm.space?.anniversariesSortedByDate ?? [] }

    var body: some View {
        CouplePopupCard {
            CouplePopupTitle(text: L10n.pick("All anniversaries", "全部纪念日"))
                .padding(.bottom, 12)

            if rows.isEmpty {
                Text(L10n.pick("No anniversaries.", "还没有纪念日。"))
                    .font(Theme.font(14))
                    .italic()
                    .foregroundColor(Theme.C.outline)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { pair in
                        row(pair.element, isLast: pair.offset == rows.count - 1)
                    }
                }
            }

            CouplePopupButton(title: L10n.t("Close"), style: .secondary) {
                CouplePopups.dismiss(CouplePopups.anniversaryAllId)
            }
            .padding(.top, 20)
        }
    }

    private func row(_ anniversary: CoupleSpace.Anniversary, isLast: Bool) -> some View {
        Button {
            // H5 closes every `.cp-all-pop` first, then opens the detail popup.
            CouplePopups.dismiss(CouplePopups.anniversaryAllId)
            vm.openAnniversaryDetail(id: anniversary.id)
        } label: {
            VStack(spacing: 0) {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(anniversary.title)
                            .font(Theme.font(14, weight: .bold))
                            .foregroundColor(Theme.C.onSurface)
                            .lineLimit(1)
                            .truncationMode(.tail)
                        Text(anniversary.dayString)
                            .font(Theme.font(10))
                            .foregroundColor(Theme.C.outline)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text(CoupleCopy.shortCountdownLabel(daysUntil: anniversary.daysUntil))
                        .font(Theme.font(12, weight: .bold))
                        .foregroundColor(anniversary.isFuture ? Theme.C.onSurface : Theme.C.outline)
                        .lineLimit(1)
                }
                .padding(.vertical, 10)
                if !isLast {
                    Rectangle()
                        .fill(Theme.C.outlineVariantFill.opacity(0.15))
                        .frame(height: 1)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressOpacityButtonStyle(opacity: 0.7))
    }
}

// MARK: - P8 · Gift jar (read-only, partner's wishes only)

struct CoupleGiftJarPopup: View {
    @ObservedObject var vm: CoupleViewModel

    private var gifts: [String] { vm.space?.gifts.partner ?? [] }

    var body: some View {
        CouplePopupCard {
            CouplePopupTitle(text: L10n.t("Gift jar"))
                .padding(.bottom, 4)
            Text(vm.partnerName.uppercased() + L10n.pick(" WANTS", " 的心愿"))
                .font(Theme.font(10, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                .foregroundColor(Theme.C.outline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 12)

            if gifts.isEmpty {
                Text(L10n.pick("They haven't added any gifts yet.", "对方还没有添加心愿礼物。"))
                    .font(Theme.font(14))
                    .italic()
                    .foregroundColor(Theme.C.outline)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                FlowLayout(spacing: 8) {
                    ForEach(Array(gifts.enumerated()), id: \.offset) { pair in
                        Text(pair.element)
                            .font(Theme.font(14))
                            .foregroundColor(Theme.C.onSurface)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Theme.C.container)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.R.chip, style: .continuous))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            CouplePopupButton(title: L10n.t("Close"), style: .secondary) {
                CouplePopups.dismiss(CouplePopups.giftJarId)
            }
            .padding(.top, 24)
        }
    }
}

// MARK: - P10 · Mark done

struct CoupleCompleteBucketPopup: View {
    @ObservedObject var vm: CoupleViewModel
    let itemId: String
    let itemText: String

    @State private var note = ""
    @State private var images: [String] = []
    @State private var pickerPresented = false

    var body: some View {
        CouplePopupCard {
            CouplePopupTitle(text: L10n.pick("Mark done", "标记完成"))
                .padding(.bottom, 4)
            Text(itemText)
                .font(Theme.font(14))
                .foregroundColor(Theme.C.onSurfaceVariant)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 16)

            SoftTextArea(text: $note,
                         placeholder: L10n.pick("Add a note (optional)", "添加备注（可选）"),
                         rows: 2)

            CoupleThumbStrip(urls: $images)
                .padding(.bottom, 12)

            CoupleAddPhotosLink { pickerPresented = true }
                .padding(.bottom, 20)

            HStack(spacing: 12) {
                CouplePopupButton(title: L10n.t("Cancel"), style: .secondary) {
                    CouplePopups.dismiss(CouplePopups.bucketDoneId)
                }
                CouplePopupButton(title: L10n.t("Done"), style: .primary) {
                    let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
                    let payload = images
                    CouplePopups.dismiss(CouplePopups.bucketDoneId)
                    Task { await vm.completeBucket(id: itemId, note: trimmed, images: payload) }
                }
            }
        }
        .photoPicker(isPresented: $pickerPresented, limit: 0) { photos in
            Task {
                let urls = await vm.uploadImages(photos)
                guard !urls.isEmpty else { return }
                images.append(contentsOf: urls)
            }
        }
    }
}

// MARK: - P11 · Completed record (read-only)

struct CoupleBucketRecordPopup: View {
    let item: CoupleSpace.BucketItem

    var body: some View {
        CouplePopupCard {
            CouplePopupTitle(text: item.text)
                .padding(.bottom, 4)
            Text(L10n.pick("COMPLETED", "已完成"))
                .font(Theme.font(10, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                .foregroundColor(Theme.C.outline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 12)

            if !item.doneImages.isEmpty {
                CoupleThumbGallery(urls: item.doneImages)
                    .padding(.bottom, 12)
            }

            if item.doneNote.isEmpty {
                Text(L10n.pick("No note added.", "没有添加备注。"))
                    .font(Theme.font(14))
                    .italic()
                    .foregroundColor(Theme.C.outline)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text(item.doneNote)
                    .font(Theme.font(14))
                    .lineSpacing(14 * 0.625)
                    .foregroundColor(Theme.C.onSurface)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            CouplePopupButton(title: L10n.t("Close"), style: .secondary) {
                CouplePopups.dismiss(CouplePopups.bucketRecordId)
            }
            .padding(.top, 24)
        }
    }
}
