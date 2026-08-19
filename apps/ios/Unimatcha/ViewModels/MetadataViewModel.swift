// Interface outline: implementation bodies removed.
import Foundation
import SwiftUI
    @Published var cities: [String] = []
    @Published var universities: [String] = []
    @Published var majors: [String] = []
    @Published var mbtiTypes: [String] = []
    @Published var nationalities: [String] = []
    @Published var isLoaded = false
    @Published var errorMessage: String?
    func loadAllIfNeeded() async
    private func applyMbtiFallback()
