import SwiftUI

struct ProfileSetupView: View {
    @EnvironmentObject var profileVM: ProfileViewModel
    let onComplete: () -> Void
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Header
                    VStack(alignment: .leading, spacing: 6) {
                        Text("👤 完善你的资料")
                            .font(.system(size: 24, weight: .bold))
                        Text("帮助我们为你找到最合适的人")
                            .font(.subheadline).foregroundColor(.secondary)
                    }
                    .padding(.bottom, 4)
                    
                    // Form
                    Group {
                        FormSection(title: "基本信息") {
                            LabeledInput("昵称", text: $profileVM.nickname, placeholder: "你的昵称")
                            LabeledInput("学校", text: $profileVM.school, placeholder: "就读学校")
                            LabeledInput("城市", text: $profileVM.city, placeholder: "所在城市")
                        }
                        
                        FormSection(title: "学业与年龄") {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("年级").font(.subheadline).fontWeight(.medium)
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack {
                                        ForEach(profileVM.grades, id: \.self) { g in
                                            TagButton(title: g, isSelected: profileVM.grade == g) {
                                                profileVM.grade = g
                                            }
                                        }
                                    }
                                }
                            }
                            
                            VStack(alignment: .leading, spacing: 8) {
                                Text("年龄：\(profileVM.age) 岁").font(.subheadline).fontWeight(.medium)
                                Slider(value: Binding(get: { Double(profileVM.age) }, set: { profileVM.age = Int($0) }), in: 16...30, step: 1)
                                    .tint(Color(red: 1, green: 0.30, blue: 0.43))
                            }
                        }
                        
                        FormSection(title: "性别与偏好") {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("我的性别").font(.subheadline).fontWeight(.medium)
                                HStack {
                                    ForEach(profileVM.genderOptions, id: \.0) { (val, label) in
                                        TagButton(title: label, isSelected: profileVM.gender == val) { profileVM.gender = val }
                                    }
                                }
                            }
                            
                            VStack(alignment: .leading, spacing: 8) {
                                Text("期望匹配").font(.subheadline).fontWeight(.medium)
                                HStack {
                                    ForEach(profileVM.genderPrefOptions, id: \.0) { (val, label) in
                                        TagButton(title: label, isSelected: profileVM.genderPref == val) { profileVM.genderPref = val }
                                    }
                                }
                            }
                        }
                        
                        FormSection(title: "兴趣爱好（多选）") {
                            FlowLayout(tags: profileVM.interestTags, selected: profileVM.interests) { tag in
                                profileVM.toggleInterest(tag)
                            }
                        }
                        
                        FormSection(title: "个人简介（可选）") {
                            TextEditor(text: $profileVM.bio)
                                .frame(minHeight: 80)
                                .padding(10)
                                .background(Color(.systemGray6))
                                .cornerRadius(12)
                                .font(.system(size: 15))
                        }
                    }
                    
                    if let err = profileVM.errorMessage {
                        Text(err).font(.caption).foregroundColor(.red)
                    }
                    
                    Button(action: { Task { await saveAndContinue() } }) {
                        HStack {
                            if profileVM.isLoading { ProgressView().tint(.white).scaleEffect(0.8) }
                            Text("保存并继续")
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 16)
                        .background(Color(red: 1, green: 0.30, blue: 0.43))
                        .foregroundColor(.white).cornerRadius(16)
                        .font(.system(size: 16, weight: .semibold))
                    }
                    .disabled(profileVM.isLoading)
                    .padding(.bottom, 32)
                }
                .padding(20)
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }
    
    private func saveAndContinue() async {
        await profileVM.saveProfile()
        if profileVM.isSaved { onComplete() }
    }
}

// MARK: - Helper Components
struct FormSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.system(size: 13, weight: .semibold)).foregroundColor(.secondary).textCase(.uppercase).tracking(0.5)
            content()
        }
    }
}

struct LabeledInput: View {
    let label: String
    @Binding var text: String
    let placeholder: String
    
    init(_ label: String, text: Binding<String>, placeholder: String) {
        self.label = label; self._text = text; self.placeholder = placeholder
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.subheadline).fontWeight(.medium)
            TextField(placeholder, text: $text)
                .padding(12).background(Color(.systemGray6)).cornerRadius(10)
        }
    }
}

struct TagButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title).font(.system(size: 14, weight: .medium))
                .padding(.horizontal, 14).padding(.vertical, 7)
                .background(isSelected ? Color(red: 1, green: 0.30, blue: 0.43) : Color(.systemGray6))
                .foregroundColor(isSelected ? .white : .primary)
                .cornerRadius(20)
        }
    }
}

struct FlowLayout: View {
    let tags: [String]
    let selected: [String]
    let onToggle: (String) -> Void
    
    var body: some View {
        // Simplified flow layout using VStack + HStack
        let rows = stride(from: 0, to: tags.count, by: 4).map { Array(tags[$0..<min($0+4, tags.count)]) }
        VStack(alignment: .leading, spacing: 8) {
            ForEach(rows, id: \.first) { row in
                HStack(spacing: 8) {
                    ForEach(row, id: \.self) { tag in
                        TagButton(title: tag, isSelected: selected.contains(tag)) { onToggle(tag) }
                    }
                    Spacer()
                }
            }
        }
    }
}
