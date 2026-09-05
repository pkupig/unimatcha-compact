import Foundation

// MARK: - Questionnaire models (api-matching-questionnaire.md §5–§6, h5-questionnaire.md §3) — WP-05
//
// `GET /questionnaire/active?type=` returns the Prisma `QuestionnaireVersion` with enabled
// questions ordered by `order`, each with options ordered by `order`. Only `id`, `type`,
// `title/titleEn`, `isRequired` and `options[].value/label/labelEn` drive the UI; the
// matching-engine metadata (`code/semantics/hardness/weight/target`) is passed through.
// Every decode is lenient: the admin can republish at any time, so a missing optional
// column must never break the page.

enum QuestionType: String, Codable, Equatable {
    case singleChoice = "SINGLE_CHOICE"
    case multipleChoice = "MULTIPLE_CHOICE"
    case scale = "SCALE"
    case text = "TEXT"

    /// Unknown / missing → `.text` (legacy iOS behaviour, keeps the page rendering).
    init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? "TEXT"
        self = QuestionType(rawValue: raw.uppercased()) ?? .text
    }
}

/// `QuestionOption { id, questionId, label (zh), labelEn?, value (stable snake_case), order }`.
/// `value` is what gets submitted — never the label or the option id (gotcha 2).
struct QuestionOption: Decodable, Identifiable, Equatable {
    var id: String
    var questionId: String?
    var label: String
    var labelEn: String?
    var value: String
    var order: Int?

    init(id: String, questionId: String? = nil, label: String, labelEn: String? = nil, value: String, order: Int? = nil) {
        self.id = id
        self.questionId = questionId
        self.label = label
        self.labelEn = labelEn
        self.value = value
        self.order = order
    }

    private enum CodingKeys: String, CodingKey {
        case id, questionId, label, labelEn, value, order, text
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let optionId = c.lenient(String.self, .id)
        var raw = c.lenient(String.self, .value) ?? ""
        if raw.isEmpty, let n = c.lenientInt(.value) { raw = String(n) }
        // H5: `String(o.value || o.id || '')`
        value = raw.isEmpty ? (optionId ?? "") : raw
        id = optionId ?? value
        questionId = c.lenient(String.self, .questionId)
        // legacy `text` key never occurs on v2 but the H5 falls back to it
        label = c.lenient(String.self, .label) ?? c.lenient(String.self, .text) ?? ""
        let en = c.lenient(String.self, .labelEn)
        labelEn = (en?.isEmpty ?? true) ? nil : en
        order = c.lenientInt(.order)
    }

    /// zh → `label || value`; en → `labelEn || label || value` (h5-questionnaire §1.3 / §5).
    /// Server content: never passed through the dictionary.
    var displayLabel: String {
        if L10n.isZh {
            return label.isEmpty ? value : label
        }
        if let en = labelEn, !en.isEmpty { return en }
        return label.isEmpty ? value : label
    }
}

struct Question: Decodable, Identifiable, Equatable {
    var id: String
    var questionnaireId: String?
    var type: QuestionType
    var title: String
    var titleEn: String?
    var description: String?
    var isRequired: Bool
    var isEnabled: Bool
    var order: Int?
    var group: String?
    var code: String?
    var semantics: String?
    var hardness: String?
    var weight: Double?
    var target: String?
    var options: [QuestionOption]

    init(id: String,
         questionnaireId: String? = nil,
         type: QuestionType,
         title: String,
         titleEn: String? = nil,
         description: String? = nil,
         isRequired: Bool = true,
         isEnabled: Bool = true,
         order: Int? = nil,
         group: String? = nil,
         code: String? = nil,
         semantics: String? = nil,
         hardness: String? = nil,
         weight: Double? = nil,
         target: String? = nil,
         options: [QuestionOption] = []) {
        self.id = id
        self.questionnaireId = questionnaireId
        self.type = type
        self.title = title
        self.titleEn = titleEn
        self.description = description
        self.isRequired = isRequired
        self.isEnabled = isEnabled
        self.order = order
        self.group = group
        self.code = code
        self.semantics = semantics
        self.hardness = hardness
        self.weight = weight
        self.target = target
        self.options = options
    }

