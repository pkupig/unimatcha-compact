// Interface outline: implementation bodies removed.
import SwiftUI
struct PartnerProfileView: View {
    init(profile: PublicProfile)
    init(userId: String)
    var body: some View {
    private func content(_ profile: PublicProfile) -> some View
    private func coverHeader(_ profile: PublicProfile) -> some View
    private func infoRows(_ profile: PublicProfile) -> some View
    private func photoGrid(_ photos: [String]) -> some View
    private func badge(text: String, icon: String? = nil) -> some View
    private func labeledCard<Content: View>(title: String,
    private func loadProfile() async
