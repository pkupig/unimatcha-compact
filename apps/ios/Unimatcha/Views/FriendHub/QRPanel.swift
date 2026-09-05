import SwiftUI

// MARK: - "Add by QR" panel (h5-addfriend-ads.md §1.1.c, §2.4)
//
// Segmented `My QR / Scan` (`.af-seg`: `border border-outline-variant/60 p-1 rounded-full`,
// `flex-1 py-2`, selected neon/black) — always resets to **My QR** when the panel opens.
//   My QR  180 pt white box (r10, `outline-variant/40`) with a 176 pt QR of the raw connect code
//          (no URL scheme), "YOUR CODE" 10/widest `outline` at `mt-3`, the code in mono 14/700
//          widest (tap to copy — H5's `select-all`), and "Scan to connect instantly." at `mt-3`.
//   Scan   square `bg-black/80` r10 viewport with the rear camera and a 200 pt scan box, the pink
//          "Camera unavailable…" line when the camera fails, the hint, and the always-present
//          manual row: uppercase code field (Enter submits) + narrow neon "Add" button.
// Decoding fires `connect` once (the scanner pauses itself); a failure toasts and re-arms after
// 2 s, which is the documented improvement over H5's dead black box.

struct QRPanel: View {
    @ObservedObject var vm: FriendHubViewModel

    /// Measured width of the camera viewport (kept square without an `aspectRatio` the
    /// enclosing `ScrollView` cannot resolve).
    @State private var scanWidth: CGFloat = 0

    init(vm: FriendHubViewModel) { self.vm = vm }

    /// `#addfriend-qr` box / the QR inside it.
    private static let qrBoxSize: CGFloat = 180
    private static let qrSize: CGFloat = 176

    var body: some View {
        VStack(spacing: 16) {
            PillSegmented(items: [L10n.t("My QR"), L10n.t("Scan")],
                          selection: $vm.qrSegment,
                          style: .qr)
            if vm.isScanning {
                scanView
            } else {
                myQRView
            }
        }
    }

    // MARK: My QR

    private var myQRView: some View {
        VStack(spacing: 0) {
            QRCodeBox(payload: vm.connectCode, boxSize: Self.qrBoxSize, qrSize: Self.qrSize)
            Text(L10n.t("YOUR CODE"))
                .font(Theme.font(10))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                .foregroundColor(Theme.C.outline)
                .padding(.top, 12)
            Text(vm.connectCodeLabel)
                .font(Theme.mono(14, weight: .bold))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 14))
                .foregroundColor(Theme.C.onSurface)
                .textSelection(.enabled)
                .contentShape(Rectangle())
                .onTapGesture { vm.copyConnectCode() }
                .accessibilityHint(L10n.pick("Tap to copy", "点击复制"))
            Text(L10n.t("Scan to connect instantly."))
                .font(Theme.font(10))
                .foregroundColor(Theme.C.outline)
                .lineSpacing(4)
                .multilineTextAlignment(.center)
                .padding(.top, 12)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Scan

    private var scanView: some View {
        VStack(spacing: 0) {
            ZStack {
                Color.black.opacity(0.8)
                if !vm.cameraFailed {
                    QRScannerView(restartToken: vm.scannerToken,
                                  scanBox: 200,
                                  onCode: { code in vm.onScanned(code) },
                                  onError: { err in vm.onCameraError(err) })
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: max(scanWidth, 0))          // `aspect-square`
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
            .background(
                GeometryReader { geo in
                    Color.clear.preference(key: FriendHubWidthKey.self, value: geo.size.width)
                }
            )
            .onPreferenceChange(FriendHubWidthKey.self) { w in
                if abs(w - scanWidth) > 0.5 { scanWidth = w }
            }
            .padding(.bottom, 8)

            if vm.cameraFailed {
                Text(L10n.pick("Camera unavailable — enter the code manually below.",
                               "无法使用摄像头，请在下方手动输入编号"))
                    .font(Theme.font(10))
                    .foregroundColor(Theme.C.neonPink)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 8)
            }

            Text(L10n.t("Point at your friend's QR — or enter their code:"))
                .font(Theme.font(10))
                .foregroundColor(Theme.C.outline)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 8)

            manualRow
        }
    }

    private var manualRow: some View {
        HStack(spacing: 8) {
            SoftField(text: $vm.manualCode,
                      placeholder: "CLXXXXXXXX",       // literal in both languages
                      size: 14,
                      autocap: .characters,
                      submitLabel: .go,
                      tracking: Theme.Tracking.widest,
                      uppercase: true,
                      placeholderTone: .outline,
                      onSubmit: { vm.submitManualCode() })
            // Deliberately not `.btn-cta` (full-width): in this row it would squeeze the field to
            // nothing and overflow the screen. `paddingV: 11` matches the 37 pt field height.
            CTAButton(title: L10n.t("Add"),
                      style: .neon,
                      size: 12,
                      tracking: Theme.Tracking.widest,
                      disabled: vm.connecting,
                      fullWidth: false,
                      paddingV: 11,
                      paddingH: 20) {
                vm.submitManualCode()
            }
        }
    }
}
