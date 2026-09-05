import SwiftUI
import UIKit

// MARK: - Soft-fill inputs (h5-design-system.md §8.2)
//
// The app-wide input style: `#f3f3f3` (dark `#23211f`) fill, 10 pt radius, no border,
// `px-3 py-2.5` (12 / 10 pt), placeholder in `outlineVariant`, and a 1 pt neon focus ring.
// `SoftTextArea` is the multiline twin (`resize-none`, N rows, optional "0 / 250" counter).
// `SoftSelect` / `UnderlineSelect` are the two `<select>` skins (soft-fill everywhere;
// underline only on the profile-setup page); both open `MetadataPickerSheet`.

struct SoftField: View {
    @Binding var text: String
    var placeholder: String
    var size: CGFloat = 14
    var keyboard: UIKeyboardType = .default
    var secure: Bool = false
    var autocap: TextInputAutocapitalization = .never
    var autocorrect: Bool = false
    var submitLabel: SubmitLabel = .done
    var tracking: CGFloat = 0                // em (e.g. 0.3 for verification codes, 0.1 for connect code)
    var uppercase: Bool = false              // connect-code input (`uppercase tracking-widest`)
    var disabled: Bool = false
    var placeholderTone: PlaceholderTone = .variant
    var onSubmit: (() -> Void)? = nil

    enum PlaceholderTone { case variant, outline }

    @FocusState private var focused: Bool

    var body: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text(placeholder)
                    .font(Theme.font(size))
                    .foregroundColor(placeholderTone == .variant ? Theme.C.outlineVariantText : Theme.C.outline)
                    .lineLimit(1)
                    .allowsHitTesting(false)
            }
            Group {
                if secure {
                    SecureField("", text: $text)
                } else {
                    TextField("", text: $text)
                }
            }
            .font(Theme.font(size, weight: uppercase ? .bold : .regular))
            .tracking(Theme.tracking(tracking, size: size))
            .foregroundColor(Theme.C.onSurface)
            .keyboardType(keyboard)
            .textInputAutocapitalization(uppercase ? .characters : autocap)
            .autocorrectionDisabled(!autocorrect)
            .submitLabel(submitLabel)
            .focused($focused)
            .disabled(disabled)
            .onSubmit { onSubmit?() }
            .onChange(of: text) { v in
                if uppercase {
                    let up = v.uppercased()
                    if up != v { text = up }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.containerLow)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(Theme.C.neon, lineWidth: focused ? 1 : 0)
        )
        .opacity(disabled ? 0.6 : 1)
        .contentShape(Rectangle())
        .onTapGesture { if !disabled { focused = true } }
    }
}

// MARK: - SoftTextArea

struct SoftTextArea: View {
    @Binding var text: String
    var placeholder: String
    var rows: Int = 3
    var size: CGFloat = 14
    var maxLength: Int? = nil
    var showCounter: Bool = false
    var disabled: Bool = false
    var style: Style = .soft

    /// `.soft` = canonical soft-fill; `.outlinedBlack` = filter-sheet extra-info textarea
    /// (`bg-white border border-black`); `.outlinedNeutral` = report modal (`border-outline-variant`).
    enum Style { case soft, outlinedBlack, outlinedNeutral }

    @FocusState private var focused: Bool

    private var lineHeight: CGFloat { size * 1.625 }           // leading-relaxed
    private var minHeight: CGFloat { lineHeight * CGFloat(max(1, rows)) + 20 }

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text(placeholder)
                        .font(Theme.font(size))
                        .foregroundColor(style == .outlinedBlack ? Theme.C.stone400 : Theme.C.outlineVariantText)
                        .padding(.horizontal, 12 + 5)
                        .padding(.vertical, 10 + 8)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $text)
                    .font(Theme.font(size, weight: style == .outlinedBlack ? .medium : .regular))
                    .foregroundColor(Theme.C.onSurface)
                    .scrollContentBackground(.hidden)
                    .background(Color.clear)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .frame(minHeight: minHeight)
                    .focused($focused)
                    .disabled(disabled)
                    .onChange(of: text) { v in
                        if let m = maxLength, v.count > m {
                            text = String(v.prefix(m))
                        }
                    }
            }
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                    .stroke(strokeColor, lineWidth: strokeWidth)
            )
            .opacity(disabled ? 0.6 : 1)
            .contentShape(Rectangle())
            .onTapGesture { if !disabled { focused = true } }

            if showCounter, let m = maxLength {
                Text("\(text.count) / \(m)")
                    .font(Theme.font(10, weight: .medium))
                    .foregroundColor(Theme.C.outline)
            }
        }
    }

    private var background: Color {
        switch style {
        case .soft: return Theme.C.containerLow
        case .outlinedBlack: return Theme.C.card
        case .outlinedNeutral: return .clear
        }
    }

    private var strokeColor: Color {
        switch style {
        case .soft: return Theme.C.neon
        case .outlinedBlack: return Theme.C.borderStrong
        case .outlinedNeutral: return focused ? Theme.C.primary : Theme.C.outlineVariant
        }
    }

    private var strokeWidth: CGFloat {
        switch style {
        case .soft: return focused ? 1 : 0
        case .outlinedBlack, .outlinedNeutral: return 1
        }
    }
}

