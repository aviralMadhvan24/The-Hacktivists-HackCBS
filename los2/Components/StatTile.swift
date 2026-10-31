import SwiftUI

/// Compact fintech metric card for 2-column grids and horizontal scroll strips.
struct StatTile: View {
    let title: String
    let value: String
    var subtitle: String? = nil
    var icon: String? = nil
    var tint: Color = LOSTheme.accent
    var isNegative: Bool = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space8) {
            HStack(spacing: LOSTheme.space8) {
                if let icon {
                    Image(systemName: icon)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(tint)
                        .frame(width: 26, height: 26)
                        .background(tint.opacity(0.12))
                        .clipShape(Circle())
                }
                
                Text(title)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(LOSTheme.textSecondary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                
                Spacer(minLength: 0)
            }
            
            Text(value)
                .font(.system(.title3, design: .rounded).weight(.bold))
                .monospacedDigit()
                .foregroundStyle(isNegative ? LOSTheme.critical : LOSTheme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            
            if let subtitle {
                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(isNegative ? LOSTheme.critical.opacity(0.9) : LOSTheme.textSecondary)
                    .lineLimit(1)
            }
        }
        .padding(LOSTheme.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusLarge, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusLarge, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title): \(value)\(subtitle != nil ? ", " + (subtitle ?? "") : "")")
    }
}

#Preview("StatTile Grid") {
    let profile = FinancialProfile.pitchDeckSample
    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
        StatTile(
            title: "Liquid Cash",
            value: LOSTheme.formatRupee(profile.liquidCash),
            subtitle: "Instant reserves",
            icon: "banknote",
            tint: LOSTheme.positive
        )
        StatTile(
            title: "Portfolio",
            value: LOSTheme.formatRupee(profile.portfolioValue),
            subtitle: "\(profile.activeHoldings.count) active holdings",
            icon: "chart.pie.fill",
            tint: LOSTheme.accent
        )
        StatTile(
            title: "Monthly Burn",
            value: LOSTheme.formatRupee(profile.monthlyExpenses),
            subtitle: "Living + EMIs",
            icon: "arrow.up.right",
            tint: LOSTheme.warning
        )
        StatTile(
            title: "Cash Runway",
            value: "20.0 mos",
            subtitle: "Survival buffer",
            icon: "clock.arrow.circlepath",
            tint: LOSTheme.positive
        )
    }
    .padding()
    .background(LOSTheme.background)
}
