import SwiftUI

// MARK: - Preference sheet `filter-overlay` (h5-match.md §1.12, §2.10) — WP-17
//
// Bottom sheet reached from the summary box "Edit" link (`AppActions.openPreferencesSheet`).
// Header = grab handle + X / centred "Edit" / neon "Save" pill and the drag zone
// (>110 pt closes, `BottomSheetContainer`); body = `px-6 py-4` column, groups 20 pt apart,
// sections inside a group 28 pt apart:
//
//   romantic  Target Gender (pill segmented) · University Stage (multi-select chips)
//   friend    Target Gender · Interest Priority (≤3 chips from the profile)
//   shared    Age Range (18–30 + "Any age") · School Filter (2 switches)
//   settings  Enhanced Mode (+ friend cells 1–5) · Extra Info (500) · Retake Questionnaire
//
// EVERY close path (X, backdrop, drag-down, Save, the locked bail-out) runs the overlay's
// `onDismiss` → `MatchStore.resyncSummary()`, because the enhanced toggle is client state
// the summary box would otherwise show stale until the next 30 s poll (gotcha 11).

struct PreferencesSheet: View {
    static let overlayId = "filter-overlay"

    let mode: MatchMode

    @StateObject private var vm: PreferencesViewModel
    @ObservedObject private var store = MatchStore.shared

    init(mode: MatchMode) {
        self.mode = mode
        _vm = StateObject(wrappedValue: PreferencesViewModel(mode: mode))
    }

