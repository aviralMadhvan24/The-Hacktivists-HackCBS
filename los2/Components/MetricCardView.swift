import SwiftUI

/// Reusable fintech card for individual resilience indicators.
/// Supports responsive scaling, Dynamic Type, and multi-line wrapping to prevent truncation.
struct MetricCardView: View {
    let title: String
    let value: String
    var subtitle: String? = nil
    var badgeText: String? = nil
    var badgeColor: Color = LOSTheme.primary
    var iconName: String? = nil
    var isNegative: Bool = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header Row: Icon + Title + Badge
            HStack(alignment: .center, spacing: 6) {
                if let iconName = iconName {
                    Image(systemName: iconName)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(badgeColor)
                        .frame(width: 24, height: 24)
                        .background(badgeColor.opacity(0.12))
                        .clipShape(Circle())
                }
                
                Text(title)
                    .font(.caption2.bold())
                    .foregroundStyle(Color.secondary)
                    .tracking(0.6)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                
                Spacer(minLength: 4)
                
                if let badge = badgeText {
                    Text(badge)
                        .font(.caption2.bold())
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(badgeColor.opacity(0.15))
                        .foregroundStyle(badgeColor)
                        .clipShape(Capsule())
                        .layoutPriority(1)
                }
            }
            
            // Value
            Text(value)
                .font(.system(.title3, design: .rounded).bold())
                .foregroundStyle(isNegative ? LOSTheme.criticalRed : Color.primary)
                .minimumScaleFactor(0.65)
                .lineLimit(1)
            
            // Subtitle
            if let subtitle = subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(isNegative ? LOSTheme.criticalRed.opacity(0.85) : Color.secondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(LOSTheme.paddingMedium)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LOSTheme.cardBackground)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusMedium)
                .stroke(LOSTheme.cardBorder, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title): \(value)\(subtitle != nil ? ", " + (subtitle ?? "") : "")")
    }
}
