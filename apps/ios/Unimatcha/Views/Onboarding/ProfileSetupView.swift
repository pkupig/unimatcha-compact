import SwiftUI

/// First-run profile form. Driven by the shared `ProfileViewModel` injected by
/// `OnboardingCoordinator`. On save: `profileVM.saveProfile()` → `authVM.refresh()`
/// → `onComplete()`. City / university / major use `MetadataViewModel.shared`.
struct ProfileSetupView: View {
    @EnvironmentObject var profileVM: ProfileViewModel
    @EnvironmentObject var authVM: AuthViewModel

    /// Called once the profile has been persisted and auth state refreshed.
    let onComplete: () -> Void

    @StateObject private var meta = MetadataViewModel.shared

    /// Which metadata picker is open (nil = none).
    private enum PickerField: Identifiable {
        case city, university, major
        var id: Int { hashValue }
    }
    @State private var activePicker: PickerField?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header

                    basicSection
                    academicSection
                    genderSection
                    interestsSection
                    bioSection

                    if let err = profileVM.errorMessage {
                        Text(err)
                            .font(.caption)
                            .foregroundColor(Theme.danger)
                    }

                    saveButton
                }
                .padding(20)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Theme.bg, for: .navigationBar)
            .themedScreen()
            .task { await meta.loadAllIfNeeded() }
            .sheet(item: $activePicker) { field in
                metadataPicker(for: field)
            }
        }
        .tint(Theme.accent)
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("完善你的资料")
                .font(.system(size: 26, weight: .bold))
                .foregroundColor(Theme.textPrimary)
            Text("帮助我们为你找到最契合的人")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
        }
        .padding(.bottom, 2)
    }

    private var basicSection: some View {
        FormSection(title: "基本信息") {
            OnboardTextField(label: "昵称", text: $profileVM.nickname, placeholder: "你的昵称")

            PickerRow(label: "学校",
                      value: profileVM.school,
                      placeholder: "选择就读学校") {
                activePicker = .university
            }

            PickerRow(label: "城市",
                      value: profileVM.city,
                      placeholder: "选择所在城市") {
                activePicker = .city
            }
        }
    }

    private var academicSection: some View {
        FormSection(title: "学业与年龄") {
            VStack(alignment: .leading, spacing: 8) {
                fieldLabel("专业（可选）")
                PickerRow(label: nil,
                          value: profileVM.major,
                          placeholder: "选择专业") {
                    activePicker = .major
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                fieldLabel("年级")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(profileVM.grades, id: \.self) { g in
                            NeonTag(title: g, isSelected: profileVM.grade == g) {
                                profileVM.grade = g
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    fieldLabel("年龄")
                    Spacer()
                    Text("\(profileVM.age) 岁")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Theme.accent)
                }
                Slider(
                    value: Binding(
                        get: { Double(profileVM.age) },
                        set: { profileVM.age = Int($0) }
                    ),
                    in: 16...30, step: 1
                )
                .tint(Theme.accent)
            }
        }
    }

    private var genderSection: some View {
        FormSection(title: "性别与偏好") {
            VStack(alignment: .leading, spacing: 10) {
                fieldLabel("我的性别")
                FlexTagRow(items: profileVM.genderOptions.map { $0.1 },
                           values: profileVM.genderOptions.map { $0.0 },
                           selected: profileVM.gender) { val in
                    profileVM.gender = val
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                fieldLabel("期望匹配")
                FlexTagRow(items: profileVM.genderPrefOptions.map { $0.1 },
                           values: profileVM.genderPrefOptions.map { $0.0 },
                           selected: profileVM.genderPref) { val in
                    profileVM.genderPref = val
                }
            }
        }
    }

    private var interestsSection: some View {
        FormSection(title: "兴趣爱好（多选）") {
            TagFlowGrid(tags: profileVM.presetTags, selected: profileVM.interests) { tag in
                profileVM.toggleInterest(tag)
            }
        }
    }

    private var bioSection: some View {
        FormSection(title: "个人简介（可选）") {
            ZStack(alignment: .topLeading) {
                if profileVM.bio.isEmpty {
                    Text("介绍一下你自己吧…")
                        .font(.system(size: 15))
                        .foregroundColor(Theme.textMuted)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 14)
                }
                TextEditor(text: $profileVM.bio)
                    .font(.system(size: 15))
                    .foregroundColor(Theme.textPrimary)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 96)
                    .padding(6)
            }
            .background(Theme.surfaceHi)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.radiusSm).stroke(Theme.outline, lineWidth: 1))
        }
    }

    private var saveButton: some View {
        Button {
            Task { await saveAndContinue() }
        } label: {
            HStack(spacing: 8) {
                if profileVM.isLoading {
                    ProgressView().tint(Theme.onAccent).scaleEffect(0.85)
                }
                Text("保存并继续")
            }
        }
        .buttonStyle(NeonButtonStyle(enabled: !profileVM.isLoading))
        .disabled(profileVM.isLoading)
        .padding(.top, 4)
    }

    // MARK: - Helpers

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.subheadline.weight(.medium))
            .foregroundColor(Theme.textPrimary)
    }

    @ViewBuilder
    private func metadataPicker(for field: PickerField) -> some View {
        switch field {
        case .city:
            MetadataPickerSheet(title: "选择城市",
                                options: meta.cities,
                                selected: profileVM.city,
                                allowFreeText: true) { value in
                profileVM.city = value
            }
        case .university:
            MetadataPickerSheet(title: "选择学校",
                                options: meta.universities,
                                selected: profileVM.school,
                                allowFreeText: true) { value in
                profileVM.school = value
            }
        case .major:
            MetadataPickerSheet(title: "选择专业",
                                options: meta.majors,
                                selected: profileVM.major,
                                allowFreeText: true) { value in
                profileVM.major = value
            }
        }
    }

    private func saveAndContinue() async {
        await profileVM.saveProfile()
        guard profileVM.isSaved else { return }
        await authVM.refresh()
        onComplete()
    }
}