    private enum CodingKeys: String, CodingKey {
        case id, questionnaireId, type, title, titleEn, description, isRequired, isEnabled, order, group,
             code, semantics, hardness, weight, target, options
        case text, question   // legacy title keys (never present on v2; H5 keeps the fallback)
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        questionnaireId = c.lenient(String.self, .questionnaireId)
        type = c.lenient(QuestionType.self, .type) ?? .text
        title = c.lenient(String.self, .title)
            ?? c.lenient(String.self, .text)
            ?? c.lenient(String.self, .question)
            ?? ""
        let en = c.lenient(String.self, .titleEn)
        titleEn = (en?.isEmpty ?? true) ? nil : en
        description = c.lenient(String.self, .description)
        isRequired = c.lenientBool(.isRequired) ?? true
        isEnabled = c.lenientBool(.isEnabled) ?? true
        order = c.lenientInt(.order)
        group = c.lenient(String.self, .group)
        code = c.lenient(String.self, .code)
        semantics = c.lenient(String.self, .semantics)
        hardness = c.lenient(String.self, .hardness)
        weight = c.lenientDouble(.weight)
        target = c.lenient(String.self, .target)
        options = c.lenient([QuestionOption].self, .options) ?? []
    }

    /// zh → `title`; en → `titleEn || title` (chosen at render time, h5-questionnaire §1.3).
    var displayTitle: String {
        if L10n.isZh { return title }
        if let en = titleEn, !en.isEmpty { return en }
        return title
    }

    /// TEXT questions carry the "Optional — leave blank to skip" hint when `isRequired === false`.
    var isOptionalText: Bool { type == .text && !isRequired }
}

struct QuestionnaireVersion: Decodable, Identifiable, Equatable {
    var id: String
    var version: Int?
    var type: String?            // "ROMANTIC" | "FRIEND"
    var title: String?
    var description: String?
    var isActive: Bool?
    var publishedAt: String?
    var createdAt: String?
    var updatedAt: String?
    var questions: [Question]

    init(id: String,
         version: Int? = nil,
         type: String? = nil,
         title: String? = nil,
         description: String? = nil,
         isActive: Bool? = nil,
         publishedAt: String? = nil,
         createdAt: String? = nil,
         updatedAt: String? = nil,
         questions: [Question]) {
        self.id = id
        self.version = version
        self.type = type
        self.title = title
        self.description = description
        self.isActive = isActive
        self.publishedAt = publishedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.questions = questions
    }

    private enum CodingKeys: String, CodingKey {
        case id, version, type, title, description, isActive, publishedAt, createdAt, updatedAt, questions
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        version = c.lenientInt(.version)
        type = c.lenient(String.self, .type)
        title = c.lenient(String.self, .title)
        description = c.lenient(String.self, .description)
        isActive = c.lenientBool(.isActive)
        publishedAt = c.lenient(String.self, .publishedAt)
        createdAt = c.lenient(String.self, .createdAt)
        updatedAt = c.lenient(String.self, .updatedAt)
        questions = c.lenient([Question].self, .questions) ?? []
    }

    /// The match mode this version belongs to (`type` ROMANTIC / FRIEND), nil when unknown.
    var mode: MatchMode? {
        switch (type ?? "").uppercased() {
        case "ROMANTIC": return .romantic
        case "FRIEND": return .friend
        default: return nil
        }
    }
}

// MARK: - Answer values (gotcha 2 / api §6.1 — send exactly these shapes)

/// scale = Int 1…5 · single = option.value · multi = [value] in selection order · text = raw string.
enum AnswerValue: Codable, Equatable {
    case scale(Int)
    case single(String)
    case multi([String])
    case text(String)

