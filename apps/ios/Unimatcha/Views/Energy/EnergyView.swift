import SwiftUI

/// 能量中心 — 展示能量余额、每日签到、充值套餐、近期流水。
/// 能量是增强匹配（enhanced matching）的消耗货币。
struct EnergyView: View {
    @StateObject private var vm = EnergyViewModel()

    private let columns = [GridItem(.flexible(), spacing: 12),
                           GridItem(.flexible(), spacing: 12)]

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                balanceCard
                checkInCard
                packagesSection
                transactionsSection
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 40)
        }
        .themedScreen()
        .navigationTitle("能量中心")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await vm.load()
            await vm.loadTransactions()
        }
        .task {
            await vm.load()
            await vm.loadTransactions()
        }
        // 反馈提示
        .alert("提示", isPresented: Binding(
            get: { vm.infoMessage != nil },
            set: { if !$0 { vm.infoMessage = nil } }
        )) {
            Button("好的") { vm.infoMessage = nil }
        } message: {
            Text(vm.infoMessage ?? "")
        }
        .alert("出错了", isPresented: Binding(
            get: { vm.errorMessage != nil },
            set: { if !$0 { vm.errorMessage = nil } }
        )) {
            Button("好的") { vm.errorMessage = nil }
        } message: {
            Text(vm.errorMessage ?? "")
        }
    }

    // MARK: - Balance
    private var balanceCard: some View {
        Card {
            VStack(spacing: 14) {
                HStack {
                    HStack(spacing: 6) {
                        Image(systemName: "bolt.fill").foregroundColor(Theme.accent)
                        Text("可用能量")
                            .font(.system(size: 14))
                            .foregroundColor(Theme.textSecondary)
                    }
                    Spacer()
                    if vm.isLoading && vm.balance == nil {
                        ProgressView().tint(Theme.accent)
                    }
                }

                Text("\(vm.available)")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundColor(Theme.accent)
                    .frame(maxWidth: .infinity)

                HStack(spacing: 0) {
                    statCell(title: "总获取", value: vm.balance?.totalEnergy)
                    Rectangle().fill(Theme.outline).frame(width: 1, height: 28)
                    statCell(title: "已使用", value: vm.balance?.usedEnergy)
                }
            }
        }
    }

    private func statCell(title: String, value: Int?) -> some View {
        VStack(spacing: 3) {
            Text("\(value ?? 0)")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
            Text(title)
                .font(.system(size: 12))
                .foregroundColor(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Daily check-in
    private var checkInCard: some View {
        Card {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(Theme.surfaceHi).frame(width: 44, height: 44)
                    Image(systemName: "calendar.badge.checkmark")
                        .font(.system(size: 20))
                        .foregroundColor(Theme.accent)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("每日签到")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(Theme.textPrimary)
                    Text("每天领取免费能量")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textSecondary)
                }
                Spacer()
                Button {
                    Task { await vm.dailyCheckIn() }
                } label: {
                    Text("签到")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(Theme.onAccent)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 9)
                        .background(Theme.accentGradient)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                }
            }
        }
    }

    // MARK: - Recharge packages
    private var packagesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("充值套餐")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
                .padding(.horizontal, 4)

            if vm.packages.isEmpty {
                Card {
                    Text("暂无可购买的套餐")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textMuted)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 8)
                }
            } else {
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(vm.packages) { pkg in
                        packageCard(pkg)
                    }
                }
            }
        }
    }

    private func packageCard(_ pkg: EnergyPackage) -> some View {
        Button {
            Task { await vm.purchase(pkg) }
        } label: {
            VStack(spacing: 10) {
                HStack(spacing: 4) {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 14))
                        .foregroundColor(Theme.accent)
                    Text("\(pkg.cells)")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundColor(Theme.accent)
                }
                Text("能量")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.textSecondary)

                Text("¥\(priceString(pkg.priceCny))")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(Theme.surfaceHi)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
            }
            .frame(maxWidth: .infinity)
            .padding(16)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.outline, lineWidth: 1))
        }
    }

    private func priceString(_ v: Double) -> String {
        v == v.rounded() ? String(format: "%.0f", v) : String(format: "%.2f", v)
    }

    // MARK: - Transactions
    private var transactionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("近期流水")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.textPrimary)
                .padding(.horizontal, 4)

            if vm.transactions.isEmpty {
                Card {
                    Text("暂无能量流水")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.textMuted)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 8)
                }
            } else {
                Card {
                    VStack(spacing: 0) {
                        ForEach(Array(vm.transactions.enumerated()), id: \.element.id) { index, tx in
                            transactionRow(tx)
                            if index < vm.transactions.count - 1 {
                                Divider().overlay(Theme.outline)
                            }
                        }
                    }
                }
            }
        }
    }

    private func transactionRow(_ tx: EnergyTransaction) -> some View {
        let positive = (tx.amountEnergy ?? 0) >= 0
        return HStack(spacing: 12) {
            ZStack {
                Circle().fill(Theme.surfaceHi).frame(width: 36, height: 36)
                Image(systemName: iconFor(tx.type))
                    .font(.system(size: 15))
                    .foregroundColor(Theme.accent)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(labelFor(tx.type))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Theme.textPrimary)
                if let reason = tx.reason, !reason.isEmpty {
                    Text(reason)
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textSecondary)
                        .lineLimit(1)
                } else if let date = tx.createdAt {
                    Text(String(date.prefix(10)))
                        .font(.system(size: 12))
                        .foregroundColor(Theme.textMuted)
                }
            }
            Spacer()
            Text("\(positive ? "+" : "")\(tx.amountEnergy ?? 0)")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(positive ? Theme.accent : Theme.danger)
        }
        .padding(.vertical, 10)
    }

    private func iconFor(_ type: String) -> String {
        switch type {
        case "RECHARGE": return "creditcard.fill"
        case "CLAIM": return "gift.fill"
        case "REFUND": return "arrow.uturn.backward"
        case "CONSUME": return "bolt.slash.fill"
        default: return "bolt.fill"
        }
    }

    private func labelFor(_ type: String) -> String {
        switch type {
        case "RECHARGE": return "充值"
        case "CLAIM": return "领取"
        case "REFUND": return "退还"
        case "CONSUME": return "消耗"
        default: return type
        }
    }
}