    /// WP-16 implements `AppActions.openPreferencesSheet(mode)` with this.
    /// `.id(mode)` forces a fresh view (and view-model) when the sheet is re-opened for the
    /// other mode — `OverlayRouter.present` replaces the layer in place and would otherwise
    /// keep the previous `@StateObject`.
    @MainActor
    static func present(mode: MatchMode) {
        OverlayRouter.shared.present(AppOverlay(
            id: overlayId,
            style: .bottomSheet,
            swipeBack: false,
            onDismiss: { MatchStore.shared.resyncSummary() }
        ) {
            PreferencesSheet(mode: mode).id(mode)
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    var body: some View {
        BottomSheetContainer(header: { header }) {
            VStack(spacing: 0) {
                if vm.readOnly { PrefReadOnlyNotice() }
                ScrollView(.vertical, showsIndicators: false) {
                    sections
                        .padding(.horizontal, Theme.Space.page)
                        .padding(.vertical, 16)
                }
                .scrollDismissesKeyboard(.interactively)
            }
        }
        .onAppear { vm.onOpen() }
    }

    // MARK: Header (X · centred title · Save pill)

    private var header: some View {
        ZStack {
            Text(L10n.pick("Edit", "编辑"))
                .font(Theme.font(16, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.tighter, size: 16))
                .foregroundColor(Theme.C.primary)
                .lineLimit(1)
            HStack(spacing: 8) {
                // The X is the one control `applyPanelReadonly` never disables.
                IconButton(material: "close",
                           size: 28,
                           iconSize: 24,
                           tint: Theme.C.stone400,
                           pressScale: Theme.Motion.pressScaleIcon,
                           accessibilityLabel: L10n.t("Close")) {
                    vm.close()
                }
                Spacer(minLength: 0)
                CTAButton(title: L10n.t("Save"),
                          style: .neonPill,
                          busy: vm.isSaving,
                          busyTitle: L10n.t("Saving…"),
                          disabled: vm.readOnly) {
                    Task { await vm.save() }
                }
            }
        }
    }

    // MARK: Body

    private var sections: some View {
        VStack(alignment: .leading, spacing: 20) {
            if mode == .romantic {
                romanticGroup
            } else {
                friendGroup
            }
            sharedGroup
            settingsGroup
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // `applyPanelReadonly`: everything below the header is disabled and dimmed while
        // the pool is active; the X above stays live.
        .disabled(vm.readOnly)
        .opacity(vm.readOnly ? 0.5 : 1)
    }

    // MARK: Romantic section

    private var romanticGroup: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 0) {
                PrefSectionHeading(text: L10n.t("Target Gender"))
                genderSegmented
            }
            VStack(alignment: .leading, spacing: 0) {
                PrefSectionHeading(text: L10n.t("University Stage"))
                FlowLayout(spacing: 8) {
                    ForEach(MatchPreferencesWrite.stageWhitelist, id: \.self) { value in
                        Chip(text: stageLabel(value),
                             selected: vm.stages.contains(value),
                             style: .stage,
                             onTap: { vm.toggleStage(value) })
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func stageLabel(_ value: String) -> String {
        switch value {
        case "undergraduate": return L10n.t("Undergraduate")
        case "master": return L10n.t("Master")
        default: return L10n.t("PhD")
        }
    }

    // MARK: Friend section

    private var friendGroup: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 0) {
                PrefSectionHeading(text: L10n.t("Target Gender"), bottomPadding: 24)
                genderSegmented
            }
            VStack(alignment: .leading, spacing: 0) {
                PrefSectionHeading(text: L10n.t("Interest Priority"))
                if vm.interestOptions.isEmpty {
                    Text(L10n.pick("Add interests to your profile first, then pick up to 3 priorities here.",
                                   "请先在个人资料里添加兴趣，然后在这里最多选择 3 个优先项。"))
                        .font(Theme.font(12))
                        .lineSpacing(12 * 0.625)
                        .foregroundColor(Theme.C.stone400)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    FlowLayout(spacing: 8) {
                        ForEach(vm.interestOptions, id: \.self) { value in
                            // User content — never translated.
                            Chip(text: value,
                                 selected: vm.friendInterests.contains(value),
                                 style: .stage,
                                 onTap: { vm.toggleInterest(value) })
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    // MARK: Shared controls (single instance, back-filled per mode)

    private var sharedGroup: some View {
        VStack(alignment: .leading, spacing: 28) {
            PrefAgeRangeSection(ageAny: $vm.ageAny,
                                ageMin: $vm.ageMin,
                                ageMax: $vm.ageMax,
                                disabled: vm.readOnly,
                                display: vm.ageDisplay)
            VStack(alignment: .leading, spacing: 0) {
                PrefSectionHeading(text: L10n.t("School Filter"), bottomPadding: 24)
                VStack(spacing: 8) {
                    PrefSwitchRow(label: L10n.t("Only Same School"), isOn: $vm.sameSchool, disabled: vm.readOnly)
                    PrefSwitchRow(label: L10n.t("Same City"), isOn: $vm.sameCity, disabled: vm.readOnly)
                }
            }
        }
    }

    // MARK: Match settings (former drawer, merged into this card)

    private var settingsGroup: some View {
        VStack(alignment: .leading, spacing: 28) {
            enhancedSection
            extraInfoSection
            PrefRetakeRow(disabled: vm.readOnly) { vm.retakeQuestionnaire() }
                .padding(.bottom, 8)
        }
    }

    private var enhancedSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 12) {
                SectionLabel(text: L10n.t("Enhanced Mode"))
                Text(L10n.t("Applies the next time you join the pool"))
                    .font(Theme.font(11))
                    .foregroundColor(Theme.C.stone400)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if mode == .romantic {
                PrefEnhanceRow(title: L10n.t("Romantic Enhance"),
                               subtitle: L10n.t("3 cells · refunded if no match"),
                               isOn: store.enhanced.romanticEnabled,
                               disabled: vm.enhanceBusy || vm.readOnly) {
                    Task { await vm.toggleEnhance() }
                }
                .padding(.bottom, 16)
                .overlay(alignment: .bottom) { Rectangle().fill(Theme.C.hairline).frame(height: 1) }
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    PrefEnhanceRow(title: L10n.t("Friend Enhance"),
                                   subtitle: L10n.t("1 cell per guaranteed match · refunded if short"),
                                   isOn: store.enhanced.friendEnabled,
                                   disabled: vm.enhanceBusy || vm.readOnly) {
                        Task { await vm.toggleEnhance() }
                    }
                    if store.enhanced.friendEnabled {
                        PrefFriendCellsBlock(cells: vm.friendCells, disabled: vm.readOnly) { n in
                            vm.setFriendCells(n)
                        }
                    }
                }
                .padding(.top, 4)
            }
        }
    }

    private var extraInfoSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionLabel(text: L10n.t("Extra Info"))
            SoftTextArea(text: $vm.extraInfo,
                         placeholder: L10n.placeholder("Anything else to help matching..."),
                         rows: 4,
                         size: 14,
                         maxLength: MatchPreferencesWrite.extraInfoMax,
                         disabled: vm.readOnly,
                         style: .outlinedBlack)
        }
    }

    // MARK: Shared gender control

    private var genderSegmented: some View {
        PillSegmented(items: [L10n.t("Male"), L10n.t("Female"), L10n.t("All")],
                      selection: Binding(get: { vm.genderIndex },
                                         set: { vm.selectGender(index: $0) }),
                      style: .sheet,
                      disabled: vm.readOnly)
    }
}
