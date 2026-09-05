import UIKit

/// `POST /uploads/image` helper: transcode to JPEG (`ImageTranscoder`) → multipart upload → absolute URL.
/// Callers then pass the URL verbatim to `/uploads/avatar`, `PUT /profiles/me {coverUrl}`, posts, chat, couple…
enum UploadService {
    /// Returns the absolute `https://api…/uploads/<uuid>.jpg` URL.
    static func upload(image: UIImage) async throws -> String {
        guard let data = ImageTranscoder.jpegData(from: image) else {
            throw APIError.http(status: 0, message: "Upload failed")
        }
        return try await upload(jpegData: data)
    }

    /// Uploads already-encoded JPEG bytes (≤ 8 MB).
    static func upload(jpegData: Data, filename: String = "image.jpg") async throws -> String {
        guard jpegData.count <= ImageTranscoder.maxBytes else {
            throw APIError.http(status: 413, message: "File too large")
        }
        let result = try await APIClient.shared.uploadImage(jpegData, mimeType: "image/jpeg", filename: filename)
        guard !result.url.isEmpty else { throw APIError.emptyData }
        return result.url
    }
}