    /// H5 blank rule (`undefined | null | '' | []`); iOS additionally trims TEXT (gotcha 3:
    /// the server trims strings, so a whitespace-only answer must not count as answered).
    var isBlank: Bool {
        switch self {
        case .scale: return false
        case .single(let s): return s.isEmpty
        case .multi(let a): return a.isEmpty
        case .text(let s): return s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    /// The value as it goes on the wire (TEXT trimmed).
    var wireValue: AnswerValue {
        if case .text(let s) = self {
            return .text(s.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return self
    }

    var textValue: String? {
        switch self {
        case .text(let s), .single(let s): return s
        case .multi(let a): return a.joined(separator: ", ")
        case .scale(let n): return String(n)
        }
    }

    var scaleValue: Int? {
        switch self {
        case .scale(let n): return n
        case .single(let s), .text(let s): return Int(s.trimmingCharacters(in: .whitespacesAndNewlines))
        case .multi: return nil
        }
    }

    var multiValues: [String] {
        switch self {
        case .multi(let a): return a
        case .single(let s), .text(let s): return s.isEmpty ? [] : [s]
        case .scale(let n): return [String(n)]
        }
    }

    // Codable — single JSON value

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let n = try? c.decode(Int.self) {
            self = .scale(n)
        } else if let d = try? c.decode(Double.self) {
            self = .scale(Int(d))
        } else if let s = try? c.decode(String.self) {
            self = .single(s)
        } else if let a = try? c.decode([String].self) {
            self = .multi(a)
        } else if let a = try? c.decode([AnyCodable].self) {
            self = .multi(a.compactMap { $0.stringValue })
        } else if c.decodeNil() {
            self = .text("")
        } else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "AnswerValue: unsupported JSON")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .scale(let n): try c.encode(n)
        case .single(let s): try c.encode(s)
        case .multi(let a): try c.encode(a)
        case .text(let s): try c.encode(s)
        }
    }

    /// Re-types a loosely decoded value for the question it answers (hydration from `/answers/mine`).
    func normalized(for type: QuestionType) -> AnswerValue? {
        switch type {
        case .scale:
            guard let n = scaleValue else { return nil }
            return .scale(n)
        case .singleChoice:
            switch self {
            case .single(let s), .text(let s): return .single(s)
            case .multi(let a): return a.first.map { .single($0) }
            case .scale(let n): return .single(String(n))
            }
        case .multipleChoice:
            return .multi(multiValues)
        case .text:
            return textValue.map { .text($0) }
        }
    }

    /// Builds a value from the untyped `value` column of `/answers/mine`.
    static func from(json: AnyCodable?, type: QuestionType) -> AnswerValue? {
        guard let j = json, !j.isNull else { return nil }
        let loose: AnswerValue
        if let i = j.value as? Int {
            loose = .scale(i)
        } else if let d = j.value as? Double {
            loose = .scale(Int(d))
        } else if let s = j.stringValue {
            loose = .single(s)
        } else if let arr = j.stringArrayValue {
            loose = .multi(arr)
        } else if let b = j.boolValue {
            loose = .single(b ? "true" : "false")
        } else {
            return nil
        }
        return loose.normalized(for: type)
    }
}

// MARK: - `GET /answers/mine?versionId=` rows (api §6.2)

struct MyAnswer: Decodable, Identifiable, Equatable {
    struct QuestionRef: Decodable, Equatable {
        var title: String?
        var type: QuestionType?

        init(title: String? = nil, type: QuestionType? = nil) {
            self.title = title
            self.type = type
        }

        private enum CodingKeys: String, CodingKey { case title, type }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            title = c.lenient(String.self, .title)
            type = c.lenient(QuestionType.self, .type)
        }
    }

    struct VersionRef: Decodable, Equatable {
        var version: Int?
        var title: String?

        init(version: Int? = nil, title: String? = nil) {
            self.version = version
            self.title = title
        }

