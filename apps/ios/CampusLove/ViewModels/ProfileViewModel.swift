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
    
    let grades = ["大一", "大二", "大三", "大四", "研一", "研二", "研三"]
    let genderOptions = [("female", "女"), ("male", "男"), ("non_binary", "非二元"), ("other", "其他")]
    let genderPrefOptions = [("any", "不限"), ("male", "男"), ("female", "女")]
    let interestTags = ["音乐", "旅行", "摄影", "阅读", "运动", "游戏", "美食", "电影", "编程", "艺术", "宠物", "健身"]
    
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
        } catch {}
        isLoading = false
    }
    
    func saveProfile() async {
        guard !nickname.isEmpty, !school.isEmpty, !city.isEmpty else {
            errorMessage = "请填写必要信息"
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            let req = CreateProfileRequest(
                nickname: nickname, school: school, grade: grade,
                gender: gender, genderPref: genderPref, age: age,
                city: city, interests: interests,
                bio: bio.isEmpty ? nil : bio, avatarUrl: nil
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
    
    func toggleInterest(_ tag: String) {
        if interests.contains(tag) {
            interests.removeAll { $0 == tag }
        } else {
            interests.append(tag)
        }
    }
    
    var completeness: Int { profile?.profileCompleteness ?? 0 }
}
