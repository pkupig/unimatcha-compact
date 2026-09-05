import SwiftUI
import UIKit
import Combine

// MARK: - Theme (port of the H5 design tokens — h5-design-system.md §0–§6, PLAN §B.4)
//
// "Ivory & Ink" + neon. Light theme is an off-white page (#f9f9f9) with near-black text,
// ONE accent (neon green #CCFF00 — always with black text/icons on it) and ONE danger/leave
// accent (neon pink #FF2EC4, outline/text only except the danger confirm button). The dark
// theme is warm black (#121110, R ≥ G ≥ B). Neon/pink never change in dark. Every colour in
// the app resolves through `Theme.C`; radii through `Theme.R`; fonts through `Theme.font` /
// `Theme.mono`; Material icon names through `Theme.Icon.sf`.
//
// The app never follows the system appearance (D10): `ThemeStore` persists `cl_theme`
// (`light` default) and `RootView` applies `.preferredColorScheme`; all tokens are dynamic
// `UIColor` providers so they flip with that override.

// MARK: - Color helpers

extension Color {
    /// `#RGB`, `#RRGGBB` or `#RRGGBBAA` (leading `#` optional). Invalid input → clear.
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        var v: UInt64 = 0
        guard Scanner(string: s).scanHexInt64(&v) else {
            self = .clear
            return
        }
        let r, g, b, a: Double
        switch s.count {
        case 6:
            r = Double((v >> 16) & 0xFF) / 255
            g = Double((v >> 8) & 0xFF) / 255
            b = Double(v & 0xFF) / 255
            a = 1
        case 8:
            r = Double((v >> 24) & 0xFF) / 255
            g = Double((v >> 16) & 0xFF) / 255
            b = Double((v >> 8) & 0xFF) / 255
            a = Double(v & 0xFF) / 255
        default:
            self = .clear
            return
        }
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }

    /// Dynamic colour (UIColor trait provider) from two hex strings.
    init(light: String, dark: String) {
        self.init(UIColor { tc in
            tc.userInterfaceStyle == .dark ? UIColor(Color(hex: dark)) : UIColor(Color(hex: light))
        })
    }

    /// Dynamic colour from two RGBA tuples (0…255 channels, 0…1 alpha).
    init(lightRGBA: (Double, Double, Double, Double), darkRGBA: (Double, Double, Double, Double)) {
        func ui(_ t: (Double, Double, Double, Double)) -> UIColor {
            UIColor(red: t.0 / 255, green: t.1 / 255, blue: t.2 / 255, alpha: t.3)
        }
        self.init(UIColor { tc in
            tc.userInterfaceStyle == .dark ? ui(darkRGBA) : ui(lightRGBA)
        })
    }
}

// MARK: - Font probe (D1: custom faces are optional; system SF otherwise)

enum FontProbe {
    private static var cache: [String: Bool] = [:]
    private static let lock = NSLock()

    /// `UIFont(name:)` probe, cached per PostScript name.
    static func exists(_ name: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        if let hit = cache[name] { return hit }
        let ok = UIFont(name: name, size: 12) != nil
        cache[name] = ok
        return ok
    }

    /// `PlusJakartaSans-<Weight>` if bundled (weights 200–800; 900 renders as ExtraBold).
    static func jakarta(_ weight: Font.Weight) -> String? {
        let name = "PlusJakartaSans-" + jakartaSuffix(weight)
        return exists(name) ? name : nil
    }

    /// `JetBrainsMono-<Weight>` if bundled (H5 only loads Regular; Bold/Medium are probed too).
    static func jetBrains(_ weight: Font.Weight) -> String? {
        let name = "JetBrainsMono-" + monoSuffix(weight)
        if exists(name) { return name }
        let regular = "JetBrainsMono-Regular"
        return exists(regular) ? regular : nil
    }

    private static func jakartaSuffix(_ w: Font.Weight) -> String {
        switch w {
        case .ultraLight, .thin: return "ExtraLight"
        case .light: return "Light"
        case .regular: return "Regular"
        case .medium: return "Medium"
        case .semibold: return "SemiBold"
        case .bold: return "Bold"
        case .heavy, .black: return "ExtraBold"
        default: return "Regular"
        }
    }

    private static func monoSuffix(_ w: Font.Weight) -> String {
        switch w {
        case .ultraLight, .thin, .light: return "Light"
        case .medium: return "Medium"
        case .semibold: return "SemiBold"
        case .bold, .heavy, .black: return "Bold"
        default: return "Regular"
        }
    }
}

// MARK: - ThemeStore

@MainActor
final class ThemeStore: ObservableObject {
    static let shared = ThemeStore()
    static let storageKey = "cl_theme"

    @Published private(set) var isDark: Bool

    private init() {
        isDark = UserDefaults.standard.string(forKey: ThemeStore.storageKey) == "dark"
    }

    /// H5 `toggleDarkMode()`: flips, persists, applies immediately (no reload, no animation).
    /// Callers show the toast (`Dark mode on` / `Light mode on`, localised via `L10n.t`).
    func toggle() {
        set(dark: !isDark)
    }

    func set(dark: Bool) {
        UserDefaults.standard.set(dark ? "dark" : "light", forKey: ThemeStore.storageKey)
        if isDark != dark { isDark = dark }
    }

