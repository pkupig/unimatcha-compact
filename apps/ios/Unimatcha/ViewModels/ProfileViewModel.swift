// Interface outline: implementation bodies removed.
import Foundation
import SwiftUI
    @Published var profile: UserProfile?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isSaved = false
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
    func loadProfile() async
    func saveProfile() async
    func toggleInterest(_ tag: String)
    func addTag()
    func removeTag(_ tag: String)
    func uploadAvatar(_ data: Data) async
    var completeness: Int { profile?.profileCompleteness ?? 0 }
