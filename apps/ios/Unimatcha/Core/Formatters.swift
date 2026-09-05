import Foundation

// MARK: - Formatters (language-aware ports of the H5 date/time helpers)
//
// square.js `formatPostTime`, chat.js `formatChatStamp` / `formatRemainingShort`,
// match.js `formatCountdown` / `getNextRevealDate` fallback, profile.js ticket lines +
// `ageFromBirthday`, couple.js `fmtTime` + anniversary tile. Every helper that renders
// text keys off `L10n.lang` at call time (H5 parity: there is no server-side language).

enum Formatters {
    // MARK: Calendar / locale helpers

    private static var calendar: Calendar { Calendar.current }   // device time zone, local dates like JS `Date`

    private static let posix = Locale(identifier: "en_US_POSIX")

    private static func fixed(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = posix
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone.current
        f.dateFormat = format
        return f
    }

    private static func pad2(_ v: Int) -> String {
        v < 10 && v >= 0 ? "0\(v)" : String(v)
    }

    private static func hm(_ date: Date) -> String {
        let c = calendar.dateComponents([.hour, .minute], from: date)
        return "\(pad2(c.hour ?? 0)):\(pad2(c.minute ?? 0))"
    }

    private static func startOfDay(_ d: Date) -> Date { calendar.startOfDay(for: d) }

    // MARK: ISO parsing (self-contained so WP-02 stays independent of WP-01's `ISODate`)

    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// Accepts `2026-09-03T14:05:00.000Z`, `2026-09-03T14:05:00Z`, `2026-09-03T14:05:00+01:00`,
    /// `2026-09-03T14:05` (local, like JS) and `2026-09-03` (local midnight, like `+ 'T00:00:00'`).
    static func parseDate(_ s: String?) -> Date? {
        guard let raw = s?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { return nil }
        if let d = isoFractional.date(from: raw) { return d }
        if let d = isoPlain.date(from: raw) { return d }
        let dateOnly = fixed("yyyy-MM-dd")
        let localMinute = fixed("yyyy-MM-dd'T'HH:mm")
        let localSecond = fixed("yyyy-MM-dd'T'HH:mm:ss")
        let localFraction = fixed("yyyy-MM-dd'T'HH:mm:ss.SSS")
        if raw.count == 10, let d = dateOnly.date(from: raw) { return d }
        if let d = localSecond.date(from: raw) { return d }
        if let d = localMinute.date(from: raw) { return d }
        if let d = localFraction.date(from: raw) { return d }
        // "YYYY-MM-DD HH:mm(:ss)" (space separator) — tolerated like most JS engines.
        if let d = fixed("yyyy-MM-dd HH:mm:ss").date(from: raw) { return d }
        if let d = fixed("yyyy-MM-dd HH:mm").date(from: raw) { return d }
        return nil
    }

    // MARK: formatPostTime — relative time

    /// `Just now` / `5M Ago` / `3H Ago` / `2D Ago` / locale date (device locale in en,
    /// zh-CN in zh); zh `刚刚` / `5 分钟前` / `3 小时前` / `2 天前`. Unparseable → "".
    static func relativeTime(_ iso: String) -> String {
        relativeTime(iso, now: Date())
    }

    static func relativeTime(_ iso: String, now: Date) -> String {
        guard let d = parseDate(iso) else { return "" }
        return relativeTime(date: d, now: now)
    }

    static func relativeTime(date d: Date, now: Date = Date()) -> String {
        let zh = L10n.isZh
        let diff = now.timeIntervalSince(d) * 1000   // ms, may be negative (future → "Just now", as in JS)
        if diff < 60_000 { return zh ? "刚刚" : "Just now" }
        if diff < 3_600_000 { let n = Int(diff / 60_000); return zh ? "\(n) 分钟前" : "\(n)M Ago" }
        if diff < 86_400_000 { let n = Int(diff / 3_600_000); return zh ? "\(n) 小时前" : "\(n)H Ago" }
        if diff < 604_800_000 { let n = Int(diff / 86_400_000); return zh ? "\(n) 天前" : "\(n)D Ago" }
        let f = DateFormatter()
        f.locale = zh ? Locale(identifier: "zh_CN") : Locale.current
        f.dateStyle = .short
        f.timeStyle = .none
        return f.string(from: d)
    }

    // MARK: formatChatStamp — chat time separators

