import SwiftUI

// MARK: - PreferenceSummaryBox (h5-match.md §1.3 item 4, design §9 item 4) — WP-06
//
// Read-only summary (`.mp-box`): fixed head (label "MATCH PREFERENCES" + Edit link / lock line)
// over a scrolling body (2×2 preference grid, "MATCH SETTINGS", read-only enhanced toggle + sub-line,
// extra-info box). Values come from `MatchStore.prefs[mode]` (placeholder "—" until the GET returns),
// enhanced state from `MatchStore.enhanced` / `lastEnhancedRound`; the view observes the store so
// `resyncSummary()` re-fills without any network call. Searching dims the body (opacity .55),
// swaps Edit for the lock line (tap → locked toast).

struct PreferenceSummaryBox: View {
    let mode: MatchMode
    let searching: Bool

    @ObservedObject private var store = MatchStore.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            head
            ScrollView(.vertical, showsIndicators: false) {
                bodyContent
            }
            .opacity(searching ? 0.55 : 1)
        }
        .clipped()
    }

    // MARK: Fixed head (`.mp-box-head`)

    private var head: some View {
        HStack(alignment: .center) {
            MPLabel(text: L10n.pick("MATCH PREFERENCES", "匹配偏好"))
            Spacer(minLength: 8)
            if searching {
                Button {
                    MatchStore.shared.showLockedToast()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: Theme.Icon.sf("lock"))
                            .font(.system(size: 11, weight: .light))
                            .frame(width: 13, height: 13)
                        // `.mp-lockline` is a plain inline-flex button in H5 with no nowrap, so the
                        // sentence wraps inside the row. At the plan pane's 315 pt content width it
                        // cannot share one line with the "MATCH PREFERENCES" label, and clamping it
                        // to one line truncated the explanation for every user in the pool.
                        Text(L10n.pick("Locked while matching · leave pool to edit", "匹配中锁定 · 离开后可修改"))
                            .font(Theme.font(10, weight: .bold))
                            .tracking(Theme.tracking(0.06, size: 10))
                            .fixedSize(horizontal: false, vertical: true)
                            .multilineTextAlignment(.trailing)
                    }
                    .foregroundColor(Theme.C.mpMuted)
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    AppActions.shared.openPreferencesSheet(mode)
                } label: {
                    VStack(spacing: 0) {
                        Text(L10n.pick("Edit", "编辑"))
                            .font(Theme.font(11, weight: .heavy))
                            .tracking(Theme.tracking(0.08, size: 11))
                            .foregroundColor(Theme.C.onSurface)
                        NeonSquiggle()
                            .stroke(Theme.C.neon, style: StrokeStyle(lineWidth: 2.6, lineCap: .round))
                            .frame(width: 26, height: 5)
                    }
                    .padding(.horizontal, 2)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleIcon))
            }
        }
    }

    // MARK: Scrolling body (`.mp-box-scroll`)

    private var bodyContent: some View {
        let p = store.prefs[mode]
        let f = PreferenceSummaryFormatter(mode: mode, prefs: p, enhanced: store.enhanced,
                                           searching: searching, lastEnhancedRound: store.lastEnhancedRound[mode] ?? false)
        _ = store.summaryVersion   // observe resync ticks
        return VStack(alignment: .leading, spacing: 0) {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 16, alignment: .topLeading),
                                GridItem(.flexible(), spacing: 16, alignment: .topLeading)],
                      alignment: .leading, spacing: 0) {
                cell(label: L10n.t("Target Gender"), value: f.gender)
                cell(label: L10n.t("Age Range"), value: f.age)
                if mode == .romantic {
                    cell(label: L10n.t("University Stage"), value: f.stage)
                } else {
                    // The plan box has its own zh wording (match.js:427) — deliberately different
                    // from the preference sheet's dictionary entries (兴趣优先级 / 学校筛选).
                    cell(label: L10n.pick("Interest Priority", "兴趣优先"), value: f.interests)
                }
                cell(label: L10n.pick("School Filter", "校区筛选"), value: f.school)
            }
            .padding(.top, 2)

            MPLabel(text: L10n.pick("MATCH SETTINGS", "匹配设置"))
                .padding(.top, 12)
                .padding(.bottom, 4)

            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(L10n.t("Enhanced Mode"))
                        .font(Theme.font(14, weight: .bold))
                        .foregroundColor(Theme.C.onSurface)
                    Text(f.enhancedSub)
                        .font(Theme.font(11))
                        .foregroundColor(Theme.C.mpMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                DisplayToggle(isOn: f.enhancedOn)
            }
            .padding(.vertical, 6)
            .overlay(alignment: .bottom) { Rectangle().fill(Theme.C.mpSep).frame(height: 1) }

            VStack(alignment: .leading, spacing: 0) {
                Text(L10n.t("Extra Info"))
                    .font(Theme.font(14, weight: .bold))
                    .foregroundColor(Theme.C.onSurface)
                Text(f.extraText)
                    .font(Theme.font(12))
                    .lineSpacing(12 * 0.6)
                    .foregroundColor(f.extraIsEmpty ? Theme.C.mpMuted : Theme.C.onSurface)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 10)
                    .padding(.horizontal, 12)
                    .background(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous).fill(Theme.C.containerLow))
                    .padding(.top, 6)
            }
            .padding(.vertical, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func cell(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(Theme.font(10))
                .tracking(Theme.tracking(0.06, size: 10))
                .foregroundColor(Theme.C.mpMuted)
                .lineLimit(1)
            Text(value)
                .font(Theme.font(14, weight: .heavy))
                .foregroundColor(Theme.C.onSurface)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 6)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.C.mpSep).frame(height: 1) }
    }
}

