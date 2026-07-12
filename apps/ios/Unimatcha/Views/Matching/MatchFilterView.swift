import SwiftUI

struct MatchFilterView: View {
    @EnvironmentObject var matchingVM: MatchingViewModel
    @Environment(\.dismiss) var dismiss

    let pink = Color(red: 1, green: 0.4, blue: 0.5)

    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text("基本筛选")) {
                    Toggle("必须同城", isOn: $matchingVM.preferences.requireSameCity)
                        .tint(pink)
                    Toggle("必须同校", isOn: $matchingVM.preferences.requireSameUniversity)
                        .tint(pink)
                }

                Section(header: Text("高级筛选（预留）")) {
                    Toggle("必须同专业", isOn: $matchingVM.preferences.requireSameMajor)
                        .tint(pink)
                        .disabled(true)

                    HStack {
                        Text("偏好国籍")
                        Spacer()
                        Text("即将开放")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    HStack {
                        Text("偏好 MBTI")
                        Spacer()
                        Text("即将开放")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                Section {
                    Text("筛选条件会影响匹配候选人范围，保存后在下次匹配生效。")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .navigationTitle("匹配筛选")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("保存") {
                        Task {
                            await matchingVM.savePreferences()
                            dismiss()
                        }
                    }
                    .fontWeight(.semibold)
                }
            }
            .task { await matchingVM.loadPreferences() }
        }
    }
}
