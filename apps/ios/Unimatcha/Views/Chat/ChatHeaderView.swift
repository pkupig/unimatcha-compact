import SwiftUI

// MARK: - ChatHeaderView (h5-chat.md §1.3 header, §2.9–§2.10; design §8.20 "Header actions") — WP-07
//
// `64 + safe-top` glass bar with a 1 pt bottom hairline, `px-6`:
//   left    `arrow_back` 24 → close, then gap-3: 36 pt avatar (→ partner profile) and the name
//           stack (14/700 tracking-tight + 10 pt tracking-widest school through `metaLabel`)
//   right   actions rendered from `sessionType` / `myConfirmed` (nothing at all when the
//           conversation carries no session metadata — which cannot happen on iOS, gotcha 1):
//           temp && !myConfirmed → neon "Confirm as Partner/Friend" pill
//           temp && myConfirmed  → disabled "Waiting for them…" outline pill
//           always               → `link_off` dissolve button

struct ChatHeaderView: View {
    @ObservedObject var vm: ChatViewModel
    let safeTop: CGFloat
    let onBack: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            HStack(spacing: 0) {
                Button(action: onBack) {
                    Image(systemName: Theme.Icon.sf("arrow_back"))
                        .font(.system(size: 24, weight: .light))
                        .foregroundColor(Theme.C.onSurface)
                        .frame(width: 24, height: 24)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.trailing, 12)

                HStack(spacing: 12) {
                    Button {
                        vm.openPartnerProfile()
                    } label: {
                        AvatarView(url: vm.context.partnerAvatarUrl,
                                   name: vm.context.partnerName,
                                   size: 36,
                                   fallback: .chat)
                    }
                    .buttonStyle(.plain)

                    VStack(alignment: .leading, spacing: 1) {
                        Text(vm.context.partnerName)
                            .font(Theme.font(14, weight: .bold))
                            .tracking(Theme.tracking(Theme.Tracking.tight, size: 14))
                            .foregroundColor(Theme.C.primary)
                            .lineLimit(1)
                        if let school = vm.context.partnerSchoolLabel {
                            Text(school)
                                .font(Theme.font(10))
                                .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                                .foregroundColor(Theme.C.neutral400)
                                .lineLimit(1)
                        }
                    }
                }
            }
            Spacer(minLength: 8)
            actions
        }
        .padding(.horizontal, Theme.Space.page)
        .frame(height: Theme.Bar.overlay)
        .padding(.top, safeTop)
        .frame(maxWidth: .infinity)
        .background(
            Theme.C.glassBar
                .background(.ultraThinMaterial)
                .overlay(alignment: .bottom) { Theme.C.hairline20.frame(height: 1) }
        )
    }

    // MARK: Actions

    @ViewBuilder
    private var actions: some View {
        if vm.context.hasSessionMetadata {
            HStack(spacing: 8) {
                if vm.context.isTemp {
                    if vm.context.myConfirmed {
                        waitingPill
                    } else {
                        confirmPill
                    }
                }
                Button {
                    vm.dissolveRelationship()
                } label: {
                    Image(systemName: Theme.Icon.sf("link_off"))
                        .font(.system(size: 18, weight: .regular))
                        .foregroundColor(Theme.C.outline)
                        .padding(8)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(vm.actionInFlight)
                .accessibilityLabel(L10n.pick("Delete Relationship", "解除关系"))
            }
        }
    }

    private var confirmPill: some View {
        Button {
            vm.confirmRelationship()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: Theme.Icon.sf(vm.context.mode == .friend ? "group" : "auto_awesome"))
                    .font(.system(size: 14, weight: .semibold))
                Text(vm.context.mode == .friend ? L10n.t("Confirm as Friend") : L10n.t("Confirm as Partner"))
                    .font(Theme.font(10, weight: .bold))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
            }
            .foregroundColor(.black)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Theme.C.neon)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle(scale: Theme.Motion.pressScaleIcon))
        .disabled(vm.actionInFlight)
        .opacity(vm.actionInFlight ? 0.6 : 1)
    }

    private var waitingPill: some View {
        Text(L10n.pick("Waiting for them…", "等待对方确认…"))
            .font(Theme.font(10, weight: .bold))
            .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
            .foregroundColor(Theme.C.outline)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                    .stroke(Theme.C.outlineVariant.opacity(0.4), lineWidth: 1)
            )
            .opacity(0.6)
    }
}