    /// `HH:MM` same day | `Yesterday HH:MM` | `M/D HH:MM` ; zh `昨天 HH:MM` | `M月D日 HH:MM`.
    static func chatStamp(_ date: Date) -> String {
        chatStamp(date, now: Date())
    }

    static func chatStamp(_ date: Date, now: Date) -> String {
        let zh = L10n.isZh
        let t = hm(date)
        let dayDiff = Int((startOfDay(now).timeIntervalSince(startOfDay(date)) / 86_400).rounded())
        if dayDiff <= 0 { return t }
        if dayDiff == 1 { return (zh ? "昨天 " : "Yesterday ") + t }
        let c = calendar.dateComponents([.month, .day], from: date)
        let m = c.month ?? 1, d = c.day ?? 1
        let md = zh ? "\(m)月\(d)日" : "\(m)/\(d)"
        return "\(md) \(t)"
    }

    /// chat.js `formatChatStamp(iso)` convenience.
    static func chatStamp(iso: String) -> String {
        guard let d = parseDate(iso) else { return "" }
        return chatStamp(d)
    }

    /// Gap above which the conversation inserts a centred time separator (10 minutes).
    static let chatStampGapMs: Double = 10 * 60_000

    // MARK: formatCountdown — match reveal countdown

    /// `HH:MM:SS` or `Dd HH:MM:SS`; `00:00:00` when the target has passed. Digits are
    /// 2-digit padded; the day count is not padded.
    static func countdown(ms: Double) -> String {
        guard ms > 0, ms.isFinite else { return "00:00:00" }
        let total = Int(ms / 1000)
        let d = total / 86_400
        let h = (total % 86_400) / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        let hms = "\(pad2(h)):\(pad2(m)):\(pad2(s))"
        return d > 0 ? "\(d)d \(hms)" : hms
    }

    /// Split form for the plan page's individual digit cells (d / h / m / s, each padded).
    static func countdownParts(ms: Double) -> (d: String, h: String, m: String, s: String) {
        guard ms > 0, ms.isFinite else { return ("00", "00", "00", "00") }
        let total = Int(ms / 1000)
        return (pad2(total / 86_400), pad2((total % 86_400) / 3600), pad2((total % 3600) / 60), pad2(total % 60))
    }

    // MARK: formatRemainingShort — temp-session badge (chat list)

    /// `Expiring` | `Nm left` (≥1) | `Nh left` (hours rounded UP). English-only in H5;
    /// the chat package localises the zh form itself if it chooses to.
    static func remainingShort(ms: Double) -> String {
        guard ms > 0, ms.isFinite else { return "Expiring" }
        let mins = Int(ms / 60_000)
        if mins < 60 { return "\(max(1, mins))m left" }
        return "\(Int((Double(mins) / 60).rounded(.up)))h left"
    }

    // MARK: Event strip / tickets

    /// `M/D HH:mm` — square event strip and the detail schedule range.
    static func eventStrip(_ date: Date) -> String {
        let c = calendar.dateComponents([.month, .day], from: date)
        return "\(c.month ?? 1)/\(c.day ?? 1) \(hm(date))"
    }

    /// `YYYY-MM-DD HH:mm` — ticket stub line.
    static func ticketDateTime(_ date: Date) -> String {
        "\(ticketDate(date)) \(ticketTime(date))"
    }

    /// `YYYY-MM-DD` — pass card date.
    static func ticketDate(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return "\(c.year ?? 0)-\(pad2(c.month ?? 1))-\(pad2(c.day ?? 1))"
    }

    /// `HH:mm` — pass card time.
    static func ticketTime(_ date: Date) -> String {
        hm(date)
    }

    // MARK: Couple space

    /// couple.js `fmtTime`: device-locale `toLocaleString([], {month:'short', day:'numeric',
    /// hour:'2-digit', minute:'2-digit'})` → `Sep 3, 02:00 PM` on a 12-hour device locale,
    /// `Sep 3, 14:00` on a 24-hour one.
    static func coupleSchedule(_ date: Date) -> String {
        coupleSchedule(date, locale: Locale.current)
    }

    static func coupleSchedule(_ date: Date, locale: Locale) -> String {
        let f = DateFormatter()
        f.locale = locale
        f.calendar = calendar
        f.timeZone = TimeZone.current
        f.dateFormat = uses12Hour(locale) ? "MMM d, hh:mm a" : "MMM d, HH:mm"
        return f.string(from: date)
    }

