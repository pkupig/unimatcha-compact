import SwiftUI

// MARK: - ProfileSetupWizardView (`#setup-wizard`, h5-auth §1.4 (a), h5-profile §1.1 state A)
//
// Progress row (mb-12): "N / 4" 12/800 +0.2em `outline` + 2 pt track (`containerHighest`) with a
// neon fill at (step+1)×25 % (0.3 s). One field per step: h2 24/800 tight (mb-2) · p 14
// `onSurfaceVariant` (mb-10) · label 10/700 +0.2em + pink * (mb-2) · 18 pt soft-fill input(s).
// Nav row (mt-14, gap-4): "Back" text button (hidden on step 0) + `.btn-cta` Next / Continue.

struct ProfileSetupWizardView: View {
    @ObservedObject var vm: ProfileSetupViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            progressRow
                .padding(.bottom, 48)

            stepContent
                .id(vm.step)
                .transition(.opacity)
                .animation(Theme.Motion.fade, value: vm.step)

            HStack(spacing: 16) {
                if vm.step > 0 {
                    Button {
                        vm.back()
                    } label: {
                        Text(L10n.t("Back"))
                            .font(Theme.font(12, weight: .bold))
                            .tracking(Theme.tracking(Theme.Tracking.widest, size: 12))
                            .foregroundColor(Theme.C.onSurfaceVariant)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 16)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                CTAButton(title: vm.isLastStep ? L10n.t("Continue") : L10n.t("Next"),
                          style: .neon,
                          action: { vm.next() })
            }
            .padding(.top, 56)
        }
    }

    // MARK: Progress

    private var progressRow: some View {
        HStack(spacing: 16) {
            Text(vm.stepLabel)
                .font(Theme.font(12, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.section, size: 12))
                .foregroundColor(Theme.C.outline)
                .lineLimit(1)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(Theme.C.containerHighest)
                    Rectangle()
                        .fill(Theme.C.neon)
                        .frame(width: geo.size.width * vm.progressFraction)
                        .animation(.easeInOut(duration: 0.3), value: vm.step)
                }
            }
            .frame(height: 2)
        }
    }

    // MARK: Steps

    @ViewBuilder private var stepContent: some View {
        switch vm.step {
        case 0:
            stepBlock(title: L10n.t("What should we call you?"),
                      subtitle: L10n.t("Your nickname is what others see."),
                      label: L10n.t("Nickname")) {
                SoftField(text: $vm.nickname,
                          placeholder: L10n.placeholder("The Scholar"),
                          size: 18,
                          autocap: .words,
                          submitLabel: .next,
                          onSubmit: { vm.next() })
            }
        case 1:
            stepBlock(title: L10n.t("Your real name"),
                      subtitle: L10n.t("Only shown to confirmed partners."),
                      label: L10n.t("Real name")) {
                HStack(spacing: 16) {
                    SoftField(text: $vm.givenName,
                              placeholder: L10n.placeholder("Given name (名)"),
                              size: 18,
                              autocap: .words,
                              submitLabel: .next)
                    SoftField(text: $vm.familyName,
                              placeholder: L10n.placeholder("Family name (姓)"),
                              size: 18,
                              autocap: .words,
                              submitLabel: .next,
                              onSubmit: { vm.next() })
                }
            }
        case 2:
            stepBlock(title: L10n.t("How do you identify?"),
                      subtitle: L10n.t("Used for matching. Not shown publicly."),
                      label: L10n.t("Gender"),
                      labelBottom: 16) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(ProfileSetupViewModel.genderOptions, id: \.value) { opt in
                        SetupChoiceButton(label: L10n.t(opt.key),
                                          selected: vm.gender == opt.value,
                                          paddingV: 16) {
                            vm.selectGender(opt.value)
                        }
                    }
                }
            }
        default:
            stepBlock(title: L10n.t("When were you born?"),
                      subtitle: L10n.t("We show your age, never your birthday."),
                      label: L10n.t("Birthday")) {
                SetupDateField(date: $vm.birthday, range: vm.birthdayRange)
            }
        }
    }

    private func stepBlock<Content: View>(title: String,
                                          subtitle: String,
                                          label: String,
                                          labelBottom: CGFloat = 8,
                                          @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(Theme.font(24, weight: .heavy))
                .tracking(Theme.tracking(Theme.Tracking.tight, size: 24))
                .foregroundColor(Theme.C.onSurface)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 8)
            Text(subtitle)
                .font(Theme.font(14))
                .foregroundColor(Theme.C.onSurfaceVariant)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 40)
            SetupFieldLabel(text: label, required: true)
                .padding(.bottom, labelBottom)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Birthday field (native `<input type=date>` equivalent)

/// Soft-fill 18 pt row showing `YYYY-MM-DD` (placeholder in `outlineVariant`); tap opens a wheel
/// date picker sheet clamped to `[today − 40 y, today − 16 y]`.
struct SetupDateField: View {
    @Binding var date: Date?
    var range: ClosedRange<Date>

    @State private var showPicker = false
    @State private var draft = Date()

    var body: some View {
        Button {
            draft = clamp(date ?? range.upperBound)
            showPicker = true
        } label: {
            HStack(spacing: 8) {
                Text(date.map { ISODate.day($0) } ?? SetupCopy.birthdayPlaceholder)
                    .font(Theme.font(18))
                    .foregroundColor(date == nil ? Theme.C.outlineVariantText : Theme.C.onSurface)
                    .lineLimit(1)
                Spacer(minLength: 0)
                MaterialIcon(name: "calendar_month", size: 20, color: Theme.C.outline)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.C.containerLow)
            .clipShape(RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.R.base, style: .continuous)
                    .stroke(Theme.C.neon, lineWidth: showPicker ? 1 : 0)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showPicker) {
            VStack(spacing: 0) {
                Capsule()
                    .fill(Theme.C.stone200)
                    .frame(width: 40, height: 4)
                    .padding(.top, 12)
                    .padding(.bottom, 12)
                ZStack {
                    Text(L10n.t("Birthday"))
                        .font(Theme.TextStyle.sheetTitle)
                        .tracking(Theme.tracking(Theme.Tracking.tighter, size: 16))
                        .foregroundColor(Theme.C.onSurface)
                    HStack {
                        Spacer()
                        Button {
                            date = clamp(draft)
                            showPicker = false
                        } label: {
                            Text(SetupCopy.done)
                                .font(Theme.font(12, weight: .bold))
                                .tracking(Theme.tracking(Theme.Tracking.widest, size: 12))
                                .foregroundColor(.black)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 8)
                                .background(Theme.C.neon)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(PressScaleButtonStyle(scale: 0.95))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 8)
                DatePicker("", selection: $draft, in: range, displayedComponents: .date)
                    .datePickerStyle(.wheel)
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 24)
                Spacer(minLength: 0)
            }
            .background(Theme.C.surface.ignoresSafeArea())
            .presentationDetents([.height(340)])
            .presentationDragIndicator(.hidden)
        }
    }

    private func clamp(_ d: Date) -> Date {
        min(max(d, range.lowerBound), range.upperBound)
    }
}