    var colorScheme: ColorScheme { isDark ? .dark : .light }
}

// MARK: - Theme

enum Theme {
    // MARK: Colours

    enum C {
        // Accents (unchanged in dark)
        static let neon = Color(hex: "#CCFF00")
        static let neonPink = Color(hex: "#FF2EC4")
        static let error = Color(hex: "#ba1a1a")

        // Grounds
        static let surface = Color(light: "#f9f9f9", dark: "#121110")          // page / tab / overlay ground
        static let card = Color(light: "#ffffff", dark: "#1c1b19")             // surface-container-lowest, bg-white
        static let containerLow = Color(light: "#f3f3f3", dark: "#23211f")     // soft-fill inputs
        static let container = Color(light: "#eeeeee", dark: "#292724")
        static let containerHigh = Color(light: "#e8e8e8", dark: "#2f2d2a")
        static let containerHighest = Color(light: "#e2e2e2", dark: "#363431")
        static let surfaceDim = Color(light: "#dadada", dark: "#121110")

        // Text
        static let onSurface = Color(light: "#1b1b1b", dark: "#eceae6")        // primary text
        static let onSurfaceVariant = Color(light: "#474747", dark: "#aaa8a3") // secondary text
        static let outline = Color(light: "#777777", dark: "#8c8a85")          // tertiary text
        // H5 resolves `outline-variant` three different ways in dark mode (main.css:208-211):
        // as a BORDER -> #343230, as TEXT -> #8c8a85, and as a BACKGROUND/FILL it has no dark rule
        // at all, so it stays #c6c6c6. Collapsing them into one token made every placeholder,
        // chevron and switch knob unreadable in dark (1.1-1.5:1). Keep the three separate.
        static let outlineVariant = Color(light: "#c6c6c6", dark: "#343230")       // borders / strokes
        static let outlineVariantText = Color(light: "#c6c6c6", dark: "#8c8a85")   // placeholders, chevrons, eyebrows
        static let outlineVariantFill = Color(light: "#c6c6c6", dark: "#c6c6c6")   // knobs, fills, energy cells
        static let primary = Color(light: "#000000", dark: "#eceae6")          // ink: titles, black buttons
        static let onPrimary = Color(light: "#ffffff", dark: "#121110")        // text on `primary` blocks (.btn-cta)
        static let borderStrong = Color(light: "#000000", dark: "#4b4945")     // border-black
        static let neutral400 = Color(light: "#a3a3a3", dark: "#8c8a85")       // card author name, chat time
        static let neutral500 = Color(light: "#737373", dark: "#aaa8a3")       // chat "+" button, ad body
        static let stone400 = Color(light: "#a8a29e", dark: "#8c8a85")         // sheet close X, min/max labels
        static let stone500 = Color(light: "#78716c", dark: "#aaa8a3")         // enhance sub-copy
        static let stone200 = Color(light: "#e7e5e4", dark: "#363431")         // bottom-sheet grab handle

        // Lines / glass
        static let hairline = Color(lightRGBA: (0, 0, 0, 0.07), darkRGBA: (255, 255, 255, 0.09))
        static let hairline20 = Color(lightRGBA: (198, 198, 198, 0.20), darkRGBA: (52, 50, 48, 0.9))   // border-outline-variant/20
        static let glassBar = Color(lightRGBA: (249, 249, 249, 0.80), darkRGBA: (18, 17, 16, 0.85))
        static let navPill = Color(lightRGBA: (255, 255, 255, 0.92), darkRGBA: (28, 27, 25, 0.92))
        static let navPillBorder = Color(lightRGBA: (0, 0, 0, 0.08), darkRGBA: (255, 255, 255, 0.08))
        static let backdrop = Color(lightRGBA: (0, 0, 0, 0.40), darkRGBA: (0, 0, 0, 0.40))           // bg-black/40
        static let neonTint10 = Color(lightRGBA: (204, 255, 0, 0.10), darkRGBA: (204, 255, 0, 0.10))
        static let neonTint15 = Color(lightRGBA: (204, 255, 0, 0.15), darkRGBA: (204, 255, 0, 0.12))
        static let pinkTint15 = Color(lightRGBA: (255, 46, 196, 0.15), darkRGBA: (255, 46, 196, 0.15))
        static let scrimBadge = Color(lightRGBA: (0, 0, 0, 0.40), darkRGBA: (0, 0, 0, 0.40))        // .school-badge bg
        static let scrimPinned = Color(lightRGBA: (0, 0, 0, 0.75), darkRGBA: (0, 0, 0, 0.75))       // .pinned-badge bg

        // Chat
        static let bubbleTheirs = Color(light: "#f1f1f1", dark: "#292724")
        static let bubbleMine = neon
        static let readReceipt = Color(light: "#b6b6b6", dark: "#8c8a85")      // read receipt + time separator
        static let avatarFallbackBg = Color(light: "#e2e2e2", dark: "#343230")
        static let avatarFallbackFg = Color(light: "#474747", dark: "#dddddd")

        // Empty states
        static let emptyTile = Color(light: "#efefef", dark: "#23211f")
        static let emptyIcon = Color(light: "#8a8a8a", dark: "#8c8a85")

        // Text card (intentionally unchanged in dark)
        static let textCardIvory = Color(hex: "#f6f1e7")
        static let textCardInk = Color(hex: "#3f3f3f")

