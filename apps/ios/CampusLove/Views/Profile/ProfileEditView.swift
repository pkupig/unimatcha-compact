import SwiftUI

struct ProfileEditView: View {
    @EnvironmentObject var profileVM: ProfileViewModel
    @Environment(\.dismiss) var dismiss

    var body: some View {
        Form {
            // Basic info
            Section("基本信息") {
                TextField("昵称", text: $profileVM.nickname)
                TextField("学校", text: $profileVM.school)

                Picker("年级", selection: $profileVM.grade) {
                    ForEach(profileVM.grades, id: \.self) { Text($0) }
                }

                Picker("性别", selection: $profileVM.gender) {
                    ForEach(profileVM.genderOptions, id: \.0) { Text($0.1).tag($0.0) }
                }

                Picker("偏好性别", selection: $profileVM.genderPref) {
                    ForEach(profileVM.genderPrefOptions, id: \.0) { Text($0.1).tag($0.0) }
                }

                Stepper("年龄：\(profileVM.age)", value: $profileVM.age, in: 16...30)

                TextField("城市", text: $profileVM.city)
            }

            // Interests
            Section("兴趣标签") {
                FlowLayout(spacing: 8) {
                    ForEach(profileVM.interestTags, id: \.self) { tag in
                        Button(action: { profileVM.toggleInterest(tag) }) {
                            Text(tag)
                                .font(.subheadline)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 6)
                                .background(
                                    profileVM.interests.contains(tag)
                                    ? Color(red: 1, green: 0.4, blue: 0.5)
                                    : Color(.systemGray6)
                                )
                                .foregroundColor(
                                    profileVM.interests.contains(tag)
                                    ? .white : .primary
                                )
                                .cornerRadius(16)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            // Bio
            Section("个人简介") {
                TextEditor(text: $profileVM.bio)
                    .frame(minHeight: 80)
            }

            // Social links
            Section("社交联系方式") {
                HStack {
                    Image(systemName: "message.fill").frame(width: 24)
                        .foregroundColor(.green)
                    TextField("微信号", text: $profileVM.wechat)
                }
                HStack {
                    Image(systemName: "bubble.left.fill").frame(width: 24)
                        .foregroundColor(.blue)
                    TextField("QQ 号", text: $profileVM.qq)
                }
                HStack {
                    Image(systemName: "book.fill").frame(width: 24)
                        .foregroundColor(.red)
                    TextField("小红书", text: $profileVM.xiaohongshu)
                }
                HStack {
                    Image(systemName: "globe").frame(width: 24)
                        .foregroundColor(.orange)
                    TextField("微博", text: $profileVM.weibo)
                }
                HStack {
                    Image(systemName: "camera.fill").frame(width: 24)
                        .foregroundColor(.purple)
                    TextField("Instagram", text: $profileVM.instagram)
                }
            }

            // Avatar placeholder
            Section("头像") {
                HStack {
                    Text("上传头像")
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("即将开放")
                        .font(.caption)
                        .foregroundColor(Color(.systemGray3))
                }
            }

            // Error
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
    }
}
