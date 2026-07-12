import SwiftUI

struct SettingsView: View {
    var body: some View {
        List {
            Section {
                settingsRow(icon: "lock.shield", title: "隐私设置", placeholder: true)
                settingsRow(icon: "bell", title: "通知设置", placeholder: true)
                settingsRow(icon: "person.badge.key", title: "账号与安全", placeholder: true)
            }

            Section {
                settingsRow(icon: "info.circle", title: "关于我们", placeholder: true)
                settingsRow(icon: "envelope", title: "意见反馈", placeholder: true)
            }

            Section {
                HStack {
                    Text("版本")
                        .foregroundColor(.primary)
                    Spacer()
                    Text("1.0.0")
                        .foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle("设置")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func settingsRow(icon: String, title: String, placeholder: Bool = false) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .frame(width: 28)
                .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
            Text(title)
            Spacer()
            if placeholder {
                Text("即将开放")
                    .font(.caption)
                    .foregroundColor(Color(.systemGray3))
            }
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(Color(.systemGray3))
        }
    }
}
