import Foundation
import SwiftUI

@MainActor
final class MatchingViewModel: ObservableObject {
    @Published var fullStatus: FullMatchStatus?
    @Published var matchState: MatchState = .idle
    @Published var partner: PublicProfile?
    @Published var matchInfo: MatchInfo?
    @Published var matchConfig: MatchConfigInfo?
    @Published var isLoading = false
    @Published var errorMessage: String?

    // 匹配偏好
    @Published var preferences: UserMatchPreferences = .defaultPrefs
    @Published var showFilterSheet = false

    func loadAll() async {
        isLoading = true
        errorMessage = nil
        do {
            let status = try await MatchingService.getFullStatus()
            self.fullStatus = status
            self.matchState = status.state
            self.partner = status.partner
            self.matchInfo = status.match
            self.matchConfig = status.matchConfig
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func startMatch() async {
        isLoading = true
        errorMessage = nil
        do {
            let _ = try await MatchingService.startMatch()
            self.matchState = .searching
            try await Task.sleep(nanoseconds: 2_000_000_000)
            await loadAll()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func stopMatch() async {
        isLoading = true
        errorMessage = nil
        do {
            let _ = try await MatchingService.stopMatch()
            self.matchState = .idle
            await loadAll()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // ─── 按 proposalId 确认（优先），回退到旧接口 ─────────────
    func confirmMatch() async {
        isLoading = true
        errorMessage = nil
        do {
            if let proposalId = matchInfo?.proposalId {
                let _ = try await MatchingService.confirmProposal(proposalId: proposalId)
            } else {
                let _ = try await MatchingService.confirmMatch()
            }
            await loadAll()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func rejectMatch() async {
        isLoading = true
        errorMessage = nil
        do {
            if let proposalId = matchInfo?.proposalId {
                let _ = try await MatchingService.rejectProposal(proposalId: proposalId)
            } else {
                let _ = try await MatchingService.rejectMatch()
            }
            await loadAll()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func dissolve(reason: String? = nil) async {
        isLoading = true
        errorMessage = nil
        do {
            let _ = try await MatchingService.dissolveRelationship(reason: reason)
            await loadAll()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    // ─── 偏好 ─────────────────────────────────────────────
    func loadPreferences() async {
        do {
            self.preferences = try await MatchingService.getPreferences()
        } catch {}
    }

    func savePreferences() async {
        do {
            self.preferences = try await MatchingService.setPreferences(preferences)
        } catch {}
    }

    var isMatched: Bool { matchState == .proposed }
    var isProposed: Bool { matchState == .proposed }
    var isInRelationship: Bool { matchState == .relationship }
    var isSearching: Bool { matchState == .searching }
    var isNoMatch: Bool { matchState == .noMatch }
    var isIdle: Bool { matchState == .idle }

    // ─── 下一个周五 17:00 的倒计时文案 ───────────────────
    var nextFridayCountdown: String {
        let now = Date()
        let cal = Calendar.current
        let weekday = cal.component(.weekday, from: now) // 1=Sun,2=Mon,...,6=Fri
        var daysUntil = (6 - weekday + 7) % 7
        if daysUntil == 0 && cal.component(.hour, from: now) >= 17 { daysUntil = 7 }
        guard let friday = cal.date(byAdding: .day, value: daysUntil, to: now),
              let nextFriday = cal.date(bySettingHour: 17, minute: 0, second: 0, of: friday) else {
            return "本周五 17:00"
        }
        let diff = nextFriday.timeIntervalSince(now)
        if diff <= 0 { return "今天 17:00 公布" }
        let d = Int(diff / 86400)
        let h = Int(diff.truncatingRemainder(dividingBy: 86400) / 3600)
        let m = Int(diff.truncatingRemainder(dividingBy: 3600) / 60)
        if d > 0 { return "\(d)天\(h)小时后公布" }
        if h > 0 { return "\(h)小时\(m)分后公布" }
        return "\(m)分钟后公布"
    }
}