        private enum CodingKeys: String, CodingKey { case version, title }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            version = c.lenientInt(.version)
            title = c.lenient(String.self, .title)
        }
    }

    var id: String
    var userId: String?
    var questionnaireVersionId: String?
    var questionId: String
    var value: AnyCodable?
    var submittedAt: String?
    var updatedAt: String?
    var question: QuestionRef?
    var questionnaireVersion: VersionRef?

    init(id: String,
         userId: String? = nil,
         questionnaireVersionId: String? = nil,
         questionId: String,
         value: AnyCodable?,
         submittedAt: String? = nil,
         updatedAt: String? = nil,
         question: QuestionRef? = nil,
         questionnaireVersion: VersionRef? = nil) {
        self.id = id
        self.userId = userId
        self.questionnaireVersionId = questionnaireVersionId
        self.questionId = questionId
        self.value = value
        self.submittedAt = submittedAt
        self.updatedAt = updatedAt
        self.question = question
        self.questionnaireVersion = questionnaireVersion
    }

    private enum CodingKeys: String, CodingKey {
        case id, userId, questionnaireVersionId, questionId, value, submittedAt, updatedAt, question, questionnaireVersion
        case question_id
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // H5 tolerates `question_id`
        let qid = c.lenient(String.self, .questionId) ?? c.lenient(String.self, .question_id) ?? ""
        questionId = qid
        id = c.lenient(String.self, .id) ?? qid
        userId = c.lenient(String.self, .userId)
        questionnaireVersionId = c.lenient(String.self, .questionnaireVersionId)
        value = c.lenient(AnyCodable.self, .value)
        submittedAt = c.lenient(String.self, .submittedAt)
        updatedAt = c.lenient(String.self, .updatedAt)
        question = c.lenient(QuestionRef.self, .question)
        questionnaireVersion = c.lenient(VersionRef.self, .questionnaireVersion)
    }

    static func == (lhs: MyAnswer, rhs: MyAnswer) -> Bool {
        lhs.id == rhs.id && lhs.questionId == rhs.questionId && lhs.questionnaireVersionId == rhs.questionnaireVersionId
    }
}

// MARK: - `GET /questionnaire/completion` (api §5.2)

struct ModeCompletion: Decodable, Equatable {
    var completed: Bool
    /// Absent when that mode has no active version.
    var versionId: String?

    init(completed: Bool, versionId: String? = nil) {
        self.completed = completed
        self.versionId = versionId
    }

    private enum CodingKeys: String, CodingKey { case completed, versionId }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        completed = c.lenientBool(.completed) ?? false
        versionId = c.lenient(String.self, .versionId)
    }
}

struct QuestionnaireCompletion: Decodable, Equatable {
    var romantic: ModeCompletion?
    var friend: ModeCompletion?

    init(romantic: ModeCompletion? = nil, friend: ModeCompletion? = nil) {
        self.romantic = romantic
        self.friend = friend
    }

    private enum CodingKeys: String, CodingKey { case romantic, friend }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        romantic = c.lenient(ModeCompletion.self, .romantic)
        friend = c.lenient(ModeCompletion.self, .friend)
    }

    func status(_ mode: MatchMode) -> ModeCompletion? {
        mode == .romantic ? romantic : friend
    }

    /// `completed` only (H5 uses nothing else); a missing bucket counts as not completed.
    func isCompleted(_ mode: MatchMode) -> Bool {
        status(mode)?.completed ?? false
    }
}

// MARK: - `POST /answers` (api §6.1)

struct AnswerItem: Encodable, Equatable {
    var questionId: String
    var value: AnswerValue

    init(questionId: String, value: AnswerValue) {
        self.questionId = questionId
        self.value = value
    }
}

struct SubmitAnswersRequest: Encodable {
    var questionnaireVersionId: String
    var answers: [AnswerItem]

    init(questionnaireVersionId: String, answers: [AnswerItem]) {
        self.questionnaireVersionId = questionnaireVersionId
        self.answers = answers
    }
}

struct SubmitAnswersResult: Decodable, Equatable {
    var message: String?
    var answeredCount: Int?
    var questionnaireVersion: Int?

    init(message: String? = nil, answeredCount: Int? = nil, questionnaireVersion: Int? = nil) {
        self.message = message
        self.answeredCount = answeredCount
        self.questionnaireVersion = questionnaireVersion
    }

    private enum CodingKeys: String, CodingKey { case message, answeredCount, questionnaireVersion }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        message = c.lenient(String.self, .message)
        answeredCount = c.lenientInt(.answeredCount)
        questionnaireVersion = c.lenientInt(.questionnaireVersion)
    }
}
