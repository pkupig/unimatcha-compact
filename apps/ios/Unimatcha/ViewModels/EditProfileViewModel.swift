import SwiftUI
import Combine

// MARK: - Edit Profile (h5-profile.md §1.3, §2 "Edit Profile", §3, gotchas 2–6; api-auth §4.2 edit variant)
//
// Open pre-fills every control from `SessionStore.currentUser.profile`, then loads the five
// metadata lists (session cache, only non-empty results). Avatar / cover / portfolio changes
// are persisted the moment the picker returns (own endpoints); text, selects, interests and
// gifts are only sent on Save (`PUT /profiles/me`, A18 payload rules below). Cancel discards
// the deferred edits only.
//
// The payload builder is a non-isolated pure function so `ProfileFixtures.verify()` can pin the
// A18 rules without touching the main actor.

// MARK: Copy (EN-only H5 toasts → `L10n.pick`, D3)

enum EditProfileCopy {
    static var nicknameRequired: String { L10n.pick("Nickname required", "请填写昵称") }
    static var ageRange: String { L10n.pick("Unimatcha is for students aged 16–40", "Unimatcha 面向 16–40 岁的学生") }
    static var profileSaved: String { L10n.pick("Profile saved!", "资料已保存！") }
    static var failedPrefix: String { L10n.t("Failed: ") }
    static var optionsFailed: String { L10n.pick("Failed to load options. Please try again.", "选项加载失败，请重试。") }
    static var avatarUpdated: String { L10n.pick("Avatar updated", "头像已更新") }
    static var avatarFailedPrefix: String { L10n.pick("Avatar upload failed: ", "头像上传失败：") }
    static var coverUpdated: String { L10n.pick("Cover updated", "封面已更新") }
    static var coverFailedPrefix: String { L10n.pick("Cover upload failed: ", "封面上传失败：") }
    static var photoFailedPrefix: String { L10n.pick("Photo upload failed: ", "照片上传失败：") }
    static var deleteFailedPrefix: String { L10n.pick("Delete failed: ", "删除失败：") }
    static var maxPhotos: String { L10n.pick("Maximum 6 photos", "最多 6 张照片") }
    static var maxInterests: String { L10n.pick("Up to 8 interests", "最多 8 个兴趣") }
    static var addPhoto: String { L10n.pick("Add Photo", "添加照片") }
    static var addChip: String { L10n.pick("+ Add", "+ 添加") }
    static var addInterestTitle: String { L10n.pick("Add Interest", "添加兴趣") }
    /// `#edit-age-hint`: en "Age 21", zh "21 岁".
    static func ageHint(_ n: Int) -> String { L10n.pick("Age \(n)", "\(n) 岁") }
    static func giftPlaceholder(_ i: Int) -> String { L10n.pick("Gift \(i)", "礼物 \(i)") }
    static var studentIdPlaceholder: String { L10n.placeholder("e.g. 2312345") }
    static var birthdayPlaceholder: String { "YYYY-MM-DD" }
}

// MARK: Payload rules (A18)

enum EditPayloadOutcome: Equatable {
    case ok(ProfileUpdate)
    case error(String)

    var payload: ProfileUpdate? {
        if case .ok(let p) = self { return p }
        return nil
    }

    var errorMessage: String? {
        if case .error(let m) = self { return m }
        return nil
    }
}

enum EditProfilePayload {
    /// Everything the Save button reads. `readyLists` = the select lists that loaded (non-empty);
    /// a select key is only sent when its list is ready (never wipes a value the user could not see).
    struct Input {
        var nickname = ""
        var givenName = ""
        var familyName = ""
        var bio = ""
        var signature = ""
        var gender: String? = nil
        var birthday: Date? = nil
        var school: String? = nil
        var grade: String? = nil
        var city: String? = nil
        var major: String? = nil
        var mbti: String? = nil
        var nationality: String? = nil
        var studentId = ""
        var interests: [String] = []
        var gifts: [String] = []
        var readyLists: Set<MetadataKind> = Set(MetadataKind.allCases)
    }

