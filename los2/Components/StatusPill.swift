import SwiftUI

/// Status pill badge with semantic tinting, high contrast, and accessible labels.
struct StatusPill: View {
    let text: String
    var icon: String? = nil
    var color: Color = LOSTheme.accent
    var isProminent: Bool = false
    
    var body: some View {
        HStack(spacing: LOSTheme.space4) {
            if let icon {
                Image(systemName: icon)
                    .font(.caption2.weight(.semibold))
            }
            Text(text)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
        }
        .padding(.horizontal, LOSTheme.space8 + 2)
        .padding(.vertical, LOSTheme.space4)
        .background(isProminent ? color : color.opacity(0.12))
        .foregroundStyle(isProminent ? Color.white : color)
        .clipShape(Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(text)
    }
}

#Preview("Status Pills") {
    VStack(spacing: 12) {
        StatusPill(text: "Healthy", icon: "shield.fill", color: LOSTheme.positive)
        StatusPill(text: "Attention Needed", icon: "exclamationmark.triangle.fill", color: LOSTheme.warning)
        StatusPill(text: "Critical Deficit", icon: "xmark.octagon.fill", color: LOSTheme.critical)
        StatusPill(text: "Market Connected", icon: "circle.fill", color: LOSTheme.positive, isProminent: true)
    }
    .padding()
    .background(LOSTheme.background)
}