/// `.mp-label` — 10 / 800 / +0.26em `#9a9a9a`.
struct MPLabel: View {
    var text: String
    var body: some View {
        Text(text)
            .font(Theme.font(10, weight: .heavy))
            .tracking(Theme.tracking(Theme.Tracking.mpLabel, size: 10))
            .foregroundColor(Theme.C.mpLabel)
            .lineLimit(1)
    }
}

/// `.mp-editlink` underline: `M2 3 C7 1.6 13 3.8 18 2.6 C21 2 23.5 3 24 2.6` in a 26×5 box.
struct NeonSquiggle: Shape {
    func path(in rect: CGRect) -> Path {
        let sx = rect.width / 26
        let sy = rect.height / 5
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * sx, y: rect.minY + y * sy) }
        var path = Path()
        path.move(to: p(2, 3))
        path.addCurve(to: p(18, 2.6), control1: p(7, 1.6), control2: p(13, 3.8))
        path.addCurve(to: p(24, 2.6), control1: p(21, 2), control2: p(23.5, 3))
        return path
    }
}

// MARK: - Value formatting (`fillPlanBox`, h5-match §1.3)

struct PreferenceSummaryFormatter {
    let mode: MatchMode
    let prefs: MatchPreferencesRead?
    let enhanced: EnhancedPrefs
    let searching: Bool
    let lastEnhancedRound: Bool

    static let placeholder = "—"

    /// `male` → Male/男生; `female` → Female/女生; anything else → Any/不限.
    var gender: String {
        guard let p = prefs else { return Self.placeholder }
        switch (p.preferredGender ?? "").lowercased() {
        case "male": return L10n.pick("Male", "男生")
        case "female": return L10n.pick("Female", "女生")
        default: return L10n.pick("Any", "不限")
        }
    }

    /// both null → Any; else `${ageMin ?? 18} — ${ageMax ?? 30}`.
    var age: String {
        guard let p = prefs else { return Self.placeholder }
        if p.ageMin == nil && p.ageMax == nil { return L10n.pick("Any", "不限") }
        return "\(p.ageMin ?? 18) — \(p.ageMax ?? 30)"
    }

    /// Friend: first 3 `preferredInterests` joined " · "; empty → Not set.
    var interests: String {
        guard let p = prefs else { return Self.placeholder }
        let list = p.preferredInterests.prefix(3)
        return list.isEmpty ? L10n.pick("Not set", "未设置") : list.joined(separator: " · ")
    }

    /// Romantic: stages mapped Undergrad/Master/PhD joined " · "; empty → Any.
    var stage: String {
        guard let p = prefs else { return Self.placeholder }
        let names: [String] = p.stages.compactMap { s in
            switch s {
            case "undergraduate": return L10n.pick("Undergrad", "本科")
            case "master": return L10n.pick("Master", "硕士")
            case "doctor": return L10n.pick("PhD", "博士")
            default: return nil
            }
        }
        return names.isEmpty ? L10n.pick("Any", "不限") : names.joined(separator: " · ")
    }

    var school: String {
        guard let p = prefs else { return Self.placeholder }
        switch (p.requireSameUniversity, p.requireSameCity) {
        case (true, true): return L10n.pick("Same school · city", "仅同校 · 同城")
        case (true, false): return L10n.pick("Same school only", "仅同校")
        case (false, true): return L10n.pick("Same city", "同城")
        case (false, false): return L10n.pick("Any", "不限")
        }
    }

    var extraIsEmpty: Bool {
        (prefs?.extraMatchInfo ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var extraText: String {
        let t = (prefs?.extraMatchInfo ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? L10n.pick("Anything else to help matching…", "告诉算法更多关于你的事") : t
    }

    var cells: Int { mode == .friend ? min(max(enhanced.friendCells, 1), 5) : EnhancedPrefs.romanticCost }

    /// `.on` when `(searching && lastEnhancedRound) || enabled`.
    var enhancedOn: Bool { (searching && lastEnhancedRound) || enhanced.isEnabled(mode) }

    var enhancedSub: String {
        if searching && lastEnhancedRound {
            return L10n.isZh ? "本轮已生效 · \(cells) 能量" : "Active this round · \(cells) cells"
        }
        if mode == .friend {
            if enhanced.friendEnabled {
                return L10n.isZh ? "保底 \(cells) 位 · \(cells) 能量" : "Guarantee \(cells) · \(cells) cells"
            }
            return L10n.pick("1 cell per guaranteed friend", "每保底 1 位朋友 1 能量")
        }
        return L10n.pick("3 cells · refunded if no match", "3 能量 · 未匹配自动退回")
    }
}
