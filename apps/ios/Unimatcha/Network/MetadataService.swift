import Foundation

struct MetadataList: Codable { let items: [String] }

struct MetadataService {
    private static func list(_ path: String) async throws -> [String] {
        let resp: MetadataList = try await APIClient.shared.request(path)
        return resp.items
    }
    static func ukCities() async throws -> [String] { try await list("/metadata/uk/cities") }
    static func ukUniversities() async throws -> [String] { try await list("/metadata/uk/universities") }
    static func ukMajors() async throws -> [String] { try await list("/metadata/uk/majors") }
    static func mbtiTypes() async throws -> [String] { try await list("/metadata/mbti-types") }
    static func nationalities() async throws -> [String] { try await list("/metadata/nationalities") }
}
