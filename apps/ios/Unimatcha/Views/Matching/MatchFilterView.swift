import SwiftUI

/// Match-preference editor. Loads via `MatchingService.getPreferences(mode:)`
/// and saves via `setPreferences(_:)`. Edits the core `MatchPreferences` fields:
/// requireSameCity, preferredGender, ageMin/ageMax, matchBasis, extraMatchInfo.
struct MatchFilterView: View {
    let mode: MatchMode
    @Environment(\.dismiss) private var dismiss

    @State private var prefs = MatchPreferences()
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let genders: [(String, String)] = [
        ("any", "不限"), ("male", "男生"), ("female", "女生")
    ]
    private let bases: [(String, String)] = [
        ("both", "综合"), ("questionnaire", "问卷"), ("profile", "资料")
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                if isLoading {
                    ProgressView().tint(Theme.accent).padding(.top, 100)
                } else {
                    VStack(spacing: 16) {
                        basicSection
                        ageSection
                        basisSection
                        extraSection

                        if let err = errorMessage {
                            Text(err)
                                .font(.footnote)
                                .foregroundColor(Theme.danger)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Text("筛选条件会影响匹配候选人范围，保存后在下次匹配生效。")
                            .font(.caption)
                            .foregroundColor(Theme.textMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(16)
                }
            }
            .themedScreen()
            .navigationTitle("匹配偏好")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("取消") { dismiss() }.tint(Theme.textSecondary)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving { ProgressView().tint(Theme.accent) }
                        else { Text("保存").fontWeight(.semibold) }
                    }
                    .tint(Theme.accent)
                    .disabled(isSaving)
                }
            }
            .task { await load() }
        }
        .tint(Theme.accent)
    }

    // MARK: - Basic
    private var basicSection: some View {
        sectionCard(title: "基本") {
            Toggle(isOn: Binding(
                get: { prefs.requireSameCity ?? false },
                set: { prefs.requireSameCity = $0 }
            )) {
                Text("必须同城").foregroundColor(Theme.textPrimary)
            }
            .tint(Theme.accent)

            Divider().overlay(Theme.outline)

            VStack(alignment: .leading, spacing: 10) {
                Text("希望匹配的性别")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
                Picker("性别", selection: Binding(
                    get: { prefs.preferredGender ?? "any" },
                    set: { prefs.preferredGender = $0 }
                )) {
                    ForEach(genders, id: \.0) { Text($0.1).tag($0.0) }
                }
                .pickerStyle(.segmented)
            }
        }
    }

    // MARK: - Age
    private var ageSection: some View {
        sectionCard(title: "年龄范围") {
            HStack {
                Text("最小")
                    .foregroundColor(Theme.textSecondary)
                    .frame(width: 44, alignment: .leading)
                Spacer()
                Text("\(prefs.ageMin ?? 18) 岁")
                    .foregroundColor(Theme.accent)
                    .font(.subheadline.bold())
                Stepper("", value: Binding(
                    get: { prefs.ageMin ?? 18 },
                    set: { newVal in
                        prefs.ageMin = newVal
                        if let hi = prefs.ageMax, newVal > hi { prefs.ageMax = newVal }
                    }
                ), in: 16...60)
                .labelsHidden()
                .tint(Theme.accent)
            }

            Divider().overlay(Theme.outline)

            HStack {
                Text("最大")
                    .foregroundColor(Theme.textSecondary)
                    .frame(width: 44, alignment: .leading)
                Spacer()
                Text("\(prefs.ageMax ?? 30) 岁")
                    .foregroundColor(Theme.accent)
                    .font(.subheadline.bold())
                Stepper("", value: Binding(
                    get: { prefs.ageMax ?? 30 },
                    set: { newVal in
                        prefs.ageMax = newVal
                        if let lo = prefs.ageMin, newVal < lo { prefs.ageMin = newVal }
                    }
                ), in: 16...60)
                .labelsHidden()
                .tint(Theme.accent)
            }
        }
    }

    // MARK: - Match basis
    private var basisSection: some View {
        sectionCard(title: "匹配依据") {
            Picker("依据", selection: Binding(
                get: { prefs.matchBasis ?? "both" },
                set: { prefs.matchBasis = $0 }
            )) {
                ForEach(bases, id: \.0) { Text($0.1).tag($0.0) }
            }
            .pickerStyle(.segmented)

            Text("综合会同时参考问卷与资料，通常匹配更准确。")
                .font(.caption)
                .foregroundColor(Theme.textMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Extra info
    private var extraSection: some View {
        sectionCard(title: mode == .friend ? "想认识的朋友" : "补充说明") {
            ZStack(alignment: .topLeading) {
                if (prefs.extraMatchInfo ?? "").isEmpty {
                    Text(mode == .friend
                         ? "描述你想认识什么样的朋友…"
                         : "补充你的匹配期望，帮助算法更懂你…")
                        .font(.subheadline)
                        .foregroundColor(Theme.textMuted)
                        .padding(.top, 8)
                        .padding(.leading, 4)
                }
                TextEditor(text: Binding(
                    get: { prefs.extraMatchInfo ?? "" },
                    set: { prefs.extraMatchInfo = $0 }
                ))
                .frame(minHeight: 96)
                .foregroundColor(Theme.textPrimary)
                .scrollContentBackground(.hidden)
                .background(Color.clear)
            }
        }
    }

    // MARK: - Section container
    private func sectionCard<Content: View>(title: String,
                                            @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(Theme.textSecondary)
            VStack(spacing: 12) { content() }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
        }
    }

    // MARK: - Data
    private func load() async {
        isLoading = true
        errorMessage = nil
        do { prefs = try await MatchingService.getPreferences(mode: mode) }
        catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
        if prefs.mode == nil { prefs.mode = mode.rawValue }
        isLoading = false
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        prefs.mode = mode.rawValue
        do {
            _ = try await MatchingService.setPreferences(prefs)
            isSaving = false
            dismiss()
        } catch let e as APIError {
            errorMessage = e.errorDescription
            isSaving = false
        } catch {
            errorMessage = error.localizedDescription
            isSaving = false
        }
    }
}
