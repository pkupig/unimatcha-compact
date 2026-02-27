import SwiftUI

struct RelationshipModeView: View {
    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            ZStack {
                Circle()
                    .fill(Color(red: 1, green: 0.94, blue: 0.96))
                    .frame(width: 120, height: 120)
                Text("💕").font(.system(size: 56))
            }

            VStack(spacing: 8) {
                Text("恋爱模式")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(Color(red: 1, green: 0.3, blue: 0.45))

                Text("恋爱任务、恋爱日记、恋爱积分\n即将开放，敬请期待")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }

            // Preview cards
            VStack(spacing: 12) {
                placeholderCard(icon: "checklist", title: "恋爱任务", desc: "完成甜蜜任务，提升恋爱分")
                placeholderCard(icon: "book.closed", title: "恋爱日记", desc: "记录你们的美好时光")
                placeholderCard(icon: "star.fill", title: "恋爱积分", desc: "互动越多，积分越高")
            }
            .padding(.horizontal, 30)

            Spacer()
        }
        .navigationTitle("恋爱模式")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func placeholderCard(icon: String, title: String, desc: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 22))
                .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                .frame(width: 40, height: 40)
                .background(Color(red: 1, green: 0.94, blue: 0.96))
                .cornerRadius(10)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                Text(desc)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Text("即将开放")
                .font(.caption2)
                .foregroundColor(Color(.systemGray3))
        }
        .padding(14)
        .background(Color.white)
        .cornerRadius(14)
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }
}