// MARK: - SoftSelect

/// Soft-fill `<select>`: label (or placeholder) + `expand_more` 18 pt chevron at `right-2`,
/// 14 / 500, truncating. Tapping opens a searchable `MetadataPickerSheet`.
struct SoftSelect<T: Hashable>: View {
    var placeholder: String
    @Binding var selection: T?
    var options: [T]
    var display: (T) -> String
    var allowClear: Bool = true              // shows the placeholder row that resets to nil (H5 value "")
    var disabled: Bool = false
    var size: CGFloat = 14

    @State private var showPicker = false

    init(placeholder: String,
         selection: Binding<T?>,
         options: [T],
         allowClear: Bool = true,
         disabled: Bool = false,
         size: CGFloat = 14,
         display: @escaping (T) -> String) {
        self.placeholder = placeholder
        self._selection = selection
        self.options = options
        self.allowClear = allowClear
        self.disabled = disabled
        self.size = size
        self.display = display
    }

    var body: some View {
        Button {
            showPicker = true
        } label: {
            HStack(spacing: 8) {
                Text(selection.map(display) ?? placeholder)
                    .font(Theme.font(size, weight: .medium))
                    .foregroundColor(selection == nil ? Theme.C.outline : Theme.C.onSurface)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 0)
                Image(systemName: Theme.Icon.sf("expand_more"))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Theme.C.outline)
                    .frame(width: 18, height: 18)
            }
            .padding(.leading, 12)
            .padding(.trailing, 8)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(Theme.C.containerLow)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.6 : 1)
        .sheet(isPresented: $showPicker) {
            MetadataPickerSheet(
                title: placeholder,
                options: options.map(display),
                selected: selection.map(display),
                placeholderRow: allowClear ? placeholder : nil
            ) { picked in
                if let p = picked, let match = options.first(where: { display($0) == p }) {
                    selection = match
                } else {
                    selection = nil
                }
            }
        }
    }
}

extension SoftSelect where T == String {
    /// String convenience: options display themselves (metadata values stay English; pass
    /// `L10n.metaLabel` through `display:` when a translated label is wanted).
    init(placeholder: String,
         selection: Binding<String?>,
         options: [String],
         allowClear: Bool = true,
         disabled: Bool = false,
         size: CGFloat = 14,
         translated: Bool = false) {
        self.init(placeholder: placeholder,
                  selection: selection,
                  options: options,
                  allowClear: allowClear,
                  disabled: disabled,
                  size: size,
                  display: { translated ? (L10n.metaLabel($0) ?? $0) : $0 })
    }
}

// MARK: - UnderlineSelect (profile setup page)

/// Setup-page `<select>` skin: transparent, 1 pt `outline` bottom border (2 pt `primary`
/// while the picker is open), 18 pt text, `py-3`, `expand_more` at the right.
struct UnderlineSelect: View {
    var placeholder: String
    @Binding var selection: String?
    var options: [String]
    var translated: Bool = true
    var disabled: Bool = false

    @State private var showPicker = false

    var body: some View {
        Button {
            showPicker = true
        } label: {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Text(selection.map { translated ? (L10n.metaLabel($0) ?? $0) : $0 } ?? placeholder)
                        .font(Theme.font(18))
                        .foregroundColor(selection == nil ? Theme.C.outline : Theme.C.onSurface)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: 0)
                    Image(systemName: Theme.Icon.sf("expand_more"))
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Theme.C.outline)
                        .frame(width: 18, height: 18)
                }
                .padding(.vertical, 12)
                Rectangle()
                    .fill(showPicker ? Theme.C.primary : Theme.C.outline)
                    .frame(height: showPicker ? 2 : 1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.6 : 1)
        .sheet(isPresented: $showPicker) {
            MetadataPickerSheet(
                title: placeholder,
                options: options,
                selected: selection,
                placeholderRow: placeholder,
                translated: translated
            ) { picked in
                selection = picked
            }
        }
    }
}

