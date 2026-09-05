import SwiftUI
import UIKit
import CoreImage
import CoreImage.CIFilterBuiltins

// MARK: - QR code generation (h5-addfriend-ads.md §1.1.c, h5-profile.md §1.10)
//
// CoreImage `CIQRCodeGenerator`, correction level M, black on white, nearest-neighbour scaling so the
// modules stay crisp. Friend-hub "My QR" renders 176×176 inside a 180×180 box; ticket detail 180×180
// inside a 200×200 box. Payload is the raw string (connect code / ticket code — no URL scheme).

enum QRCodeGenerator {
    private static let context = CIContext(options: [.useSoftwareRenderer: false])

    /// Returns a crisp black-on-white QR bitmap roughly `size` points wide (scaled by screen scale).
    /// `screenScale` defaults to the main screen's scale; pass it explicitly when calling off the
    /// main thread (`QRCodeView` reads it on the main actor before detaching).
    static func image(_ payload: String, size: CGFloat, correction: String = "M", screenScale: CGFloat? = nil) -> UIImage? {
        guard !payload.isEmpty, let data = payload.data(using: .utf8) else { return nil }
        let filter = CIFilter.qrCodeGenerator()
        filter.message = data
        filter.correctionLevel = correction
        guard let output = filter.outputImage else { return nil }
        let screen = max(1, screenScale ?? UIScreen.main.scale)
        let px = max(1, size * screen)
        let scale = max(1, (px / output.extent.width).rounded(.down))
        let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg, scale: screen, orientation: .up)
    }
}

/// Bare QR image at `size` × `size` points (black on white). Blank while generating; a `qr_code_2`
/// 48 pt `outline` glyph when generation fails (H5 "QR lib missing" fallback).
struct QRCodeView: View {
    var payload: String
    var size: CGFloat = 176

    @State private var image: UIImage? = nil
    @State private var failed = false
    @State private var renderedFor: String = ""

    var body: some View {
        ZStack {
            Color.white
            if let img = image {
                Image(uiImage: img)
                    .interpolation(.none)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else if failed {
                Image(systemName: Theme.Icon.sf("qr_code_2"))
                    .font(.system(size: 48 * 0.82, weight: .light))
                    .foregroundColor(Theme.C.outline)
                    .frame(width: 48, height: 48)
            }
        }
        .frame(width: size, height: size)
        .task(id: payload + "|\(size)") {
            let p = payload
            let s = size
            guard !p.isEmpty else {
                image = nil
                failed = false
                renderedFor = ""
                return
            }
            if renderedFor == p, image != nil { return }
            let screenScale = UIScreen.main.scale
            let generated = await Task.detached(priority: .userInitiated) {
                QRCodeGenerator.image(p, size: s, screenScale: screenScale)
            }.value
            guard !Task.isCancelled else { return }
            image = generated
            failed = generated == nil
            renderedFor = p
        }
        .accessibilityLabel("QR")
    }
}

/// The H5 QR box: `boxSize` square (180 friend hub / 200 ticket), white (dark: card) bg, radius 10,
/// 1 pt `outlineVariant/40` border, `overflow-hidden`, with the `qrSize` code centered. Empty / nil
/// payload → blank box (H5 empties it while loading).
struct QRCodeBox: View {
    var payload: String?
    var boxSize: CGFloat = 180
    var qrSize: CGFloat = 176
    var showBorder: Bool = true

    var body: some View {
        ZStack {
            Theme.C.card
            if let p = payload, !p.isEmpty {
                QRCodeView(payload: p, size: qrSize)
            }
        }
        .frame(width: boxSize, height: boxSize)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(Theme.C.outlineVariant.opacity(showBorder ? 0.4 : 0), lineWidth: 1)
        )
    }
}
