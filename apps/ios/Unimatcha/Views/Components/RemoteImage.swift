import SwiftUI
import UIKit

// MARK: - ImageCache
//
// Memory-only `NSCache` + plain `URLSession` downloads (no `APIClient`: image hosts are the API's
// `/uploads` static route and third-party CDNs, never authenticated). In-flight requests are
// de-duplicated so a feed of identical avatars downloads once.

final class ImageCache {
    static let shared = ImageCache()

    private let cache = NSCache<NSURL, UIImage>()
    private let session: URLSession
    private var inflight: [URL: Task<UIImage?, Never>] = [:]
    private let lock = NSLock()

    private init() {
        cache.countLimit = 400
        cache.totalCostLimit = 120 * 1024 * 1024
        // A private URLCache (not the shared one) so logout can purge exactly the images this
        // app downloaded — chat photos and partner `realPhotos` otherwise stay in the app
        // container on disk after the account is signed out.
        let cfg = URLSessionConfiguration.default
        cfg.urlCache = URLCache(memoryCapacity: 16 * 1024 * 1024,
                                diskCapacity: 128 * 1024 * 1024,
                                diskPath: "unimatcha-images")
        cfg.requestCachePolicy = .returnCacheDataElseLoad
        cfg.timeoutIntervalForRequest = 30
        cfg.timeoutIntervalForResource = 120
        cfg.httpMaximumConnectionsPerHost = 6
        session = URLSession(configuration: cfg)
        // Rule 6: per-session memory is dropped on logout / 401 (chat & profile images of the previous account).
        resetObserver = NotificationCenter.default.addObserver(forName: .sessionDidReset, object: nil, queue: nil) { [weak self] _ in
            self?.removeAll()
            // Cancel in-flight downloads too: one completing after the flush would re-seed the
            // cache with the previous account's image.
            self?.cancelInflight()
            cfg.urlCache?.removeAllCachedResponses()
        }
    }

    private var resetObserver: NSObjectProtocol?

    func cached(_ url: URL) -> UIImage? {
        cache.object(forKey: url as NSURL)
    }

    func store(_ image: UIImage, for url: URL) {
        let cost = Int(image.size.width * image.size.height * image.scale * image.scale * 4)
        cache.setObject(image, forKey: url as NSURL, cost: cost)
    }

    func removeAll() {
        cache.removeAllObjects()
    }

    /// Cancels every download still running, so none of them can re-seed the cache with an image
    /// belonging to the account that just signed out.
    func cancelInflight() {
        lock.lock()
        let tasks = inflight.values
        inflight.removeAll()
        lock.unlock()
        for t in tasks { t.cancel() }
    }

    /// Resolves from cache, then network. `data:image/*` URLs are decoded inline. Never throws.
    func image(for url: URL) async -> UIImage? {
        if let hit = cached(url) { return hit }
        if url.scheme?.lowercased() == "data" {
            let img = Self.decodeDataURL(url.absoluteString)
            if let img = img { store(img, for: url) }
            return img
        }
        lock.lock()
        if let existing = inflight[url] {
            lock.unlock()
            return await existing.value
        }
        let task = Task<UIImage?, Never> { [session] in
            var req = URLRequest(url: url)
            req.setValue("image/*", forHTTPHeaderField: "Accept")
            guard let (data, resp) = try? await session.data(for: req) else { return nil }
            if let http = resp as? HTTPURLResponse, !(200...299).contains(http.statusCode) { return nil }
            guard let img = UIImage(data: data) else { return nil }
            let decoded = img.preparingForDisplay() ?? img
            return decoded
        }
        inflight[url] = task
        lock.unlock()
        let result = await task.value
        lock.lock()
        inflight[url] = nil
        lock.unlock()
        if let img = result { store(img, for: url) }
        return result
    }

