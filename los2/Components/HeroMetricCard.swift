import SwiftUI

/// Prominent hero card anchoring a screen's single most critical metric.
struct HeroMetricCard<Content: View>: View {
    let category: String
    let value: String
    var subtitle: String? = nil
    var statusPill: StatusPill? = nil
    @ViewBuilder var auxiliaryContent: () -> Content
    
    init(
        category: String,
        value: String,
        subtitle: String? = nil,
        statusPill: StatusPill? = nil,
        @ViewBuilder auxiliaryContent: @escaping () -> Content = { EmptyView() }
    ) {
        self.category = category
        self.value = value
        self.subtitle = subtitle
        self.statusPill = statusPill
        self.auxiliaryContent = auxiliaryContent
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space16) {
            // Header: Category label + Status pill
            HStack {
                Text(category.uppercased())
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(LOSTheme.textSecondary)
                    .tracking(0.8)
                
                Spacer()
                
                if let statusPill {
                    statusPill
                }
            }
            
            // Hero Number
            Text(value)
                .font(.system(.largeTitle, design: .rounded).weight(.bold))
                .monospacedDigit()
                .foregroundStyle(LOSTheme.textPrimary)
                .contentTransition(.numericText())
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            
            // Subtitle
            if let subtitle {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(LOSTheme.textSecondary)
                    .lineLimit(2)
            }
            
            // Custom visual content (gauge, depletion bar, mini-chart)
            auxiliaryContent()
        }
        .padding(LOSTheme.space24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
        .shadow(color: Color.black.opacity(0.08), radius: LOSTheme.shadowRadius, y: LOSTheme.shadowY)
    }
}

#Preview("Hero Metric Card") {
    let profile = FinancialProfile.pitchDeckSample
    VStack(spacing: 20) {
        HeroMetricCard(
            category: "Estimated Cash Runway",
            value: "20.0 Months",
            subtitle: "Cash buffer before liquid reserves reach zero",
            statusPill: StatusPill(text: "Robust", icon: "shield.fill", color: LOSTheme.positive)
        )
        
        HeroMetricCard(
            category: "Portfolio Drawdown Risk",
            value: "−\(LOSTheme.formatRupee(profile.portfolioValue * 0.15))",
            subtitle: "Simulated 15% cyclomatic correction impact",
            statusPill: StatusPill(text: "Stress 15%", icon: "arrow.down.right", color: LOSTheme.warning)
        )
    }
    .padding()
    .background(LOSTheme.background)
}
