import UIKit

/// Re-encodes any `UIImage` (HEIC camera captures included) as baseline JPEG for `POST /uploads/image`,
/// which accepts only JPEG/PNG/GIF/WebP by declared MIME and caps bodies at 8 MB (`api-auth §5.1`, S7).
enum ImageTranscoder {
    static let maxBytes = 8 * 1024 * 1024

    /// Longest side ≤ `maxDimension`, EXIF orientation baked in, quality stepped down (then the size)
    /// until the payload is ≤ 8 MB. Returns nil only for images that cannot be rasterised.
    static func jpegData(from image: UIImage, maxDimension: CGFloat = 1600, quality: CGFloat = 0.85) -> Data? {
        var current = normalized(image, maxDimension: maxDimension)
        var q = quality
        var data = current.jpegData(compressionQuality: q)
        var guardCount = 0
        while let d = data, d.count > maxBytes, guardCount < 12 {
            guardCount += 1
            if q > 0.35 {
                q = max(0.3, q - 0.15)
            } else {
                // Quality floor reached: shrink the raster and start over at the requested quality.
                let side = max(current.size.width, current.size.height) * current.scale
                current = normalized(current, maxDimension: max(320, side * 0.7))
                q = quality
            }
            data = current.jpegData(compressionQuality: q)
        }
        return data
    }

    /// Downscales so the longest side is ≤ `maxDimension` and draws through a renderer so the
    /// result is always `.up` oriented at scale 1 (HEIC/camera images carry EXIF orientation).
    static func normalized(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let pixelW = image.size.width * image.scale
        let pixelH = image.size.height * image.scale
        guard pixelW > 0, pixelH > 0 else { return image }
        let longest = max(pixelW, pixelH)
        let ratio = longest > maxDimension ? maxDimension / longest : 1
        let target = CGSize(width: (pixelW * ratio).rounded(.down), height: (pixelH * ratio).rounded(.down))
        if ratio == 1 && image.imageOrientation == .up && image.scale == 1 {
            return image
        }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: target, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
