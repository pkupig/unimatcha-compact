import SwiftUI

// MARK: - BootErrorView (PLAN §A.4 `.bootError`, D11 — iOS-only Retry state)
//
// Shown when `GET /users/me` fails at boot for a transport / server reason (not 401). The token
// is kept; Retry re-runs `SessionStore.checkUserState()`. The H5 logged the user out here
// (h5-core gotcha 2/18) — deliberately not replicated.

struct BootErrorView: View {
    @ObservedObject private var session = SessionStore.shared
    @State private var retrying = false

    var body: some View {
        ZStack {
            Theme.C.surface.ignoresSafeArea()
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                EmptyState(
                    material: "cloud_off",
                    title: L10n.t("Failed to load"),
                    subtitle: subtitle,
                    tone: .muted,
                    action: (retrying ? L10n.t("Loading…") : L10n.t("Retry"), { retry() }),
                    actionStyle: .underline,
                    topPadding: 0
                )
                .opacity(retrying ? 0.7 : 1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Theme.Space.page)
        }
    }

    private var subtitle: String {
        let m = (session.bootErrorMessage ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return m.isEmpty ? L10n.t("Check your connection and try again") : m
    }

    private func retry() {
        guard !retrying else { return }
        retrying = true
        Task {
            await session.retryBoot()
            retrying = false
        }
    }
}
