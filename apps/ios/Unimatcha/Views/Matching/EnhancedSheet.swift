import SwiftUI

/// Sheet to launch an enhanced match. Shows energy cost (romantic = 3 cells fixed,
/// friend = 1…5 cells stepper), current balance, a recharge link, and confirms by
/// calling `matchingVM.start(enhanced: true, cells:)`.
struct EnhancedSheet: View {
    @EnvironmentObject var matchingVM: MatchingViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var friendCells = 1
    @State private var balance: EnergyBalance?
    @State private var isLoadingBalance = true
    @State private var isStarting = false
    @State private var balanceError: String?

    /// Cells consumed by this match.
    private var cost: Int { matchingVM.mode == .romantic ? 3 : friendCells }

    private var available: Int { balance?.availableEnergy ?? 0 }
    private var canAfford: Bool { available >= cost }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    header
                    costCard
                    balanceCard
                    if matchingVM.mode == .friend { cellsStepper }

                    if let msg = matchingVM.errorMessage {
                        Text(msg)
                            .font(.footnote)
                            .foregroundColor(Theme.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(16)
            }
            .themedScreen()
            .navigationTitle("增强匹配")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("取消") { dismiss() }.tint(Theme.textSecondary)
                }
            }
            .safeAreaInset(edge: .bottom) { bottomBar }
            .task { await loadBalance() }
        }
        .tint(Theme.accent)
    }

    // MARK: - Header
    private var header: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle().fill(Theme.accent.opacity(0.14)).frame(width: 88, height: 88)
                Image(systemName: "bolt.fill")
                    .font(.system(size: 38))
                    .foregroundColor(Theme.accent)
            }
            Text("增强匹配")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(Theme.textPrimary)
            Text(matchingVM.mode == .romantic
                 ? "消耗能量提升本周恋人匹配优先级与候选质量"
                 : "消耗能量扩大朋友匹配范围，认识更多同频的人")
                .font(.subheadline)
                .foregroundColor(Theme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    // MARK: - Cost card
    private var costCard: some View {
        Card {
            HStack {
                Label("本次消耗", systemImage: "bolt.fill")
                    .font(.subheadline)
                    .foregroundColor(Theme.textSecondary)
                Spacer()
                Text("\(cost) 能量")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(Theme.accent)
            }
        }
    }

    // MARK: - Balance card
    private var balanceCard: some View {
        Card {
            VStack(spacing: 12) {
                HStack {
                    Label("当前余额", systemImage: "leaf.fill")
                        .font(.subheadline)
                        .foregroundColor(Theme.textSecondary)
                    Spacer()
                    if isLoadingBalance {
                        ProgressView().tint(Theme.accent)
                    } else {
                        Text("\(available) 能量")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(canAfford ? Theme.textPrimary : Theme.danger)
                    }
                }

                if let err = balanceError {
                    Text(err).font(.caption).foregroundColor(Theme.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if !isLoadingBalance && !canAfford {
                    Text("余额不足，还需 \(cost - available) 能量")
                        .font(.caption)
                        .foregroundColor(Theme.warning)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Divider().overlay(Theme.outline)

                NavigationLink { EnergyView() } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus.circle.fill")
                        Text("去充值能量")
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption)
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(Theme.accent)
                }
            }
        }
    }

    // MARK: - Friend cells stepper
    private var cellsStepper: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("匹配数量").font(.subheadline).foregroundColor(Theme.textPrimary)
                    Spacer()
                    Text("\(friendCells) 位朋友")
                        .font(.subheadline.bold())
                        .foregroundColor(Theme.accent)
                }
                Stepper(value: $friendCells, in: 1...5) {
                    Text("每位朋友消耗 1 能量")
                        .font(.caption)
                        .foregroundColor(Theme.textSecondary)
                }
                .tint(Theme.accent)
            }
        }
    }

    // MARK: - Bottom bar
    private var bottomBar: some View {
        VStack(spacing: 0) {
            Divider().overlay(Theme.outline)
            Button {
                Task {
                    isStarting = true
                    matchingVM.errorMessage = nil
                    await matchingVM.start(enhanced: true, cells: cost)
                    isStarting = false
                    if matchingVM.errorMessage == nil { dismiss() }
                }
            } label: {
                HStack(spacing: 8) {
                    if isStarting { ProgressView().tint(Theme.onAccent) }
                    Text(canAfford ? "确认并开始（\(cost) 能量）" : "能量不足")
                }
            }
            .buttonStyle(NeonButtonStyle(enabled: canAfford && !isLoadingBalance))
            .disabled(!canAfford || isLoadingBalance || isStarting)
            .padding(16)
        }
        .background(Theme.surfaceLo)
    }

    // MARK: - Data
    private func loadBalance() async {
        isLoadingBalance = true
        balanceError = nil
        do { balance = try await EnergyService.getBalance() }
        catch let e as APIError { balanceError = e.errorDescription }
        catch { balanceError = error.localizedDescription }
        isLoadingBalance = false
    }
}
