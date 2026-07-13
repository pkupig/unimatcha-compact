import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit

/// 连接码页 —— 展示我的连接码（文本 + 二维码），并支持通过对方连接码直接建立好友会话。
struct ConnectCodeView: View {
    @State private var myCode: String?
    @State private var loadingCode = true

    @State private var inputCode = ""
    @State private var connecting = false
    @State private var connectMessage: String?
    @State private var connectSuccess = false
    @State private var errorMessage: String?

    private let ciContext = CIContext()

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                myCodeCard
                addByCodeCard

                if let error = errorMessage {
                    Text(error)
                        .font(.system(size: 12)).foregroundColor(Theme.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Spacer().frame(height: 24)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
        .themedScreen()
        .navigationTitle("我的连接码")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task { await loadCode() }
    }

    // MARK: - My code + QR
    private var myCodeCard: some View {
        Card {
            VStack(spacing: 16) {
                Text("向好友出示此二维码或连接码")
                    .font(.system(size: 13))
                    .foregroundColor(Theme.textSecondary)

                ZStack {
                    RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                        .fill(Theme.surfaceHi)
                        .frame(width: 208, height: 208)

                    if loadingCode {
                        ProgressView().tint(Theme.accent)
                    } else if let code = myCode, let qr = qrImage(from: code) {
                        Image(uiImage: qr)
                            .interpolation(.none)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 176, height: 176)
                            .padding(8)
                            .background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))
                    } else {
                        Image(systemName: "qrcode")
                            .font(.system(size: 80))
                            .foregroundColor(Theme.textMuted)
                    }
                }

                if let code = myCode {
                    VStack(spacing: 8) {
                        Text(code)
                            .font(.system(size: 20, weight: .bold, design: .monospaced))
                            .foregroundColor(Theme.accent)
                            .textSelection(.enabled)
                        Button {
                            UIPasteboard.general.string = code
                        } label: {
                            Label("复制连接码", systemImage: "doc.on.doc")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(Theme.textSecondary)
                        }
                    }
                } else if !loadingCode {
                    Text("连接码加载失败，请下拉重试")
                        .font(.system(size: 13)).foregroundColor(Theme.textMuted)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Add by code
    private var addByCodeCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("输入对方连接码")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.textPrimary)
                Text("成功后将直接与对方建立好友会话。")
                    .font(.system(size: 12)).foregroundColor(Theme.textMuted)

                TextField("", text: $inputCode,
                          prompt: Text("请输入连接码").foregroundColor(Theme.textMuted))
                    .font(.system(size: 16, weight: .medium, design: .monospaced))
                    .foregroundColor(Theme.textPrimary)
                    .tint(Theme.accent)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .padding(12)
                    .background(Theme.surfaceHi)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusSm, style: .continuous))

                if let msg = connectMessage {
                    Text(msg)
                        .font(.system(size: 12))
                        .foregroundColor(connectSuccess ? Theme.accent : Theme.danger)
                }

                Button {
                    Task { await connect() }
                } label: {
                    HStack(spacing: 6) {
                        if connecting { ProgressView().tint(Theme.onAccent) }
                        Text(connecting ? "连接中…" : "添加好友")
                    }
                }
                .buttonStyle(NeonButtonStyle())
                .disabled(connecting || inputCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    // MARK: - QR generation
    private func qrImage(from string: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        // Scale up so the code is crisp when displayed.
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        guard let cg = ciContext.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }

    // MARK: - Actions
    private func loadCode() async {
        loadingCode = true; errorMessage = nil
        do {
            myCode = try await ProfileService.getConnectCode().connectCode
        } catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
        loadingCode = false
    }

    private func connect() async {
        let code = inputCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty else { return }
        connecting = true; connectMessage = nil; connectSuccess = false; errorMessage = nil
        do {
            let result = try await MatchingService.connect(code: code)
            connectSuccess = true
            let name = result.partner?.nickname ?? "好友"
            connectMessage = result.message ?? "已与 \(name) 建立会话"
            inputCode = ""
        } catch let e as APIError { connectMessage = e.errorDescription }
        catch { connectMessage = error.localizedDescription }
        connecting = false
    }
}