        // Match plan page
        static let mpMuted = Color(light: "#b0b0b0", dark: "#8c8a85")
        static let mpLabel = Color(light: "#9a9a9a", dark: "#8c8a85")
        static let mpSub = Color(light: "#8a8a8a", dark: "#8c8a85")
        static let mpToggleOff = Color(light: "#d6d4d3", dark: "#343230")
        static let mpSep = Color(lightRGBA: (27, 27, 27, 0.07), darkRGBA: (255, 255, 255, 0.09))
        static let mpCardGlow = Color(lightRGBA: (204, 255, 0, 0.35), darkRGBA: (204, 255, 0, 0.35))

        // Toast (unchanged in dark)
        static let toastBg = Color(hex: "#000000")
        static let toastFg = Color(hex: "#ffffff")

        // Notifications
        static let notifPlate = Color(light: "#f1f1f1", dark: "#292724")
        static let notifPlateFg = Color(light: "#1b1b1b", dark: "#eceae6")

        // Couple space
        static let coupleHeroPlum = Color(hex: "#2e1a3a")

        // Misc
        static let splashTrack = Color(light: "#e6e6e6", dark: "#343230")
        static let ticketDivider = Color(lightRGBA: (0, 0, 0, 0.12), darkRGBA: (255, 255, 255, 0.12))
        static let inkTrack = Color(light: "#e2e2e2", dark: "#363431")         // .ink-range track / .ink-switch off
        static let pollFill = Color(lightRGBA: (204, 255, 0, 0.28), darkRGBA: (204, 255, 0, 0.28))
        static let pollFillMine = Color(lightRGBA: (204, 255, 0, 0.50), darkRGBA: (204, 255, 0, 0.50))

        /// Anonymous alias avatar background (`ALIAS_BG[index]`, same in both themes).
        static func aliasBg(index: Int) -> Color { Alias.background(index: index) }
    }

    // MARK: Radii (Tailwind steps all collapse to 10 px; explicit values listed)

    enum R {
        static let base: CGFloat = 10
        static let feed: CGFloat = 6           // all feed cards, .neon-check box
        static let chip: CGFloat = 10
        static let sheetTop: CGFloat = 10      // bottom sheets (rounded-t-xl == 10)
        static let bubble: CGFloat = 18        // chat bubbles, chat textarea, empty-state tile
        static let bubbleTail: CGFloat = 6
        static let plate: CGFloat = 12         // notif icon plate, .mp-cta, language rows, action menu
        static let menu: CGFloat = 14          // plus-menu card, new-post options, ticket card, chat image
        static let empty: CGFloat = 18
        static let pass: CGFloat = 20          // ticket pass card
        static let profileSheet: CGFloat = 24  // profile menu block top corners
        static let cta: CGFloat = 12           // .mp-cta
        static let energyCell: CGFloat = 3
        static let dayBadge: CGFloat = 5       // .mp-day-badge
        static let dayToday: CGFloat = 11      // .mp-day--today
        static let eventChip: CGFloat = 8      // EVENT / UNDER REVIEW / REJECTED chips
        static let langDialog: CGFloat = 16
        static let splashLogo: CGFloat = 22
        static let notifDetailPlate: CGFloat = 14
        static let full: CGFloat = 9999
    }

    // MARK: Spacing (page gutters)

    enum Space {
        static let page: CGFloat = 24          // auth / setup / questionnaire / overlay bodies / filter sheet
        static let settings: CGFloat = 20
        static let feed: CGFloat = 6           // square gutters + gaps
        static let postDetail: CGFloat = 12
        static let chat: CGFloat = 16
        static let plan: CGFloat = 30          // match plan pane
        static let listRow: CGFloat = 16       // py-4 rows, icon→label gap
        static let pageGap: CGFloat = 12       // horizontal pager inter-page gap
    }

    // MARK: Bars (add safeAreaInsets.top)

    enum Bar {
        static let home: CGFloat = 56
        static let square: CGFloat = 44
        static let overlay: CGFloat = 64
        static let navPill: CGFloat = 62
        static let navBottomGap: CGFloat = 14  // + safeAreaInsets.bottom
        static let navIcon: CGFloat = 33
        static let navCircle: CGFloat = 50
    }

    // MARK: Typography

    /// Plus Jakarta Sans when bundled (`PlusJakartaSans-<Weight>`, weights 200–800), else
    /// system SF with the same weight (D1). Sizes are fixed like the H5 pixel scale.
    static func font(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        if let name = FontProbe.jakarta(weight) { return .custom(name, size: size) }
        return .system(size: size, weight: weight)
    }

