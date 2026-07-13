import Foundation
import SwiftUI

@MainActor
final class MetadataViewModel: ObservableObject {
    static let shared = MetadataViewModel()

    @Published var cities: [String] = []
    @Published var universities: [String] = []
    @Published var majors: [String] = []
    @Published var mbtiTypes: [String] = []
    @Published var nationalities: [String] = []
    @Published var isLoaded = false
    @Published var errorMessage: String?

    private init() {}

    func loadAllIfNeeded() async {
        guard !isLoaded else { return }
        errorMessage = nil
        async let c = MetadataService.ukCities()
        async let u = MetadataService.ukUniversities()
        async let m = MetadataService.ukMajors()
        async let mb = MetadataService.mbtiTypes()
        async let n = MetadataService.nationalities()
        do {
            let (cities, universities, majors, mbtiTypes, nationalities) = try await (c, u, m, mb, n)
            self.cities = cities; self.universities = universities; self.majors = majors
            self.mbtiTypes = mbtiTypes; self.nationalities = nationalities
            isLoaded = true
        } catch let error as APIError { errorMessage = error.errorDescription; applyMbtiFallback() }
        catch { errorMessage = error.localizedDescription; applyMbtiFallback() }
    }

    private func applyMbtiFallback() {
        if mbtiTypes.isEmpty {
            mbtiTypes = ["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP",
                         "ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"]
        }
    }
}
