import Foundation
import SwiftUI

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var profile: UserProfile?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isSaved = false

    // ─── Form fields ──────────────────────────────────────────
    @Published var nickname = ""
    @Published var school = ""
    @Published var grade = "大一"
    @Published var gender = "female"
    @Published var genderPref = "any"
    @Published var age = 20
    @Published var city = ""
    @Published var interests: [String] = []
    @Published var bio = ""

    // Social links
    @Published var wechat = ""
    @Published var qq = ""
    @Published var xiaohongshu = ""
    @Published var weibo = ""
    @Published var instagram = ""

    // Signature & tags
    @Published var signature = ""
    @Published var tags: [String] = []
    @Published var newTag = ""

    // ─── 第三轮新增 ──────────────────────────────────────────
    @Published var major = ""
    @Published var mbti = ""
    @Published var nationality = ""
    @Published var realPhotos: [String] = []
    @Published var verificationStatus = "unverified"
    @Published var zodiac = ""
    @Published var coverUrl = ""

    // ─── 下拉选项（静态 + 从 MetadataViewModel 获取） ─────────
    let grades = ["大一", "大二", "大三", "大四", "研一", "研二", "研三", "博士一", "博士二", "博士三", "博士四"]
    let zodiacOptions = ["白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"]
    let genderOptions = [("female", "女"), ("male", "男"), ("non_binary", "非二元"), ("other", "其他")]
    let genderPrefOptions = [("any", "不限"), ("male", "男"), ("female", "女")]
    let presetTags = ["音乐", "旅行", "摄影", "阅读", "运动", "游戏", "美食", "电影", "编程", "艺术", "宠物", "健身",
                      "追剧", "二次元", "户外", "做饭", "咖啡", "酒吧", "桌游", "骑行"]

    // 向下兼容：interestTags 别名
    var interestTags: [String] { presetTags }

    // ─── Load ──────────────────────────────────────────────────
    func loadProfile() async {
        isLoading = true
        do {
            let p = try await ProfileService.getMyProfile()
            self.profile = p
            self.nickname = p.nickname ?? ""
            self.school = p.school ?? ""
            self.grade = p.grade ?? "大一"
            self.gender = p.gender ?? "female"
            self.genderPref = p.genderPref ?? "any"
            self.age = p.age ?? 20
            self.city = p.city ?? ""
            self.interests = p.interests ?? []
            self.bio = p.bio ?? ""
            self.signature = p.signature ?? ""
            self.tags = p.tags ?? []
            self.major = p.major ?? ""
            self.mbti = p.mbti ?? ""
            self.nationality = p.nationality ?? ""
            self.realPhotos = p.realPhotos ?? []
            self.zodiac = p.zodiac ?? ""
            self.coverUrl = p.coverUrl ?? ""
            // Social links
            self.wechat = p.socialLinks?.wechat ?? ""
            self.qq = p.socialLinks?.qq ?? ""
            self.xiaohongshu = p.socialLinks?.xiaohongshu ?? ""
            self.weibo = p.socialLinks?.weibo ?? ""
            self.instagram = p.socialLinks?.instagram ?? ""
        } catch {}
        isLoading = false
    }

    // ─── Save ──────────────────────────────────────────────────
    func saveProfile() async {
        guard !nickname.isEmpty, !school.isEmpty, !city.isEmpty else {
            errorMessage = "请填写必要信息（昵称、学校、城市）"
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            let socialLinks = SocialLinks(
                wechat: wechat.isEmpty ? nil : wechat,
                qq: qq.isEmpty ? nil : qq,
                xiaohongshu: xiaohongshu.isEmpty ? nil : xiaohongshu,
                weibo: weibo.isEmpty ? nil : weibo,
                instagram: instagram.isEmpty ? nil : instagram
            )
            // 合并 interests 到 tags（去重，最多10个）
            let mergedTags = mergeInterestsAndTags()

            let req = CreateProfileRequest(
                nickname: nickname, school: school, grade: grade,
                gender: gender, genderPref: genderPref, age: age,
                city: city, interests: interests,
                bio: bio.isEmpty ? nil : bio, avatarUrl: nil,
                socialLinks: socialLinks,
                signature: signature.isEmpty ? nil : signature,
                coverUrl: nil,
                tags: mergedTags.isEmpty ? nil : mergedTags,
                major: major.isEmpty ? nil : major,
                mbti: mbti.isEmpty ? nil : mbti,
                nationality: nationality.isEmpty ? nil : nationality,
                realPhotos: realPhotos.isEmpty ? nil : realPhotos,
                zodiac: zodiac.isEmpty ? nil : zodiac,
                coverUrl: coverUrl.isEmpty ? nil : coverUrl
            )
            let saved = try await ProfileService.upsertProfile(req)
            self.profile = saved
            self.isSaved = true
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // ─── Tag helpers ──────────────────────────────────────────
    func toggleInterest(_ tag: String) {
        if interests.contains(tag) {
            interests.removeAll { $0 == tag }
        } else {
            interests.append(tag)
        }
    }

    func addTag() {
        let trimmed = newTag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !tags.contains(trimmed), tags.count < 10 else { return }
        tags.append(trimmed)
        newTag = ""
    }

    func removeTag(_ tag: String) {
        tags.removeAll { $0 == tag }
    }

    /// 合并 interests + tags → 统一 tags，去重，上限 10
    private func mergeInterestsAndTags() -> [String] {
        var result: [String] = []
        for t in tags {
            if !result.contains(t) && result.count < 10 { result.append(t) }
        }
        for i in interests {
            if !result.contains(i) && result.count < 10 { result.append(i) }
        }
        return result
    }

    // ─── Verification ──────────────────────────────────────────
    func applyVerification() async {
        isLoading = true
        errorMessage = nil
        do {
            let _ = try await MatchingService.applyVerification()
            self.verificationStatus = "pending"
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    var completeness: Int { profile?.profileCompleteness ?? 0 }
}
