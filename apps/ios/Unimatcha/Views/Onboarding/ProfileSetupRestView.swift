import SwiftUI

// MARK: - ProfileSetupRestView (`#setup-rest`, h5-auth §1.4 (b), h5-profile §1.1 state B)
//
// Sections 64 pt apart: Avatar (128 dashed circle, immediate upload) → Basic Info (five
// UNDERLINE selects, Looking For 3-col with "Anyone" pre-selected, Academic Year soft-fill
// select) → Interests (neon chips ≤ 8, 4 suggestion chips, input + neon "Add") → Bio (textarea
// p-6 14 pt italic, 250 max, counter) → "Confirm Profile" (neon py-5 14/800 +0.3em) + consent line.

struct ProfileSetupRestView: View {
    @ObservedObject var vm: ProfileSetupViewModel

    @State private var showAvatarPicker = false

    var body: some View {
        VStack(alignment: .leading, spacing: 64) {
            avatarSection
            basicInfoSection
            interestsSection
            bioSection
            finalSection
        }
        .photoPicker(isPresented: $showAvatarPicker, limit: 1) { photos in
            guard let first = photos.first else { return }
            Task { await vm.avatarPicked(first) }
        }
    }

    // MARK: 1. Avatar

    private var avatarSection: some View {
        VStack(spacing: 16) {
            Button {
                guard !vm.isUploadingAvatar else { return }
                showAvatarPicker = true
            } label: {
                ZStack {
                    if let url = vm.avatarUrl, SafeURL.isSafe(url) {
                        RemoteImage(url: url, contentMode: .fill)
                            .frame(width: 128, height: 128)
                            .clipShape(Circle())
                    } else {
                        Circle().fill(Theme.C.card)
                        Circle()
                            .stroke(style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                            .foregroundColor(Theme.C.outlineVariantText)
                        VStack(spacing: 4) {
                            MaterialIcon(name: "add_a_photo", size: 30, color: Theme.C.onSurfaceVariant)
                            Text(L10n.t("Upload"))
                                .font(Theme.font(10, weight: .bold))
                                .tracking(Theme.tracking(Theme.Tracking.tighter, size: 10))
                                .foregroundColor(Theme.C.onSurfaceVariant)
                        }
                    }
                }
                .frame(width: 128, height: 128)
                .opacity(vm.isUploadingAvatar ? 0.6 : 1)
                .contentShape(Circle())
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.98))
            .disabled(vm.isUploadingAvatar)
            .accessibilityLabel(L10n.t("Upload"))

            Text(L10n.t("Your Academic Identity"))
                .font(Theme.font(12))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 12))
                .foregroundColor(Theme.C.onSurfaceVariant)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: 2. Basic Info