    private static func uses12Hour(_ locale: Locale) -> Bool {
        let template = DateFormatter.dateFormat(fromTemplate: "j", options: 0, locale: locale) ?? ""
        return template.contains("a")
    }

    /// Anniversary tear-off tile: month = 3-letter English abbreviation upper-cased
    /// (`toLocaleString('en', {month:'short'})`), day 2-digit padded, year as-is.
    static func anniversaryTile(_ date: Date) -> (month: String, day: String, year: String) {
        let mf = fixed("MMM")
        let c = calendar.dateComponents([.year, .day], from: date)
        return (mf.string(from: date).uppercased(), pad2(c.day ?? 1), String(c.year ?? 0))
    }

    /// couple.js date parsing for anniversaries: `String(a.date).slice(0,10) + 'T00:00:00'`.
    static func anniversaryDate(_ raw: String?) -> Date? {
        guard let raw = raw, raw.count >= 10 else { return nil }
        return parseDate(String(raw.prefix(10)))
    }

    // MARK: Age

    /// profile.js `ageFromBirthday`: calendar age from a local `YYYY-MM-DD` string; nil when
    /// the string is empty or unparseable.
    static func ageFrom(birthday: String) -> Int? {
        ageFrom(birthday: birthday, now: Date())
    }

    static func ageFrom(birthday: String, now: Date) -> Int? {
        let t = birthday.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty, t.count >= 10, let b = parseDate(String(t.prefix(10))) else { return nil }
        let bc = calendar.dateComponents([.year, .month, .day], from: b)
        let nc = calendar.dateComponents([.year, .month, .day], from: now)
        guard let by = bc.year, let bm = bc.month, let bd = bc.day,
              let ny = nc.year, let nm = nc.month, let nd = nc.day else { return nil }
        var age = ny - by
        let m = nm - bm
        if m < 0 || (m == 0 && nd < bd) { age -= 1 }
        return age
    }

    /// `YYYY-MM-DD` for a local date (birthday input bounds; profile.js `iso(d)` equivalent
    /// computed in local time rather than UTC so the day never shifts).
    static func localDateString(_ date: Date) -> String {
        ticketDate(date)
    }

    // MARK: Reveal fallback

    /// match.js `getNextRevealDate` fallback: the next Friday 17:00 local; if today is Friday
    /// and it is already ≥17:00, next week's Friday.
    static func nextFriday17Local(from now: Date = Date()) -> Date {
        let cal = calendar
        // JS getDay(): Sunday = 0 … Friday = 5. Apple weekday: Sunday = 1 … Friday = 6.
        let weekday = cal.component(.weekday, from: now) - 1
        var dd = (5 - weekday + 7) % 7
        if dd == 0 && cal.component(.hour, from: now) >= 17 { dd = 7 }
        let day = cal.date(byAdding: .day, value: dd, to: now) ?? now
        var comps = cal.dateComponents([.year, .month, .day], from: day)
        comps.hour = 17
        comps.minute = 0
        comps.second = 0
        return cal.date(from: comps) ?? day
    }

    // MARK: Debug

