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
        async let c = MetadataService.getUkCities()
        async let u = MetadataService.getUkUniversities()
        async let m = MetadataService.getUkMajors()
        async let mb = MetadataService.getMbtiTypes()
        async let n = MetadataService.getNationalities()

        do {
            let (cities, universities, majors, mbtiTypes, nationalities) = try await (c, u, m, mb, n)
            self.cities = cities
            self.universities = universities
            self.majors = majors
            self.mbtiTypes = mbtiTypes
            self.nationalities = nationalities
            self.isLoaded = true
            self.errorMessage = nil
        } catch let error as APIError {
            // 暴露错误供调用方展示（对齐其它 ViewModel 与 H5 端的 toast 提示）
            self.errorMessage = error.errorDescription
            applyMbtiFallback()
        } catch {
            self.errorMessage = error.localizedDescription
            applyMbtiFallback()
        }
    }

    // Fallback to hardcoded MBTI at minimum，保证选项不至于完全为空
    private func applyMbtiFallback() {
        if mbtiTypes.isEmpty {
            mbtiTypes = [
                "INTJ","INTP","ENTJ","ENTP",
                "INFJ","INFP","ENFJ","ENFP",
                "ISTJ","ISFJ","ESTJ","ESFJ",
                "ISTP","ISFP","ESTP","ESFP",
            ]
        }
    }
}
