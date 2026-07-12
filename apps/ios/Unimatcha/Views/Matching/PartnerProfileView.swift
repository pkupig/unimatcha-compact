import SwiftUI

struct PartnerProfileView: View {
    let userId: String
    @State private var profile: PublicProfile?
    @State private var isLoading = true
    @State private var errorMessage: String?

    let pink = Color(red: 1, green: 0.4, blue: 0.5)

    var body: some View {
        ScrollView {
            if isLoading {
                ProgressView().padding(.top, 80)
            } else if let profile = profile {
                let isVerified = profile.verificationStatus == "verified"

                VStack(spacing: 24) {
                    // Avatar with verification ring
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(red: 1, green: 0.85, blue: 0.9), Color(red: 1, green: 0.94, blue: 0.96)],
                                    startPoint: .top, endPoint: .bottom
                                )
                            )
                            .frame(width: 100, height: 100)
                            .overlay(
                                Text(String(profile.nickname?.prefix(1) ?? "?"))
                                    .font(.system(size: 40, weight: .medium))
                                    .foregroundColor(Color(red: 1, green: 0.35, blue: 0.45))
                            )
                            .overlay(Circle().stroke(isVerified ? Color.yellow : .clear, lineWidth: 3))
                        if isVerified {
                            Image(systemName: "checkmark.seal.fill")
                                .foregroundColor(.yellow).font(.system(size: 20))
                                .offset(x: 36, y: 36)
                        }
                    }
                    .padding(.top, 20)

                    Text(profile.nickname ?? "匿名用户")
                        .font(.system(size: 24, weight: .bold))

                    // MBTI + 星座 badges
                    HStack(spacing: 6) {
                        if let mbti = profile.mbti, !mbti.isEmpty {
                            Text(mbti)
                                .font(.caption).fontWeight(.semibold)
                                .padding(.horizontal, 8).padding(.vertical, 2)
                                .background(Color.purple.opacity(0.12))
                                .foregroundColor(.purple).cornerRadius(8)
                        }
                        if let zodiac = profile.zodiac, !zodiac.isEmpty {
                            Text(zodiac)
                                .font(.caption).fontWeight(.semibold)
                                .padding(.horizontal, 8).padding(.vertical, 2)
                                .background(Color.yellow.opacity(0.15))
                                .foregroundColor(Color(red: 0.72, green: 0.53, blue: 0))
                                .cornerRadius(8)
                        }
                    }

                    // Info cards
                    VStack(spacing: 0) {
                        infoRow(icon: "graduationcap", label: "学校", value: profile.school)
                        Divider().padding(.leading, 52)
                        infoRow(icon: "person", label: "年龄", value: profile.age.map { "\($0) 岁" })
                        Divider().padding(.leading, 52)
                        infoRow(icon: "location", label: "城市", value: profile.city)
                        Divider().padding(.leading, 52)
                        infoRow(icon: "book", label: "年级", value: profile.grade)
                        if let major = profile.major, !major.isEmpty {
                            Divider().padding(.leading, 52)
                            infoRow(icon: "book.closed", label: "专业", value: major)
                        }
                        if let nationality = profile.nationality, !nationality.isEmpty {
                            Divider().padding(.leading, 52)
                            infoRow(icon: "globe", label: "国籍", value: nationality)
                        }
                    }
                    .background(Color.white)
                    .cornerRadius(16)
                    .padding(.horizontal, 20)

                    // Tags
                    if let tags = profile.tags, !tags.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("个人标签")
                                .font(.system(size: 16, weight: .semibold))
                            FlowLayout(spacing: 8) {
                                ForEach(tags, id: \.self) { tag in
                                    Text(tag)
                                        .font(.subheadline)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 6)
                                        .background(Color(red: 1, green: 0.94, blue: 0.96))
                                        .foregroundColor(Color(red: 1, green: 0.3, blue: 0.45))
                                        .cornerRadius(16)
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                    }

                    // Bio
                    if let bio = profile.bio, !bio.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("个人简介")
                                .font(.system(size: 16, weight: .semibold))
                            Text(bio)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(Color.white)
                        .cornerRadius(16)
                        .padding(.horizontal, 20)
                    }

                    // Social links (only visible in relationship mode)
                    if let social = profile.socialLinks {
                        socialLinksSection(social)
                    }

                    Spacer().frame(height: 40)
                }
            } else if let error = errorMessage {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 40))
                        .foregroundColor(.secondary)
                    Text(error)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 80)
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("TA 的主页")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadProfile() }
    }

    private func infoRow(icon: String, label: String, value: String?) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .frame(width: 28)
                .foregroundColor(pink)
            Text(label)
                .foregroundColor(.secondary)
                .frame(width: 50, alignment: .leading)
            Text(value ?? "—")
                .foregroundColor(.primary)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func socialLinksSection(_ social: SocialLinks) -> some View {
        let links: [(String, String, String?)] = [
            ("微信", "message.fill", social.wechat),
            ("QQ", "bubble.left.fill", social.qq),
            ("小红书", "book.fill", social.xiaohongshu),
            ("微博", "globe", social.weibo),
            ("Instagram", "camera.fill", social.instagram),
        ]
        let nonEmpty = links.filter { $0.2 != nil && !$0.2!.isEmpty }
        guard !nonEmpty.isEmpty else { return AnyView(EmptyView()) }

        return AnyView(
            VStack(alignment: .leading, spacing: 10) {
                Text("联系方式")
                    .font(.system(size: 16, weight: .semibold))

                VStack(spacing: 0) {
                    ForEach(Array(nonEmpty.enumerated()), id: \.offset) { index, item in
                        HStack(spacing: 12) {
                            Image(systemName: item.1)
                                .frame(width: 28)
                                .foregroundColor(pink)
                            Text(item.0)
                                .foregroundColor(.secondary)
                                .frame(width: 70, alignment: .leading)
                            Text(item.2 ?? "")
                                .foregroundColor(.primary)
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)

                        if index < nonEmpty.count - 1 {
                            Divider().padding(.leading, 56)
                        }
                    }
                }
                .background(Color.white)
                .cornerRadius(12)
            }
            .padding(.horizontal, 20)
        )
    }

    private func loadProfile() async {
        isLoading = true
        do {
            profile = try await ProfileService.getPublicProfile(userId: userId)
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
