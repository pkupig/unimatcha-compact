import Foundation
import Combine
import UIKit

// MARK: - SetupCopy (package-local strings; zh through `L10n.pick`, D3)

enum SetupCopy {
    static var enterNickname: String { L10n.pick("Please enter a nickname", "请输入昵称") }
    static var enterRealName: String { L10n.pick("Please enter your real name", "请输入真实姓名") }
    static var enterRealNameFull: String { L10n.pick("Please enter your real name (given + family name)", "请输入真实姓名（名 + 姓）") }
    static var selectGender: String { L10n.pick("Please select your gender", "请选择性别") }
    static var selectBirthday: String { L10n.pick("Please select your birthday", "请选择生日") }
    static var ageRange: String { L10n.pick("Unimatcha is for students aged 16–40", "Unimatcha 面向 16–40 岁的学生") }
    static var optionsFailed: String { L10n.pick("Failed to load options. Please try again.", "选项加载失败，请重试。") }
    static var saveFailedPrefix: String { L10n.pick("Save failed: ", "保存失败：") }
    static var avatarUpdated: String { L10n.pick("Avatar updated", "头像已更新") }
    static var avatarFailedPrefix: String { L10n.pick("Avatar upload failed: ", "头像上传失败：") }
    static var men: String { L10n.pick("Men", "男生") }
    static var women: String { L10n.pick("Women", "女生") }
    static var anyone: String { L10n.pick("Anyone", "不限") }
    static var bioPlaceholder: String { L10n.pick("Briefly describe your academic pursuits...", "简单介绍一下你的学术方向…") }
    static func bioCounter(_ n: Int) -> String { L10n.pick("\(n) / \(ProfileRules.bioMax) characters", "\(n) / \(ProfileRules.bioMax) 字") }
    static var birthdayPlaceholder: String { "YYYY-MM-DD" }
    static var done: String { L10n.pick("Done", "完成") }
}

// MARK: - ProfileSetupViewModel (h5-auth §1.4, §2.4; h5-profile §1.1, §2; api-auth §4.2 setup variant)

@MainActor
final class ProfileSetupViewModel: ObservableObject {
    enum Phase: Equatable { case wizard, rest }

    static let stepCount = 4
    static let suggestions = ["Linguistics", "Philosophy", "Digital Art", "Architecture"]
    /// `data-gender` values with their dictionary keys (iOS uses `Non-binary`, PLAN §B.3).
    static let genderOptions: [(value: String, key: String)] = [
        ("male", "Male"), ("female", "Female"), ("non_binary", "Non-binary"), ("other", "Other"),
    ]
    static let genderPrefValues = ["male", "female", "any"]

    // Phase / wizard
    @Published private(set) var phase: Phase = .wizard
    @Published private(set) var step = 0
    /// Bumped when the page should scroll to its top (wizard → rest).
    @Published private(set) var scrollToTopSignal = 0

    // Required (wizard)
    @Published var nickname = ""
    @Published var givenName = ""
    @Published var familyName = ""
    @Published var gender: String? = nil
    @Published var birthday: Date? = nil

    // Optional (rest)
    @Published private(set) var avatarUrl: String? = nil
    @Published var school: String? = nil
    @Published var city: String? = nil
    @Published var major: String? = nil
    @Published var mbti: String? = nil
    @Published var nationality: String? = nil
    @Published var genderPref: String = "any"          // "Anyone" pre-selected
    @Published var grade: String? = nil
    @Published var interests: [String] = []
    @Published var tagInput = ""
    @Published var bio = "" {
        didSet {
            if bio.count > ProfileRules.bioMax { bio = String(bio.prefix(ProfileRules.bioMax)) }
        }
    }

    // Metadata lists (empty until loaded / when the fetch failed)
    @Published private(set) var universities: [String] = []
    @Published private(set) var cities: [String] = []
    @Published private(set) var majors: [String] = []
    @Published private(set) var mbtiTypes: [String] = []
    @Published private(set) var nationalities: [String] = []
    @Published private(set) var metadataLoading = false

    // Busy flags (iOS improvement over H5's unguarded buttons)
    @Published private(set) var isUploadingAvatar = false
    @Published private(set) var isSaving = false

    private var metadataTask: Task<Void, Never>?
    private var entered = false
    private var bag = Set<AnyCancellable>()