    /// `saveEditProfile()`: validation first (nickname → age), then the exact `PUT /profiles/me` body:
    /// always `nickname`, `bio`, `signature`, `interests`, `wishGifts`, `grade`, `studentId`;
    /// `school` / `city` / `major` / `mbti` / `nationality` whenever their list loaded (`""` clears);
    /// name keys only if at least one name is non-empty; `gender` only if chosen; `birthday` + `age`
    /// only if set (and 16–40); never `coverUrl` / `realPhotos` / `avatarUrl`.
    static func build(_ i: Input, now: Date = Date()) -> EditPayloadOutcome {
        func trim(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

        let nickname = trim(i.nickname)
        if nickname.isEmpty { return .error(EditProfileCopy.nicknameRequired) }

        var age: Int? = nil
        var birthdayString: String? = nil
        if let b = i.birthday {
            let a = ProfileRules.age(for: b, now: now)
            guard ProfileRules.isValidAge(a) else { return .error(EditProfileCopy.ageRange) }
            age = a
            birthdayString = ISODate.day(b)
        }

        var u = ProfileUpdate()
        u.nickname = nickname
        // H5 trims both before sending (`value.trim()`), then the server caps nothing — the client does.
        u.bio = String(trim(i.bio).prefix(ProfileRules.bioMax))
        u.signature = String(trim(i.signature).prefix(ProfileRules.signatureMax))
        u.interests = i.interests
        u.wishGifts = Array(i.gifts.map(trim).filter { !$0.isEmpty }.prefix(ProfileRules.wishGiftsMax))
        u.grade = GradeOptions.normalize(i.grade) ?? ""
        u.studentId = String(trim(i.studentId).prefix(ProfileRules.studentIdMax))

        if i.readyLists.contains(.universities) { u.school = trim(i.school ?? "") }
        if i.readyLists.contains(.cities) { u.city = trim(i.city ?? "") }
        if i.readyLists.contains(.majors) { u.major = trim(i.major ?? "") }
        if i.readyLists.contains(.mbtiTypes) { u.mbti = trim(i.mbti ?? "") }
        if i.readyLists.contains(.nationalities) { u.nationality = trim(i.nationality ?? "") }

        let given = trim(i.givenName)
        let family = trim(i.familyName)
        if !given.isEmpty || !family.isEmpty {
            u.givenName = given
            u.familyName = family
            u.realName = [given, family].filter { !$0.isEmpty }.joined(separator: " ")
        }

        if let g = i.gender?.trimmingCharacters(in: .whitespacesAndNewlines), !g.isEmpty {
            u.gender = g
        }

        if let b = birthdayString, let a = age {
            u.birthday = b
            u.age = a
        }
        return .ok(u)
    }
}

// MARK: Gender select (`#edit-gender`: api-auth §6.1 enum, dictionary key `Non-binary` — PLAN §B.3)
//
// Nonisolated so the pure fixture checks can read the table without hopping to the main actor.

enum ProfileGenderOptions {
    /// Stored value → dictionary key (EN label). Order = the H5 select order.
    static let all: [(value: String, key: String)] = [
        ("male", "Male"), ("female", "Female"), ("non_binary", "Non-binary"), ("other", "Other"),
    ]
    static var values: [String] { all.map { $0.value } }

    static func label(_ value: String) -> String {
        guard let o = all.first(where: { $0.value == value }) else { return value }
        return L10n.t(o.key)
    }
}

// MARK: - View model

@MainActor
final class EditProfileViewModel: ObservableObject {
    static var genderOptions: [(value: String, key: String)] { ProfileGenderOptions.all }
    static var genderValues: [String] { ProfileGenderOptions.values }

    static func genderLabel(_ value: String) -> String { ProfileGenderOptions.label(value) }

    // Deferred edits (sent on Save)
    @Published var nickname = ""
    @Published var givenName = ""
    @Published var familyName = ""
    @Published var bio = "" {
        didSet { if bio.count > ProfileRules.bioMax { bio = String(bio.prefix(ProfileRules.bioMax)) } }
    }
    @Published var signature = "" {
        didSet { if signature.count > ProfileRules.signatureMax { signature = String(signature.prefix(ProfileRules.signatureMax)) } }
    }
    @Published var gender: String? = nil
    @Published var birthday: Date? = nil
    @Published var school: String? = nil
    @Published var grade: String? = nil
    @Published var city: String? = nil
    @Published var major: String? = nil
    @Published var mbti: String? = nil
    @Published var nationality: String? = nil
    @Published var studentId = "" {
        didSet { if studentId.count > ProfileRules.studentIdMax { studentId = String(studentId.prefix(ProfileRules.studentIdMax)) } }
    }
    @Published private(set) var interests: [String] = []
    @Published var gifts: [String] = Array(repeating: "", count: ProfileRules.wishGiftsMax)

