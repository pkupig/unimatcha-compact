import Foundation

struct MetadataService {
    static func getUkCities() async throws -> [String] {
        let resp: MetadataListResponse = try await APIClient.shared.request("/metadata/uk/cities")
        return resp.items
    }

    static func getUkUniversities() async throws -> [String] {
        let resp: MetadataListResponse = try await APIClient.shared.request("/metadata/uk/universities")
        return resp.items
    }

    static func getUkMajors() async throws -> [String] {
        let resp: MetadataListResponse = try await APIClient.shared.request("/metadata/uk/majors")
        return resp.items
    }

    static func getMbtiTypes() async throws -> [String] {
        let resp: MetadataListResponse = try await APIClient.shared.request("/metadata/mbti-types")
        return resp.items
    }

    static func getNationalities() async throws -> [String] {
        let resp: MetadataListResponse = try await APIClient.shared.request("/metadata/nationalities")
        return resp.items
    }
}
