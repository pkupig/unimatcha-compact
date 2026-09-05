import SwiftUI

// MARK: - Edit Profile field groups (h5-profile.md §1.3 items 2, 3, 5)
//
// Every label = 10/700 tracking-widest `onSurfaceVariant`; every input = soft-fill `containerLow`,
// r10, px-3 py-2.5, 1 pt neon focus ring (the shared `SoftField` / `SoftTextArea` / `SoftSelect`).

/// 10/700 tracking-widest `onSurfaceVariant` field label.
struct EditFieldLabel: View {
    var text: String
    var body: some View {
        MicroLabel(text: text)
    }
}

// MARK: - Fields block (`space-y-7`)

struct EditProfileFieldsView: View {
    @ObservedObject var vm: EditProfileViewModel

    private let gridColumns = [
        GridItem(.flexible(), spacing: 16, alignment: .top),
        GridItem(.flexible(), spacing: 16, alignment: .top),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            nicknameField
            realNameField
            bioField
            signatureField
            LazyVGrid(columns: gridColumns, alignment: .leading, spacing: 24) {
                genderField
                birthdayField
                selectField(label: L10n.t("School"),
                            placeholder: L10n.t("Select School"),
                            selection: $vm.school,
                            options: vm.options(for: .universities),
                            ready: vm.listReady(.universities))
                gradeField
                selectField(label: L10n.t("City"),
                            placeholder: L10n.t("Select City"),
                            selection: $vm.city,
                            options: vm.options(for: .cities),
                            ready: vm.listReady(.cities))
                selectField(label: L10n.t("Major"),
                            placeholder: L10n.t("Select Major"),
                            selection: $vm.major,
                            options: vm.options(for: .majors),
                            ready: vm.listReady(.majors))
                selectField(label: L10n.t("MBTI"),
                            placeholder: L10n.t("Select MBTI"),
                            selection: $vm.mbti,
                            options: vm.options(for: .mbtiTypes),
                            ready: vm.listReady(.mbtiTypes),
                            translated: false)
                selectField(label: L10n.t("Nationality"),
                            placeholder: L10n.t("Select Nationality"),
                            selection: $vm.nationality,
                            options: vm.options(for: .nationalities),
                            ready: vm.listReady(.nationalities))
                studentIdField
            }
        }
    }

    // MARK: Text fields

    private var nicknameField: some View {
        VStack(alignment: .leading, spacing: 8) {
            EditFieldLabel(text: L10n.t("Nickname"))
            SoftField(text: $vm.nickname,
                      placeholder: L10n.placeholder("The Scholar"),
                      size: 16,
                      autocap: .words,
                      submitLabel: .done)
        }
    }

    /// Label suffix in `outline` normal case; 2-col given / family, 14 pt.
    private var realNameField: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                EditFieldLabel(text: L10n.t("Real name"))
                Text(L10n.t("· only shown to confirmed partners"))
                    .font(Theme.font(10))
                    .foregroundColor(Theme.C.outline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            HStack(spacing: 16) {
                SoftField(text: $vm.givenName,
                          placeholder: L10n.placeholder("Given name (名)"),
                          size: 14,
                          autocap: .words,
                          submitLabel: .next)
                SoftField(text: $vm.familyName,
                          placeholder: L10n.placeholder("Family name (姓)"),
                          size: 14,
                          autocap: .words,
                          submitLabel: .done)
            }
        }
    }

    private var bioField: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                EditFieldLabel(text: L10n.t("Bio"))
                Spacer(minLength: 8)
                counter(vm.bioCount, max: ProfileRules.bioMax)
            }
            SoftTextArea(text: $vm.bio,
                         placeholder: "",
                         rows: 3,
                         size: 14,
                         maxLength: ProfileRules.bioMax)
        }
    }

    private var signatureField: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                EditFieldLabel(text: L10n.t("Signature"))
                Spacer(minLength: 8)
                counter(vm.signatureCount, max: ProfileRules.signatureMax)
            }
            SoftTextArea(text: $vm.signature,
                         placeholder: L10n.placeholder("A short line about you"),
                         rows: 2,
                         size: 14,
                         maxLength: ProfileRules.signatureMax)
        }
    }

    /// "`n` / 250" 10 pt `outline`.
    private func counter(_ n: Int, max: Int) -> some View {
        Text("\(n) / \(max)")
            .font(Theme.font(10))
            .foregroundColor(Theme.C.outline)
    }

    // MARK: Grid cells

    private var genderField: some View {
        VStack(alignment: .leading, spacing: 8) {
            EditFieldLabel(text: L10n.t("Gender"))
            SoftSelect<String>(placeholder: L10n.t("Select Gender"),
                               selection: $vm.gender,
                               options: EditProfileViewModel.genderValues,
                               allowClear: true,
                               size: 14,
                               display: { EditProfileViewModel.genderLabel($0) })
        }
    }

    /// Label row also carries `#edit-age-hint` (10 pt `outline`, live from the date).
    private var birthdayField: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                EditFieldLabel(text: L10n.t("Birthday"))
                Spacer(minLength: 4)
                if !vm.ageHint.isEmpty {
                    Text(vm.ageHint)
                        .font(Theme.font(10, weight: .medium))
                        .foregroundColor(Theme.C.outline)
                        .lineLimit(1)
                }
            }
            EditBirthdayField(date: $vm.birthday, range: vm.birthdayRange)
        }
    }

    private var gradeField: some View {
        VStack(alignment: .leading, spacing: 8) {
            EditFieldLabel(text: L10n.t("Grade"))
            SoftSelect<String>(placeholder: L10n.t("Select Grade"),
                               selection: $vm.grade,
                               options: vm.gradeOptions,
                               allowClear: true,
                               size: 14,
                               display: { L10n.grade($0) })
        }
    }

    private var studentIdField: some View {
        VStack(alignment: .leading, spacing: 8) {
            EditFieldLabel(text: L10n.t("Student ID"))
            SoftField(text: $vm.studentId,
                      placeholder: EditProfileCopy.studentIdPlaceholder,
                      size: 14,
                      keyboard: .asciiCapable,
                      submitLabel: .done)
        }
    }

    /// Metadata select: disabled (stored value shown read-only) until its list has loaded, so Save
    /// never clears a value the user could not have changed (gotcha 3).
    private func selectField(label: String,
                             placeholder: String,
                             selection: Binding<String?>,
                             options: [String],
                             ready: Bool,
                             translated: Bool = true) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            EditFieldLabel(text: label)
            SoftSelect<String>(placeholder: placeholder,
                               selection: selection,
                               options: options,
                               allowClear: true,
                               disabled: !ready,
                               size: 14,
                               translated: translated)
        }
    }
}

