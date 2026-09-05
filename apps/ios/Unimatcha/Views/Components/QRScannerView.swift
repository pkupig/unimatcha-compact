import SwiftUI
import UIKit
import AVFoundation

// MARK: - QRScannerView (h5-addfriend-ads.md §1.1.c "Scan" view)
//
// AVCaptureSession + `AVCaptureMetadataOutput(.qr)` on the rear camera, preview `resizeAspectFill`
// inside the caller's square black box, with a 200×200 scan guide (H5 `qrbox: 200`) that also limits
// `rectOfInterest`. `onCode` fires exactly once per arming: after a hit the scanner PAUSES (H5 stops
// the camera after decode); bump `restartToken` to resume, or re-create the view (`.id(...)`). Errors
// (`permissionDenied` / `noCamera` / `sessionFailed`) surface through `onError` so the caller shows
// the "Camera unavailable — enter the code manually below." line. The session stops when the view
// disappears / the app backgrounds and restarts on foreground.

enum QRScannerError: Error, Equatable {
    case permissionDenied
    case noCamera
    case sessionFailed
}

struct QRScannerView: UIViewControllerRepresentable {
    var restartToken: Int = 0
    var scanBox: CGFloat = 200
    var onCode: (String) -> Void
    var onError: (QRScannerError) -> Void

    func makeUIViewController(context: Context) -> QRScannerController {
        let vc = QRScannerController()
        vc.scanBox = scanBox
        vc.onCode = onCode
        vc.onError = onError
        context.coordinator.lastToken = restartToken
        return vc
    }

    func updateUIViewController(_ vc: QRScannerController, context: Context) {
        vc.onCode = onCode
        vc.onError = onError
        if context.coordinator.lastToken != restartToken {
            context.coordinator.lastToken = restartToken
            vc.resume()
        }
    }

    static func dismantleUIViewController(_ vc: QRScannerController, coordinator: Coordinator) {
        vc.stop()
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var lastToken: Int = 0
    }
}

final class QRScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var scanBox: CGFloat = 200
    var onCode: ((String) -> Void)?
    var onError: ((QRScannerError) -> Void)?

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "ai.unimatcha.qr-scanner")
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let metadataOutput = AVCaptureMetadataOutput()
    private let guide = CAShapeLayer()
    private var configured = false
    private var paused = false
    private var errorReported = false
    private var observers: [NSObjectProtocol] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.8)
        view.clipsToBounds = true

        guide.fillColor = UIColor.clear.cgColor
        guide.strokeColor = UIColor(Theme.C.neon).cgColor
        guide.lineWidth = 2
        guide.lineDashPattern = nil
        view.layer.addSublayer(guide)

        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.stopSession()
        })
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self, self.viewIfLoaded?.window != nil else { return }
            self.startSession()
        })
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        session.stopRunning()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        authorizeAndStart()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        stopSession()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        layoutGuide()
    }

    // MARK: Public control

    /// Re-arms detection after a code fired (H5: user taps "Scan" again).
    func resume() {
        paused = false
        if configured && !session.isRunning { startSession() }
    }

    func stop() {
        stopSession()
    }

    // MARK: Session

    private func authorizeAndStart() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureIfNeeded()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    if granted { self.configureIfNeeded() } else { self.report(.permissionDenied) }
                }
            }
        case .denied, .restricted:
            report(.permissionDenied)
        @unknown default:
            report(.permissionDenied)
        }
    }

    private func configureIfNeeded() {
        if configured {
            startSession()
            return
        }
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
                ?? AVCaptureDevice.default(for: .video)
            guard let cam = device, let input = try? AVCaptureDeviceInput(device: cam) else {
                DispatchQueue.main.async { self.report(.noCamera) }
                return
            }
            self.session.beginConfiguration()
            self.session.sessionPreset = .high
            guard self.session.canAddInput(input), self.session.canAddOutput(self.metadataOutput) else {
                self.session.commitConfiguration()
                DispatchQueue.main.async { self.report(.sessionFailed) }
                return
            }
            self.session.addInput(input)
            self.session.addOutput(self.metadataOutput)
            self.metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            if self.metadataOutput.availableMetadataObjectTypes.contains(.qr) {
                self.metadataOutput.metadataObjectTypes = [.qr]
            } else {
                self.session.commitConfiguration()
                DispatchQueue.main.async { self.report(.sessionFailed) }
                return
            }
            self.session.commitConfiguration()
            self.configured = true
            DispatchQueue.main.async {
                let layer = AVCaptureVideoPreviewLayer(session: self.session)
                layer.videoGravity = .resizeAspectFill
                layer.frame = self.view.bounds
                self.view.layer.insertSublayer(layer, at: 0)
                self.previewLayer = layer
                self.layoutGuide()
                self.startSession()
            }
        }
    }

    private func startSession() {
        guard configured else { return }
        sessionQueue.async { [weak self] in
            guard let self = self, !self.session.isRunning else { return }
            self.session.startRunning()
        }
    }

    private func stopSession() {
        sessionQueue.async { [weak self] in
            guard let self = self, self.session.isRunning else { return }
            self.session.stopRunning()
        }
    }

    private func report(_ error: QRScannerError) {
        guard !errorReported else { return }
        errorReported = true
        onError?(error)
    }

    private func layoutGuide() {
        let side = min(scanBox, min(view.bounds.width, view.bounds.height) * 0.9)
        let rect = CGRect(x: (view.bounds.width - side) / 2, y: (view.bounds.height - side) / 2, width: side, height: side)
        guide.path = UIBezierPath(roundedRect: rect, cornerRadius: Theme.R.base).cgPath
        guide.frame = view.bounds
        if let layer = previewLayer, !rect.isEmpty {
            metadataOutput.rectOfInterest = layer.metadataOutputRectConverted(fromLayerRect: rect)
        }
    }

    // MARK: AVCaptureMetadataOutputObjectsDelegate

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                        didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        guard !paused else { return }
        guard let obj = metadataObjects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first(where: { $0.type == .qr }),
              let value = obj.stringValue, !value.isEmpty else { return }
        paused = true
        stopSession()
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        onCode?(value)
    }
}