    private var basicInfoSection: some View {
        VStack(alignment: .leading, spacing: 40) {
            SetupSectionHeader(title: L10n.t("Basic Info"))
            VStack(alignment: .leading, spacing: 32) {
                underlineField(label: L10n.t("University / School"),
                               placeholder: L10n.t("Select Institution"),
                               selection: $vm.school,
                               options: vm.universities)
                underlineField(label: L10n.t("City"),
                               placeholder: L10n.t("Select City"),
                               selection: $vm.city,
                               options: vm.cities)
                underlineField(label: L10n.t("Major"),
                               placeholder: L10n.t("Select Major"),
                               selection: $vm.major,
                               options: vm.majors)
                underlineField(label: L10n.t("MBTI"),
                               placeholder: L10n.t("Select MBTI"),
                               selection: $vm.mbti,
                               options: vm.mbtiTypes,
                               translated: false)
                underlineField(label: L10n.t("Nationality"),
                               placeholder: L10n.t("Select Nationality"),
                               selection: $vm.nationality,
                               options: vm.nationalities)

                VStack(alignment: .leading, spacing: 16) {
                    SetupFieldLabel(text: L10n.t("Looking For"))
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                        SetupChoiceButton(label: SetupCopy.men, selected: vm.genderPref == "male", paddingV: 12) { vm.selectGenderPref("male") }
                        SetupChoiceButton(label: SetupCopy.women, selected: vm.genderPref == "female", paddingV: 12) { vm.selectGenderPref("female") }
                        SetupChoiceButton(label: SetupCopy.anyone, selected: vm.genderPref == "any", paddingV: 12) { vm.selectGenderPref("any") }
                    }
                }

                VStack(alignment: .leading, spacing: 16) {
                    SetupFieldLabel(text: L10n.t("Academic Year"))
                    SoftSelect<String>(placeholder: L10n.t("Select Grade"),
                                       selection: $vm.grade,
                                       options: vm.gradeOptions,
                                       allowClear: true,
                                       size: 14,
                                       translated: true)
                }
            }
        }
    }

    private func underlineField(label: String,
                                placeholder: String,
                                selection: Binding<String?>,
                                options: [String],
                                translated: Bool = true) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SetupFieldLabel(text: label)
            UnderlineSelect(placeholder: placeholder,
                            selection: selection,
                            options: options,
                            translated: translated)
        }
    }

    // MARK: 3. Interests

    private var interestsSection: some View {
        VStack(alignment: .leading, spacing: 40) {
            SetupSectionHeader(title: L10n.t("Interests"))

            if !vm.interests.isEmpty {
                FlowLayout(spacing: 8) {
                    ForEach(Array(vm.interests.enumerated()), id: \.offset) { pair in
                        Chip(text: pair.element,
                             selected: true,
                             style: .tag,
                             onRemove: { vm.removeInterest(at: pair.offset) })
                    }
                }
            }

            FlowLayout(spacing: 8) {
                ForEach(ProfileSetupViewModel.suggestions, id: \.self) { s in
                    Chip(text: s,
                         selected: false,
                         style: .suggestion,
                         onTap: { vm.addInterest(s) })
                }
            }

            HStack(alignment: .bottom, spacing: 12) {
                SoftField(text: $vm.tagInput,
                          placeholder: L10n.placeholder("Add new interest..."),
                          size: 14,
                          autocap: .words,
                          submitLabel: .done,
                          onSubmit: { vm.addInterestFromInput() })
                CTAButton(title: L10n.t("Add"),
                          style: .neon,
                          size: 12,
                          fullWidth: false,
                          paddingV: 10,
                          paddingH: 20,
                          action: { vm.addInterestFromInput() })
                    .fixedSize()
            }
        }
    }

    // MARK: 4. Bio

    private var bioSection: some View {
        VStack(alignment: .leading, spacing: 40) {
            SetupSectionHeader(title: L10n.t("Bio"))
            VStack(alignment: .leading, spacing: 8) {
                SetupFieldLabel(text: L10n.t("Academic Manifesto"))
                SetupBioEditor(text: $vm.bio, placeholder: SetupCopy.bioPlaceholder, maxLength: ProfileRules.bioMax)
                Text(SetupCopy.bioCounter(vm.bioCount))
                    .font(Theme.font(10))
                    .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                    .foregroundColor(Theme.C.onSurfaceVariant)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
    }

    // MARK: 5. Confirm

    private var finalSection: some View {
        VStack(spacing: 24) {
            CTAButton(title: L10n.t("Confirm Profile"),
                      style: .neon,
                      weight: .heavy,
                      tracking: Theme.Tracking.hero,
                      busy: vm.isSaving,
                      busyTitle: L10n.t("Saving…"),
                      action: { Task { await vm.save() } })
            Text(L10n.t("By continuing, you agree to the Academic Code of Conduct."))
                .font(Theme.font(10))
                .tracking(Theme.tracking(Theme.Tracking.widest, size: 10))
                .foregroundColor(Theme.C.outline)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
        .padding(.top, 32)
        .padding(.bottom, 48)
    }
}

// MARK: - Bio editor (`#setup-bio`: rows 4, p-6, 14 pt italic, placeholder `outline`, 250 max)

struct SetupBioEditor: View {
    @Binding var text: String
    var placeholder: String
    var maxLength: Int

    @FocusState private var focused: Bool

    private let size: CGFloat = 14
    private var minHeight: CGFloat { size * 1.625 * 4 + 48 }

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(placeholder)
                    .font(Theme.font(size).italic())
                    .foregroundColor(Theme.C.outline)
                    .padding(.horizontal, 24 + 5)
                    .padding(.vertical, 24 + 8)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .font(Theme.font(size).italic())
                .foregroundColor(Theme.C.onSurface)
                .scrollContentBackground(.hidden)
                .background(Color.clear)
                .padding(.horizontal, 24)
                .padding(.vertical, 24)
                .frame(minHeight: minHeight)
                .focused($focused)
                .onChange(of: text) { v in
                    if v.count > maxLength { text = String(v.prefix(maxLength)) }
                }
        }
        .background(Theme.C.containerLow)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                .stroke(Theme.C.neon, lineWidth: focused ? 1 : 0)
        )
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
    }
}