// MARK: - Birthday (`<input type=date>` with min/max = today−40y / today−16y)

struct EditBirthdayField: View {
    @Binding var date: Date?
    var range: ClosedRange<Date>

    var body: some View {
        HStack(spacing: 8) {
            if let d = date {
                DatePicker("",
                           selection: Binding(get: { d }, set: { date = min(max($0, range.lowerBound), range.upperBound) }),
                           in: range,
                           displayedComponents: .date)
                    .labelsHidden()
                    .datePickerStyle(.compact)
                    .tint(Theme.C.primary)
                Spacer(minLength: 0)
                Button {
                    date = nil
                } label: {
                    Image(systemName: Theme.Icon.sf("close"))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Theme.C.outline)
                        .frame(width: 24, height: 24)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.t("Close"))
            } else {
                Button {
                    date = range.upperBound
                } label: {
                    HStack {
                        Text(EditProfileCopy.birthdayPlaceholder)
                            .font(Theme.font(14))
                            .foregroundColor(Theme.C.outlineVariantText)
                        Spacer(minLength: 0)
                        Image(systemName: Theme.Icon.sf("calendar_month"))
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Theme.C.outline)
                            .frame(width: 18, height: 18)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .frame(minHeight: 40)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.C.containerLow)
        .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
    }
}

// MARK: - Interests (`#edit-tags-list`: neon `.tag-chip`s with × + dashed "+ Add")

struct EditInterestsSection: View {
    @ObservedObject var vm: EditProfileViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            EditFieldLabel(text: L10n.t("Interests"))
            FlowLayout(spacing: 8) {
                ForEach(Array(vm.interests.enumerated()), id: \.offset) { pair in
                    Chip(text: pair.element,
                         selected: true,
                         style: .tag,
                         onRemove: { vm.removeInterest(at: pair.offset) })
                }
                Chip(text: EditProfileCopy.addChip,
                     selected: false,
                     style: .add,
                     onTap: {
                         guard vm.canOpenAddInterest() else { return }
                         AddInterestCard.present(vm: vm)
                     })
            }
        }
    }
}

// MARK: - Gift jar (`#edit-gift-0..4`, placeholders "Gift 1"…"Gift 5", 14 pt)

struct EditGiftJarSection: View {
    @ObservedObject var vm: EditProfileViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            EditFieldLabel(text: L10n.t("Gift jar"))
            ForEach(0..<ProfileRules.wishGiftsMax, id: \.self) { i in
                if vm.gifts.indices.contains(i) {
                    SoftField(text: $vm.gifts[i],
                              placeholder: EditProfileCopy.giftPlaceholder(i + 1),
                              size: 14,
                              autocap: .sentences,
                              submitLabel: i == ProfileRules.wishGiftsMax - 1 ? .done : .next)
                }
            }
        }
    }
}
