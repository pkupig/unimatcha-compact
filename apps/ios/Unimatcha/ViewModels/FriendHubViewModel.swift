import Foundation
import SwiftUI
import UIKit

// MARK: - FriendHubViewModel (addfriend.js — `openFriendHubAt` / graph / contact search / QR)
//
// One full-page overlay (`friend-hub`) that shows exactly ONE panel, chosen by the home "+"
// popover; there is no in-hub navigation (the old "menu" landing page was deleted from H5), so
// Back always closes. Panel side effects on entry (H5 `friendHubShow`):
//   graph  → load sessions (gotcha 8: a node without a cached session falls back to the public
//            profile) then `GET /relationships/graph`
//   search → clear the field, focus after 50 ms, list every session (fetching them if empty)
//   qr     → force the "My QR" sub-view (stops any scanner) + `GET /users/me/connect-code`
// Anything that leaves the QR panel stops the camera; so does closing the overlay.

@MainActor
final class FriendHubViewModel: ObservableObject {
    nonisolated static let overlayId = "friend-hub"

    enum GraphState: Equatable {
        case loading
        case failed
        case loaded(RelationshipGraph)
    }

    /// "My QR" (0) / "Scan" (1) — `switchAddFriendView`.
    enum QRSegment: Int {
        case myQR = 0
        case scan = 1
    }

    // Panel
    @Published private(set) var panel: FriendHubPanel

    // Graph
    @Published private(set) var graphState: GraphState = .loading

    // Search
    /// Live field text (H5 `#friend-search-input`).
    @Published var searchTerm: String = "" {
        didSet { scheduleSearch() }
    }
    /// Debounced term actually applied to the list (120 ms — H5 `friendSearchTimer`).
    @Published private(set) var appliedTerm: String = ""
    @Published private(set) var isLoadingSessions = false

    // QR
    @Published var qrSegment: Int = QRSegment.myQR.rawValue {
        didSet { if oldValue != qrSegment { qrSegmentChanged() } }
    }
    /// `nil` while loading (shows "—"); `.some` with the code, or the failure marker.
    @Published private(set) var connectCode: String?
    @Published private(set) var connectCodeFailed = false
    @Published var manualCode: String = ""
    /// Shows the pink "Camera unavailable — enter the code manually below." line.
    @Published private(set) var cameraFailed = false
    /// Bumped to re-arm `QRScannerView` after a failed connect (H5 leaves a dead black box).
    @Published private(set) var scannerToken = 0
    /// `afConnecting` — html5-qrcode fires per frame; without this the same code POSTs N times.
    @Published private(set) var connecting = false

    /// Seconds before scanning resumes after a failed connect (documented improvement over H5,
    /// long enough that the same wrong code is not re-fired immediately).
    nonisolated static let scannerResumeDelay: TimeInterval = 2
    nonisolated static let searchDebounce: TimeInterval = 0.120
    /// The search field autofocuses 50 ms after the panel appears (H5 `setTimeout(…, 50)`).
    nonisolated static let searchFocusDelay: TimeInterval = 0.050

    /// The panel's entry side effects run once per presentation (see `EnergyPurchaseViewModel`).
    private var didAppear = false
    private var searchTask: Task<Void, Never>?
    private var sessionsTask: Task<Void, Never>?
    private var graphTask: Task<Void, Never>?
    private var codeTask: Task<Void, Never>?
    private var resumeTask: Task<Void, Never>?
    private var resetObserver: NSObjectProtocol?

