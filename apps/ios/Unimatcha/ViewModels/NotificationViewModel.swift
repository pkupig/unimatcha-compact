// Interface outline: implementation bodies removed.
import Foundation
import SwiftUI
    @Published var items: [AppNotification] = []
    @Published var unread = 0
    @Published var isLoading = false
    @Published var errorMessage: String?
    func load() async
    func refreshUnread() async
    func markAllRead() async
