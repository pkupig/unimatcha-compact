import SwiftUI

// MARK: - Report a Problem modal (h5-settings.md §1.8, §2.8; overlay id `report`)
//
// Centred card (`max-w-md` 448, p-8, r10, card ground, internal scroll ≤85 % of the screen) on a
// dim backdrop that does NOT close on tap. Header: "Report a Problem" 18/700 + `close` glyph.
// Fields (labels 10 tracking widest `outline`): Category select (bug / user / content / other,
// default `bug`), Description textarea (rows 4, required), Contact (optional). Submit neon r10.
// Every open starts from a fresh state (the overlay content is rebuilt on present).

struct ReportProblemCard: View {
    static let overlayId = "report"

    @State private var category: ReportCategory = .bug
    @State private var content: String = ""
    @State private var contact: String = ""
    @State private var submitting: Bool = false

    init() {}

    /// Settings › Support › Report a Problem. WP-16 implements `AppActions.openReportProblem` with this.
    @MainActor
    static func present() {
        OverlayRouter.shared.present(AppOverlay(id: overlayId, style: .card(dismissOnBackdrop: false)) {
            ReportProblemCard()
        })
    }

    @MainActor
    static func dismiss() {
        OverlayRouter.shared.dismiss(id: overlayId)
    }

    /// Option labels (dictionary keys) in H5 `<select>` order.
    static func label(for c: ReportCategory) -> String {
        switch c {
        case .bug: return L10n.t("App bug")
        case .user: return L10n.t("Report a user")
        case .content: return L10n.t("Inappropriate content")
        case .other: return L10n.t("Other")
        }
    }

    var body: some View {
        // `max-h-[85vh] overflow-y-auto`: the form is laid out flat when it fits, otherwise the
        // same form inside a ScrollView fills the 85 % cap and scrolls internally.
        ViewThatFits(in: .vertical) {
            form
            ScrollView(.vertical, showsIndicators: false) { form }
        }
        .frame(maxWidth: OverlayChrome.cardMaxWidthMd)
        .frame(maxHeight: OverlayChrome.screenSize.height * 0.85)
        .background(Theme.C.card)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .shadow(color: Color.black.opacity(0.25), radius: 25, x: 0, y: 12)
        .padding(.horizontal, Theme.Space.page)
    }

    // MARK: Pieces

    private var form: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.bottom, 24)
            VStack(alignment: .leading, spacing: 24) {
                field(L10n.t("Category")) { categorySelect }
                field(L10n.t("Description")) {
                    SoftTextArea(text: $content,
                                 placeholder: L10n.placeholder("Tell us what happened..."),
                                 rows: 4,
                                 size: 14,
                                 style: .outlinedNeutral)
                }
                field(L10n.t("Contact (optional)")) { contactInput }
                submitButton
            }
        }
        .padding(32)
    }

    private var header: some View {
        HStack(alignment: .center) {
            Text(L10n.t("Report a Problem"))
                .font(Theme.font(18, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 18))
                .foregroundColor(Theme.C.onSurface)
            Spacer(minLength: 8)
            IconButton(material: "close",
                       size: 32,
                       iconSize: 22,
                       tint: Theme.C.stone400,
                       accessibilityLabel: "Close") {
                ReportProblemCard.dismiss()
            }
        }
    }

    private func field<Content: View>(_ label: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            MicroLabel(text: label, color: Theme.C.outline, tracking: Theme.Tracking.widest, weight: .regular)
            content()
        }
    }

    /// `<select>`: 1 pt `outlineVariant` border, r10, py-3 px-3, 14 pt; `expand_more` chevron.
    private var categorySelect: some View {
        Menu {
            ForEach(ReportCategory.allCases, id: \.self) { c in
                Button(action: { category = c }) {
                    if c == category {
                        Label(ReportProblemCard.label(for: c), systemImage: Theme.Icon.sf("check"))
                    } else {
                        Text(ReportProblemCard.label(for: c))
                    }
                }
            }
        } label: {
            HStack {
                Text(ReportProblemCard.label(for: category))
                    .font(Theme.font(14))
                    .foregroundColor(Theme.C.onSurface)
                Spacer(minLength: 8)
                Image(systemName: Theme.Icon.sf("expand_more"))
                    .font(.system(size: 14, weight: .light))
                    .foregroundColor(Theme.C.onSurfaceVariant)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                    .stroke(Theme.C.outlineVariant, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .disabled(submitting)
    }

    /// `<input type="text">` with the same bordered style as the select.
    private var contactInput: some View {
        TextField(L10n.placeholder("Email or phone for follow-up"), text: $contact)
            .font(Theme.font(14))
            .foregroundColor(Theme.C.onSurface)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled(true)
            .keyboardType(.emailAddress)
            .submitLabel(.done)
            .disabled(submitting)
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                    .stroke(Theme.C.outlineVariant, lineWidth: 1)
            )
    }

    private var submitButton: some View {
        Button(action: submit) {
            Text(L10n.t("Submit Report"))
                .font(Theme.font(10, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.section, size: 10))
                .foregroundColor(.black)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Theme.C.neon)
                .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleWide))
        .disabled(submitting)
        .opacity(submitting ? 0.5 : 1)
    }

    // MARK: Submit (§2.8)

    private func submit() {
        guard !submitting else { return }
        submitting = true
        let cat = category
        let text = content
        let who = contact
        Task { @MainActor in
            let ok = await SettingsViewModel.submitReport(category: cat, content: text, contact: who)
            submitting = false
            if ok { ReportProblemCard.dismiss() }
        }
    }
}
