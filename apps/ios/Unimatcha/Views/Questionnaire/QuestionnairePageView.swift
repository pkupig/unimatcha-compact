import SwiftUI

// MARK: - QuestionnairePageView (h5-questionnaire.md §1.3, §2.2–§2.6) — overlay `page-questionnaire`
//
// Full-page overlay (swipe-back on). Geometry from the H5 page:
//   header  fixed, 64 + top inset glass bar, px-6: `arrow_back` (exit) … `grid_view` (nav sheet)
//   main    scrolls, px-6, max-w-2xl; starts 80 + inset (= 16 pt below the bar), `mb-12` (48) after
//           the step indicator; question section `space-y-8` (32) with the `Q.NN` watermark
//           at (−16, −40) 48/900 `containerHighest` @ 20 %, title 20/700 tight leading-snug
//   footer  fixed, white, `border-t containerHigh`, px-6 py-6 (+ safe-area bottom on iOS):
//           Previous (hidden on Q1, slot kept) … Next / Submit neon block px-10 py-4
// iOS adds the loading / error / empty states the H5 never had (gotcha 7).

struct QuestionnairePageView: View {
    @ObservedObject private var vm = QuestionnaireViewModel.shared

    private static let contentMaxWidth: CGFloat = 672   // max-w-2xl

