// Interface outline: implementation bodies removed.
import Foundation
struct MetadataList: Codable {
struct MetadataService {
    static func ukCities() async throws -> [String]
    static func ukUniversities() async throws -> [String]
    static func ukMajors() async throws -> [String]
    static func mbtiTypes() async throws -> [String]
    static func nationalities() async throws -> [String]
