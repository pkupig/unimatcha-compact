import Foundation

/// Backend error `message` is a plain string for service-thrown exceptions and an array of
/// strings for class-validator failures (`api-auth §0.3` S1). Decodes both; `text` joins with "\n".
enum StringOrArray: Decodable, Equatable {
    case one(String)
    case many([String])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) {
            self = .one(s)
        } else if let a = try? c.decode([String].self) {
            self = .many(a)
        } else if c.decodeNil() {
            self = .one("")
        } else {
            // Last resort: anything else (number / object) → stringified description.
            let any = try c.decode(AnyCodable.self)
            self = .one(String(describing: any.value))
        }
    }

    /// Joined user-facing text ("\n" between validation messages).
    var text: String {
        switch self {
        case .one(let s): return s
        case .many(let a): return a.joined(separator: "\n")
        }
    }

    var isEmpty: Bool { text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}
