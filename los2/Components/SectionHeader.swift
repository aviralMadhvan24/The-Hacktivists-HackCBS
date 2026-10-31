import SwiftUI

/// Standardized section title header with optional trailing action button.
struct SectionHeader: View {
    let title: String
    var subtitle: String? = nil
    var actionTitle: String? = nil
    var actionIcon: String? = nil
    var onAction: (() -> Void)? = nil
    
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: LOSTheme.space4) {
                Text(title)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(LOSTheme.textPrimary)
                
                if let subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(LOSTheme.textSecondary)
                }
            }
            
            Spacer()
            
            if let actionTitle, let onAction {
                Button(action: onAction) {
                    HStack(spacing: LOSTheme.space4) {
                        Text(actionTitle)
                            .font(.subheadline.weight(.semibold))
                        if let actionIcon {
                            Image(systemName: actionIcon)
                                .font(.caption.weight(.bold))
                        }
                    }
                    .foregroundStyle(LOSTheme.accent)
                }
            }
        }
        .padding(.horizontal, LOSTheme.space4)
    }
}

#Preview("Section Headers") {
    VStack(spacing: 24) {
        SectionHeader(
            title: "Simulated Scenarios",
            subtitle: "Compare impact across shock severities",
            actionTitle: "See All",
            actionIcon: "chevron.right",
            onAction: {}
        )
        
        SectionHeader(
            title: "Portfolio Companies",
            subtitle: "3 active holdings"
        )
    }
    .padding()
    .background(LOSTheme.background)
}
