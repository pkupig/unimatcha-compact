import SwiftUI
import PhotosUI
import UIKit

// MARK: - PhotoPicker
//
// PhotosUI (`PHPickerViewController`) wrapper. Every picked asset is normalised through
// `ImageTranscoder.jpegData` (HEIC → JPEG, ≤1600 px, ≤8 MB) so callers can hand the bytes straight
// to `APIClient.uploadImage` / `UploadService.upload(image:)`. Single (`limit: 1`) or multi.
// No photo-library permission is needed for the picker itself (it runs out-of-process).

struct PickedPhoto: Identifiable {
    let id = UUID()
    let image: UIImage          // normalised (orientation-up, downscaled) preview
    let jpeg: Data              // upload payload
}

struct PhotoPicker: UIViewControllerRepresentable {
    var limit: Int = 1
    var onPicked: ([PickedPhoto]) -> Void
    var onCancel: (() -> Void)? = nil

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.filter = .images
        config.selectionLimit = max(0, limit)
        config.preferredAssetRepresentationMode = .current
        let vc = PHPickerViewController(configuration: config)
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let parent: PhotoPicker
        init(_ parent: PhotoPicker) { self.parent = parent }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            picker.dismiss(animated: true)
            guard !results.isEmpty else {
                parent.onCancel?()
                return
            }
            let providers = results.map { $0.itemProvider }
            Task.detached(priority: .userInitiated) { [parent] in
                var out: [PickedPhoto] = []
                for p in providers {
                    if let photo = await Self.load(p) { out.append(photo) }
                }
                let photos = out
                await MainActor.run { parent.onPicked(photos) }
            }
        }

        private static func load(_ provider: NSItemProvider) async -> PickedPhoto? {
            guard provider.canLoadObject(ofClass: UIImage.self) else {
                // Fallback: raw data (some formats report no UIImage class).
                let data: Data? = await withCheckedContinuation { cont in
                    provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { d, _ in cont.resume(returning: d) }
                }
                guard let d = data, let img = UIImage(data: d) else { return nil }
                return transcode(img)
            }
            let image: UIImage? = await withCheckedContinuation { cont in
                provider.loadObject(ofClass: UIImage.self) { obj, _ in cont.resume(returning: obj as? UIImage) }
            }
            guard let img = image else { return nil }
            return transcode(img)
        }

        private static func transcode(_ img: UIImage) -> PickedPhoto? {
            guard let jpeg = ImageTranscoder.jpegData(from: img) else { return nil }
            let preview = ImageTranscoder.normalized(img, maxDimension: 1600)
            return PickedPhoto(image: preview, jpeg: jpeg)
        }
    }
}

// MARK: - Modifier

extension View {
    /// `.photoPicker(isPresented:limit:onPicked:)` — presents the system picker as a sheet.
    func photoPicker(isPresented: Binding<Bool>, limit: Int = 1, onPicked: @escaping ([PickedPhoto]) -> Void) -> some View {
        sheet(isPresented: isPresented) {
            PhotoPicker(limit: limit, onPicked: onPicked)
                .ignoresSafeArea()
        }
    }
}

// MARK: - Dashed drop zones (h5-design-system.md §8.2)

/// `border border-dashed border-outline-variant rounded-[10px] text-outline` add tile (80 pt image add,
/// 128 pt avatar circle `border-2`, verify card 16:10 with `add_a_photo` 30 pt + "Tap to upload").
struct DashedAddTile: View {
    var size: CGFloat = 80
    var circle: Bool = false
    var lineWidth: CGFloat = 1
    var sf: String = Theme.Icon.sf("add")
    var iconSize: CGFloat = 24
    var caption: String? = nil
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                if circle {
                    Circle().stroke(style: StrokeStyle(lineWidth: lineWidth, dash: [5, 4]))
                        .foregroundColor(Theme.C.outlineVariantText)
                } else {
                    RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                        .stroke(style: StrokeStyle(lineWidth: lineWidth, dash: [5, 4]))
                        .foregroundColor(Theme.C.outlineVariantText)
                }
                VStack(spacing: 6) {
                    Image(systemName: sf)
                        .font(.system(size: iconSize * 0.82, weight: .light))
                        .foregroundColor(Theme.C.outline)
                    if let c = caption {
                        Text(c)
                            .font(Theme.font(10, weight: .bold))
                            .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                            .foregroundColor(Theme.C.outline)
                    }
                }
            }
            .frame(width: size, height: size)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.98))
    }
}
