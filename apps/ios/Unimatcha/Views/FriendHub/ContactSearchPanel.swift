import SwiftUI

// MARK: - Contact search panel (h5-addfriend-ads.md §1.1.b, §2.2)
//
// Offline search over the cached `/chat/sessions` list — no network while typing, no "find
// people" section (product decision 2026-08-19: adding friends lives only in "Add by QR").
//   pill    `flex items-center gap-2 bg-surface-container-low rounded-full px-4 py-2.5`,
//           20 pt `search` glyph + 14 pt field, placeholder "Search your contacts", autofocus 50 ms
//   results `space-y-2` rows: 36 pt avatar (image, else a 18 pt `person` glyph on `#eee`),
//           name 14/700 (**note first**, then nickname, then "Partner"), subtitle 10 pt `outline`
//           (last message, `[Photo]` for image-only, else the zh-mapped school), `chevron_right`
//   empty   11 pt italic `outline`: "No conversations matched." with a term, otherwise
//           "No conversations yet."
// An empty term lists every session (temp + confirmed) in the order the server returned.

struct ContactSearchPanel: View {
    @ObservedObject var vm: FriendHubViewModel
    @ObservedObject private var store = ChatSessionsStore.shared

    @FocusState private var focused: Bool

    init(vm: FriendHubViewModel) { self.vm = vm }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            searchPill
            results
        }
        .onAppear {
            // H5 focuses the field 50 ms after the panel is shown.
            DispatchQueue.main.asyncAfter(deadline: .now() + FriendHubViewModel.searchFocusDelay) {
                focused = true
            }
        }
    }

    // MARK: Pill

    private var searchPill: some View {
        HStack(spacing: 8) {
            MaterialIcon(name: "search", size: 20, color: Theme.C.outline)
            ZStack(alignment: .leading) {
                if vm.searchTerm.isEmpty {
                    Text(L10n.placeholder("Search your contacts"))
                        .font(Theme.font(14))
                        .foregroundColor(Theme.C.outline)
                        .lineLimit(1)
                        .allowsHitTesting(false)
                }
                TextField("", text: $vm.searchTerm)
                    .font(Theme.font(14))
                    .foregroundColor(Theme.C.onSurface)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .submitLabel(.search)
                    .focused($focused)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background(Theme.C.containerLow)
        .clipShape(Capsule())
        .contentShape(Capsule())
        .onTapGesture { focused = true }
    }

    // MARK: Results

    @ViewBuilder
    private var results: some View {
        let rows = vm.results(in: store.sessions)
        if rows.isEmpty && vm.isLoadingSessions {
            // H5 leaves the results box empty while the first `/chat/sessions` call is in flight —
            // "No conversations yet." would be a lie for the half second it takes.
            Color.clear.frame(height: 0)
        } else if rows.isEmpty {
            Text(vm.hasSearchTerm
                 ? L10n.t("No conversations matched.")
                 : L10n.t("No conversations yet."))
                .font(Theme.font(11).italic())
                .foregroundColor(Theme.C.outline)
                .padding(.horizontal, 4)
                .padding(.bottom, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            LazyVStack(spacing: 8) {
                ForEach(rows) { session in
                    ContactRow(session: session) { vm.openSession(session) }
                }
            }
        }
    }
}

// MARK: - Row

struct ContactRow: View {
    let session: ChatSession
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                avatar
                VStack(alignment: .leading, spacing: 0) {
                    Text(FriendHubViewModel.rowName(session))
                        .font(Theme.font(14, weight: .bold))
                        .foregroundColor(Theme.C.onSurface)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    let subtitle = FriendHubViewModel.rowSubtitle(session)
                    if !subtitle.isEmpty {
                        Text(subtitle)
                            .font(Theme.font(10))
                            .foregroundColor(Theme.C.outline)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                MaterialIcon(name: "chevron_right", size: 24, color: Theme.C.outline)
            }
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressOpacityButtonStyle(opacity: 0.7))
    }

    /// 36 pt circle on `surface-container`; the H5 fallback is a `person` glyph, not initials.
    private var avatar: some View {
        ZStack {
            Circle().fill(Theme.C.container)
            if SafeURL.isSafe(session.partner.avatarUrl) {
                RemoteImage(url: session.partner.avatarUrl, contentMode: .fill)
            } else {
                MaterialIcon(name: "person", size: 18, color: Theme.C.outline)
            }
        }
        .frame(width: 36, height: 36)
        .clipShape(Circle())
    }
}
