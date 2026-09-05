import Foundation

/// Debug-only decode harness (PLAN §H.4). Loads `Resources/Fixtures/<name>.json` from the app bundle
/// and decodes it as `APIEnvelope<T>` first, then as bare `T`. Used by every `<Domain>Fixtures.verify()`.
enum FixtureCheck {
    struct Failure: Error, CustomStringConvertible {
        let fixture: String
        let reason: String
        var description: String { "fixture \(fixture): \(reason)" }
    }

    /// Locates the fixture file (folder-reference layouts differ between xcodegen and manual projects).
    static func url(for name: String) -> URL? {
        let base = name.hasSuffix(".json") ? String(name.dropLast(5)) : name
        let bundle = Bundle.main
        let candidates: [URL?] = [
            bundle.url(forResource: base, withExtension: "json", subdirectory: "Fixtures"),
            bundle.url(forResource: base, withExtension: "json", subdirectory: "Resources/Fixtures"),
            bundle.url(forResource: base, withExtension: "json"),
        ]
        if let u = candidates.compactMap({ $0 }).first { return u }
        // Source-tree fallback (running `-unimatcha-decode-check` from a build without folder references).
        if let root = ProcessInfo.processInfo.environment["UNIMATCHA_FIXTURES_DIR"] {
            let u = URL(fileURLWithPath: root).appendingPathComponent(base + ".json")
            if FileManager.default.fileExists(atPath: u.path) { return u }
        }
        return nil
    }

    static func data(fixture name: String) throws -> Data {
        guard let u = url(for: name) else { throw Failure(fixture: name, reason: "file not found in bundle") }
        do {
            return try Data(contentsOf: u)
        } catch {
            throw Failure(fixture: name, reason: "unreadable: \(error)")
        }
    }

    /// Decodes `APIEnvelope<T>` (returning `data`) or bare `T`; throws with both errors when neither works.
    @discardableResult
    static func decode<T: Decodable>(_ type: T.Type, fixture name: String) throws -> T {
        let raw = try data(fixture: name)
        let dec = JSONDecoder()
        var envelopeError: Error?
        do {
            let env = try dec.decode(APIEnvelope<T>.self, from: raw)
            if let d = env.data { return d }
            envelopeError = Failure(fixture: name, reason: "envelope decoded but data is null")
        } catch {
            envelopeError = error
        }
        do {
            return try dec.decode(T.self, from: raw)
        } catch {
            throw Failure(fixture: name, reason: "as envelope: \(envelopeError.map { String(describing: $0) } ?? "-"); as bare: \(error)")
        }
    }

    /// Asserts a condition inside a `verify()` body, throwing a descriptive failure instead of trapping.
    static func expect(_ condition: @autoclosure () -> Bool, _ fixture: String, _ what: String) throws {
        if !condition() { throw Failure(fixture: fixture, reason: "expectation failed: \(what)") }
    }
}
