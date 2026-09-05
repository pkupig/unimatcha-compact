import Foundation
import SwiftUI

// MARK: - QuestionnaireViewModel (h5-questionnaire.md §2, §4; PLAN §B.7 / §C.2) — WP-05
//
// App-level instance (`QuestionnaireViewModel.shared`) — the port of the H5 `S.*` slots:
//   `S.questionnaire`      → `questionnaire` (single slot shared by both modes)
//   `S.questionnaireMode`  → `mode`
//   `S.romanticAnswers` / `S.friendAnswers` → `buckets[mode]`
//   `S.currentQuestion`    → `currentIndex` (shared by both modes)
//   module-local `isSubmitting` → `isSubmitting` (not reset by cleanup, H5 parity)
// Presents its own overlays (`page-questionnaire`, `questionnaire-cards`, `q-nav`) and
// clears itself on `.sessionDidReset`.

// MARK: Pure rules (shared by resume, nav-grid colouring, submit and the fixture check)

enum QuestionnaireLogic {
    /// H5 blank rule: `undefined | null | '' | []` ⇒ blank (TEXT trimmed on iOS, gotcha 3).
    static func isBlank(_ value: AnswerValue?) -> Bool {
        guard let v = value else { return true }
        return v.isBlank
    }

    /// First question whose answer is blank; when every question is answered → the **last**
    /// question (gotcha 6: retake lands on "Submit"); empty list → 0.
    static func firstUnansweredIndex(questions: [Question], bucket: [String: AnswerValue]) -> Int {
        guard !questions.isEmpty else { return 0 }
        if let i = questions.firstIndex(where: { isBlank(bucket[$0.id]) }) { return i }
        return questions.count - 1
    }

    /// First `isRequired` question that is blank (client-side required check, submit only).
    static func firstMissingRequiredIndex(questions: [Question], bucket: [String: AnswerValue]) -> Int? {
        questions.firstIndex { $0.isRequired && isBlank(bucket[$0.id]) }
    }

    /// `/answers/mine` rows → bucket, re-typed per question; rows for questions outside the
    /// version are ignored (they could only produce the "foreign question ids" 400).
    static func hydrate(answers: [MyAnswer], version: QuestionnaireVersion) -> [String: AnswerValue] {
        var byId: [String: Question] = [:]
        for q in version.questions { byId[q.id] = q }
        var bucket: [String: AnswerValue] = [:]
        // Rows arrive `submittedAt desc`; keep the first (newest) per question.
        for a in answers where !a.questionId.isEmpty {
            guard let q = byId[a.questionId], bucket[q.id] == nil else { continue }
            if let v = AnswerValue.from(json: a.value, type: q.type) {
                bucket[q.id] = v
            }
        }
        return bucket
    }

    /// Payload in question order, blank entries dropped (so a cleared TEXT / emptied MULTI is
    /// not sent — the server upserts and never deletes, gotcha 4), TEXT trimmed.
    static func payload(questions: [Question], bucket: [String: AnswerValue]) -> [AnswerItem] {
        questions.compactMap { q in
            guard let v = bucket[q.id], !isBlank(v) else { return nil }
            return AnswerItem(questionId: q.id, value: v.wireValue)
        }
    }

    static func answeredCount(questions: [Question], bucket: [String: AnswerValue]) -> Int {
        questions.reduce(0) { $0 + (isBlank(bucket[$1.id]) ? 0 : 1) }
    }
}

// MARK: Copy owned by this package (h5-questionnaire.md §5; toasts localised per D3)

enum QuestionnaireCopy {
    // Pre-start confirm card (render-time branch in H5)
    static var confirmTitle: String { L10n.pick("Before you start", "开始前，先说一句") }
    static var confirmBody: String {
        L10n.pick(
            "The questions ahead are direct and personal — be ready. No offence is intended: honest answers simply make your matches better. Everything you answer is strictly confidential and never shown to anyone. Go with your first instinct.",
            "接下来的问题会比较犀利、直接，请先做好心理准备。这些问题绝无任何冒犯之意，只是为了更真实地了解你、给你更精准的匹配。你的所有作答都会严格保密、不会公开给任何人。凭第一反应、如实作答就好。"
        )
    }
    static var confirmOK: String { L10n.pick("I'm ready", "我准备好了") }
    static var confirmCancel: String { L10n.pick("Maybe later", "再想想") }

