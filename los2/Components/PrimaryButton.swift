import SwiftUI

/// Primary action button adhering to Apple Human Interface Guidelines.
struct PrimaryButton: View {
    let title: String
    var icon: String? = nil
    var isLoading: Bool = false
    var isDestructive: Bool = false
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: LOSTheme.space8) {
                if isLoading {
                    ProgressView()
                        .tint(Color.white)
                } else {
                    if let icon {
                        Image(systemName: icon)
                            .font(.headline)
                    }
                    Text(title)
                        .font(.headline.weight(.semibold))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, LOSTheme.space16)
            .background(isDestructive ? LOSTheme.critical : LOSTheme.accent)
            .foregroundStyle(Color.white)
            .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
            .shadow(color: (isDestructive ? LOSTheme.critical : LOSTheme.accent).opacity(0.25), radius: 8, y: 4)
        }
        .disabled(isLoading)
        .sensoryFeedback(.impact(weight: .light), trigger: isLoading)
    }
}

#Preview("Primary Button") {
    VStack(spacing: 16) {
        PrimaryButton(title: "Run Full Stress Test", icon: "play.fill", action: {})
        PrimaryButton(title: "Simulating...", isLoading: true, action: {})
        PrimaryButton(title: "Reset Financial Profile", icon: "trash", isDestructive: true, action: {})
    }
    .padding()
    .background(LOSTheme.background)
}
