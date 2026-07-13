import Foundation
import SwiftUI

@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var profile: UserProfile?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isSaved = false

    // Form fields
    @Published var nickname = ""
    @Published var school = ""
    @Published var grade = "大一"
    @Published var gender = "female"
    @Published var genderPref = "any"
    @Published var age = 20
    @Published var city = ""
    @Published var interests: [String] = []
    @Published var bio = ""
    @Published var wechat = ""
    @Published var qq = ""
    @Published var xiaohongshu = ""
    @Published var weibo = ""
    @Published var instagram = ""
    @Published var signature = ""
    @Published var tags: [String] = []
    @Published var newTag = ""
    @Published var major = ""
    @Published var mbti = ""
    @Published var nationality = ""
    @Published var realPhotos: [String] = []
    @Published var zodiac = ""
    @Published var coverUrl = ""
    @Published var avatarUrl = ""

    let grades = ["大一", "大二", "大三", "大四", "研一", "研二", "研三", "博士一", "博士二", "博士三", "博士四"]
    let zodiacOptions = ["白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"]
    let genderOptions = [("female", "女"), ("male", "男"), ("non_binary", "非二元"), ("other", "其他")]
    let genderPrefOptions = [("any", "不限"), ("male", "男"), ("female", "女")]
    let presetTags = ["音乐", "旅行", "摄影", "阅读", "运动", "游戏", "美食", "电影", "编程", "艺术", "宠物", "健身",
                      "追剧", "二次元", "户外", "做饭", "咖啡", "酒吧", "桌游", "骑行"]

    func loadProfile() async {
        isLoading = true
        do {
            let p = try await ProfileService.getMyProfile()
            profile = p
            nickname = p.nickname ?? ""; school = p.school ?? ""; grade = p.grade ?? "大一"
            gender = p.gender ?? "female"; genderPref = p.genderPref ?? "any"; age = p.age ?? 20
            city = p.city ?? ""; interests = p.interests ?? []; bio = p.bio ?? ""
            signature = p.signature ?? ""; tags = p.tags ?? []
            major = p.major ?? ""; mbti = p.mbti ?? ""; nationality = p.nationality ?? ""
            realPhotos = p.realPhotos ?? []; zodiac = p.zodiac ?? ""
            coverUrl = p.coverUrl ?? ""; avatarUrl = p.avatarUrl ?? ""
            wechat = p.socialLinks?.wechat ?? ""; qq = p.socialLinks?.qq ?? ""
            xiaohongshu = p.socialLinks?.xiaohongshu ?? ""; weibo = p.socialLinks?.weibo ?? ""
            instagram = p.socialLinks?.instagram ?? ""
        } catch {}
        isLoading = false
    }

    func saveProfile() async {
        guard !nickname.isEmpty, !school.isEmpty, !city.isEmpty else {
            errorMessage = "请填写必要信息（昵称、学校、城市）"; return
        }
        isLoading = true; errorMessage = nil
        do {
            let links = SocialLinks(
                wechat: wechat.isEmpty ? nil : wechat, qq: qq.isEmpty ? nil : qq,
                xiaohongshu: xiaohongshu.isEmpty ? nil : xiaohongshu,
                weibo: weibo.isEmpty ? nil : weibo, instagram: instagram.isEmpty ? nil : instagram)
            let req = UpdateProfileRequest(
                nickname: nickname, school: school, grade: grade, gender: gender, genderPref: genderPref,
                age: age, city: city, interests: interests, wishGifts: nil,
                bio: bio.isEmpty ? nil : bio, avatarUrl: avatarUrl.isEmpty ? nil : avatarUrl,
                socialLinks: links, signature: signature.isEmpty ? nil : signature,
                coverUrl: coverUrl.isEmpty ? nil : coverUrl, tags: tags.isEmpty ? nil : tags,
                major: major.isEmpty ? nil : major, mbti: mbti.isEmpty ? nil : mbti,
                nationality: nationality.isEmpty ? nil : nationality,
                realPhotos: realPhotos.isEmpty ? nil : realPhotos, zodiac: zodiac.isEmpty ? nil : zodiac)
            profile = try await ProfileService.updateProfile(req)
            isSaved = true
        } catch let error as APIError { errorMessage = error.errorDescription }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    func toggleInterest(_ tag: String) {
        if interests.contains(tag) { interests.removeAll { $0 == tag } } else { interests.append(tag) }
    }
    func addTag() {
        let t = newTag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, !tags.contains(t), tags.count < 10 else { return }
        tags.append(t); newTag = ""
    }
    func removeTag(_ tag: String) { tags.removeAll { $0 == tag } }

    /// Upload picked image data and set as avatar.
    func uploadAvatar(_ data: Data) async {
        do { avatarUrl = try await UploadService.upload(data) }
        catch { errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription }
    }

    var completeness: Int { profile?.profileCompleteness ?? 0 }
}