    init(panel: FriendHubPanel = .search) {
        self.panel = panel
        resetObserver = NotificationCenter.default.addObserver(forName: .sessionDidReset, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.reset() }
        }
    }

    deinit {
        if let o = resetObserver { NotificationCenter.default.removeObserver(o) }
        searchTask?.cancel()
        sessionsTask?.cancel()
        graphTask?.cancel()
        codeTask?.cancel()
        resumeTask?.cancel()
    }

    // MARK: Titles (H5 `titles` map; the legacy "menu"/unknown views fall back to "Friends")

    var title: String {
        switch panel {
        case .graph: return L10n.t("Relationship Network")
        case .search: return L10n.t("Search & discover")
        case .qr: return L10n.t("Add by QR")
        }
    }

    // MARK: Panel lifecycle

    /// `friendHubShow(view)` — the panel's entry side effects.
    func onAppear() {
        didAppear = true
        switch panel {
        case .graph: loadGraph()
        case .search: startSearchPanel()
        case .qr: startQRPanel()
        }
    }

    func onAppearIfNeeded() {
        guard !didAppear else { return }
        onAppear()
    }

    /// Overlay `onDismiss` (back button, swipe-back, `dismissAll`): stop the camera and every
    /// in-flight job — H5 only stops the scanner on the explicit close path (gotcha: a 401 left
    /// the camera running).
    func handleDismiss() {
        stopScanner()
        searchTask?.cancel(); searchTask = nil
        sessionsTask?.cancel(); sessionsTask = nil
        graphTask?.cancel(); graphTask = nil
        codeTask?.cancel(); codeTask = nil
        resumeTask?.cancel(); resumeTask = nil
    }

    func close() {
        OverlayRouter.shared.dismiss(id: Self.overlayId)
    }

    func reset() {
        didAppear = false
        handleDismiss()
        graphState = .loading
        searchTerm = ""
        appliedTerm = ""
        connectCode = nil
        connectCodeFailed = false
        manualCode = ""
        cameraFailed = false
        connecting = false
        qrSegment = QRSegment.myQR.rawValue
    }

    // MARK: Graph panel

    func loadGraph() {
        graphTask?.cancel()
        graphState = .loading
        graphTask = Task { @MainActor [weak self] in
            guard let self = self else { return }
            // Sessions first: a node whose partner has no cached session would silently open the
            // public profile instead of the chat (h5-addfriend gotcha 8).
            if ChatSessionsStore.shared.sessions.isEmpty {
                await ChatSessionsStore.shared.loadSessions()
            }
            guard !Task.isCancelled else { return }
            do {
                let graph = try await RelationshipsService.graph()
                guard !Task.isCancelled else { return }
                self.graphState = .loaded(graph)
            } catch {
                guard !Task.isCancelled else { return }
                self.graphState = .failed        // inline line, no toast (H5 parity)
            }
        }
    }

    /// Node tap: cached session → that chat; otherwise the partner's public profile. The hub
    /// closes first in both cases (H5 `openConnectionChatFromGraph`). The self node is inert.
    func openNode(_ node: GraphNode) {
        let matchId = ChatSessionsStore.shared.sessions
            .first { $0.partner.id == node.id }
            .map { $0.matchId }
            .flatMap { $0.isEmpty ? nil : $0 }
        close()
        if let matchId = matchId {
            AppActions.shared.openChat(matchId)
        } else {
            AppActions.shared.openPartnerProfile(node.id, nil)
        }
    }

    // MARK: Search panel

    private func startSearchPanel() {
        searchTerm = ""
        appliedTerm = ""
        guard ChatSessionsStore.shared.sessions.isEmpty else { return }
        isLoadingSessions = true
        sessionsTask?.cancel()
        sessionsTask = Task { @MainActor [weak self] in
            await ChatSessionsStore.shared.loadSessions()
            self?.isLoadingSessions = false
        }
    }

    private func scheduleSearch() {
        let term = searchTerm
        searchTask?.cancel()
        searchTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.searchDebounce * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.appliedTerm = term
        }
    }

    /// True while the user has typed something — picks between the two empty-state sentences.
    var hasSearchTerm: Bool {
        !appliedTerm.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// H5 `runFriendSearch`: case-insensitive substring over
    /// `[nickname, name, note, school, lastMsgText(lastMessage)]` joined by a space.
    /// (`SessionPartner` already folds the wire's `name` into `nickname`.)
    func matches(_ session: ChatSession) -> Bool {
        Self.matches(session, term: appliedTerm)
    }

    nonisolated static func matches(_ session: ChatSession, term rawTerm: String) -> Bool {
        let term = rawTerm.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return true }        // empty term lists every session
        return haystack(session).contains(term)
    }

    nonisolated static func haystack(_ session: ChatSession) -> String {
        let p = session.partner
        return [p.nickname, p.note, p.school, lastMessageText(session)]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
            .lowercased()
    }

    /// Filtered rows in the order `/chat/sessions` returned them (temp + confirmed, no grouping).
    func results(in sessions: [ChatSession]) -> [ChatSession] {
        sessions.filter(matches)
    }

    /// `lastMsgText`: the text, else `[Photo]` for an image-only message, else "".
    /// (H5 leaves the placeholder English here; iOS localises it — D3.)
    nonisolated static func lastMessageText(_ session: ChatSession) -> String {
        guard let lm = session.lastMessage else { return "" }
        if !lm.content.isEmpty { return lm.content }
        if let url = lm.imageUrl, !url.isEmpty { return L10n.t("[Photo]") }
        return ""
    }

    /// Row title: the private note wins over the nickname here (unlike the chat list, where the
    /// note is only a chip).
    nonisolated static func rowName(_ session: ChatSession) -> String {
        session.partner.noteChip ?? session.partner.displayName
    }

    /// Row subtitle: last message, else the (zh-mapped) school, else empty.
    nonisolated static func rowSubtitle(_ session: ChatSession) -> String {
        let last = lastMessageText(session)
        if !last.isEmpty { return last }
        return L10n.metaLabel(session.partner.school) ?? ""
    }

    func openSession(_ session: ChatSession) {
        let matchId = session.matchId
        guard !matchId.isEmpty else { return }
        close()
        AppActions.shared.openChat(matchId)
    }

    // MARK: QR panel

    private func startQRPanel() {
        qrSegment = QRSegment.myQR.rawValue
        stopScanner()
        loadConnectCode()
    }

    private func qrSegmentChanged() {
        if qrSegment == QRSegment.scan.rawValue {
            cameraFailed = false
            resumeTask?.cancel(); resumeTask = nil
            scannerToken += 1              // re-arm after a previous hit / error
        } else {
            stopScanner()
        }
    }

    var isScanning: Bool { qrSegment == QRSegment.scan.rawValue }

    private func stopScanner() {
        resumeTask?.cancel(); resumeTask = nil
        if qrSegment != QRSegment.myQR.rawValue {
            qrSegment = QRSegment.myQR.rawValue   // unmounts `QRScannerView` → session stops
        }
    }

    /// `GET /users/me/connect-code` on every entry (no cache). Failure → "unavailable" + toast.
    func loadConnectCode() {
        codeTask?.cancel()
        connectCode = nil
        connectCodeFailed = false
        codeTask = Task { @MainActor [weak self] in
            do {
                let code = try await ProfileService.connectCode()
                guard !Task.isCancelled else { return }
                self?.connectCode = code
            } catch {
                guard !Task.isCancelled else { return }
                guard let self = self else { return }
                if (error as? APIError)?.isUnauthorized == true { return }
                self.connectCodeFailed = true
                ToastCenter.shared.show(L10n.pick("Failed to load your code", "编号加载失败"))
            }
        }
    }

    /// The code line: "—" while loading, "unavailable" after a failure, else the code.
    var connectCodeLabel: String {
        if let code = connectCode, !code.isEmpty { return code }
        return connectCodeFailed ? L10n.pick("unavailable", "不可用") : "—"
    }

    func copyConnectCode() {
        guard let code = connectCode, !code.isEmpty else { return }
        UIPasteboard.general.string = code
        ToastCenter.shared.show(L10n.pick("Code copied", "编号已复制"))
    }

    // MARK: Connect

    func onScanned(_ code: String) {
        Task { await connect(code) }
    }

    func onCameraError(_ error: QRScannerError) {
        cameraFailed = true
    }

    func submitManualCode() {
        let code = manualCode
        Task { await connect(code) }
    }

    /// `connectWithCode`: trim → guard → stop the camera → `POST /matching/connect {code}` →
    /// require `matchId` → toast + close + open the chat. Codes are uppercase on the server and
    /// looked up by exact match, so the client uppercases first (gotcha 6).
    func connect(_ raw: String) async {
        let code = Self.normalizeCode(raw)
        guard !code.isEmpty, !connecting else { return }
        connecting = true
        defer { connecting = false }
        resumeTask?.cancel(); resumeTask = nil
        do {
            let result = try await MatchingService.connect(code: code)
            guard !result.matchId.isEmpty else {
                throw APIError.http(status: 200, message: result.message ?? "Connect failed")
            }
            ToastCenter.shared.show(Self.connectMessage(result.message))
            close()
            AppActions.shared.openChat(result.matchId)
        } catch {
            if (error as? APIError)?.isUnauthorized == true { return }   // overlay is being torn down
            let text = APIError.message(of: error)
            ToastCenter.shared.show(L10n.t("Failed: ") + Self.connectMessage(text))
            scheduleScannerResume()
        }
    }

    /// Codes are `"CL" + 8 [0-9A-Z]` and the server look-up is an exact match, so a scanned /
    /// typed code is trimmed and uppercased before it is sent (gotcha 6).
    nonisolated static func normalizeCode(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    }

    /// H5 leaves the camera dead after a failure ("black square until you tap Scan again").
    /// iOS re-arms it once the toast has been read.
    private func scheduleScannerResume() {
        guard isScanning, !cameraFailed else { return }
        resumeTask?.cancel()
        resumeTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.scannerResumeDelay * 1_000_000_000))
            guard !Task.isCancelled, let self = self, self.isScanning, !self.cameraFailed else { return }
            self.scannerToken += 1
        }
    }

    /// The connect endpoint's messages are fixed English server strings (not user content), so
    /// zh gets a translation and anything unknown is shown verbatim (D3).
    nonisolated static func connectMessage(_ serverText: String?) -> String {
        let text = (serverText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return L10n.pick("Connected!", "已添加！") }
        guard L10n.isZh else { return text }
        return serverMessagesZh[text] ?? text
    }

    nonisolated private static let serverMessagesZh: [String: String] = [
        "Added — start chatting!": "已添加，开始聊天吧！",
        "Connected!": "已添加！",
        "Connect failed": "添加失败",
        "Connection code cannot be empty": "编号不能为空",
        "Invalid connection code": "无效的编号",
        "You cannot add yourself": "不能添加自己",
        "User not found": "用户不存在",
        "This user is unavailable": "该用户不可用",
    ]

    // MARK: Overlay plumbing (own package → presented directly, PLAN §A.2.6)

    /// `AppActions.openFriendHub(panel)` (WP-16) → the home "+" popover's three entries.
    @MainActor
    static func present(panel: FriendHubPanel) {
        let vm = FriendHubViewModel(panel: panel)
        vm.onAppear()
        OverlayRouter.shared.present(AppOverlay(id: overlayId,
                                                style: .fullPage,
                                                swipeBack: true,
                                                onDismiss: { [weak vm] in vm?.handleDismiss() }) {
            FriendHubView(vm: vm)
        })
    }
}