    init() {
        NotificationCenter.default.publisher(for: .sessionDidReset)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in self?.resetForNewSession() }
            }
            .store(in: &bag)
    }

    // MARK: Derived

    var stepLabel: String { "\(step + 1) / \(ProfileSetupViewModel.stepCount)" }
    var progressFraction: CGFloat { CGFloat(step + 1) / CGFloat(ProfileSetupViewModel.stepCount) }
    var isLastStep: Bool { step == ProfileSetupViewModel.stepCount - 1 }
    var birthdayRange: ClosedRange<Date> { ProfileRules.birthdayRange() }
    var birthdayText: String? { birthday.map { ISODate.day($0) } }
    var bioCount: Int { bio.count }
    var gradeOptions: [String] { GradeOptions.options(including: grade) }

    // MARK: Lifecycle (`initProfileSetupPage`)

    /// Pre-fills from `currentUser.profile` (text fields only when still empty) and loads the five
    /// metadata lists in parallel. Idempotent per mount; a concurrent metadata load is not duplicated.
    func onEnter() {
        if !entered {
            entered = true
            prefill(from: SessionStore.shared.currentUser?.profile)
        }
        loadMetadata()
    }

    private func prefill(from profile: UserProfile?) {
        guard let p = profile else { return }
        if interests.isEmpty, !p.interests.isEmpty {
            interests = Array(p.interests.prefix(ProfileRules.interestCap))
        }
        if nickname.isEmpty, let v = p.nickname { nickname = v }
        if givenName.isEmpty, let v = p.givenName { givenName = v }
        if familyName.isEmpty, let v = p.familyName { familyName = v }
        if bio.isEmpty, let v = p.bio { bio = String(v.prefix(ProfileRules.bioMax)) }
        if birthday == nil, let b = p.birthday, let d = ISODate.parse(b) { birthday = d }
        if gender == nil, let g = p.gender, ProfileSetupViewModel.genderOptions.contains(where: { $0.value == g }) { gender = g }
        if let gp = p.genderPref, ProfileSetupViewModel.genderPrefValues.contains(gp) { genderPref = gp }
        if grade == nil { grade = GradeOptions.normalize(p.grade) }
        func nonEmpty(_ s: String?) -> String? {
            let t = (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? nil : t
        }
        if school == nil { school = nonEmpty(p.school) }
        if city == nil { city = nonEmpty(p.city) }
        if major == nil { major = nonEmpty(p.major) }
        if mbti == nil { mbti = nonEmpty(p.mbti) }
        if nationality == nil { nationality = nonEmpty(p.nationality) }
        if avatarUrl == nil { avatarUrl = nonEmpty(p.avatarUrl) }
    }

    /// Five parallel `/metadata/*` fetches; any failure → one toast (lists that loaded still fill).
    func loadMetadata() {
        if metadataTask != nil { return }
        metadataLoading = true
        metadataTask = Task { [weak self] in
            let bundle = await MetadataService.shared.fetchAll()
            // A logout while the five lists are in flight cancels them (MetadataService.reset);
            // that must not paint empty selects or toast "Failed to load options".
            guard let self = self, !Task.isCancelled else { return }
            self.universities = bundle[.universities]
            self.cities = bundle[.cities]
            self.majors = bundle[.majors]
            self.mbtiTypes = bundle[.mbtiTypes]
            self.nationalities = bundle[.nationalities]
            self.metadataLoading = false
            self.metadataTask = nil
            if bundle.anyFailed {
                ToastCenter.shared.show(SetupCopy.optionsFailed)
            }
        }
    }

    private func resetForNewSession() {
        metadataTask?.cancel()
        metadataTask = nil
        metadataLoading = false
        entered = false
        phase = .wizard
        step = 0
        nickname = ""; givenName = ""; familyName = ""
        gender = nil; birthday = nil; avatarUrl = nil
        school = nil; city = nil; major = nil; mbti = nil; nationality = nil
        genderPref = "any"; grade = nil
        interests = []; tagInput = ""; bio = ""
        universities = []; cities = []; majors = []; mbtiTypes = []; nationalities = []
        isUploadingAvatar = false; isSaving = false
    }

    // MARK: Wizard (`setupWizardNext` / `setupWizardPrev`)

    /// Validation toast for the current step; nil when the step passes.
    nonisolated static func wizardError(step: Int, nickname: String, givenName: String, familyName: String,
                            gender: String?, birthday: Date?, now: Date = Date()) -> String? {
        switch step {
        case 0:
            return nickname.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? SetupCopy.enterNickname : nil
        case 1:
            let g = givenName.trimmingCharacters(in: .whitespacesAndNewlines)
            let f = familyName.trimmingCharacters(in: .whitespacesAndNewlines)
            return (g.isEmpty || f.isEmpty) ? SetupCopy.enterRealName : nil
        case 2:
            return (gender ?? "").isEmpty ? SetupCopy.selectGender : nil
        default:
            guard let b = birthday else { return SetupCopy.selectBirthday }
            guard let age = ProfileRules.age(for: b, now: now) else { return SetupCopy.selectBirthday }
            return ProfileRules.isValidAge(age) ? nil : SetupCopy.ageRange
        }
    }

    func next() {
        if let err = ProfileSetupViewModel.wizardError(step: step, nickname: nickname, givenName: givenName,
                                                       familyName: familyName, gender: gender, birthday: birthday) {
            ToastCenter.shared.show(err)
            return
        }
        if isLastStep {
            phase = .rest
            scrollToTopSignal += 1
        } else {
            step += 1
        }
    }

    func back() {
        guard step > 0 else { return }
        step -= 1
    }

    func selectGender(_ value: String) { gender = value }
    func selectGenderPref(_ value: String) { genderPref = value }

    // MARK: Interests (`addSetupTagValue` / `addSetupTag` / `removeSetupTag`)

    /// Trims; ignores empty, duplicates (case-sensitive) and anything beyond the cap of 8 (silently).
    @discardableResult
    func addInterest(_ raw: String) -> Bool {
        let tag = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !tag.isEmpty, !interests.contains(tag), interests.count < ProfileRules.interestCap else { return false }
        interests.append(tag)
        return true
    }

    func addInterestFromInput() {
        let value = tagInput
        tagInput = ""
        addInterest(value)
    }

    func removeInterest(at index: Int) {
        guard interests.indices.contains(index) else { return }
        interests.remove(at: index)
    }

    // MARK: Avatar (`handleAvatarFile(event, 'setup')` — immediate, independent of Confirm)

    func avatarPicked(_ photo: PickedPhoto) async {
        guard !isUploadingAvatar else { return }
        isUploadingAvatar = true
        defer { isUploadingAvatar = false }
        do {
            let url = try await ProfileService.uploadAvatar(jpegData: photo.jpeg)
            avatarUrl = url
            SessionStore.shared.updateProfile { $0.avatarUrl = url }
            ToastCenter.shared.show(SetupCopy.avatarUpdated)
        } catch {
            ToastCenter.shared.show(SetupCopy.avatarFailedPrefix + APIError.message(of: error))
        }
    }

    // MARK: Confirm Profile (`saveProfile`)

    /// Re-validation toast in H5 order (the hidden wizard values are the data source); nil = ok.
    nonisolated static func saveError(nickname: String, givenName: String, familyName: String, gender: String?,
                          birthday: Date?, now: Date = Date()) -> String? {
        if nickname.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return SetupCopy.enterNickname }
        let g = givenName.trimmingCharacters(in: .whitespacesAndNewlines)
        let f = familyName.trimmingCharacters(in: .whitespacesAndNewlines)
        if g.isEmpty || f.isEmpty { return SetupCopy.enterRealNameFull }
        if (gender ?? "").isEmpty { return SetupCopy.selectGender }
        guard let b = birthday, let age = ProfileRules.age(for: b, now: now) else { return SetupCopy.selectBirthday }
        if !ProfileRules.isValidAge(age) { return SetupCopy.ageRange }
        return nil
    }

    /// The exact `PUT /profiles/me` setup payload (api-auth §4.2). Nil when validation fails.
    func buildPayload(now: Date = Date()) -> ProfileUpdate? {
        guard ProfileSetupViewModel.saveError(nickname: nickname, givenName: givenName, familyName: familyName,
                                              gender: gender, birthday: birthday, now: now) == nil,
              let b = birthday, let g = gender, let age = ProfileRules.age(for: b, now: now) else { return nil }
        return ProfileUpdate.setup(nickname: nickname,
                                   givenName: givenName,
                                   familyName: familyName,
                                   school: school,
                                   grade: grade,
                                   gender: g,
                                   genderPref: genderPref,
                                   age: age,
                                   birthday: ISODate.day(b),
                                   bio: bio,
                                   interests: interests,
                                   city: city,
                                   major: major,
                                   mbti: mbti,
                                   nationality: nationality)
    }

    func save() async {
        if let err = ProfileSetupViewModel.saveError(nickname: nickname, givenName: givenName, familyName: familyName,
                                                     gender: gender, birthday: birthday) {
            ToastCenter.shared.show(err)
            return
        }
        guard let payload = buildPayload() else {
            ToastCenter.shared.show(SetupCopy.selectBirthday)
            return
        }
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            let row = try await ProfileService.update(payload)
            let session = SessionStore.shared
            // H5: merge the sent payload into the local profile; the returned row is authoritative on top.
            var merged = session.currentUser?.profile ?? UserProfile()
            merged.merge(payload.patch)
            merged.merge(row: row)
            if let a = avatarUrl, !a.isEmpty, (merged.avatarUrl ?? "").isEmpty { merged.avatarUrl = a }
            session.markProfileSaved(merged)
            // `switchTab('match')` → `switchHomeView('chat')` → `renderQuestionnaireCards()`
            let actions = AppActions.shared
            actions.switchTab(.match)
            actions.switchHomeView(.chat)
            actions.showQuestionnaireCards()
        } catch {
            ToastCenter.shared.show(SetupCopy.saveFailedPrefix + APIError.message(of: error))
        }
    }
}
