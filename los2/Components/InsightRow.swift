import SwiftUI

/// Flat, scannable key-value row for financial metrics and audit insights.
struct InsightRow: View {
    let title: String
    let value: String
    var subtitle: String? = nil
    var icon: String? = nil
    var tint: Color = LOSTheme.accent
    var isEmphasized: Bool = false
    var isNegative: Bool = false
    
    var body: some View {
        HStack(alignment: .center, spacing: LOSTheme.space12) {
            if let icon {
                Image(systemName: icon)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(tint)
                    .frame(width: 32, height: 32)
                    .background(tint.opacity(0.12))
                    .clipShape(Circle())
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(isEmphasized ? .body.weight(.semibold) : .subheadline)
                    .foregroundStyle(LOSTheme.textPrimary)
                    .lineLimit(1)
                
                if let subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(LOSTheme.textSecondary)
                        .lineLimit(1)
                }
            }
            
            Spacer(minLength: LOSTheme.space8)
            
            Text(value)
                .font(isEmphasized ? .headline.weight(.bold) : .subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(isNegative ? LOSTheme.critical : (isEmphasized ? LOSTheme.textPrimary : LOSTheme.textSecondary))
                .lineLimit(1)
        }
        .padding(.vertical, LOSTheme.space8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title): \(value)")
    }
}

#Preview("Insight Rows") {
    let profile = FinancialProfile.pitchDeckSample
    VStack(spacing: 0) {
        InsightRow(
            title: "Post-Emergency Cash",
            value: LOSTheme.formatRupee(profile.liquidCash - profile.unexpectedExpense),
            subtitle: "Instant liquidity remaining",
            icon: "banknote",
            tint: LOSTheme.positive,
            isEmphasized: true
        )
        Divider().overlay(LOSTheme.borderHairline)
        InsightRow(
            title: "Emergency Shock Drain",
            value: "−\(LOSTheme.formatRupee(profile.unexpectedExpense))",
            subtitle: "One-time simulation drain",
            icon: "cross.case.fill",
            tint: LOSTheme.warning,
            isNegative: true
        )
        Divider().overlay(LOSTheme.borderHairline)
        InsightRow(
            title: "Minimum Safety Reserve",
            value: LOSTheme.formatRupee(profile.minimumCashReserve),
            subtitle: "Target survival floor",
            icon: "shield.checkerboard",
            tint: LOSTheme.accent
        )
    }
    .padding()
    .background(LOSTheme.surface)
    .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
    .padding()
    .background(LOSTheme.background)
}
