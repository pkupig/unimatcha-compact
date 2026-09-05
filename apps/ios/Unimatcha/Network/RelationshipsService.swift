import Foundation

/// `/relationships/*` (api-matching §4). One endpoint: the star graph behind the Friend Hub's
/// "Relationship Network" panel. No params, no pagination, no caching (H5 re-fetches on every
/// panel entry); a failure shows the inline "Couldn't load network." line, never a toast.
enum RelationshipsService {
    static func graph() async throws -> RelationshipGraph {
        try await APIClient.shared.request(.get("/relationships/graph"))
    }
}
