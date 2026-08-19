// Interface outline: implementation bodies removed.
import SwiftUI
struct NotificationsView: View {
    var body: some View {
    private func row(_ item: AppNotification) -> some View
    private func icon(for type: String?) -> String
    private func relativeTime(_ iso: String) -> String
