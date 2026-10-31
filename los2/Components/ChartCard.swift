import SwiftUI
import Charts

/// Reusable container wrapping Swift Charts with standardized typography, legend, and accessibility.
struct ChartCard<ChartContent: View, TrailingContent: View>: View {
    let title: String
    var subtitle: String? = nil
    var accessibilityLabel: String
    @ViewBuilder var trailing: () -> TrailingContent
    @ViewBuilder var chart: () -> ChartContent
    
    init(
        title: String,
        subtitle: String? = nil,
        accessibilityLabel: String,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() },
        @ViewBuilder chart: @escaping () -> ChartContent
    ) {
        self.title = title
        self.subtitle = subtitle
        self.accessibilityLabel = accessibilityLabel
        self.trailing = trailing
        self.chart = chart
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space16) {
            // Header Row
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
                
                trailing()
            }
            
            // Swift Chart content
            chart()
                .accessibilityElement(children: .contain)
                .accessibilityLabel(accessibilityLabel)
        }
        .padding(LOSTheme.space20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
    }
}

#Preview("Chart Card") {
    let points = [
        (month: "Jan", balance: 500_000.0),
        (month: "Feb", balance: 420_000.0),
        (month: "Mar", balance: 340_000.0),
        (month: "Apr", balance: 260_000.0),
        (month: "May", balance: 180_000.0),
        (month: "Jun", balance: 100_000.0)
    ]
    
    ChartCard(
        title: "Liquidity Burn Trajectory",
        subtitle: "Projected balances over the next 6 months",
        accessibilityLabel: "Liquidity burn trajectory showing decline from 500,000 to 100,000 rupees over 6 months",
        trailing: {
            StatusPill(text: "Burn Mode", icon: "flame.fill", color: LOSTheme.warning)
        }
    ) {
        Chart(points, id: \.month) { pt in
            AreaMark(
                x: .value("Month", pt.month),
                y: .value("Cash", pt.balance)
            )
            .foregroundStyle(
                LinearGradient(
                    colors: [LOSTheme.accent.opacity(0.3), Color.clear],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            
            LineMark(
                x: .value("Month", pt.month),
                y: .value("Cash", pt.balance)
            )
            .foregroundStyle(LOSTheme.accent)
            .lineStyle(StrokeStyle(lineWidth: 2))
        }
        .frame(height: 160)
        .chartYAxis {
            AxisMarks(position: .leading) { val in
                if let num = val.as(Double.self) {
                    AxisValueLabel {
                        Text(LOSTheme.formatRupeeCompact(num))
                            .font(.caption2)
                            .foregroundStyle(LOSTheme.textSecondary)
                    }
                }
            }
        }
    }
    .padding()
    .background(LOSTheme.background)
}
