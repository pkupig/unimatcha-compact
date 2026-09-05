import Foundation
import Combine

// MARK: - Language
//
// Port of apps/h5/src/modules/i18n.js (language half). English is the source language of
// every UI string; Chinese is obtained by an exact whole-string lookup in the `ZH`
// dictionary (`L10n.t`), by a composed ternary (`L10n.pick`), by the placeholder table
// (`L10n.placeholder`) or by the metadata display map (`L10n.metaLabel`). User content is
// never translated — there is no DOM rewrite on iOS, so simply never pass user text
// through these helpers.
//
// The preference is device-level (`UserDefaults` key `cl_lang`, default `en`), survives
// logout / account switches and is never sent to the backend (H5 parity).

enum Lang: String, CaseIterable {
    case en
    case zh
}

/// Non-isolated cache of the current language so that `L10n`/`Formatters` can be read from
/// any context (decoders, background formatting) without hopping to the main actor.
/// `LocaleStore` is the only writer.
enum LangRegistry {
    static let storageKey = "cl_lang"

    static var current: Lang = readPersisted()

    static func readPersisted() -> Lang {
        if let raw = UserDefaults.standard.string(forKey: storageKey), let l = Lang(rawValue: raw) {
            return l
        }
        return .en
    }
}

@MainActor
final class LocaleStore: ObservableObject {
    static let shared = LocaleStore()

    @Published private(set) var lang: Lang

    private init() {
        let persisted = LangRegistry.readPersisted()
        LangRegistry.current = persisted
        lang = persisted
    }

    /// Persists `cl_lang` and publishes. H5 reloads the page; iOS remounts the view tree
    /// (`RootView` uses `.id(locale.lang)`), so nothing else is needed here.
    func set(_ l: Lang) {
        guard l != lang else { return }
        UserDefaults.standard.set(l.rawValue, forKey: LangRegistry.storageKey)
        LangRegistry.current = l
        lang = l
    }

    /// Convenience for the language dialog / legacy `toggleLang()` semantics.
    func toggle() {
        set(lang == .zh ? .en : .zh)
    }
}

// MARK: - L10n

enum L10n {
    /// Current UI language (mirrors `LocaleStore.shared.lang`, readable off the main actor).
    static var lang: Lang { LangRegistry.current }

    static var isZh: Bool { lang == .zh }

    /// Exact-key lookup in the `ZH` dictionary (plus the small shared `EXTRA_ZH` table).
    /// Returns `en` unchanged when the language is English or the key is missing —
    /// identical to H5's whole-text-node match (substrings are never translated).
    static func t(_ en: String) -> String {
        guard isZh else { return en }
        if let zh = L10nTables.zhDictionary[en] { return zh }
        if let zh = L10nTables.extraZhDictionary[en] { return zh }
        return en
    }

    /// Composed / dynamic strings — the H5 `getLang() === 'zh' ? zh : en` ternary.
    static func pick(_ en: String, _ zh: String) -> String {
        isZh ? zh : en
    }

    /// `placeholder` attribute table (`ZH_PLACEHOLDER`). Placeholders not in the table stay
    /// English in zh mode (e.g. `student@campus.edu`).
    static func placeholder(_ en: String) -> String {
        guard isZh else { return en }
        return L10nTables.zhPlaceholderDictionary[en] ?? en
    }

    /// Display-only translation for profile metadata values (school / city / major /
    /// nationality / grade). `META_ZH[v] || ZH[v] || v` in zh, identity in en. The stored
    /// / PUT value is always the English canonical string.
    static func metaLabel(_ value: String?) -> String? {
        guard let v = value, !v.isEmpty else { return value }
        guard isZh else { return v }
        return L10nTables.metaZhDictionary[v] ?? L10nTables.zhDictionary[v] ?? v
    }

    /// Canonical grade display (`Year 1` → 大一 in zh; identity in en). Legacy DB values
    /// (`Freshman`, `Postgraduate`, `Doctorate`) resolve through the same map.
    static func grade(_ value: String) -> String {
        metaLabel(value) ?? value
    }

    // MARK: Strings hard-coded per language by i18n.js itself (§5.8)

    enum LanguageDialog {
        static var title: String { L10n.isZh ? "语言 / Language" : "Language / 语言" }
        static let optionZh = "中文"
        static let optionEn = "English"
        static var cancel: String { L10n.isZh ? "取消" : "Cancel" }
        static var confirm: String { L10n.isZh ? "确定" : "Confirm" }
    }
}

// MARK: - Debug self-check

#if DEBUG
enum L10nSelfCheck {
    /// Returns a list of failed assertions (empty = all green). Intended to be called from
    /// the `-unimatcha-decode-check` launch path; it is not run automatically.
    static func verify() -> [String] {
        var failures: [String] = []
        func expect(_ cond: Bool, _ msg: String) { if !cond { failures.append(msg) } }

        let zh = L10nTables.zhDictionary
        expect(zh["Join Matching Pool"] == "加入匹配池", "ZH[Join Matching Pool]")
        expect(zh["Non-binary"] == "非二元", "ZH[Non-binary]")
        expect(zh["End Relationship"] == "解除关系", "ZH duplicate key resolves")
        expect(L10nTables.zhEntries.count == 333, "ZH entries count \(L10nTables.zhEntries.count) != 333")
        expect(zh.count == 324, "ZH unique keys \(zh.count) != 324")
        expect(L10nTables.zhPlaceholderEntries.count == 27, "ZH_PLACEHOLDER count \(L10nTables.zhPlaceholderEntries.count) != 27")
        expect(L10nTables.metaZhEntries.count == 247, "META_ZH count \(L10nTables.metaZhEntries.count) != 247")
        // META_ZH and ZH share no keys (verified in H5).
        let overlap = Set(L10nTables.metaZhDictionary.keys).intersection(zh.keys)
        expect(overlap.isEmpty, "META_ZH/ZH key overlap: \(overlap)")

        let saved = LangRegistry.current
        defer { LangRegistry.current = saved }

        LangRegistry.current = .en
        expect(L10n.t("Join Matching Pool") == "Join Matching Pool", "t identity in en")
        expect(L10n.metaLabel("University of Warwick") == "University of Warwick", "metaLabel identity in en")
        expect(L10n.grade("Year 1") == "Year 1", "grade identity in en")
        expect(L10n.placeholder("Search posts") == "Search posts", "placeholder identity in en")
        expect(L10n.pick("a", "b") == "a", "pick en")

        LangRegistry.current = .zh
        expect(L10n.t("Join Matching Pool") == "加入匹配池", "t zh")
        expect(L10n.t("3 cells") == "3 cells", "t exact-key only (no substring)")
        expect(L10n.t("Confirm") == "确定", "EXTRA_ZH Confirm")
        expect(L10n.metaLabel("University of Warwick") == "华威大学", "metaLabel zh")
        expect(L10n.metaLabel("Undergraduate") == "本科", "metaLabel ZH fallback")
        expect(L10n.metaLabel("INFP") == "INFP", "metaLabel unknown identity")
        expect(L10n.metaLabel(nil) == nil, "metaLabel nil")
        expect(L10n.grade("Year 1") == "大一", "grade zh")
        expect(L10n.grade("Freshman") == "大一新生", "grade legacy")
        expect(L10n.placeholder("Search posts") == "搜索帖子", "placeholder zh")
        expect(L10n.pick("a", "b") == "b", "pick zh")

        failures.append(contentsOf: Alias.verify())
        failures.append(contentsOf: Formatters.verify())
        failures.append(contentsOf: ContentPages.verify())
        return failures
    }
}
#endif