    static func decodeDataURL(_ s: String) -> UIImage? {
        guard let comma = s.firstIndex(of: ",") else { return nil }
        let header = s[s.startIndex..<comma].lowercased()
        let payload = String(s[s.index(after: comma)...])
        if header.contains(";base64") {
            guard let data = Data(base64Encoded: payload, options: [.ignoreUnknownCharacters]) else { return nil }
            return UIImage(data: data)
        }
        guard let decoded = payload.removingPercentEncoding, let data = decoded.data(using: .utf8) else { return nil }
        return UIImage(data: data)
    }
}

// MARK: - URL hygiene (h5-core.md §2.7 `safeUrl`)

enum SafeURL {
    /// Returns a loadable URL only for `http(s)` (incl. protocol-relative `//host`) and `data:image/*`.
    /// Rejects `javascript:`, `vbscript:`, `file:`, `blob:`, non-image `data:` and anything else.
    /// Control characters (U+0000–U+0020) before the scheme are stripped first, like H5.
    static func image(_ raw: String?) -> URL? {
        guard var s = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        s = String(s.unicodeScalars.filter { $0.value > 0x20 || $0 == " " }).trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("//") { s = "https:" + s }
        let lower = s.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") {
            if let u = URL(string: s) { return u }
            if let enc = s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed), let u = URL(string: enc) { return u }
            return nil
        }
        if lower.hasPrefix("data:image/") {
            return URL(string: s) ?? DataURLBox.url(s)
        }
        return nil
    }

    static func isSafe(_ raw: String?) -> Bool { image(raw) != nil }
}

/// `URL(string:)` rejects long/odd data URLs on some inputs; wrap the payload so the cache key is stable.
private enum DataURLBox {
    static func url(_ s: String) -> URL? {
        var comps = URLComponents()
        comps.scheme = "data"
        comps.path = String(s.dropFirst("data:".count))
        return comps.url
    }
}

// MARK: - RemoteImage

/// Async image with scheme validation, memory cache, placeholder and an intrinsic-size callback
/// (the masonry needs the aspect ratio of post images). Content mode `.fill` clips to its frame.
struct RemoteImage: View {
    var url: String?
    var contentMode: ContentMode = .fill
    var placeholder: AnyView? = nil
    var placeholderColor: Color = Theme.C.containerHigh
    var onSuccess: ((CGSize) -> Void)? = nil
    var onFailure: (() -> Void)? = nil

    @State private var image: UIImage? = nil
    @State private var failed = false
    @State private var loadedFor: URL? = nil

    private var resolved: URL? { SafeURL.image(url) }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                if let img = image {
                    Image(uiImage: img)
                        .resizable()
                        .aspectRatio(contentMode: contentMode)
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                } else if let ph = placeholder {
                    ph
                } else {
                    placeholderColor
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .clipped()
        .task(id: resolved) { await load() }
    }

    @MainActor
    private func load() async {
        guard let u = resolved else {
            image = nil
            failed = true
            if url != nil { onFailure?() }
            return
        }
        if let hit = ImageCache.shared.cached(u) {
            if loadedFor != u {
                image = hit
                loadedFor = u
                onSuccess?(hit.size)
            }
            return
        }
        if loadedFor != u { image = nil }
        failed = false
        let result = await ImageCache.shared.image(for: u)
        guard !Task.isCancelled, resolved == u else { return }
        if let img = result {
            image = img
            loadedFor = u
            failed = false
            onSuccess?(img.size)
        } else {
            image = nil
            failed = true
            onFailure?()
        }
    }
}

/// Convenience for square/fixed frames: `RemoteImage(url:).frame(width:height:)` is the normal use;
/// this wrapper adds the corner radius clip used by chat images / comment images (`rounded-[14px]`, `[10px]`).
struct RoundedRemoteImage: View {
    var url: String?
    var radius: CGFloat = Theme.R.base
    var contentMode: ContentMode = .fill
    var body: some View {
        RemoteImage(url: url, contentMode: contentMode)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}
