// Interface outline: implementation bodies removed.
import SwiftUI
struct CoupleSpaceView: View {
    let matchId: String
    init(matchId: String)
    var body: some View {
    private func coverHeader(_ space: CoupleSpace) -> some View
    private func avatarBadge(_ profile: PublicProfile?, label: String) -> some View
    private func initialsCircle(_ nickname: String?) -> some View
    private func daysCard(_ space: CoupleSpace) -> some View
    private func loveYouCard(_ space: CoupleSpace) -> some View
    private func loveCount(label: String, value: Int?) -> some View
    private func statusCravingCard(_ space: CoupleSpace) -> some View
    private func editableRow(icon: String, title: String, value: String?, emptyHint: String, action: @escaping () -> Void) -> some View
    private func bucketCard(_ space: CoupleSpace) -> some View
    private func anniversaryCard(_ space: CoupleSpace) -> some View
    private func textEntrySheet(title: String, placeholder: String, text: Binding<String>, onSave: @escaping () async -> Void) -> some View
    private func dismissAllSheets()