    #if DEBUG
    static func verify() -> [String] {
        var f: [String] = []
        func expect(_ got: String, _ want: String, _ label: String) {
            if got != want { f.append("\(label): got \(got) want \(want)") }
        }
        let saved = LangRegistry.current
        defer { LangRegistry.current = saved }
        let cal = calendar

        // Fixed reference: 2026-09-03 14:05:00 local (a Thursday).
        var c = DateComponents()
        c.year = 2026; c.month = 9; c.day = 3; c.hour = 14; c.minute = 5; c.second = 0
        let now = cal.date(from: c)!
        let fiveMinAgo = now.addingTimeInterval(-5 * 60)
        let yesterday = cal.date(byAdding: .day, value: -1, to: now)!
        var yc = cal.dateComponents([.year, .month, .day], from: yesterday)
        yc.hour = 14; yc.minute = 3
        let yesterday1403 = cal.date(from: yc)!

        LangRegistry.current = .en
        expect(relativeTime(date: fiveMinAgo, now: now), "5M Ago", "relativeTime en")
        expect(relativeTime(date: now.addingTimeInterval(-30), now: now), "Just now", "relativeTime just now")
        expect(relativeTime(date: now.addingTimeInterval(-3 * 3600), now: now), "3H Ago", "relativeTime hours")
        expect(relativeTime(date: now.addingTimeInterval(-2 * 86_400), now: now), "2D Ago", "relativeTime days")
        expect(chatStamp(yesterday1403, now: now), "Yesterday 14:03", "chatStamp yesterday en")
        expect(chatStamp(now, now: now), "14:05", "chatStamp same day")
        expect(chatStamp(now.addingTimeInterval(-3 * 86_400), now: now),
               "\(cal.component(.month, from: now.addingTimeInterval(-3 * 86_400)))/\(cal.component(.day, from: now.addingTimeInterval(-3 * 86_400))) 14:05",
               "chatStamp M/D en")
        expect(countdown(ms: (1 * 3600 + 2 * 60 + 3) * 1000), "01:02:03", "countdown hms")
        expect(countdown(ms: (86_400 + 2 * 3600 + 3 * 60 + 4) * 1000), "1d 02:03:04", "countdown days")
        expect(countdown(ms: 0), "00:00:00", "countdown zero")
        expect(remainingShort(ms: 0), "Expiring", "remaining expiring")
        expect(remainingShort(ms: 3 * 60_000), "3m left", "remaining minutes")
        expect(remainingShort(ms: 61 * 60_000), "2h left", "remaining hours ceil")
        expect(remainingShort(ms: 20_000), "1m left", "remaining min 1")
        expect(eventStrip(now), "9/3 14:05", "eventStrip")
        expect(ticketDateTime(now), "2026-09-03 14:05", "ticketDateTime")
        expect(ticketDate(now), "2026-09-03", "ticketDate")
        expect(ticketTime(now), "14:05", "ticketTime")
        var sc = c; sc.hour = 14; sc.minute = 0
        let two = cal.date(from: sc)!
        expect(coupleSchedule(two, locale: Locale(identifier: "en_US")), "Sep 3, 02:00 PM", "coupleSchedule en_US")
        let tile = anniversaryTile(now)
        expect(tile.month + "|" + tile.day + "|" + tile.year, "SEP|03|2026", "anniversaryTile")
        expect(String(describing: ageFrom(birthday: "2004-03-15", now: now)), "Optional(22)", "ageFrom")
        expect(String(describing: ageFrom(birthday: "2004-09-04", now: now)), "Optional(21)", "ageFrom before birthday")
        expect(String(describing: ageFrom(birthday: "", now: now)), "nil", "ageFrom empty")
        let fri = nextFriday17Local(from: now)
        expect(String(cal.component(.weekday, from: fri)), "6", "nextFriday weekday")
        expect(String(cal.component(.hour, from: fri)), "17", "nextFriday hour")
        expect(String(cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: fri)).day ?? -1), "1", "nextFriday tomorrow")
        var fc = c; fc.day = 4; fc.hour = 17; fc.minute = 0   // Friday 17:00 → next week
        let fri17 = cal.date(from: fc)!
        expect(String(cal.dateComponents([.day], from: cal.startOfDay(for: fri17), to: cal.startOfDay(for: nextFriday17Local(from: fri17))).day ?? -1), "7", "nextFriday rollover")

        LangRegistry.current = .zh
        expect(relativeTime(date: now.addingTimeInterval(-30), now: now), "刚刚", "relativeTime zh just now")
        expect(relativeTime(date: fiveMinAgo, now: now), "5 分钟前", "relativeTime zh minutes")
        expect(chatStamp(yesterday1403, now: now), "昨天 14:03", "chatStamp yesterday zh")
        expect(chatStamp(now.addingTimeInterval(-3 * 86_400), now: now),
               "\(cal.component(.month, from: now.addingTimeInterval(-3 * 86_400)))月\(cal.component(.day, from: now.addingTimeInterval(-3 * 86_400)))日 14:05",
               "chatStamp M月D日 zh")

        if parseDate("2026-09-03T14:05:00.000Z") == nil { f.append("parseDate fractional") }
        if parseDate("2026-09-03T14:05:00Z") == nil { f.append("parseDate plain") }
        if parseDate("2026-09-03") == nil { f.append("parseDate date-only") }
        if parseDate("2026-09-03T14:05") == nil { f.append("parseDate local minute") }
        if parseDate("garbage") != nil { f.append("parseDate garbage") }
        return f
    }
    #endif
}
