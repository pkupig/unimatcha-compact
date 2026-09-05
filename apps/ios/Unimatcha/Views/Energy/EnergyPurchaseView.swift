import SwiftUI

// MARK: - Energy purchase page (`#modal-energy-purchase`, h5-profile.md §1.9 / §2 "Energy purchase")
//
// Full-page overlay id `energy-purchase` (fade + swipe-back). Bar: back + "Get Energy".
// Body (H5 markup, verbatim geometry):
//   `px-6 pt-6 pb-2 max-w-lg`  — 3-column package grid, `gap-3`
//   `px-6 pt-5 pb-10 max-w-lg` — "Payment Method" label, 3 radio rows (`space-y-2`, `mb-5`), `.btn-cta`
// Package card: `py-5 border border-outline-variant rounded-[10px]`, `gap-1`; 24/800 cells number,
// "cells" 10/widest outline, "¥N" 12/700 with `mt-1`; selected → `border-2 border-black bg-neon/10`.
// Payment row: `py-3 px-4 rounded-[10px] border`; 20 pt icon, 12/700/widest label, neon filled
// `check_circle` revealed on selection, selected → `border-2 border-black`.

struct EnergyPurchaseView: View {
    @ObservedObject var vm: EnergyPurchaseViewModel

    /// Standalone use (previews / a caller that does not own a VM).
    init() { self.vm = EnergyPurchaseViewModel() }
    init(vm: EnergyPurchaseViewModel) { self.vm = vm }

    private static let maxContentWidth: CGFloat = 512      // max-w-lg

    var body: some View {
        VStack(spacing: 0) {
            FullPageBar.backTitle(L10n.t("Get Energy"), onBack: { vm.close() })
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 0) {
                    packageGrid
                        .padding(.horizontal, Theme.Space.page)
                        .padding(.top, 24)
                        .padding(.bottom, 8)
                        .frame(maxWidth: Self.maxContentWidth)
                        .frame(maxWidth: .infinity)
                    paymentSection
                        .padding(.horizontal, Theme.Space.page)
                        .padding(.top, 20)
                        .padding(.bottom, 40)
                        .frame(maxWidth: Self.maxContentWidth)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.C.surface.ignoresSafeArea())
        .onAppear { vm.onOpenIfNeeded() }
    }

    // MARK: Packages

    private var packageGrid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 12) {
            ForEach(vm.packages) { pkg in
                PackageCard(package: pkg, selected: vm.isSelected(pkg)) {
                    vm.select(package: pkg)
                }
            }
        }
    }

    private struct PackageCard: View {
        let package: EnergyPackage
        let selected: Bool
        let action: () -> Void

        var body: some View {
            Button(action: action) {
                VStack(spacing: 4) {
                    Text("\(package.cells)")
                        .font(Theme.font(24, weight: .heavy))
                        .foregroundColor(Theme.C.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Text(L10n.t("cells"))
                        .font(Theme.font(10))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                        .foregroundColor(Theme.C.outline)
                        .lineLimit(1)
                    Text("¥\(package.priceCny)")
                        .font(Theme.font(12, weight: .bold))
                        .foregroundColor(Theme.C.primary)
                        .lineLimit(1)
                        .padding(.top, 4)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
                .background(selected ? Theme.C.neonTint10 : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                        .strokeBorder(selected ? Theme.C.borderStrong : Theme.C.outlineVariant,
                                      lineWidth: selected ? 2 : 1)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.98))
            .accessibilityLabel("\(package.cells) \(L10n.t("cells")) ¥\(package.priceCny)")
            .accessibilityAddTraits(selected ? [.isSelected] : [])
        }
    }

    // MARK: Payment method + CTA

    private var paymentSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(L10n.t("Payment Method"))
                .font(Theme.font(10))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                .foregroundColor(Theme.C.outline)
                .padding(.bottom, 8)
            VStack(spacing: 8) {
                ForEach(EnergyPurchaseViewModel.PaymentMethod.allCases) { method in
                    PaymentRow(method: method, selected: vm.isSelected(method)) {
                        vm.select(method: method)
                    }
                }
            }
            .padding(.bottom, 20)
            CTAButton(title: vm.ctaTitle,
                      style: .neon,
                      disabled: !vm.ctaEnabled) {
                Task { await vm.pay() }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private struct PaymentRow: View {
        let method: EnergyPurchaseViewModel.PaymentMethod
        let selected: Bool
        let action: () -> Void

        var body: some View {
            Button(action: action) {
                HStack(spacing: 12) {
                    MaterialIcon(name: method.icon, size: 20, color: Theme.C.onSurface)
                    Text(method.label)
                        .font(Theme.font(12, weight: .bold))
                        .tracking(Theme.tracking(Theme.Tracking.widest, size: 12))
                        .foregroundColor(Theme.C.onSurface)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    MaterialIcon(name: "check_circle", size: 20, filled: true, weight: .regular, color: Theme.C.neon)
                        .opacity(selected ? 1 : 0)
                }
                .padding(.vertical, 12)
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                        .strokeBorder(selected ? Theme.C.borderStrong : Theme.C.outlineVariant,
                                      lineWidth: selected ? 2 : 1)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.98))
            .accessibilityAddTraits(selected ? [.isSelected] : [])
        }
    }
}