    // Toasts (English only in H5 — iOS ships zh)
    static var loadFailed: String { L10n.pick("Failed to load questionnaire", "问卷加载失败") }
    /// H5 falls back to the literal `'this question'` when the version carries no title.
    static func requiredMissing(_ title: String) -> String {
        let label = title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? L10n.pick("this question", "这道题")
            : title
        return L10n.pick("Please answer required question: ", "请先回答必答题：") + label
    }
    static func complete(count: Int?) -> String {
        if let n = count {
            return L10n.pick("Assessment complete! \(n) questions answered", "答题完成！已回答 \(n) 题")
        }
        return L10n.pick("Assessment complete!", "答题完成！")
    }
    static func submitFailed(_ message: String) -> String {
        L10n.pick("Submit failed: ", "提交失败：") + message
    }
    /// Server rejected the payload because required questions are missing. The wire text lists
    /// the **zh** titles (api-matching gotcha 12) — show our own copy instead.
    static var requiredMissingGeneric: String {
        L10n.pick("Some required questions are still unanswered", "还有必答题没有回答")
    }
    /// The version rotated mid-fill (or the cached copy went stale) — reloading the latest one.
    static var versionRotated: String {
        L10n.pick("The questionnaire was updated — loading the latest version", "问卷已更新，正在加载最新版本")
    }

    // iOS-only states (H5 had none, gotcha 7)
    static var noQuestionnaireTitle: String { L10n.pick("No questionnaire available", "暂无问卷") }
    static var noQuestionnaireSubtitle: String {
        L10n.pick("This mode has no active questionnaire yet.", "该模式暂未发布问卷，请稍后再试。")
    }
    static var noQuestionsTitle: String { L10n.pick("Nothing to answer yet", "暂无题目") }
    static var noQuestionsSubtitle: String {
        L10n.pick("This questionnaire has no questions yet.", "这份问卷还没有题目。")
    }

    static func modeBadge(_ mode: MatchMode) -> String {
        mode == .romantic ? L10n.t("Romantic") : L10n.t("Friend")
    }
    static func modeIcon(_ mode: MatchMode) -> String {
        mode == .romantic ? "auto_awesome" : "group"
    }
    static func cardTitle(_ mode: MatchMode) -> String {
        mode == .romantic ? L10n.t("Romantic Questionnaire") : L10n.t("Friend Questionnaire")
    }

    static let scaleLabels = ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"]
}

// MARK: View model

@MainActor
final class QuestionnaireViewModel: ObservableObject {
    static let shared = QuestionnaireViewModel()

    static let pageOverlayId = "page-questionnaire"
    static let cardsOverlayId = "questionnaire-cards"
    static let navOverlayId = "q-nav"

    /// `S.questionnaireMode` — bucket selector; default romantic.
    @Published private(set) var mode: MatchMode = .romantic
    /// `S.questionnaire` — the last loaded version (single slot shared by both modes).
    @Published private(set) var questionnaire: QuestionnaireVersion?
    /// Mode the slot was loaded for (a version belongs to exactly one type).
    @Published private(set) var loadedMode: MatchMode?
    /// `S.romanticAnswers` / `S.friendAnswers`.
    @Published private(set) var buckets: [MatchMode: [String: AnswerValue]] = [.romantic: [:], .friend: [:]]
    /// `S.currentQuestion` — 0-based, shared by both modes.
    @Published private(set) var currentIndex: Int = 0
    @Published private(set) var isLoading = false
    /// Last `/questionnaire/active` failure message (nil once a load succeeds).
    @Published private(set) var loadError: String?
    @Published private(set) var isSubmitting = false
    /// Cards overlay: nil = neutral (both "Start"); filled after `GET /questionnaire/completion`.
    @Published private(set) var cardsCompletion: QuestionnaireCompletion?

    private var loadGeneration = 0
    private var cardsGeneration = 0
    /// Set right before dismissing the page after a successful submit (H5 `S.homeView = mode`).
    private var pendingHomeView: HomeView?
    private var resetObserver: NSObjectProtocol?

