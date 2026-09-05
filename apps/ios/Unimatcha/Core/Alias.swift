import SwiftUI

// MARK: - Anonymous alias (bit-identical to apps/h5/src/modules/i18n.js)
//
// The backend sends only `aliasSeed` (uint32, per-post HMAC output) plus an English
// `nickname` fallback. Name, emoji and pastel background are derived on the client:
//
//   n   = UInt32(truncatingIfNeeded: seed)     // JS `Number(seed) >>> 0`
//   adj = n % 16
//   ani = (n >> 8) % 16                        // animal index == emoji index
//   bg  = (n >> 16) % 16
//   en  = ADJ_EN[adj] + " " + ANI_EN[ani]
//   zh  = ADJ_ZH[adj] + ANI_ZH[ani]            // no space
//
// Same seed → same animal, emoji and background in both languages. Seeds differ across
// posts for the same person by design — never try to correlate. The pastel table is the
// one place outside Theme.swift where literal hex is allowed (OWNERSHIP rule 4).

enum Alias {
    static let adjEN = ["Curious", "Quiet", "Brave", "Gentle", "Witty", "Clever", "Mellow", "Swift", "Cozy", "Bold", "Sunny", "Lucky", "Calm", "Eager", "Noble", "Jolly"]
    static let aniEN = ["Otter", "Fox", "Sparrow", "Koala", "Panda", "Lynx", "Heron", "Robin", "Wren", "Bear", "Finch", "Hare", "Seal", "Crane", "Marten", "Quokka"]
    static let adjZH = ["好奇的", "安静的", "勇敢的", "温柔的", "机灵的", "聪明的", "慵懒的", "敏捷的", "暖心的", "大胆的", "开朗的", "幸运的", "淡定的", "热心的", "优雅的", "欢快的"]
    static let aniZH = ["水獭", "狐狸", "麻雀", "考拉", "熊猫", "山猫", "白鹭", "知更鸟", "云雀", "小熊", "金翅雀", "野兔", "海豹", "仙鹤", "松貂", "小袋鼠"]
    /// Emoji index == animal index → the avatar always shows the animal in the name.
    static let emojis = ["🦦", "🦊", "🐦", "🐨", "🐼", "🐆", "🦩", "🐤", "🕊️", "🐻", "🦜", "🐰", "🦭", "🦢", "🦡", "🦘"]
    /// `ALIAS_BG` pastel palette (fixed list; never randomise per render).
    static let backgroundHex = ["#FDE68A", "#BFDBFE", "#FBCFE8", "#BBF7D0", "#DDD6FE", "#FED7AA", "#A5F3FC", "#E9D5FF", "#FEF08A", "#C7D2FE", "#FECACA", "#D9F99D", "#99F6E4", "#F5D0FE", "#BAE6FD", "#FDBA74"]

    static let fallbackName = "Anonymous"

    // MARK: Index derivation

    static func adjectiveIndex(_ n: UInt32) -> Int { Int(n % 16) }
    static func animalIndex(_ n: UInt32) -> Int { Int((n >> 8) % 16) }
    static func emojiIndex(_ n: UInt32) -> Int { Int((n >> 8) % 16) }
    static func backgroundIndex(_ n: UInt32) -> Int { Int((n >> 16) % 16) }

    /// `Number(seed) >>> 0` for the value shapes the API may deliver (number or numeric string).
    static func seed(from any: Any?) -> UInt32? {
        switch any {
        case let u as UInt32: return u
        case let i as Int: return UInt32(truncatingIfNeeded: i)
        case let i as Int64: return UInt32(truncatingIfNeeded: i)
        case let u as UInt: return UInt32(truncatingIfNeeded: u)
        case let d as Double:
            guard d.isFinite else { return nil }
            return UInt32(truncatingIfNeeded: Int64(d))
        case let s as String:
            let t = s.trimmingCharacters(in: .whitespaces)
            if let i = Int64(t) { return UInt32(truncatingIfNeeded: i) }
            if let d = Double(t), d.isFinite { return UInt32(truncatingIfNeeded: Int64(d)) }
            return nil
        default: return nil
        }
    }

    // MARK: Public surface (PLAN §B.3)

    /// en "Cozy Heron" / zh "暖心的白鹭" (follows the current language); `nil` seed →
    /// `fallback` (the server's English `anonymousAuthor.nickname`) or "Anonymous".
    static func name(seed: UInt32?, fallback: String? = nil) -> String {
        guard let seed = seed else {
            if let f = fallback, !f.isEmpty { return f }
            return fallbackName
        }
        return name(seed: seed, lang: L10n.lang)
    }

    static func name(seed: UInt32, lang: Lang) -> String {
        let a = adjectiveIndex(seed)
        let b = animalIndex(seed)
        switch lang {
        case .zh: return adjZH[a] + aniZH[b]
        case .en: return adjEN[a] + " " + aniEN[b]
        }
    }

    /// `EMOJI[(n>>8)%16]`
    static func emoji(seed: UInt32) -> String {
        emojis[emojiIndex(seed)]
    }

    /// `BG[(n>>16)%16]`
    static func background(seed: UInt32) -> Color {
        background(index: backgroundIndex(seed))
    }

    static func background(index: Int) -> Color {
        let i = ((index % backgroundHex.count) + backgroundHex.count) % backgroundHex.count
        return Color(hex: backgroundHex[i])
    }

    /// Emoji font size for an avatar box: H5 `emojiSizeFor` = box × 0.62 (8/19 lesson: a
    /// glyph the size of its box overflows).
    static func emojiFontSize(forBox size: CGFloat) -> CGFloat {
        (size * 0.62).rounded()
    }

    // MARK: Debug

    #if DEBUG
    /// Unit-verifies the index formula with seed 0x00010203 in both languages.
    static func verify() -> [String] {
        var f: [String] = []
        let s: UInt32 = 0x0001_0203
        // n % 16 = 0x203 % 16 = 3 ; (n>>8) % 16 = 0x102 % 16 = 2 ; (n>>16) % 16 = 1
        if adjectiveIndex(s) != 3 { f.append("alias adj index") }
        if animalIndex(s) != 2 { f.append("alias animal index") }
        if emojiIndex(s) != 2 { f.append("alias emoji index") }
        if backgroundIndex(s) != 1 { f.append("alias bg index") }
        if name(seed: s, lang: .en) != "Gentle Sparrow" { f.append("alias en name \(name(seed: s, lang: .en))") }
        if name(seed: s, lang: .zh) != "温柔的麻雀" { f.append("alias zh name \(name(seed: s, lang: .zh))") }
        if emoji(seed: s) != "🐦" { f.append("alias emoji") }
        if backgroundHex[backgroundIndex(s)] != "#BFDBFE" { f.append("alias bg hex") }
        if name(seed: nil, fallback: "Cozy Heron") != "Cozy Heron" { f.append("alias fallback nickname") }
        if name(seed: nil, fallback: nil) != "Anonymous" { f.append("alias fallback Anonymous") }
        if seed(from: "66051") != s { f.append("alias seed from string") }
        if seed(from: 4_294_967_296 + 66051) != s { f.append("alias seed >>> 0 wrap") }
        if emojiFontSize(forBox: 16) != 10 { f.append("alias emoji size 16→10") }
        if emojiFontSize(forBox: 32) != 20 { f.append("alias emoji size 32→20") }
        if [adjEN, aniEN, adjZH, aniZH, emojis, backgroundHex].contains(where: { $0.count != 16 }) { f.append("alias table length") }
        return f
    }
    #endif
}
