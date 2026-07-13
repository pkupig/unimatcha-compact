import SwiftUI

/// 资料编辑页 —— 绑定 ProfileViewModel 的 @Published 字段，保存调用 saveProfile()。
/// 使用 MetadataViewModel.shared 提供城市 / 学校 / 专业 / MBTI / 国籍选项。
struct ProfileEditView: View {
    @EnvironmentObject var profileVM: ProfileViewModel
    @ObservedObject var metadataVM = MetadataViewModel.shared
    @Environment(\.dismiss) var dismiss

    @State private var citySearch = ""
    @State private var schoolSearch = ""
    @State private var majorSearch = ""

    private var filteredCities: [String] {
        citySearch.isEmpty ? metadataVM.cities
            : metadataVM.cities.filter { $0.localizedCaseInsensitiveContains(citySearch) }
    }
    private var filteredSchools: [String] {
        schoolSearch.isEmpty ? metadataVM.universities
            : metadataVM.universities.filter { $0.localizedCaseInsensitiveContains(schoolSearch) }
    }
    private var filteredMajors: [String] {
        majorSearch.isEmpty ? metadataVM.majors
            : metadataVM.majors.filter { $0.localizedCaseInsensitiveContains(majorSearch) }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                avatarSection
                basicSection
                personalitySection
                signatureSection
                tagsSection
                bioSection
                socialSection

                if let error = metadataVM.errorMessage {
                    Text("选项加载失败：\(error)")
                        .font(.system(size: 12)).foregroundColor(Theme.warning)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if let error = profileVM.errorMessage {
                    Text(error)
                        .font(.system(size: 12)).foregroundColor(Theme.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                saveButton
                Spacer().frame(height: 24)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
        .themedScreen()
        .navigationTitle("编辑资料")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task { await metadataVM.loadAllIfNeeded() }
    }

    // MARK: - Sections

    private var avatarSection: some View {
        Card {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(Theme.surfaceHi).frame(width: 64, height: 64)
                    if let url = URL(string: profileVM.avatarUrl), !profileVM.avatarUrl.isEmpty {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let img): img.resizable().scaledToFill()
                            default: avatarInitial
                            }
                        }
                        .frame(width: 64, height: 64)
                        .clipShape(Circle())
                    } else {
                        avatarInitial
                    }
                }
                .overlay(Circle().stroke(Theme.outline, lineWidth: 1))

                VStack(alignment: .leading, spacing: 4) {
                    Text("头像").font(.system(size: 15, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                    Text("头像上传即将开放")
                        .font(.system(size: 12)).foregroundColor(Theme.textMuted)
                }
                Spacer()
            }
        }
    }

    private var avatarInitial: some View {
        Text(String((profileVM.nickname.isEmpty ? "U" : profileVM.nickname).prefix(1)))
            .font(.system(size: 26, weight: .semibold))
            .foregroundColor(Theme.accent)
    }