    // Immediate (own endpoints)
    @Published private(set) var avatarUrl: String? = nil
    @Published private(set) var coverUrl: String? = nil
    @Published private(set) var realPhotos: [String] = []

    // Metadata lists
    @Published private(set) var universities: [String] = []
    @Published private(set) var cities: [String] = []
    @Published private(set) var majors: [String] = []
    @Published private(set) var mbtiTypes: [String] = []
    @Published private(set) var nationalities: [String] = []
    @Published private(set) var metadataLoading = false
    @Published private(set) var readyLists: Set<MetadataKind> = []

    // Busy flags
    @Published private(set) var isUploadingAvatar = false
    @Published private(set) var isUploadingCover = false
    @Published private(set) var isUploadingPhoto = false
    @Published private(set) var isRemovingPhoto = false
    @Published private(set) var isSaving = false

    private var opened = false
    private var metadataTask: Task<Void, Never>?
    private var bag = Set<AnyCancellable>()

    init() {
        // Rule 6: the overlay is dismissed on logout / 401, but drop the draft (which is another
        // user's profile data) as soon as the session resets, whatever the dismissal order is.
        NotificationCenter.default.publisher(for: .sessionDidReset)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in self?.clearOnSessionReset() }
            }
            .store(in: &bag)
    }

    /// Drops every draft field and cancels the metadata load (`cleanupUserState` parity).
    private func clearOnSessionReset() {
        metadataTask?.cancel()
        metadataTask = nil
        opened = false
        prefill(from: nil)
        readyLists = []
        universities = []
        cities = []
        majors = []
        mbtiTypes = []
        nationalities = []
        metadataLoading = false
    }

    // MARK: Derived

    var bioCount: Int { bio.count }
    var signatureCount: Int { signature.count }
    var birthdayRange: ClosedRange<Date> { ProfileRules.birthdayRange() }

    /// `#edit-age-hint` live from the date; empty when no birthday.
    var ageHint: String {
        guard let b = birthday, let a = ProfileRules.age(for: b) else { return "" }
        return EditProfileCopy.ageHint(a)
    }

    var gradeOptions: [String] { GradeOptions.options(including: grade) }

    /// Loaded list, with the stored value injected at the top when the API list does not contain it
    /// (H5 §3: "if a stored value isn't in the list it's inserted at the top so it stays selectable"
    /// — legacy / free-text values must survive an edit round-trip).
    func options(for kind: MetadataKind) -> [String] {
        let list: [String]
        switch kind {
        case .universities: list = universities
        case .cities: list = cities
        case .majors: list = majors
        case .mbtiTypes: list = mbtiTypes
        case .nationalities: list = nationalities
        }
        let stored = (selection(for: kind) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !stored.isEmpty, !list.contains(stored) else { return list }
        return [stored] + list
    }

    /// Current value of the select bound to `kind`.
    func selection(for kind: MetadataKind) -> String? {
        switch kind {
        case .universities: return school
        case .cities: return city
        case .majors: return major
        case .mbtiTypes: return mbti
        case .nationalities: return nationality
        }
    }

    /// A select is usable only once its list loaded (non-empty); otherwise it shows the stored
    /// value read-only and Save leaves that key untouched (gotcha 3 guard).
    func listReady(_ kind: MetadataKind) -> Bool { readyLists.contains(kind) }

    var photoSlotsFull: Bool { realPhotos.count >= ProfileRules.realPhotosMax }

    // MARK: Open (`openEditProfile`)

    func onOpen() {
        guard !opened else { return }
        opened = true
        prefill(from: SessionStore.shared.currentUser?.profile)
        loadMetadata()
    }

    private func prefill(from profile: UserProfile?) {
        let p = profile ?? UserProfile()
        nickname = p.nickname ?? ""
        givenName = p.givenName ?? ""
        familyName = p.familyName ?? ""
        bio = String((p.bio ?? "").prefix(ProfileRules.bioMax))
        signature = String((p.signature ?? "").prefix(ProfileRules.signatureMax))
        gender = Self.genderValues.contains(p.gender ?? "") ? p.gender : nil
        if let b = p.birthday, b.count >= 10, let d = ISODate.parse(String(b.prefix(10))) {
            birthday = d
        } else {
            birthday = nil
        }
        func nonEmpty(_ s: String?) -> String? {
            let t = (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? nil : t
        }
        school = nonEmpty(p.school)
        grade = GradeOptions.normalize(p.grade)
        city = nonEmpty(p.city)
        major = nonEmpty(p.major)
        mbti = nonEmpty(p.mbti)
        nationality = nonEmpty(p.nationality)
        studentId = String((p.studentId ?? "").prefix(ProfileRules.studentIdMax))
        interests = Array(p.interests.prefix(ProfileRules.interestCap))
        var g = (p.wishGifts ?? []).prefix(ProfileRules.wishGiftsMax).map { $0 }
        while g.count < ProfileRules.wishGiftsMax { g.append("") }
        gifts = g
        avatarUrl = nonEmpty(p.avatarUrl)
        coverUrl = nonEmpty(p.coverUrl)
        realPhotos = Array((p.realPhotos ?? []).prefix(ProfileRules.realPhotosMax))
    }

    /// Five parallel `GET /metadata/*` (session-cached); one toast when any list failed.
    func loadMetadata() {
        metadataTask?.cancel()
        metadataLoading = true
        metadataTask = Task { [weak self] in
            let bundle = await MetadataService.shared.fetchAll()
            guard let self = self, !Task.isCancelled else { return }
            self.universities = bundle[.universities]
            self.cities = bundle[.cities]
            self.majors = bundle[.majors]
            self.mbtiTypes = bundle[.mbtiTypes]
            self.nationalities = bundle[.nationalities]
            var ready = Set<MetadataKind>()
            for kind in MetadataKind.allCases where bundle.succeeded(kind) { ready.insert(kind) }
            self.readyLists = ready
            self.metadataLoading = false
            if bundle.anyFailed {
                ToastCenter.shared.show(EditProfileCopy.optionsFailed)
            }
        }
    }

    // MARK: Avatar (`handleAvatarFile(event, 'edit')` — immediate)

    func avatarPicked(_ photo: PickedPhoto) async {
        guard !isUploadingAvatar else { return }
        isUploadingAvatar = true
        defer { isUploadingAvatar = false }
        do {
            let url = try await ProfileService.uploadAvatar(jpegData: photo.jpeg)
            avatarUrl = url
            SessionStore.shared.updateProfile { $0.avatarUrl = url }
            ToastCenter.shared.show(EditProfileCopy.avatarUpdated)
        } catch {
            ToastCenter.shared.show(EditProfileCopy.avatarFailedPrefix + APIError.message(of: error))
        }
    }

    // MARK: Cover (`handleCoverFile` — upload then `PUT /profiles/me {coverUrl}`, immediate)

    func coverPicked(_ photo: PickedPhoto) async {
        guard !isUploadingCover else { return }
        isUploadingCover = true
        defer { isUploadingCover = false }
        do {
            let url = try await UploadService.upload(jpegData: photo.jpeg)
            var u = ProfileUpdate()
            u.coverUrl = url
            try await ProfileService.update(u)
            coverUrl = url
            SessionStore.shared.updateProfile { $0.coverUrl = url }
            ToastCenter.shared.show(EditProfileCopy.coverUpdated)
        } catch {
            ToastCenter.shared.show(EditProfileCopy.coverFailedPrefix + APIError.message(of: error))
        }
    }

    // MARK: Portfolio (`triggerProfilePhotoUpload` / `removeProfilePhoto` — immediate, serialised)

    /// Returns false when the tap must be ignored (an upload is in flight) or the grid is full.
    func canPickPhoto() -> Bool {
        guard !isUploadingPhoto else { return false }
        if photoSlotsFull {
            ToastCenter.shared.show(EditProfileCopy.maxPhotos)
            return false
        }
        return true
    }

    func photoPicked(_ photo: PickedPhoto) async {
        guard !isUploadingPhoto else { return }
        if photoSlotsFull {
            ToastCenter.shared.show(EditProfileCopy.maxPhotos)
            return
        }
        isUploadingPhoto = true
        defer { isUploadingPhoto = false }
        do {
            let url = try await UploadService.upload(jpegData: photo.jpeg)
            let before = realPhotos.count
            let result = try await ProfileService.addRealPhoto(url: url)
            let list = Array(result.realPhotos.prefix(ProfileRules.realPhotosMax))
            realPhotos = list
            SessionStore.shared.updateProfile { $0.realPhotos = list }
            if list.count <= before {
                // 201 at the cap: the server returned the unchanged list with an explanatory message (S8).
                ToastCenter.shared.show(result.message ?? EditProfileCopy.maxPhotos)
            }
        } catch {
            ToastCenter.shared.show(EditProfileCopy.photoFailedPrefix + APIError.message(of: error))
        }
    }

    func removePhoto(at index: Int) async {
        guard realPhotos.indices.contains(index), !isRemovingPhoto else { return }
        isRemovingPhoto = true
        defer { isRemovingPhoto = false }
        var remaining = realPhotos
        remaining.remove(at: index)
        do {
            var u = ProfileUpdate()
            u.realPhotos = remaining
            try await ProfileService.update(u)
            realPhotos = remaining
            SessionStore.shared.updateProfile { $0.realPhotos = remaining }
        } catch {
            ToastCenter.shared.show(EditProfileCopy.deleteFailedPrefix + APIError.message(of: error))
        }
    }

    // MARK: Interests (`openAddInterest` / `addInterestValue` / `removeEditTag`)

    /// "+ Add" chip: at the cap → toast and no popup; otherwise the caller presents `AddInterestCard`.
    func canOpenAddInterest() -> Bool {
        if interests.count >= ProfileRules.interestCap {
            ToastCenter.shared.show(EditProfileCopy.maxInterests)
            return false
        }
        return true
    }

    /// `addInterestValue`: trims; empty → ignored (popup stays open); at the cap → toast (popup stays
    /// open); duplicates are not re-added but the popup closes. Returns whether the popup should close.
    @discardableResult
    func submitInterest(_ raw: String) -> Bool {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return false }
        if interests.count >= ProfileRules.interestCap {
            ToastCenter.shared.show(EditProfileCopy.maxInterests)
            return false
        }
        if !interests.contains(t) {
            interests.append(t)
        }
        return true
    }

    func removeInterest(at index: Int) {
        guard interests.indices.contains(index) else { return }
        interests.remove(at: index)
    }

    // MARK: Save (`saveEditProfile`)

    var payloadInput: EditProfilePayload.Input {
        EditProfilePayload.Input(nickname: nickname,
                                 givenName: givenName,
                                 familyName: familyName,
                                 bio: bio,
                                 signature: signature,
                                 gender: gender,
                                 birthday: birthday,
                                 school: school,
                                 grade: grade,
                                 city: city,
                                 major: major,
                                 mbti: mbti,
                                 nationality: nationality,
                                 studentId: studentId,
                                 interests: interests,
                                 gifts: gifts,
                                 readyLists: readyLists)
    }

    /// Validation first (button untouched on failure), then busy → PUT → merge → toast → close.
    /// Returns true when the overlay should close.
    @discardableResult
    func save() async -> Bool {
        let payload: ProfileUpdate
        switch EditProfilePayload.build(payloadInput) {
        case .error(let msg):
            ToastCenter.shared.show(msg)
            return false
        case .ok(let p):
            payload = p
        }
        guard !isSaving else { return false }
        isSaving = true
        defer { isSaving = false }
        do {
            let row = try await ProfileService.update(payload)
            let patch = payload.patch
            SessionStore.shared.updateProfile { p in
                p.merge(patch)
                p.merge(row: row)
            }
            ToastCenter.shared.show(EditProfileCopy.profileSaved)
            return true
        } catch {
            ToastCenter.shared.show(EditProfileCopy.failedPrefix + APIError.message(of: error))
            return false
        }
    }
}