// MARK: - MetadataPickerSheet

/// Searchable single-choice list used by every select. Shows the raw (English) values
/// with `L10n.metaLabel` display when `translated`; an optional placeholder row at the top
/// clears the selection (mirrors the `<option value="">` H5 placeholder). A stored value
/// missing from `options` is inserted at the top so it stays selectable (H5 edit-profile rule).
struct MetadataPickerSheet: View {
    var title: String
    var options: [String]
    var selected: String?
    var placeholderRow: String? = nil
    var translated: Bool = true
    var onPick: (String?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @FocusState private var searchFocused: Bool

    private var allOptions: [String] {
        var list = options
        if let s = selected, !s.isEmpty, !list.contains(s) { list.insert(s, at: 0) }
        return list
    }

    private var filtered: [String] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return allOptions }
        return allOptions.filter { opt in
            opt.localizedCaseInsensitiveContains(q) || label(opt).localizedCaseInsensitiveContains(q)
        }
    }

    private func label(_ v: String) -> String {
        translated ? (L10n.metaLabel(v) ?? v) : v
    }

    var body: some View {
        VStack(spacing: 0) {
            // Grab handle + header (bottom-sheet header style, h5-design §7.4)
            Capsule()
                .fill(Theme.C.stone200)
                .frame(width: 40, height: 4)
                .padding(.top, 12)
                .padding(.bottom, 12)
            ZStack {
                Text(title)
                    .font(Theme.TextStyle.sheetTitle)
                    .tracking(Theme.tracking(Theme.Tracking.tighter, size: 16))
                    .foregroundColor(Theme.C.onSurface)
                    .lineLimit(1)
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: Theme.Icon.sf("close"))
                            .font(.system(size: 18, weight: .medium))
                            .foregroundColor(Theme.C.stone400)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 8)

            // Search pill
            HStack(spacing: 8) {
                Image(systemName: Theme.Icon.sf("search"))
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(Theme.C.outline)
                    .frame(width: 20, height: 20)
                ZStack(alignment: .leading) {
                    if query.isEmpty {
                        Text(L10n.t("Search"))
                            .font(Theme.font(14))
                            .foregroundColor(Theme.C.outlineVariantText)
                    }
                    TextField("", text: $query)
                        .font(Theme.font(14))
                        .foregroundColor(Theme.C.onSurface)
                        .autocorrectionDisabled(true)
                        .textInputAutocapitalization(.never)
                        .focused($searchFocused)
                }
                if !query.isEmpty {
                    Button { query = "" } label: {
                        Image(systemName: Theme.Icon.sf("close"))
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Theme.C.outline)
                            .frame(width: 18, height: 18)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Theme.C.containerLow)
            .clipShape(Capsule())
            .padding(.horizontal, 24)
            .padding(.bottom, 8)

            Rectangle().fill(Theme.C.hairline).frame(height: 1)

            ScrollView {
                LazyVStack(spacing: 0) {
                    if let ph = placeholderRow, query.isEmpty {
                        row(text: ph, isSelected: selected == nil || selected?.isEmpty == true, muted: true) {
                            onPick(nil)
                            dismiss()
                        }
                    }
                    if filtered.isEmpty {
                        Text(L10n.pick("No matches", "没有匹配的选项"))
                            .font(Theme.font(14))
                            .foregroundColor(Theme.C.onSurfaceVariant)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                    }
                    ForEach(filtered, id: \.self) { opt in
                        row(text: label(opt), isSelected: opt == selected, muted: false) {
                            onPick(opt)
                            dismiss()
                        }
                    }
                }
                .padding(.bottom, 24)
            }
        }
        .background(Theme.C.surface.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.hidden)
    }

    private func row(text: String, isSelected: Bool, muted: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Text(text)
                    .font(Theme.font(14, weight: .medium))
                    .tracking(Theme.tracking(Theme.Tracking.wide, size: 14))
                    .foregroundColor(muted ? Theme.C.outline : Theme.C.onSurface)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if isSelected {
                    Image(systemName: Theme.Icon.sf("check"))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(Theme.C.onSurface)
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .overlay(alignment: .bottom) {
                Rectangle().fill(Theme.C.hairline20).frame(height: 1).padding(.leading, 24)
            }
        }
        .buttonStyle(.plain)
    }
}