    init() {}

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    modeBadge
                        .padding(.bottom, 16)
                        .id("q-top")
                    if let q = vm.currentQuestion {
                        stepIndicator
                            .padding(.bottom, 48)
                        questionSection(q)
                    } else {
                        stateBlock
                    }
                }
                .padding(.horizontal, Theme.Space.page)
                .padding(.top, 16)
                .padding(.bottom, 8)
                .frame(maxWidth: Self.contentMaxWidth, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .background(Theme.C.surface)
            .safeAreaInset(edge: .top, spacing: 0) { header }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if vm.currentQuestion != nil {
                    footer
                }
            }
            .onChange(of: vm.currentIndex) { _ in
                proxy.scrollTo("q-top", anchor: .top)
            }
        }
    }

    // MARK: Header

    private var header: some View {
        FullPageBar.backTitle("", onBack: { vm.exitPage() }) {
            IconButton(
                material: "grid_view",
                size: 40,
                iconSize: 24,
                tint: Theme.C.onSurface,
                accessibilityLabel: "Questions",
                action: { vm.openNav() }
            )
            .padding(.trailing, -8)
        }
    }

    // MARK: Step indicator

    /// `#q-mode-badge`: neon pill, icon 14 + 10/700 tracking .15em, set before the fetch.
    private var modeBadge: some View {
        HStack(spacing: 6) {
            MaterialIcon(name: QuestionnaireCopy.modeIcon(vm.mode), size: 14, color: .black)
            Text(QuestionnaireCopy.modeBadge(vm.mode))
                .font(Theme.font(10, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.label, size: 10))
                .foregroundColor(.black)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .background(Theme.C.neon)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
    }

    private var stepIndicator: some View {
        let total = vm.questions.count
        let position = min(vm.currentIndex + 1, max(total, 1))
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .lastTextBaseline) {
                Text(L10n.t("Assessment Progress"))
                    .font(Theme.font(12, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.section, size: 12))
                    .foregroundColor(Theme.C.onSurfaceVariant)
                Spacer(minLength: 8)
                HStack(spacing: 0) {
                    Text(Self.padded(position))
                        .foregroundColor(Theme.C.onSurface)
                    Text("/")
                        .foregroundColor(Theme.C.outlineVariantText)
                        .padding(.horizontal, 4)
                    Text(Self.padded(total))
                        .foregroundColor(Theme.C.onSurface)
                }
                .font(Theme.font(18, weight: .heavy))
            }
            .padding(.bottom, 16)
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Rectangle().fill(Theme.C.containerHighest)
                    Rectangle()
                        .fill(Theme.C.primary)
                        .frame(width: g.size.width * CGFloat(vm.progressFraction))
                        .animation(.easeInOut(duration: 0.5), value: vm.progressFraction)
                }
            }
            .frame(height: 2)
        }
    }

    /// Zero-padded to 2 digits ("03 / 18", "Q.03").
    static func padded(_ n: Int) -> String {
        n < 10 ? "0\(n)" : String(n)
    }

    // MARK: Question

    private func questionSection(_ q: Question) -> some View {
        VStack(alignment: .leading, spacing: 32) {
            ZStack(alignment: .topLeading) {
                Text("Q.\(Self.padded(vm.currentIndex + 1))")
                    .font(Theme.font(48, weight: .black))
                    .foregroundColor(Theme.C.containerHighest.opacity(0.2))
                    .lineLimit(1)
                    .fixedSize()
                    .offset(x: -16, y: -40)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                Text(q.displayTitle)
                    .font(Theme.font(20, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.tight, size: 20))
                    .lineSpacing(4)
                    .foregroundColor(Theme.C.onSurface)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .zIndex(1)
            }
            QuestionOptionsView(question: q, vm: vm)
        }
        .id(q.id)
    }

    // MARK: Footer

    private var footer: some View {
        HStack(spacing: 0) {
            // `#q-prev-btn`: `visibility:hidden` on question 1 — keeps its slot so Next stays right.
            Button {
                vm.previous()
            } label: {
                HStack(spacing: 8) {
                    MaterialIcon(name: "arrow_back", size: 14, weight: .medium)
                    Text(L10n.t("Previous"))
                        .font(Theme.font(14, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 14))
                }
                .foregroundColor(Theme.C.onSurfaceVariant)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleIcon))
            .opacity(vm.isFirstQuestion ? 0 : 1)
            .disabled(vm.isFirstQuestion)
            .accessibilityHidden(vm.isFirstQuestion)

            Spacer(minLength: 8)

            // `#q-next-btn`: Next + arrow_forward, or Submit + check on the last question;
            // disabled (no visual change) only while the POST is in flight.
            Button {
                vm.next()
            } label: {
                HStack(spacing: 16) {
                    Text(vm.isLastQuestion ? L10n.t("Submit") : L10n.t("Next"))
                        .font(Theme.font(16, weight: .heavy))
                        .tracking(Theme.tracking(Theme.Tracking.section, size: 16))
                    MaterialIcon(name: vm.isLastQuestion ? "check" : "arrow_forward", size: 24, weight: .medium, color: .black)
                }
                .foregroundColor(.black)
                .padding(.horizontal, 40)
                .padding(.vertical, 16)
                .background(Theme.C.neon)
                .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleIcon))
            .disabled(vm.isSubmitting)
        }
        .frame(maxWidth: Self.contentMaxWidth)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Space.page)
        .padding(.vertical, 24)
        .background(Theme.C.card.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.C.containerHigh).frame(height: 1)
        }
    }

    // MARK: Loading / error / empty (iOS-only states)

    @ViewBuilder
    private var stateBlock: some View {
        if vm.showsLoading {
            LoadingLine()
        } else if let err = vm.loadError {
            if err.range(of: "No questionnaire available", options: .caseInsensitive) != nil {
                EmptyState(
                    material: "quiz",
                    title: QuestionnaireCopy.noQuestionnaireTitle,
                    subtitle: QuestionnaireCopy.noQuestionnaireSubtitle,
                    action: (L10n.t("Retry"), { vm.retryLoad() })
                )
            } else {
                EmptyState.loadFailed(retry: { vm.retryLoad() })
            }
        } else if vm.isLoading {
            // Same-mode reload with nothing renderable yet.
            LoadingLine()
        } else {
            // Loaded fine but the version has no enabled questions (H5 renders nothing).
            EmptyState(
                material: "quiz",
                title: QuestionnaireCopy.noQuestionsTitle,
                subtitle: QuestionnaireCopy.noQuestionsSubtitle,
                action: (L10n.t("Retry"), { vm.retryLoad() })
            )
        }
    }
}
