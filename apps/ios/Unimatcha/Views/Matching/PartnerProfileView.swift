import SwiftUI

/// Full partner profile rendered from a `PublicProfile`.
/// Use `init(profile:)` when the object is already loaded (match status carries it),
/// or `init(userId:)` to fetch it lazily (relationship "view profile" link).
struct PartnerProfileView: View {
    private let preloaded: PublicProfile?
    private let userId: String?

    @State private var profile: PublicProfile?
    @State private var isLoading: Bool
    @State private var errorMessage: String?

    init(profile: PublicProfile) {
        self.preloaded = profile
        self.userId = profile.userId
        _profile = State(initialValue: profile)
        _isLoading = State(initialValue: false)
    }

    init(userId: String) {
        self.preloaded = nil
        self.userId = userId
        _profile = State(initialValue: nil)
        _isLoading = State(initialValue: true)
    }

    var body: some View {
        ScrollView {
            if let profile = profile {
                content(profile)
            } else if isLoading {
                ProgressView().tint(Theme.accent).padding(.top, 80)
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 40))
                        .foregroundColor(Theme.textMuted)
                    Text(errorMessage ?? "无法加载资料")
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                }
                .padding(.top, 80)
            }
        }
        .themedScreen()
        .navigationTitle("TA 的主页")
        .navigationBarTitleDisplayMode(.inline)
        .task { if preloaded == nil { await loadProfile() } }
    }

    // MARK: - Content
    private func content(_ profile: PublicProfile) -> some View {
        VStack(spacing: 16) {
            coverHeader(profile)

            // Name + badges
            VStack(spacing: 10) {
                Text(profile.nickname ?? "匿名用户")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(Theme.textPrimary)

                HStack(spacing: 8) {
                    if profile.verificationStatus == "verified" {
                        badge(text: "已认证", icon: "checkmark.seal.fill")
                    }
                    if let mbti = profile.mbti, !mbti.isEmpty { badge(text: mbti) }
                    if let zodiac = profile.zodiac, !zodiac.isEmpty { badge(text: zodiac) }
                }
            }

            // Info rows
            Card {
                VStack(spacing: 0) {
                    infoRows(profile)
                }
            }
            .padding(.horizontal, 16)

            // Bio
            if let bio = profile.bio, !bio.isEmpty {
                labeledCard(title: "个人简介") {
                    Text(bio)
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            // Interests
            if let interests = profile.interests, !interests.isEmpty {
                labeledCard(title: "兴趣爱好") {
                    FlowLayout(spacing: 8) {
                        ForEach(interests, id: \.self) { TagChip(text: $0) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            // Tags
            if let tags = profile.tags, !tags.isEmpty {
                labeledCard(title: "个人标签") {
                    FlowLayout(spacing: 8) {
                        ForEach(tags, id: \.self) { TagChip(text: $0) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            // Real photos grid
            if let photos = profile.realPhotos, !photos.isEmpty {
                labeledCard(title: "真实照片") {
                    photoGrid(photos)
                }
            }

            Spacer().frame(height: 32)
        }
        .padding(.bottom, 8)
    }

    // MARK: - Cover + avatar
    private func coverHeader(_ profile: PublicProfile) -> some View {
        ZStack(alignment: .bottom) {
            Group {
                if let cover = profile.coverUrl, let url = URL(string: cover) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFill()
                        default: Theme.accentGradient
                        }
                    }
                } else {
                    Theme.accentGradient
                }
            }
            .frame(height: 160)
            .frame(maxWidth: .infinity)
            .clipped()
            .overlay(
                LinearGradient(colors: [.clear, Theme.bg.opacity(0.85)],
                               startPoint: .center, endPoint: .bottom)
            )

            AvatarCircle(urlString: profile.avatarUrl, fallback: profile.nickname, size: 92)
                .overlay(Circle().stroke(Theme.bg, lineWidth: 4))
                .offset(y: 46)
        }
        .padding(.bottom, 46)
    }

    // MARK: - Info rows
    @ViewBuilder
    private func infoRows(_ profile: PublicProfile) -> some View {
        let rows: [(String, String, String?)] = [
            ("graduationcap", "学校", profile.school),
            ("person", "年龄", profile.age.map { "\($0) 岁" }),
            ("location", "城市", profile.city),
            ("book", "年级", profile.grade),
            ("book.closed", "专业", profile.major),
            ("globe", "国籍", profile.nationality),
        ]
        let visible = rows.filter { ($0.2?.isEmpty == false) }
        ForEach(Array(visible.enumerated()), id: \.offset) { idx, row in
            HStack(spacing: 12) {
                Image(systemName: row.0)
                    .frame(width: 24)
                    .foregroundColor(Theme.accent)
                Text(row.1)
                    .foregroundColor(Theme.textSecondary)
                    .frame(width: 52, alignment: .leading)
                Text(row.2 ?? "—")
                    .foregroundColor(Theme.textPrimary)
                Spacer()
            }
            .font(.subheadline)
            .padding(.vertical, 12)
            if idx < visible.count - 1 {
                Divider().overlay(Theme.outline).padding(.leading, 36)
            }
        }
    }

    // MARK: - Photo grid
    private func photoGrid(_ photos: [String]) -> some View {
        let columns = [GridItem(.flexible(), spacing: 8),
                       GridItem(.flexible(), spacing: 8),
                       GridItem(.flexible(), spacing: 8)]
        return LazyVGrid(columns: columns, spacing: 8) {
            ForEach(photos, id: \.self) { urlString in
                AsyncImage(url: URL(string: urlString)) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFill()
                    case .empty: Theme.surfaceHi
                    default: Theme.surfaceHi.overlay(
                        Image(systemName: "photo").foregroundColor(Theme.textMuted))
                    }
                }
                .frame(height: 104)
                .frame(maxWidth: .infinity)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
            }
        }
    }

    // MARK: - Small builders
    private func badge(text: String, icon: String? = nil) -> some View {
        HStack(spacing: 4) {
            if let icon = icon { Image(systemName: icon).font(.caption2) }
            Text(text)
        }
        .font(.caption.weight(.semibold))
        .foregroundColor(Theme.accent)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Theme.accent.opacity(0.12))
        .clipShape(Capsule())
    }

    private func labeledCard<Content: View>(title: String,
                                            @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
        .padding(.horizontal, 16)
    }

    // MARK: - Load
    private func loadProfile() async {
        guard let userId = userId else { isLoading = false; return }
        isLoading = true
        do { profile = try await ProfileService.getPublicProfile(userId: userId) }
        catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }
}
