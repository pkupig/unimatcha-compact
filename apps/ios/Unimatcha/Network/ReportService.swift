import Foundation

/// `POST /reports` category (`api-square §5.1`, `@IsIn`).
enum ReportCategory: String, Encodable, CaseIterable {
    case bug, user, content, other
}

/// `POST /reports` — shared by Settings "Report a problem" (WP-13) and comment reporting (WP-09).
enum ReportService {
    struct Request: Encodable {
        let category: ReportCategory
        let content: String
        var contact: String? = nil       // omitted when nil (never sent empty)
    }

    /// Posts `{category, content, contact?}`; an empty/whitespace contact is omitted.
    static func submit(category: ReportCategory, content: String, contact: String?) async throws {
        let trimmedContact = contact?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = Request(category: category,
                           content: content,
                           contact: (trimmedContact?.isEmpty ?? true) ? nil : trimmedContact)
        try await APIClient.shared.send(.post("/reports", body: body))
    }
}
