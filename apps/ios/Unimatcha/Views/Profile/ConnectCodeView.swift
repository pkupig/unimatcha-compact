// Interface outline: implementation bodies removed.
import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit
struct ConnectCodeView: View {
    var body: some View {
    private func qrImage(from string: String) -> UIImage?
    private func loadCode() async
    private func connect() async
