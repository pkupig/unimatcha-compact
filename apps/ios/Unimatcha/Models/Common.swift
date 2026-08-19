import Foundation

// MARK: - API envelope
struct APIResponse<T: Codable>: Codable {
    let success: Bool
    let data: T?
    let message: String?
}

/// For endpoints whose payload is just an ack ({message}/{status}/{ok}).
struct GenericResponse: Codable {
    let message: String?
    let status: String?
    let ok: Bool?
}

struct UploadResult: Codable {
    let url: String
    let filename: String?
}

// MARK: - Social links
struct SocialLinks: Codable, Equatable {
    var wechat: String?
    var qq: String?
    var xiaohongshu: String?
    var weibo: String?
    var instagram: String?
}

// MARK: - Public profile (shape driven by SystemConfig public_profile_fields — treat all optional)
struct PublicProfile: Codable, Identifiable, Equatable {
    var id: String { userId ?? UUID().uuidString }
    let userId: String?
    let nickname: String?
    let school: String?
    let grade: String?
    let age: Int?
    let city: String?
    let interests: [String]?
    let bio: String?
    let avatarUrl: String?
    let signature: String?
    let coverUrl: String?
    let tags: [String]?
    let major: String?
    let mbti: String?
    let nationality: String?
    let realPhotos: [String]?
    let verificationStatus: String?
    let zodiac: String?
}

// MARK: - ISO date helpers
enum ISODate {
    static let full: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f
    }()
    static func parse(_ s: String?) -> Date? {
        guard let s = s else { return nil }
        return full.date(from: s) ?? plain.date(from: s)
    }
}

// MARK: - AnyCodable (questionnaire answer values: string / int / double / bool / arrays)
struct AnyCodable: Codable {
    let value: Any
    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let v = try? c.decode(Bool.self) { value = v }
        else if let v = try? c.decode(Int.self) { value = v }
        else if let v = try? c.decode(Double.self) { value = v }
        else if let v = try? c.decode(String.self) { value = v }
        else if let v = try? c.decode([AnyCodable].self) { value = v.map { $0.value } }
        else if let v = try? c.decode([String: AnyCodable].self) { value = v.mapValues { $0.value } }
        else { value = "" }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch value {
        case let v as Bool: try c.encode(v)
        case let v as Int: try c.encode(v)
        case let v as Double: try c.encode(v)
        case let v as String: try c.encode(v)
        case let v as [String]: try c.encode(v)
        case let v as [Int]: try c.encode(v)
        case let v as [Double]: try c.encode(v)
        case let v as [Any]: try c.encode(v.map { AnyCodable($0) })
        default: try c.encodeNil()
        }
    }
}
