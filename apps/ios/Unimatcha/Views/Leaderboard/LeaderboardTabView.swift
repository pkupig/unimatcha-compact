import SwiftUI

struct LeaderboardTabView: View {
    @EnvironmentObject var leaderboardVM: LeaderboardViewModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Segmented picker
                Picker("排行榜", selection: $leaderboardVM.selectedTab) {
                    ForEach(LeaderboardViewModel.LeaderboardTab.allCases, id: \.self) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)

                // Content
                ScrollView {
                    let entries = leaderboardVM.selectedTab == .duration
                        ? leaderboardVM.durationEntries
                        : leaderboardVM.scoreEntries

                    if leaderboardVM.isLoading {
                        ProgressView().padding(.top, 60)
                    } else if entries.isEmpty {
                        emptyState
                    } else {
                        LazyVStack(spacing: 12) {
                            ForEach(entries) { entry in
                                leaderboardRow(entry)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 8)
                    }
                }
                .refreshable { await leaderboardVM.loadCurrent() }
            }
            .navigationTitle("排行榜")
            .task { await leaderboardVM.loadCurrent() }
            .onChange(of: leaderboardVM.selectedTab) { _ in
                Task { await leaderboardVM.loadCurrent() }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "trophy")
                .font(.system(size: 48))
                .foregroundColor(Color(.systemGray4))
            Text("暂无数据")
                .font(.headline)
                .foregroundColor(.secondary)
            Text("还没有情侣上榜哦，成为第一对吧！")
                .font(.subheadline)
                .foregroundColor(Color(.systemGray3))
        }
        .padding(.top, 60)
    }

    private func leaderboardRow(_ entry: LeaderboardEntry) -> some View {
        HStack(spacing: 14) {
            // Rank
            rankBadge(entry.rank)

            // Couple avatars
            HStack(spacing: -8) {
                miniAvatar(entry.coupleA.nickname)
                miniAvatar(entry.coupleB.nickname)
            }

            // Names
            VStack(alignment: .leading, spacing: 2) {
                Text("\(entry.coupleA.nickname) & \(entry.coupleB.nickname)")
                    .font(.system(size: 15, weight: .medium))
                    .lineLimit(1)
                if let school = entry.coupleA.school {
                    Text(school)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            // Duration or Score
            if leaderboardVM.selectedTab == .duration {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(entry.durationDays ?? 0)")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                    Text("天")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            } else {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(String(format: "%.1f", entry.avgScore ?? 0))
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
                    Text("分")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(14)
        .background(Color.white)
        .cornerRadius(14)
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    private func rankBadge(_ rank: Int) -> some View {
        ZStack {
            if rank <= 3 {
                Circle()
                    .fill(rank == 1 ? Color.yellow : rank == 2 ? Color.gray : Color.orange)
                    .frame(width: 32, height: 32)
                Text("\(rank)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
            } else {
                Text("\(rank)")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.secondary)
                    .frame(width: 32)
            }
        }
    }

    private func miniAvatar(_ name: String) -> some View {
        Circle()
            .fill(Color(red: 1, green: 0.92, blue: 0.95))
            .frame(width: 36, height: 36)
            .overlay(
                Text(String(name.prefix(1)))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(red: 1, green: 0.4, blue: 0.5))
            )
            .overlay(Circle().stroke(Color.white, lineWidth: 2))
    }
}
