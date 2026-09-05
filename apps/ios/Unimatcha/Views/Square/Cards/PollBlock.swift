import SwiftUI

// MARK: - PollBlock (`pollBlock` — h5-square.md §1.3, api-square §2.7) — WP-08
//
// `.poll-block`: column, gap 6, `my-3` (12 vertical). Optional review chip above the rows (pending →
// UNDER REVIEW, rejected → REJECTED). One `.poll-opt` button per option: full width, padding 9/12,
// 1 pt `#c6c6c6` border, radius 10, `card` bg; `.poll-opt-fill` left bar `width = pct%` neon/.28
// (`.5` for mine), width animates 0.4 s; label 13/600 onSurface ellipsis; count JetBrains Mono 11
// onSurfaceVariant `pct%` (empty when total 0). Mine → 1.5 pt onSurface border. Tappable only when
// `reviewStatus === 'approved'`. Footer 10 outline widest `mt-1.5`: "{total} vote(s)" (+ " · tap to change").

struct PollBlock: View {
    var post: SquarePostCard
    var onVote: (Int) -> Void

    private var options: [PollOption] { post.pollOptions ?? [] }
    private var total: Int { post.pollTotalVotes }
    private var canVote: Bool { post.isApproved }

    static func percent(votes: Int, total: Int) -> Int {
        guard total > 0 else { return 0 }
        return Int((Double(max(0, votes)) / Double(total) * 100).rounded())
    }

    static func footer(total: Int, hasVoted: Bool) -> String {
        let votes = L10n.pick("\(total) vote\(total == 1 ? "" : "s")", "\(total) 票")
        return hasVoted ? votes + L10n.pick(" · tap to change", " · 点击可更改") : votes
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if post.isPendingReview {
                Badge.underReview
                    .padding(.bottom, 4)
            } else if post.isRejected {
                Badge.rejected
                    .padding(.bottom, 4)
            }
            ForEach(Array(options.enumerated()), id: \.offset) { pair in
                PollOptionRow(text: pair.element.text,
                              percent: PollBlock.percent(votes: pair.element.votes, total: total),
                              showPercent: total > 0,
                              mine: post.myVote == pair.offset,
                              enabled: canVote) {
                    onVote(pair.offset)
                }
            }
            Text(PollBlock.footer(total: total, hasVoted: post.myVote != nil))
                .font(Theme.font(10))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                .foregroundColor(Theme.C.outline)
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 12)
    }
}

/// One `.poll-opt` row.
struct PollOptionRow: View {
    var text: String
    var percent: Int
    var showPercent: Bool
    var mine: Bool
    var enabled: Bool
    var onTap: () -> Void

    var body: some View {
        Button {
            guard enabled else { return }
            onTap()
        } label: {
            ZStack(alignment: .leading) {
                GeometryReader { g in
                    Rectangle()
                        .fill(mine ? Theme.C.pollFillMine : Theme.C.pollFill)
                        .frame(width: g.size.width * CGFloat(min(max(percent, 0), 100)) / 100)
                        .animation(Theme.Motion.pollFill, value: percent)
                }
                HStack(spacing: 8) {
                    Text(text)
                        .font(Theme.font(13, weight: .semibold))
                        .foregroundColor(Theme.C.onSurface)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: 0)
                    Text(showPercent ? "\(percent)%" : "")
                        .font(Theme.mono(11))
                        .foregroundColor(Theme.C.onSurfaceVariant)
                        .lineLimit(1)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.C.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                    .stroke(mine ? Theme.C.onSurface : Theme.C.outlineVariant, lineWidth: mine ? 1.5 : 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        }
        .buttonStyle(SquareInlinePressStyle())
        .disabled(!enabled)
        .accessibilityLabel(Text(text))
        .accessibilityValue(Text(showPercent ? "\(percent)%" : ""))
    }
}
