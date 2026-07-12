import SwiftUI

struct ProfileEditView: View {
    @EnvironmentObject var profileVM: ProfileViewModel
    @ObservedObject var metadataVM = MetadataViewModel.shared
    @Environment(\.dismiss) var dismiss

    let pink = Color(red: 1, green: 0.4, blue: 0.5)

    // ─── 搜索过滤状态 ─────────────────────────────────────────
    @State private var citySearch = ""
    @State private var schoolSearch = ""
    @State private var majorSearch = ""

    var filteredCities: [String] {
        citySearch.isEmpty ? metadataVM.cities : metadataVM.cities.filter { $0.localizedCaseInsensitiveContains(citySearch) }
    }
    var filteredSchools: [String] {
        schoolSearch.isEmpty ? metadataVM.universities : metadataVM.universities.filter { $0.localizedCaseInsensitiveContains(schoolSearch) }
    }
    var filteredMajors: [String] {
        majorSearch.isEmpty ? metadataVM.majors : metadataVM.majors.filter { $0.localizedCaseInsensitiveContains(majorSearch) }
    }

    var body: some View {
        Form {
            // ─── 头像（占位） ──────────────────────────────────
            Section("头像") {
                HStack {
                    // 头像预览
                    Circle()
                        .fill(Color(red: 1, green: 0.94, blue: 0.96))
                        .frame(width: 60, height: 60)
                        .overlay(
                            Text(String(profileVM.nickname.prefix(1)))
                                .font(.system(size: 24, weight: .medium))
                                .foregroundColor(pink)
                        )
                    Spacer()
                    Text("上传功能即将开放")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            // ─── 基本信息 ──────────────────────────────────────
            Section("基本信息") {
                TextField("昵称", text: $profileVM.nickname)

                // 城市 Picker（搜索型）
                NavigationLink {
                    searchablePickerView(
                        title: "选择城市",
                        items: filteredCities,
                        search: $citySearch,
                        selection: $profileVM.city
                    )
                } label: {
                    HStack {
                        Text("城市")
                        Spacer()
                        Text(profileVM.city.isEmpty ? "请选择" : profileVM.city)
                            .foregroundColor(profileVM.city.isEmpty ? .secondary : .primary)
                    }
                }

                // 学校 Picker（搜索型）
                NavigationLink {
                    searchablePickerView(
                        title: "选择学校",
                        items: filteredSchools,
                        search: $schoolSearch,
                        selection: $profileVM.school
                    )
                } label: {
                    HStack {
                        Text("学校")
                        Spacer()
                        Text(profileVM.school.isEmpty ? "请选择" : profileVM.school)
                            .foregroundColor(profileVM.school.isEmpty ? .secondary : .primary)
                    }
                }

                // 年级
                Picker("年级", selection: $profileVM.grade) {
                    ForEach(profileVM.grades, id: \.self) { Text($0) }
                }

                // 专业 Picker（搜索型）
                NavigationLink {
                    searchablePickerView(
                        title: "选择专业",
                        items: filteredMajors,
                        search: $majorSearch,
                        selection: $profileVM.major
                    )
                } label: {
                    HStack {
                        Text("专业")
                        Spacer()
                        Text(profileVM.major.isEmpty ? "请选择" : profileVM.major)
                            .foregroundColor(profileVM.major.isEmpty ? .secondary : .primary)
                    }
                }

                Picker("性别", selection: $profileVM.gender) {
                    ForEach(profileVM.genderOptions, id: \.0) { Text($0.1).tag($0.0) }
                }

                Picker("偏好性别", selection: $profileVM.genderPref) {
                    ForEach(profileVM.genderPrefOptions, id: \.0) { Text($0.1).tag($0.0) }
                }

                Stepper("年龄：\(profileVM.age)", value: $profileVM.age, in: 16...40)
            }

            // ─── MBTI & 国籍 & 星座 ─────────────────────────────
            Section("个性属性") {
                Picker("MBTI", selection: $profileVM.mbti) {
                    Text("未选择").tag("")
                    ForEach(metadataVM.mbtiTypes, id: \.self) { Text($0).tag($0) }
                }

                Picker("星座", selection: $profileVM.zodiac) {
                    Text("未选择").tag("")
                    ForEach(profileVM.zodiacOptions, id: \.self) { Text($0).tag($0) }
                }

                // 国籍 Picker
                Picker("国籍", selection: $profileVM.nationality) {
                    Text("未选择").tag("")
                    ForEach(metadataVM.nationalities, id: \.self) { Text($0).tag($0) }
                }
            }

            // ─── 个性签名 ──────────────────────────────────────
            Section("个性签名") {
                TextField("一句话介绍自己...", text: $profileVM.signature)
            }

            // ─── 标签（合并 interests + 自定义，最多10） ───────
            Section(header: Text("个人标签（最多10个）"), footer: Text("选择预设标签或输入自定义标签，保存时会合并兴趣标签")) {
                // 预设标签（可点选）
                FlowLayout(spacing: 8) {
                    ForEach(profileVM.presetTags, id: \.self) { tag in
                        Button(action: { toggleTag(tag) }) {
                            Text(tag)
                                .font(.subheadline)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(profileVM.tags.contains(tag) ? pink : Color(.systemGray6))
                                .foregroundColor(profileVM.tags.contains(tag) ? .white : .primary)
                                .cornerRadius(14)
                        }
                        .buttonStyle(.plain)
                    }
                }

                // 已添加的自定义标签
                let customTags = profileVM.tags.filter { !profileVM.presetTags.contains($0) }
                if !customTags.isEmpty {
                    FlowLayout(spacing: 8) {
                        ForEach(customTags, id: \.self) { tag in
                            HStack(spacing: 4) {
                                Text(tag).font(.subheadline)
                                Button { profileVM.removeTag(tag) } label: {
                                    Image(systemName: "xmark.circle.fill").font(.system(size: 12))
                                }
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Color(red: 1, green: 0.94, blue: 0.96))
                            .foregroundColor(pink)
                            .cornerRadius(14)
                        }
                    }
                }

                if profileVM.tags.count < 10 {
                    HStack {
                        TextField("添加自定义标签", text: $profileVM.newTag)
                            .onSubmit { profileVM.addTag() }
                        Button("添加") { profileVM.addTag() }
                            .disabled(profileVM.newTag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }

            // ─── 个人简介 ──────────────────────────────────────
            Section("个人简介") {
                TextEditor(text: $profileVM.bio)
                    .frame(minHeight: 80)
            }

            // ─── 社交联系方式 ──────────────────────────────────
            Section("社交联系方式") {
                socialLinkRow(icon: "message.fill", color: .green, placeholder: "微信号", text: $profileVM.wechat)
                socialLinkRow(icon: "bubble.left.fill", color: .blue, placeholder: "QQ 号", text: $profileVM.qq)
                socialLinkRow(icon: "book.fill", color: .red, placeholder: "小红书", text: $profileVM.xiaohongshu)
                socialLinkRow(icon: "globe", color: .orange, placeholder: "微博", text: $profileVM.weibo)
                socialLinkRow(icon: "camera.fill", color: .purple, placeholder: "Instagram", text: $profileVM.instagram)
            }

            // ─── 真实照片 ──────────────────────────────────────
            Section(header: Text("真实照片"), footer: Text("最多6张，仅验证后对匹配对象可见。照片存储在本地")) {
                if !profileVM.realPhotos.isEmpty {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ForEach(Array(profileVM.realPhotos.enumerated()), id: \.offset) { index, _ in
                            ZStack(alignment: .topTrailing) {
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(Color(red: 1, green: 0.94, blue: 0.96))
                                    .frame(height: 80)
                                    .overlay(
                                        Image(systemName: "photo").font(.title2)
                                            .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                                    )
                                Button(action: {
                                    profileVM.realPhotos.remove(at: index)
                                }) {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 18))
                                        .foregroundColor(.red)
                                }
                                .offset(x: 4, y: -4)
                            }
                        }
                    }
                }
                if profileVM.realPhotos.count < 6 {
                    Button(action: {
                        // Add a placeholder photo entry
                        profileVM.realPhotos.append("photo_\(Date().timeIntervalSince1970)")
                    }) {
                        HStack {
                            Image(systemName: "plus.circle")
                            Text("添加照片占位")
                        }
                        .font(.system(size: 14))
                        .foregroundColor(pink)
                    }
                }
            }

            // ─── 身份认证 ──────────────────────────────────────
            Section("身份认证") {
                verificationRow
            }

            // ─── Error ──────────────────────────────────────────
            if let error = metadataVM.errorMessage {
                Section {
                    Text("选项加载失败：\(error)").foregroundColor(.red).font(.caption)
                }
            }
            if let error = profileVM.errorMessage {
                Section {
                    Text(error).foregroundColor(.red).font(.caption)
                }
            }
        }
        .navigationTitle("编辑资料")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: {
                    Task {
                        await profileVM.saveProfile()
                        if profileVM.isSaved { dismiss() }
                    }
                }) {
                    if profileVM.isLoading {
                        ProgressView()
                    } else {
                        Text("保存").fontWeight(.semibold)
                    }
                }
                .disabled(profileVM.isLoading)
            }
        }
        .task { await metadataVM.loadAllIfNeeded() }
    }

    // MARK: - Tag toggle（预设标签点击切换）
    private func toggleTag(_ tag: String) {
        if profileVM.tags.contains(tag) {
            profileVM.tags.removeAll { $0 == tag }
        } else if profileVM.tags.count < 10 {
            profileVM.tags.append(tag)
        }
    }

    // MARK: - Social link row
    private func socialLinkRow(icon: String, color: Color, placeholder: String, text: Binding<String>) -> some View {
        HStack {
            Image(systemName: icon).frame(width: 24).foregroundColor(color)
            TextField(placeholder, text: text)
        }
    }

    // MARK: - Verification row
    private var verificationRow: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text("认证状态")
                    verificationBadge
                }
                Text("通过认证后，头像将显示黄色认证徽标")
                    .font(.caption2).foregroundColor(.secondary)
            }
            Spacer()
            if profileVM.verificationStatus == "unverified" || profileVM.verificationStatus == "rejected" {
                Button(action: { Task { await profileVM.applyVerification() } }) {
                    Text("申请认证")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(pink)
                        .cornerRadius(14)
                }
            }
        }
    }

    @ViewBuilder
    private var verificationBadge: some View {
        switch profileVM.verificationStatus {
        case "verified":
            HStack(spacing: 3) {
                Image(systemName: "checkmark.seal.fill").foregroundColor(.yellow).font(.system(size: 13))
                Text("已认证").font(.caption).foregroundColor(.green)
            }
        case "pending":
            HStack(spacing: 3) {
                Image(systemName: "clock.fill").foregroundColor(.orange).font(.system(size: 13))
                Text("审核中").font(.caption).foregroundColor(.orange)
            }
        case "rejected":
            HStack(spacing: 3) {
                Image(systemName: "xmark.circle.fill").foregroundColor(.red).font(.system(size: 13))
                Text("被拒绝").font(.caption).foregroundColor(.red)
            }
        default:
            Text("未认证").font(.caption).foregroundColor(.secondary)
        }
    }

    // MARK: - Searchable Picker（搜索型列表选择）
    private func searchablePickerView(
        title: String,
        items: [String],
        search: Binding<String>,
        selection: Binding<String>
    ) -> some View {
        List {
            Section {
                TextField("搜索...", text: search)
            }
            ForEach(items, id: \.self) { item in
                Button(action: {
                    selection.wrappedValue = item
                    dismiss()
                }) {
                    HStack {
                        Text(item)
                        Spacer()
                        if selection.wrappedValue == item {
                            Image(systemName: "checkmark").foregroundColor(pink)
                        }
                    }
                }
                .foregroundColor(.primary)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