// MARK: - Form building blocks (themed)

struct FormSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Theme.textSecondary)
                .textCase(.uppercase)
                .tracking(0.6)
            content()
        }
    }
}

/// Labeled text input on a raised surface.
struct OnboardTextField: View {
    let label: String
    @Binding var text: String
    let placeholder: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.subheadline.weight(.medium))
                .foregroundColor(Theme.textPrimary)
            TextField("", text: $text, prompt: Text(placeholder).foregroundColor(Theme.textMuted))
                .font(.system(size: 15))
                .foregroundColor(Theme.textPrimary)
                .padding(14)
                .background(Theme.surfaceHi)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.radiusSm).stroke(Theme.outline, lineWidth: 1))
        }
    }
}

/// Tappable row that opens a picker. `label` is optional (omit for a bare row).
struct PickerRow: View {
    let label: String?
    let value: String
    let placeholder: String
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let label {
                Text(label)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(Theme.textPrimary)
            }
            Button(action: action) {
                HStack {
                    Text(value.isEmpty ? placeholder : value)
                        .font(.system(size: 15))
                        .foregroundColor(value.isEmpty ? Theme.textMuted : Theme.textPrimary)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Theme.textSecondary)
                }
                .padding(14)
                .background(Theme.surfaceHi)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.radiusSm).stroke(Theme.outline, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }
}

/// A neon pill toggle chip.
struct NeonTag: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: .medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .foregroundColor(isSelected ? Theme.onAccent : Theme.textPrimary)
                .background(
                    Group {
                        if isSelected {
                            AnyView(Theme.accentGradient)
                        } else {
                            AnyView(Theme.surfaceHi)
                        }
                    }
                )
                .clipShape(Capsule())
                .overlay(
                    Capsule().stroke(isSelected ? Color.clear : Theme.outline, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}

/// Value-backed single-select row of chips (label shown, value emitted).
struct FlexTagRow: View {
    let items: [String]
    let values: [String]
    let selected: String
    let onSelect: (String) -> Void

    var body: some View {
        HStack(spacing: 8) {
            ForEach(Array(zip(values, items)), id: \.0) { (val, label) in
                NeonTag(title: label, isSelected: selected == val) {
                    onSelect(val)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

/// Wrapping grid of selectable interest chips (fixed 3-per-row for stable layout).
struct TagFlowGrid: View {
    let tags: [String]
    let selected: [String]
    let onToggle: (String) -> Void

    private let columns = [GridItem(.adaptive(minimum: 90), spacing: 8, alignment: .leading)]

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
            ForEach(tags, id: \.self) { tag in
                NeonTag(title: tag, isSelected: selected.contains(tag)) {
                    onToggle(tag)
                }
            }
        }
    }
}

// MARK: - Metadata picker sheet

/// Searchable single-select sheet backed by a `MetadataViewModel` list.
/// `allowFreeText` lets the user commit whatever they typed if it isn't listed.
struct MetadataPickerSheet: View {
    let title: String
    let options: [String]
    let selected: String
    let allowFreeText: Bool
    let onPick: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var filtered: [String] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return options }
        return options.filter { $0.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchBar

                if options.isEmpty {
                    emptyState
                } else {
                    List {
                        if allowFreeText,
                           !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                           !options.contains(where: { $0 == query }) {
                            Button {
                                commit(query.trimmingCharacters(in: .whitespacesAndNewlines))
                            } label: {
                                Label("使用「\(query)」", systemImage: "plus.circle")
                                    .foregroundColor(Theme.accent)
                            }
                            .listRowBackground(Theme.surface)
                        }

                        ForEach(filtered, id: \.self) { opt in
                            Button {
                                commit(opt)
                            } label: {
                                HStack {
                                    Text(opt).foregroundColor(Theme.textPrimary)
                                    Spacer()
                                    if opt == selected {
                                        Image(systemName: "checkmark")
                                            .foregroundColor(Theme.accent)
                                    }
                                }
                            }
                            .listRowBackground(Theme.surface)
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Theme.bg.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Theme.bg, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("取消") { dismiss() }
                        .foregroundColor(Theme.textSecondary)
                }
            }
        }
        .tint(Theme.accent)
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(Theme.textMuted)
            TextField("", text: $query,
                      prompt: Text("搜索").foregroundColor(Theme.textMuted))
                .foregroundColor(Theme.textPrimary)
                .autocorrectionDisabled()
        }
        .padding(12)
        .background(Theme.surfaceHi)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            if allowFreeText {
                Text("暂无可选项，直接输入即可")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
                if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button("使用「\(query)」") {
                        commit(query.trimmingCharacters(in: .whitespacesAndNewlines))
                    }
                    .buttonStyle(GhostButtonStyle())
                    .padding(.horizontal, 40)
                }
            } else {
                Text("暂无可选项")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func commit(_ value: String) {
        onPick(value)
        dismiss()
    }
}
