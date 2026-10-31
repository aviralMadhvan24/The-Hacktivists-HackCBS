import SwiftUI

/// Secondary tonal button for auxiliary or non-dominant actions.
struct SecondaryButton: View {
    let title: String
    var icon: String? = nil
    var tint: Color = LOSTheme.textPrimary
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: LOSTheme.space8) {
                if let icon {
                    Image(systemName: icon)
                        .font(.subheadline.weight(.semibold))
                }
                Text(title)
                    .font(.subheadline.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, LOSTheme.space12 + 2)
            .background(LOSTheme.surfaceElevated)
            .foregroundStyle(tint)
            .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LOSTheme.radiusMedium, style: .continuous)
                    .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
            )
        }
        .sensoryFeedback(.selection, trigger: title)
    }
}

#Preview("Secondary Button") {
    VStack(spacing: 16) {
        SecondaryButton(title: "Connect Broker via Zerodha", icon: "link", action: {})
        SecondaryButton(title: "Export Stress Report (PDF)", icon: "square.and.arrow.up", action: {})
    }
    .padding()
    .background(LOSTheme.background)
}
