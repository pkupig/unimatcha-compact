import Foundation
import SwiftUI

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isLoggedIn = false
    @Published var currentUser: User?

    init() {
        if TokenStorage.shared.isLoggedIn, let user = TokenStorage.shared.loadUser() {
            self.currentUser = user
            self.isLoggedIn = true
            Task { await refresh() }
        }
    }

    @Published var codeHint: String?
    @Published var isSendingCode = false

    /// 请求注册邮箱验证码；开发态后端会回 devCode，直接提示出来方便测试。
    func sendRegisterCode(email: String) async {
        guard !email.isEmpty else { errorMessage = "请先填写邮箱"; return }
        isSendingCode = true; errorMessage = nil; codeHint = nil
        do {
            let res = try await AuthService.sendRegisterCode(email: email)
            if let dev = res.devCode {
                codeHint = "开发模式（未接邮件服务）：验证码 \(dev)"
            } else {
                codeHint = res.message ?? "验证码已发送到你的邮箱，10 分钟内有效"
            }
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isSendingCode = false
    }

    func register(email: String, password: String, code: String) async {
        await authenticate { try await AuthService.register(email: email, password: password, code: code) }
    }

    func login(email: String, password: String) async {
        await authenticate { try await AuthService.login(email: email, password: password) }
    }

    private func authenticate(_ op: () async throws -> AuthResponse) async {
        isLoading = true; errorMessage = nil
        do {
            let response = try await op()
            TokenStorage.shared.token = response.token
            currentUser = response.user
            isLoggedIn = true
            await refresh()
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    /// Pull the full user (modeStates + profile + hasProfile + completedQuestionnaire).
    func refresh() async {
        do {
            let me = try await ProfileService.getMe()
            currentUser = me
            TokenStorage.shared.saveUser(me)
            if me.status == "BANNED" { logout() }
        } catch {
            // keep whatever we had; a 401 already cleared the token in APIClient
        }
    }

    func logout() {
        TokenStorage.shared.clearToken()
        currentUser = nil
        isLoggedIn = false
    }
}