    init() {
        resetObserver = NotificationCenter.default.addObserver(forName: .sessionDidReset, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.reset() }
        }
    }

    // MARK: PLAN §B.7 API (used by WP-06 / WP-16)

    /// `GET /questionnaire/completion`; nil on any failure = fail-open (h5-questionnaire §3.5).
    func completion() async -> QuestionnaireCompletion? {
        do {
            return try await QuestionnaireService.completion()
        } catch {
            return nil
        }
    }

    /// Presents `page-questionnaire` and loads the mode (match prompt card / refill banner /
    /// preferences "Retake" — no pre-start confirm on these paths, gotcha 9).
    func open(mode: MatchMode) {
        // H5 sets `S.questionnaireMode` + the badge synchronously before the fetch; do the same
        // so the first frame never shows the other mode's slot or the "no questions" state.
        beginLoad(mode: mode)
        presentPage()
        Task { await load(mode: mode) }
    }

    /// Presents `questionnaire-cards` (post-setup chooser). Both cards are reset to neutral
    /// *before* the completion request so a slow response never shows another account's ticks.
    func presentCards() {
        cardsGeneration += 1
        let gen = cardsGeneration
        cardsCompletion = nil
        OverlayRouter.shared.present(AppOverlay(
            id: Self.cardsOverlayId,
            style: .card(dismissOnBackdrop: false),
            swipeBack: false,
            onDismiss: nil
        ) {
            QuestionnaireCardsView()
        })
        Task {
            // Failure keeps both cards as "Start" silently (H5: console.error only).
            let result = try? await QuestionnaireService.completion()
            guard gen == self.cardsGeneration else { return }
            if let c = result { self.cardsCompletion = c }
        }
    }

    // MARK: Cards overlay

    func dismissCards() {
        OverlayRouter.shared.dismiss(id: Self.cardsOverlayId)
    }

    func isCardCompleted(_ mode: MatchMode) -> Bool {
        cardsCompletion?.isCompleted(mode) ?? false
    }

    /// "Start" / "Retake" → pre-start confirm card → close cards → page (h5-questionnaire §2.1).
    func startFromCards(mode: MatchMode) {
        Task {
            let ok = await DialogCenter.shared.confirm(
                title: QuestionnaireCopy.confirmTitle,
                body: QuestionnaireCopy.confirmBody,
                confirmLabel: QuestionnaireCopy.confirmOK,
                cancelLabel: QuestionnaireCopy.confirmCancel
            )
            // Cancel (false) and backdrop (nil) both keep the user on the cards overlay.
            guard ok == true else { return }
            dismissCards()
            open(mode: mode)
        }
    }

    // MARK: Page overlay

    private func presentPage() {
        OverlayRouter.shared.present(AppOverlay(
            id: Self.pageOverlayId,
            style: .fullPage,
            swipeBack: true,
            onDismiss: { [weak self] in self?.pageDidDismiss() }
        ) {
            QuestionnairePageView()
        })
    }

    /// Header back arrow (and the swipe-back gesture through `onDismiss`): leave without
    /// saving; answers stay in memory for a same-version resume (gotcha 17).
    func exitPage() {
        OverlayRouter.shared.dismiss(id: Self.pageOverlayId)
    }

    /// Every dismissal path of `page-questionnaire`. H5 exits with `showPage('page-home');
    /// switchTab('match')`; after a submit it first sets `S.homeView = questionnaireMode`.
    private func pageDidDismiss() {
        if OverlayRouter.shared.isPresented(Self.navOverlayId) {
            OverlayRouter.shared.dismiss(id: Self.navOverlayId)
        }
        let pending = pendingHomeView
        pendingHomeView = nil
        // Logout / 401 tear-down also dismisses us: no navigation then.
        guard SessionStore.shared.token != nil else { return }
        // H5 order: `S.homeView = questionnaireMode` (submit only) → `showPage('page-home')`
        // → `switchTab('match')`, which reads the *already updated* `S.homeView`. Setting the
        // home view first is what makes the tab land on that mode's pane, and it keeps the
        // sequence correct whether or not a re-tap of an already-active tab re-activates it.
        if let view = pending {
            AppActions.shared.switchHomeView(view)
        }
        AppActions.shared.switchTab(.match)
    }

    // MARK: Load (h5-questionnaire §2.2)

    /// Synchronous prelude of `load(mode:)`: selects the bucket, drops the other mode's slot
    /// (its render must not be shown for this one) and flips the page into its loading state.
    private func beginLoad(mode: MatchMode) {
        self.mode = mode
        if loadedMode != mode {
            questionnaire = nil
            loadedMode = nil
        }
        isLoading = true
        loadError = nil
    }

    func load(mode: MatchMode) async {
        beginLoad(mode: mode)
        loadGeneration += 1
        let gen = loadGeneration
        do {
            let version = try await QuestionnaireService.active(mode: mode)
            guard gen == loadGeneration else { return }
            let bucket = buckets[mode] ?? [:]
            // A19: same version id + non-empty in-memory bucket → resume.
            let resume = questionnaire?.id == version.id && loadedMode == mode && !bucket.isEmpty
            questionnaire = version
            loadedMode = mode
            if resume {
                if currentIndex < 0 || currentIndex >= version.questions.count {
                    currentIndex = QuestionnaireLogic.firstUnansweredIndex(questions: version.questions, bucket: bucket)
                }
                isLoading = false
                return
            }
            // First load / different version / other mode in between: reset + hydrate.
            buckets[mode] = [:]
            currentIndex = 0
            var hydrated: [String: AnswerValue] = [:]
            if let mine = try? await QuestionnaireService.myAnswers(versionId: version.id) {
                guard gen == loadGeneration else { return }
                hydrated = QuestionnaireLogic.hydrate(answers: mine, version: version)
            }
            guard gen == loadGeneration else { return }
            buckets[mode] = hydrated
            currentIndex = QuestionnaireLogic.firstUnansweredIndex(questions: version.questions, bucket: hydrated)
            isLoading = false
        } catch {
            guard gen == loadGeneration else { return }
            isLoading = false
            if let e = error as? APIError, e.isUnauthorized { return }
            loadError = APIError.message(of: error)
            ToastCenter.shared.show(QuestionnaireCopy.loadFailed)
        }
    }

    func retryLoad() {
        Task { await load(mode: mode) }
    }

    // MARK: Derived

    /// Questions of the loaded version when it belongs to the current mode.
    var questions: [Question] {
        guard loadedMode == mode, let q = questionnaire else { return [] }
        return q.questions
    }

    var currentQuestion: Question? {
        let qs = questions
        guard qs.indices.contains(currentIndex) else { return nil }
        return qs[currentIndex]
    }

    var isLastQuestion: Bool {
        let n = questions.count
        return n > 0 && currentIndex >= n - 1
    }

    var isFirstQuestion: Bool { currentIndex <= 0 }

    /// Position-based progress `(index+1)/total` (gotcha 13), 0 when empty.
    var progressFraction: Double {
        let n = questions.count
        guard n > 0 else { return 0 }
        return Double(min(currentIndex + 1, n)) / Double(n)
    }

    /// True while the page has nothing renderable for this mode and a fetch is in flight.
    var showsLoading: Bool { isLoading && questions.isEmpty && loadError == nil }

    func answer(_ questionId: String) -> AnswerValue? {
        buckets[mode]?[questionId]
    }

    func isAnswered(_ questionId: String) -> Bool {
        !QuestionnaireLogic.isBlank(answer(questionId))
    }

    func scaleAnswer(_ questionId: String) -> Int? {
        if case .scale(let n)? = answer(questionId) { return n }
        return nil
    }

    func singleAnswer(_ questionId: String) -> String? {
        if case .single(let s)? = answer(questionId) { return s }
        return nil
    }

    func multiAnswer(_ questionId: String) -> [String] {
        if case .multi(let a)? = answer(questionId) { return a }
        return []
    }

    func textAnswer(_ questionId: String) -> String {
        if case .text(let s)? = answer(questionId) { return s }
        return ""
    }

    // MARK: Answering (h5-questionnaire §2.3)

    func answerScale(_ questionId: String, _ value: Int) {
        setAnswer(questionId, .scale(value))
    }

    /// Tapping the selected row again keeps it selected (no deselect).
    func answerSingle(_ questionId: String, value: String) {
        setAnswer(questionId, .single(value))
    }

    /// Toggle: `push` on select, `splice` on deselect → array order = selection order.
    func toggleMulti(_ questionId: String, value: String) {
        var arr = multiAnswer(questionId)
        if let i = arr.firstIndex(of: value) {
            arr.remove(at: i)
        } else {
            arr.append(value)
        }
        setAnswer(questionId, .multi(arr))
    }

    /// Raw string on every keystroke (no trim); blank rule trims at read time.
    func answerText(_ questionId: String, _ text: String) {
        if textAnswer(questionId) == text { return }
        setAnswer(questionId, .text(text))
    }

    private func setAnswer(_ questionId: String, _ value: AnswerValue) {
        var b = buckets[mode] ?? [:]
        b[questionId] = value
        buckets[mode] = b
    }

    // MARK: Navigation (h5-questionnaire §2.4)

    func next() {
        if isLastQuestion {
            Task { await submit() }
        } else if currentIndex < questions.count - 1 {
            currentIndex += 1
        }
    }

    func previous() {
        if currentIndex > 0 { currentIndex -= 1 }
    }

    /// Nav grid tap: jump + hide the sheet.
    func jump(to index: Int) {
        if questions.indices.contains(index) {
            currentIndex = index
        }
        OverlayRouter.shared.dismiss(id: Self.navOverlayId)
    }

    /// Header `grid_view` → `q-nav` bottom sheet (no-op when nothing is loaded).
    func openNav() {
        guard !questions.isEmpty else { return }
        OverlayRouter.shared.present(AppOverlay(
            id: Self.navOverlayId,
            style: .bottomSheet,
            swipeBack: false,
            onDismiss: nil
        ) {
            QuestionNavSheet()
        })
    }

    // MARK: Submit (h5-questionnaire §2.6)

    func submit() async {
        guard !isSubmitting, loadedMode == mode, let version = questionnaire else { return }
        let bucket = buckets[mode] ?? [:]
        if let missing = QuestionnaireLogic.firstMissingRequiredIndex(questions: version.questions, bucket: bucket) {
            currentIndex = missing
            ToastCenter.shared.show(QuestionnaireCopy.requiredMissing(version.questions[missing].displayTitle))
            return
        }
        isSubmitting = true
        defer { isSubmitting = false }
        let items = QuestionnaireLogic.payload(questions: version.questions, bucket: bucket)
        let gen = loadGeneration
        do {
            let result = try await QuestionnaireService.submit(versionId: version.id, answers: items)
            // A 401 mid-flight tears the session down; a newer load supersedes this page state.
            guard gen == loadGeneration, SessionStore.shared.token != nil else { return }
            ToastCenter.shared.show(QuestionnaireCopy.complete(count: result.answeredCount))
            pendingHomeView = HomeView(mode: mode)
            OverlayRouter.shared.dismiss(id: Self.pageOverlayId)
        } catch {
            if let e = error as? APIError, e.isUnauthorized { return }
            guard gen == loadGeneration else { return }
            let message = APIError.message(of: error)
            // The three failure modes worth surfacing properly on iOS (h5-questionnaire gotcha 11,
            // api-matching gotcha 12). The server's own text is English except for the required
            // list, which embeds the **zh** question titles — never toast that verbatim.
            if message.range(of: "no longer accepts submissions", options: .caseInsensitive) != nil
                || message.range(of: "do not belong to this questionnaire version", options: .caseInsensitive) != nil {
                // Version rotated mid-fill / stale cached version: the question ids we hold are no
                // longer valid, so drop the slot and re-fetch — exactly like an H5 re-entry.
                ToastCenter.shared.show(QuestionnaireCopy.versionRotated)
                questionnaire = nil
                loadedMode = nil
                await load(mode: mode)
                return
            }
            if message.range(of: "required questions are not answered", options: .caseInsensitive) != nil {
                // Our cached `isRequired` flags are behind the server's (the client check passed).
                // Keep the typed answers, jump to the first still-blank question and use our copy.
                if let blank = version.questions.firstIndex(where: { QuestionnaireLogic.isBlank(bucket[$0.id]) }) {
                    currentIndex = blank
                }
                ToastCenter.shared.show(QuestionnaireCopy.requiredMissingGeneric)
                return
            }
            ToastCenter.shared.show(QuestionnaireCopy.submitFailed(message))
        }
    }

    // MARK: Reset (`cleanupUserState`)

    func reset() {
        loadGeneration += 1
        cardsGeneration += 1
        questionnaire = nil
        loadedMode = nil
        buckets = [.romantic: [:], .friend: [:]]
        mode = .romantic
        currentIndex = 0
        isLoading = false
        loadError = nil
        cardsCompletion = nil
        pendingHomeView = nil
        // `isSubmitting` is intentionally left alone (H5 parity: the in-flight `finally` clears it).
    }
}