    private var basicSection: some View {
        sectionCard(title: "基本信息") {
            fieldRow(label: "昵称") {
                themedTextField("请输入昵称", text: $profileVM.nickname)
            }
            rowDivider
            pickerNavRow(label: "城市", value: profileVM.city, title: "选择城市",
                         items: filteredCities, search: $citySearch, selection: $profileVM.city)
            rowDivider
            pickerNavRow(label: "学校", value: profileVM.school, title: "选择学校",
                         items: filteredSchools, search: $schoolSearch, selection: $profileVM.school)
            rowDivider
            pickerNavRow(label: "专业", value: profileVM.major, title: "选择专业",
                         items: filteredMajors, search: $majorSearch, selection: $profileVM.major)
            rowDivider
            inlineMenuRow(label: "年级", value: profileVM.grade) {
                ForEach(profileVM.grades, id: \.self) { g in
                    Button(g) { profileVM.grade = g }
                }
            }
            rowDivider
            inlineMenuRow(label: "性别", value: genderLabel(profileVM.gender)) {
                ForEach(profileVM.genderOptions, id: \.0) { opt in
                    Button(opt.1) { profileVM.gender = opt.0 }
                }
            }
            rowDivider
            inlineMenuRow(label: "偏好性别", value: genderPrefLabel(profileVM.genderPref)) {
                ForEach(profileVM.genderPrefOptions, id: \.0) { opt in
                    Button(opt.1) { profileVM.genderPref = opt.0 }
                }
            }
            rowDivider
            HStack {
                Text("年龄").foregroundColor(Theme.textPrimary).font(.system(size: 15))
                Spacer()
                Stepper("\(profileVM.age) 岁", value: $profileVM.age, in: 16...40)
                    .fixedSize()
                    .foregroundColor(Theme.textPrimary)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
        }
    }

    private var personalitySection: some View {
        sectionCard(title: "个性属性") {
            inlineMenuRow(label: "MBTI", value: profileVM.mbti.isEmpty ? "未选择" : profileVM.mbti) {
                Button("未选择") { profileVM.mbti = "" }
                ForEach(metadataVM.mbtiTypes, id: \.self) { t in
                    Button(t) { profileVM.mbti = t }
                }
            }
            rowDivider
            inlineMenuRow(label: "星座", value: profileVM.zodiac.isEmpty ? "未选择" : profileVM.zodiac) {
                Button("未选择") { profileVM.zodiac = "" }
                ForEach(profileVM.zodiacOptions, id: \.self) { z in
                    Button(z) { profileVM.zodiac = z }
                }
            }
            rowDivider
            inlineMenuRow(label: "国籍", value: profileVM.nationality.isEmpty ? "未选择" : profileVM.nationality) {
                Button("未选择") { profileVM.nationality = "" }
                ForEach(metadataVM.nationalities, id: \.self) { n in
                    Button(n) { profileVM.nationality = n }
                }
            }
        }
    }

    private var signatureSection: some View {
        sectionCard(title: "个性签名") {
            fieldRow(label: nil) {
                themedTextField("一句话介绍自己…", text: $profileVM.signature)
            }
        }
    }

    private var tagsSection: some View {
        sectionCard(title: "个人标签（最多 10 个）") {
            VStack(alignment: .leading, spacing: 12) {
                FlowLayout(spacing: 8) {
                    ForEach(profileVM.presetTags, id: \.self) { tag in
                        let selected = profileVM.tags.contains(tag)
                        Button { toggleTag(tag) } label: {
                            Text(tag)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(selected ? Theme.onAccent : Theme.textSecondary)
                                .padding(.horizontal, 12).padding(.vertical, 6)
                                .background(selected ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(Theme.surfaceHi))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }

                let customTags = profileVM.tags.filter { !profileVM.presetTags.contains($0) }
                if !customTags.isEmpty {
                    FlowLayout(spacing: 8) {
                        ForEach(customTags, id: \.self) { tag in
                            HStack(spacing: 4) {
                                Text(tag).font(.system(size: 13, weight: .medium))
                                    .foregroundColor(Theme.accent)
                                Button { profileVM.removeTag(tag) } label: {
                                    Image(systemName: "xmark.circle.fill").font(.system(size: 12))
                                        .foregroundColor(Theme.accent)
                                }
                            }
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(Theme.accent.opacity(0.12))
                            .clipShape(Capsule())
                        }
                    }
                }

                if profileVM.tags.count < 10 {
                    HStack(spacing: 8) {
                        themedTextField("添加自定义标签", text: $profileVM.newTag)
                            .onSubmit { profileVM.addTag() }
                        Button("添加") { profileVM.addTag() }
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.accent)
                            .disabled(profileVM.newTag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .padding(14)
        }
    }

    private var bioSection: some View {
        sectionCard(title: "个人简介") {
            ZStack(alignment: .topLeading) {
                if profileVM.bio.isEmpty {
                    Text("介绍一下你自己吧…")
                        .font(.system(size: 15)).foregroundColor(Theme.textMuted)
                        .padding(.horizontal, 18).padding(.vertical, 16)
                }
                TextEditor(text: $profileVM.bio)
                    .font(.system(size: 15))
                    .foregroundColor(Theme.textPrimary)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 96)
                    .padding(.horizontal, 10).padding(.vertical, 8)
            }
        }
    }

    private var socialSection: some View {
        sectionCard(title: "社交联系方式") {
            socialRow(icon: "message.fill", placeholder: "微信号", text: $profileVM.wechat)
            rowDivider
            socialRow(icon: "bubble.left.fill", placeholder: "QQ 号", text: $profileVM.qq)
            rowDivider
            socialRow(icon: "book.fill", placeholder: "小红书", text: $profileVM.xiaohongshu)
            rowDivider
            socialRow(icon: "globe", placeholder: "微博", text: $profileVM.weibo)
            rowDivider
            socialRow(icon: "camera.fill", placeholder: "Instagram", text: $profileVM.instagram)
        }
    }

    private var saveButton: some View {
        Button {
            Task {
                await profileVM.saveProfile()
                if profileVM.isSaved { dismiss() }
            }
        } label: {
            HStack(spacing: 8) {
                if profileVM.isLoading { ProgressView().tint(Theme.onAccent) }
                Text(profileVM.isLoading ? "保存中…" : "保存资料")
            }
        }
        .buttonStyle(NeonButtonStyle())
        .disabled(profileVM.isLoading)
        .padding(.top, 4)
    }

    // MARK: - Reusable building blocks

    private func sectionCard<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Theme.textSecondary)
                .padding(.leading, 4)
            VStack(spacing: 0) { content() }
                .background(Theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
        }
    }

    private var rowDivider: some View {
        Divider().overlay(Theme.outline)
    }

    private func fieldRow<Content: View>(label: String?, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            if let label = label {
                Text(label).foregroundColor(Theme.textPrimary).font(.system(size: 15))
                    .frame(width: 72, alignment: .leading)
            }
            content()
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private func themedTextField(_ placeholder: String, text: Binding<String>) -> some View {
        TextField("", text: text, prompt: Text(placeholder).foregroundColor(Theme.textMuted))
            .font(.system(size: 15))
            .foregroundColor(Theme.textPrimary)
            .tint(Theme.accent)
    }

    private func pickerNavRow(label: String, value: String, title: String,
                              items: [String], search: Binding<String>,
                              selection: Binding<String>) -> some View {
        NavigationLink {
            searchablePicker(title: title, items: items, search: search, selection: selection)
        } label: {
            HStack {
                Text(label).foregroundColor(Theme.textPrimary).font(.system(size: 15))
                Spacer()
                Text(value.isEmpty ? "请选择" : value)
                    .font(.system(size: 15))
                    .foregroundColor(value.isEmpty ? Theme.textMuted : Theme.textSecondary)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold)).foregroundColor(Theme.textMuted)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
    }

    private func inlineMenuRow<Content: View>(label: String, value: String,
                                              @ViewBuilder menu: () -> Content) -> some View {
        Menu {
            menu()
        } label: {
            HStack {
                Text(label).foregroundColor(Theme.textPrimary).font(.system(size: 15))
                Spacer()
                Text(value).font(.system(size: 15)).foregroundColor(Theme.textSecondary)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 11, weight: .semibold)).foregroundColor(Theme.textMuted)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
    }

    private func socialRow(icon: String, placeholder: String, text: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15)).foregroundColor(Theme.accent)
                .frame(width: 22)
            themedTextField(placeholder, text: text)
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
    }

    private func searchablePicker(title: String, items: [String],
                                  search: Binding<String>, selection: Binding<String>) -> some View {
        ScrollView {
            VStack(spacing: 0) {
                themedTextField("搜索…", text: search)
                    .padding(14)
                    .background(Theme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.radiusSm).stroke(Theme.outline, lineWidth: 1))
                    .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 8)

                LazyVStack(spacing: 0) {
                    ForEach(items, id: \.self) { item in
                        Button {
                            selection.wrappedValue = item
                            dismiss()
                        } label: {
                            HStack {
                                Text(item).foregroundColor(Theme.textPrimary).font(.system(size: 15))
                                Spacer()
                                if selection.wrappedValue == item {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(Theme.accent)
                                        .font(.system(size: 14, weight: .bold))
                                }
                            }
                            .padding(.horizontal, 16).padding(.vertical, 13)
                            .contentShape(Rectangle())
                        }
                        Divider().overlay(Theme.outline).padding(.leading, 16)
                    }
                }
            }
        }
        .themedScreen()
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
    }

    // MARK: - Helpers

    private func toggleTag(_ tag: String) {
        if profileVM.tags.contains(tag) {
            profileVM.tags.removeAll { $0 == tag }
        } else if profileVM.tags.count < 10 {
            profileVM.tags.append(tag)
        }
    }

    private func genderLabel(_ raw: String) -> String {
        profileVM.genderOptions.first { $0.0 == raw }?.1 ?? raw
    }
    private func genderPrefLabel(_ raw: String) -> String {
        profileVM.genderPrefOptions.first { $0.0 == raw }?.1 ?? raw
    }
}