    /// JetBrains Mono when bundled, else the system monospaced design.
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        if let name = FontProbe.jetBrains(weight) { return .custom(name, size: size) }
        return .system(size: size, weight: weight, design: .monospaced)
    }

    /// Letter-spacing in points for an em value (Tailwind tracking-* × font size).
    static func tracking(_ em: CGFloat, size: CGFloat) -> CGFloat { em * size }

    enum Tracking {
        static let tighter: CGFloat = -0.05
        static let tight: CGFloat = -0.025
        static let wide: CGFloat = 0.025
        static let wider: CGFloat = 0.05
        static let widest: CGFloat = 0.1       // uppercase micro-labels & buttons
        static let badge: CGFloat = 0.08
        static let label: CGFloat = 0.15       // auth labels, q-mode badge
        static let cta: CGFloat = 0.18         // splash wordmark, .mp-cta
        static let section: CGFloat = 0.2      // section headers, wizard step
        static let mpLabel: CGFloat = 0.26
        static let hero: CGFloat = 0.3         // splash Skip, Confirm Profile, version line
        static let beta: CGFloat = 0.35
    }

    /// Canonical type styles (h5-design-system.md §2.6) — `Theme.TextStyle.pageTitle` etc.
    enum TextStyle {
        static var pageTitle: Font { font(20, weight: .bold) }
        static var sheetTitle: Font { font(16, weight: .bold) }
        static var sectionLabel: Font { font(12, weight: .heavy) }
        static var microLabel: Font { font(10, weight: .bold) }
        static var rowLabel: Font { font(14, weight: .medium) }
        static var body: Font { font(14, weight: .regular) }
        static var heroHeadline: Font { font(30, weight: .heavy) }
        static var cardTitle: Font { font(18, weight: .bold) }
        static var smallCardTitle: Font { font(13, weight: .bold) }
        static var badge: Font { font(9, weight: .bold) }
        static var toast: Font { font(14, weight: .regular) }
    }

    // MARK: Motion

    enum Motion {
        /// Master easing `cubic-bezier(0.22, 1, 0.36, 1)`.
        static let snap = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.28)
        static let sheet = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.32)
        static let fade = Animation.easeInOut(duration: 0.25)
        static let hero = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.45)
        static let press = Animation.easeOut(duration: 0.15)
        static let pressDuration: Double = 0.15
        static let ptrSnap = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.30)
        static let navHide = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.30)
        static let chromeHide = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.26)
        static let inkUnderline = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.28)
        static let pinnedSeg = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.24)
        static let pollFill = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.40)
        static let plusMenu = Animation.easeOut(duration: 0.18)
        static let swipeCommit = Animation.easeOut(duration: 0.20)
        static let swipeCancel = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.25)
        static let toastIn = Animation.easeOut(duration: 0.30)
        static let splashOut = Animation.easeInOut(duration: 0.60)
        static let splashMinimumSeconds: Double = 3.0
        static let toastSeconds: Double = 3.0

        static let pressScaleIcon: CGFloat = 0.95
        static let pressScaleWide: CGFloat = 0.98
        static let pressScaleSmallIcon: CGFloat = 0.90
        static let pressScaleCard: CGFloat = 0.99
    }

    // MARK: Icons (Material Symbols Rounded → SF Symbols)

    enum Icon {
        /// SF Symbol name for a Material Symbols name. Never empty: unknown names fall back
        /// to `questionmark.circle`. Pass `filled: true` for the H5 `FILL 1` cases (active
        /// nav, energy bolt, liked heart, verified check, selected check_circle, like /
        /// match_result notifications).
        static func sf(_ material: String, filled: Bool = false) -> String {
            let key = material.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if filled, let f = filledMap[key] { return f }
            if let base = map[key] { return base }
            return fallback
        }

        static let fallback = "questionmark.circle"

        static let filledMap: [String: String] = [
            "favorite": "heart.fill",
            "favorite_border": "heart.fill",
            "notifications": "bell.fill",
            "notifications_none": "bell.fill",
            "star": "star.fill",
            "star_border": "star.fill",
            "bookmark": "bookmark.fill",
            "bookmark_border": "bookmark.fill",
            "image": "photo.fill",
            "photo": "photo.fill",
            "lock": "lock.fill",
            "flag": "flag.fill",
            "shield": "shield.fill",
            "home": "house.fill",
            "thumb_up": "hand.thumbsup.fill",
            "redeem": "gift.fill",
            "settings": "gearshape.fill",
            "chat": "message.fill",
            "message": "message.fill",
            "mail": "envelope.fill",
            "mail_outline": "envelope.fill",
            "email": "envelope.fill",
            "person_outline": "person.fill",
            "group": "person.2.fill",
            "school": "graduationcap.fill",
            "calendar_month": "calendar",
            "event": "calendar",
            "confirmation_number": "ticket.fill",
            "credit_card": "creditcard.fill",
            "account_balance_wallet": "wallet.pass.fill",
            "dark_mode": "moon.fill",
            "light_mode": "sun.max.fill",
            "visibility": "eye.fill",
            "visibility_off": "eye.slash.fill",
            "location_on": "mappin.and.ellipse",
            "place": "mappin.circle.fill",
            "timer": "timer",
            "schedule": "clock.fill",
            "info": "info.circle.fill",
            "error": "exclamationmark.circle.fill",
            "warning": "exclamationmark.triangle.fill",
            "help": "questionmark.circle.fill",
            "help_outline": "questionmark.circle.fill",
            "wallpaper": "photo.fill.on.rectangle.fill",
            "photo_camera": "camera.fill",
            "camera_alt": "camera.fill",
            "forum": "bubble.left.and.bubble.right.fill",
            "comment": "text.bubble.fill",
            "cloud": "cloud.fill",
            "cloud_off": "icloud.slash.fill",
            "description": "doc.text.fill",
            "policy": "doc.text.fill",
            "delete": "trash.fill",
            "send": "paperplane.fill",
            "pets": "pawprint.fill",
            "celebration": "party.popper.fill",
            "bedtime": "bed.double.fill",
            "mood_bad": "flame.fill",
            "sentiment_very_satisfied": "face.smiling.inverse",
            "hub": "point.3.filled.connected.trianglepath.dotted",
            "push_pin": "pin.fill",
            "pin_drop": "mappin.circle.fill",
            "map": "map.fill",
            "explore": "safari.fill",
            "sports_esports": "gamecontroller.fill",
            "headphones": "headphones",
            "mic": "mic.fill",
            "videocam": "video.fill",
            "play_arrow": "play.fill",
            "pause": "pause.fill",
            "stop": "stop.fill",
            "folder": "folder.fill",
            "archive": "archivebox.fill",
            "inbox": "tray.fill",
            "lightbulb": "lightbulb.fill",
            "bug_report": "ant.fill",
            "key": "key.fill",
            "lock_open": "lock.open.fill",
            "security": "lock.shield.fill",
            "verified_user": "checkmark.shield.fill",
            "workspace_premium": "rosette",
            "emoji_events": "trophy.fill",
            "grade": "star.fill",
            "label": "tag.fill",
            "local_offer": "tag.fill",
            "sell": "tag.fill",
            "add_circle": "plus.circle.fill",
            "remove_circle": "minus.circle.fill",
            "cancel": "xmark.circle.fill",
            "check_circle": "checkmark.circle.fill",
            "task_alt": "checkmark.circle.fill",
            "radio_button_checked": "largecircle.fill.circle",
            "check_box": "checkmark.square.fill",
            "wifi_off": "wifi.slash",
            "smartphone": "iphone",
            "person_add": "person.badge.plus",
            "group_add": "person.badge.plus",
            "person": "person.fill",
            "eco": "leaf.fill",
            "bolt": "bolt.fill",
            "flash_on": "bolt.fill",
            "chat_bubble": "bubble.left.fill",
            "auto_awesome": "sparkles",
            "verified": "checkmark.seal.fill",
        ]

        static let map: [String: String] = [
            // Present in `filledMap` only until now, so the unfilled lookup fell through to the
            // `questionmark.circle` fallback — the comment composer's anonymity toggle showed a
            // `?` glyph in both states (h5-square §1.5 Footer wants eye / eye-slash).
            "visibility": "eye",
            "visibility_off": "eye.slash",
            // ── Navigation / chrome ──
            "add": "plus",
            "notifications_none": "bell",
            "notifications": "bell",
            "search": "magnifyingglass",
            "close": "xmark",
            "clear": "xmark",
            "arrow_back": "chevron.left",
            "arrow_back_ios": "chevron.left",
            "arrow_forward": "chevron.right",
            "arrow_forward_ios": "chevron.right",
            "arrow_upward": "arrow.up",
            "arrow_downward": "arrow.down",
            "arrow_left": "arrow.left",
            "arrow_right": "arrow.right",
            "more_horiz": "ellipsis",
            "more_vert": "ellipsis",
            "menu": "line.3.horizontal",
            "chevron_right": "chevron.right",
            "chevron_left": "chevron.left",
            "expand_more": "chevron.down",
            "expand_less": "chevron.up",
            "keyboard_arrow_down": "chevron.down",
            "keyboard_arrow_up": "chevron.up",
            "keyboard_arrow_left": "chevron.left",
            "keyboard_arrow_right": "chevron.right",
            "unfold_more": "chevron.up.chevron.down",
            "drag_indicator": "line.3.horizontal",
            "drag_handle": "line.3.horizontal",
            "reorder": "line.3.horizontal",
            "refresh": "arrow.clockwise",
            "sync": "arrow.triangle.2.circlepath",
            "autorenew": "arrow.triangle.2.circlepath",
            "cached": "arrow.triangle.2.circlepath",
            "loop": "arrow.triangle.2.circlepath",
            "history": "clock.arrow.circlepath",
            "undo": "arrow.uturn.backward",
            "redo": "arrow.uturn.forward",
            "open_in_new": "arrow.up.right.square",
            "launch": "arrow.up.right.square",
            "logout": "rectangle.portrait.and.arrow.right",
            "login": "arrow.right.square",
            "exit_to_app": "rectangle.portrait.and.arrow.right",
            "home": "house",
            "explore": "safari",
            "apps": "square.grid.3x3",
            "dashboard": "rectangle.3.group",
            "grid_view": "square.grid.2x2",
            "view_list": "list.bullet",
            "list": "list.bullet",
            "filter_list": "line.3.horizontal.decrease",
            "sort": "arrow.up.arrow.down",
            "tune": "slider.horizontal.3",
            "settings": "gearshape",
            "fullscreen": "arrow.up.left.and.arrow.down.right",
            "close_fullscreen": "arrow.down.right.and.arrow.up.left",
            "zoom_in": "plus.magnifyingglass",
            "zoom_out": "minus.magnifyingglass",
            "swap_horiz": "arrow.left.arrow.right",
            "swap_vert": "arrow.up.arrow.down",
            "import_export": "arrow.up.arrow.down",
            "open_with": "arrow.up.and.down.and.arrow.left.and.right",

            // ── Tabs ──
            "chat_bubble": "bubble.left",
            "eco": "leaf.fill",
            "person": "person",
            "person_outline": "person",

            // ── Actions / status ──
            "check": "checkmark",
            "done": "checkmark",
            "done_all": "checkmark.circle.fill",
            "check_circle": "checkmark.circle.fill",
            "task_alt": "checkmark.circle",
            "check_box": "checkmark.square",
            "check_box_outline_blank": "square",
            "radio_button_checked": "largecircle.fill.circle",
            "radio_button_unchecked": "circle",
            "toggle_on": "switch.2",
            "toggle_off": "switch.2",
            "cancel": "xmark.circle",
            "highlight_off": "xmark.circle",
            "remove": "minus",
            "remove_circle": "minus.circle",
            "add_circle": "plus.circle",
            "add_box": "plus.square",
            "block": "nosign",
            "not_interested": "nosign",
            "do_not_disturb": "minus.circle",
            "delete": "trash",
            "delete_outline": "trash",
            "delete_forever": "trash.slash",
            "backspace": "delete.left",
            "edit": "pencil",
            "create": "pencil",
            "edit_note": "square.and.pencil",
            "edit_square": "square.and.pencil",
            "note_add": "note.text.badge.plus",
            "post_add": "square.and.pencil",
            "draw": "pencil.tip",
            "save": "square.and.arrow.down",
            "place_item": "square.and.arrow.down",
            "download": "arrow.down.circle",
            "file_download": "arrow.down.circle",
            "upload": "arrow.up.circle",
            "file_upload": "arrow.up.circle",
            "cloud_upload": "icloud.and.arrow.up",
            "cloud_download": "icloud.and.arrow.down",
            "cloud": "cloud",
            "cloud_off": "icloud.slash",
            "wifi_off": "wifi.slash",
            "wifi": "wifi",
            "ios_share": "square.and.arrow.up",
            "share": "square.and.arrow.up",
            "content_copy": "doc.on.doc",
            "copy_all": "doc.on.doc",
            "link": "link",
            "link_off": "xmark.circle",
            "add_link": "link.badge.plus",
            "attach_file": "paperclip",
            "attachment": "paperclip",
            "send": "paperplane",
            "reply": "arrowshape.turn.up.left",
            "forward": "arrowshape.turn.up.right",
            "print": "printer",
            "qr_code_2": "qrcode",
            "qr_code": "qrcode",
            "qr_code_scanner": "qrcode.viewfinder",
            "hub": "point.3.connected.trianglepath.dotted",
            "touch_app": "hand.tap",
            "waving_hand": "hand.wave",
            "front_hand": "hand.raised",
            "pan_tool": "hand.raised",
            "thumb_up": "hand.thumbsup",
            "thumb_down": "hand.thumbsdown",
            "refresh_alt": "arrow.clockwise",

            // ── Feedback / info ──
            "info": "info.circle",
            "error": "exclamationmark.circle",
            "warning": "exclamationmark.triangle",
            "report": "exclamationmark.triangle",
            "report_problem": "exclamationmark.triangle",
            "priority_high": "exclamationmark",
            "help": "questionmark.circle",
            "help_outline": "questionmark.circle",
            "contact_support": "questionmark.circle",
            "live_help": "questionmark.circle",
            "quiz": "questionmark.square",
            "question_mark": "questionmark",
            "feedback": "text.bubble",
            "rate_review": "star.bubble",
            "bug_report": "ant",
            "support_agent": "headphones",
            "lightbulb": "lightbulb",
            "tips_and_updates": "lightbulb",
            "new_releases": "seal",
            "verified": "checkmark.seal.fill",
            "verified_user": "checkmark.shield",
            "shield": "shield",
            "security": "lock.shield",
            "privacy_tip": "hand.raised",
            "admin_panel_settings": "shield.lefthalf.filled",
            "lock": "lock",
            "lock_open": "lock.open",
            "key": "key",
            "password": "key",
            "fingerprint": "touchid",
            "flag": "flag",
            "outlined_flag": "flag",
            "gavel": "scale.3d",
            "policy": "doc.text",
            "description": "doc.text",
            "article": "doc.plaintext",
            "receipt": "doc.plaintext",
            "feed": "doc.richtext",
            "note": "note.text",
            "notes": "note.text",
            "sticky_note_2": "note.text",
            "text_snippet": "text.quote",
            "format_quote": "quote.opening",
            "title": "textformat",
            "text_fields": "textformat.abc",
            "label": "tag",
            "local_offer": "tag",
            "sell": "tag",
            "tag": "number",
            "pin": "number",
            "numbers": "number",
            "bookmark": "bookmark",
            "bookmark_border": "bookmark",
            "star": "star",
            "star_border": "star",
            "grade": "star",
            "workspace_premium": "rosette",
            "emoji_events": "trophy",
            "military_tech": "medal",
            "leaderboard": "chart.bar",
            "trending_up": "chart.line.uptrend.xyaxis",
            "insights": "chart.bar.xaxis",
            "analytics": "chart.bar",
            "auto_awesome": "sparkles",
            "auto_fix_high": "wand.and.stars",
            "magic_button": "wand.and.stars",
            "flare": "sparkle",

            // ── People / social ──
            "group": "person.2",
            "groups": "person.3",
            "group_off": "person.2.slash",
            "group_add": "person.badge.plus",
            "person_add": "person.badge.plus",
            "person_off": "person.crop.circle.badge.xmark",
            "person_search": "person.crop.circle.badge.questionmark",
            "account_circle": "person.crop.circle",
            "manage_accounts": "person.crop.circle.badge.checkmark",
            "badge": "person.text.rectangle",
            "contacts": "person.crop.rectangle.stack",
            "favorite": "heart",
            "favorite_border": "heart",
            "heart_plus": "heart.circle",
            "heart_minus": "heart.slash",
            "volunteer_activism": "hands.sparkles",
            "handshake": "hand.raised",
            "diversity_1": "person.3",
            "diversity_3": "person.3",
            "mood": "face.smiling",
            "sentiment_very_satisfied": "face.smiling",
            "sentiment_satisfied": "face.smiling",
            "sentiment_neutral": "face.dashed",
            "sentiment_dissatisfied": "cloud.rain",
            "sentiment_very_dissatisfied": "hand.thumbsdown.fill",
            "sentiment_stressed": "face.dashed",
            "sentiment_worried": "cloud.bolt",
            "mood_bad": "flame",
            "celebration": "party.popper",
            "cake": "birthday.cake",
            "bedtime": "bed.double",
            "nightlight": "moon.stars",
            "nightlight_round": "moon.stars",
            "redeem": "gift",
            "card_giftcard": "gift",
            "pets": "pawprint",
            "cruelty_free": "hare",
            "emoji_nature": "leaf",
            "park": "leaf",
            "forest": "leaf",
            "spa": "leaf",
            "sunny": "sun.max",
            "wb_sunny": "sun.max",
            "light_mode": "sun.max",
            "dark_mode": "moon",
            "contrast": "circle.lefthalf.filled",
            "translate": "globe",
            "language": "globe",
            "public": "globe",

            // ── Communication ──
            "chat": "message",
            "message": "message",
            "sms": "message",
            "textsms": "message",
            "comment": "text.bubble",
            "forum": "bubble.left.and.bubble.right",
            "question_answer": "bubble.left.and.bubble.right",
            "mail": "envelope",
            "mail_outline": "envelope",
            "email": "envelope",
            "mark_email_read": "envelope.open",
            "inbox": "tray",
            "outbox": "tray.and.arrow.up",
            "archive": "archivebox",
            "campaign": "megaphone",
            "call": "phone",
            "phone": "phone",
            "videocam": "video",
            "videocam_off": "video.slash",
            "mic": "mic",
            "mic_off": "mic.slash",
            "volume_up": "speaker.wave.2",
            "volume_off": "speaker.slash",
            "headphones": "headphones",
            "headset": "headphones",

            // ── Media ──
            "image": "photo",
            "photo": "photo",
            "photo_library": "photo.on.rectangle",
            "collections": "photo.on.rectangle",
            "wallpaper": "photo.on.rectangle",
            "add_a_photo": "camera",
            "add_photo_alternate": "plus.rectangle.on.rectangle",
            "photo_camera": "camera.fill",
            "camera_alt": "camera",
            "camera": "camera",
            "cameraswitch": "camera.rotate",
            "photography": "camera",
            "crop": "crop",
            "rotate_right": "rotate.right",
            "rotate_left": "rotate.left",
            "flip": "arrow.left.and.right.righttriangle.left.righttriangle.right",
            "palette": "paintpalette",
            "color_lens": "paintpalette",
            "brush": "paintbrush",
            "movie": "film",
            "theaters": "film",
            "music_note": "music.note",
            "play_arrow": "play",
            "pause": "pause",
            "stop": "stop",
            "skip_next": "forward.end",
            "skip_previous": "backward.end",
            "opacity": "drop",
            "blur_on": "circle.dotted",

            // ── Time / place / events ──
            "schedule": "clock",
            "access_time": "clock",
            "timer": "timer",
            "timer_off": "timer",
            "alarm": "alarm",
            "hourglass_empty": "hourglass",
            "hourglass_top": "hourglass.tophalf.filled",
            "hourglass_bottom": "hourglass.bottomhalf.filled",
            "hourglass_full": "hourglass",
            "hourglass_disabled": "hourglass.tophalf.filled",
            "pending": "ellipsis.circle",
            "update": "clock.arrow.2.circlepath",
            "calendar_month": "calendar",
            "calendar_today": "calendar",
            "today": "calendar",
            "date_range": "calendar",
            "event": "calendar",
            "event_note": "calendar.badge.clock",
            "event_available": "checkmark.circle",
            "event_busy": "calendar.badge.exclamationmark",
            "location_on": "mappin.and.ellipse",
            "place": "mappin",
            "pin_drop": "mappin",
            "map": "map",
            "near_me": "location",
            "my_location": "location",
            "navigation": "location.north",
            "directions": "arrow.triangle.turn.up.right.diamond",
            "school": "graduationcap",
            "local_library": "books.vertical",
            "menu_book": "book",
            "book": "book",
            "auto_stories": "book",
            "history_edu": "graduationcap",
            "work": "briefcase",
            "business": "building.2",
            "apartment": "building",
            "home_work": "house",
            "cottage": "house",
            "hotel": "bed.double",
            "restaurant": "fork.knife",
            "local_cafe": "cup.and.saucer",
            "lunch_dining": "fork.knife",
            "local_bar": "wineglass",
            "icecream": "birthday.cake",
            "fitness_center": "dumbbell",
            "sports": "sportscourt",
            "sports_esports": "gamecontroller",
            "hiking": "figure.hiking",
            "directions_run": "figure.run",
            "directions_walk": "figure.walk",
            "directions_bike": "bicycle",
            "flight": "airplane",
            "train": "tram",
            "directions_car": "car",
            "local_activity": "ticket",
            "festival": "party.popper",
            "attractions": "sparkles",
            "confirmation_number": "ticket",
            "push_pin": "pin",

            // ── Money / energy ──
            "bolt": "bolt",
            "flash_on": "bolt.fill",
            "electric_bolt": "bolt.fill",
            "energy_savings_leaf": "leaf",
            "account_balance_wallet": "wallet.pass",
            "wallet": "wallet.pass",
            "credit_card": "creditcard",
            "payments": "creditcard",
            "payment": "creditcard",
            "paid": "dollarsign.circle",
            "attach_money": "dollarsign",
            "monetization_on": "dollarsign.circle",
            "savings": "banknote",
            "shopping_bag": "bag",
            "shopping_cart": "cart",
            "storefront": "bag",
            "store": "bag",
            "local_mall": "bag",
            "loyalty": "tag",
            "discount": "percent",
            "percent": "percent",
            "calculate": "plus.slash.minus",

            // ── Devices / tech ──
            "smartphone": "iphone",
            "phone_iphone": "iphone",
            "tablet": "ipad",
            "laptop": "laptopcomputer",
            "computer": "desktopcomputer",
            "tv": "tv",
            "watch": "applewatch",
            "devices": "laptopcomputer.and.iphone",
            "keyboard": "keyboard",
            "mouse": "computermouse",
            "memory": "memorychip",
            "storage": "externaldrive",
            "dns": "server.rack",
            "router": "wifi",
            "bluetooth": "dot.radiowaves.left.and.right",
            "nfc": "wave.3.right",
            "usb": "cable.connector",
            "power": "power",
            "power_settings_new": "power",
            "battery_full": "battery.100",
            "code": "chevron.left.forwardslash.chevron.right",
            "terminal": "terminal",
            "api": "network",
            "data_object": "curlybraces",
            "dataset": "tablecells",
            "table_chart": "tablecells",
            "widgets": "square.grid.2x2",
            "extension": "puzzlepiece",
            "category": "square.grid.2x2",
            "style": "paintpalette",
            "science": "testtube.2",
            "biotech": "atom",
            "engineering": "gearshape.2",
            "architecture": "building.columns",
            "construction": "hammer",
            "build": "wrench",
            "handyman": "wrench.and.screwdriver",
            "folder": "folder",
            "folder_open": "folder",
            "create_new_folder": "folder.badge.plus",
            "input": "arrow.down.to.line",
            "output": "arrow.up.to.line",
            "search_off": "magnifyingglass",
            "searching": "magnifyingglass",
            "searchable": "magnifyingglass",
            "startup": "paperplane",
            "male": "person",
            "female": "person",
            "transgender": "person",
            "images": "photo.on.rectangle",
        ]

        #if DEBUG
        /// Runtime check that every mapped SF name exists on this OS (call from the
        /// `-unimatcha-decode-check` path). Returns the Material names whose symbol is missing.
        static func missingSymbols() -> [String] {
            var missing: [String] = []
            for (m, sf) in map where UIImage(systemName: sf) == nil { missing.append("\(m)→\(sf)") }
            for (m, sf) in filledMap where UIImage(systemName: sf) == nil { missing.append("\(m)(filled)→\(sf)") }
            return missing.sorted()
        }

        /// Every Material name in h5-design-system.md §13 plus the couple status presets and
        /// notification icons must resolve to a non-empty, non-fallback name.
        static func verifyInventory() -> [String] {
            let inventory = [
                "add", "notifications_none", "search", "close", "arrow_back", "arrow_forward", "arrow_upward",
                "more_horiz", "image", "visibility_off", "chat_bubble", "eco", "person", "flash_on",
                "confirmation_number", "person_outline", "mail_outline", "settings", "chevron_right",
                "expand_more", "translate", "dark_mode", "contrast", "help_outline", "shield", "flag", "gavel",
                "policy", "tune", "grid_view", "auto_awesome", "group", "check_circle", "check", "verified",
                "favorite", "lock", "mail", "pin", "add_a_photo", "photo_camera", "place_item", "qr_code_2",
                "hub", "ios_share", "link_off", "refresh", "block", "touch_app", "chat", "account_balance_wallet",
                "credit_card", "forum", "cloud_off", "school", "push_pin", "notifications", "person_off",
                "hourglass_empty", "group_off",
                // couple status presets
                "sentiment_very_satisfied", "celebration", "bedtime", "sentiment_dissatisfied",
                "sentiment_stressed", "sentiment_worried", "mood_bad",
                // couple space + notifications
                "edit", "list", "redeem", "photo", "delete", "info", "hourglass_disabled", "bolt",
                "visibility", "waving_hand", "edit_note", "wallpaper", "calendar_month", "timer", "schedule",
                "location_on", "expand_less", "arrow_downward", "more_vert",
            ]
            return inventory.filter { map[$0] == nil }
        }
        #endif
    }
}
