import SwiftUI
import Charts

/// Native Swift Charts month-by-month cash depletion timeline component.
/// Shows cash balance projection over time with reserve floor and zero-line RuleMarks.
struct RunwayTimelineView: View {
    let startingCash: Double
    let monthlyBurn: Double
    let runwayMonths: Double
    let state: RunwayState
    var minimumReserveFloor: Double = 20_000.0
    
    struct MonthPoint: Identifiable {
        let id: Int
        let monthName: String
        let remainingCash: Double
    }
    
    var forecastPoints: [MonthPoint] {
        let maxMonths = min(12, max(3, Int(ceil(runwayMonths)) + 1))
        return (0...maxMonths).map { m in
            let balance = max(0, startingCash - (monthlyBurn * Double(m)))
            let label = m == 0 ? "Now" : "M\(m)"
            return MonthPoint(id: m, monthName: label, remainingCash: balance)
        }
    }
    
    var maxY: Double {
        max(50_000, max(startingCash, minimumReserveFloor) * 1.20)
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space16) {
            HStack {
                VStack(alignment: .leading, spacing: LOSTheme.space4) {
                    Text("DEPLETION TRAJECTORY")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(LOSTheme.textSecondary)
                        .tracking(0.8)
                        .lineLimit(1)
                    Text("Monthly reserve balance")
                        .font(.caption)
                        .foregroundStyle(LOSTheme.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
                
                Spacer()
                
                StatusPill(
                    text: state.rawValue,
                    icon: stateIcon,
                    color: statusColor
                )
            }
            
            if state == .cashSurplus {
                HStack(spacing: LOSTheme.space12) {
                    Image(systemName: "arrow.up.forward.circle.fill")
                        .font(.title2)
                        .foregroundStyle(LOSTheme.positive)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Income Exceeds Outflows")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LOSTheme.textPrimary)
                        Text("Your liquid savings are accumulating each month without burning reserves.")
                            .font(.caption)
                            .foregroundStyle(LOSTheme.textSecondary)
                    }
                }
                .padding(.vertical, LOSTheme.space8)
            } else if state == .breakEven {
                HStack(spacing: LOSTheme.space12) {
                    Image(systemName: "equal.circle.fill")
                        .font(.title2)
                        .foregroundStyle(LOSTheme.accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Zero Net Burn")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LOSTheme.textPrimary)
                        Text("Cash balances stay steady at current income and spending levels.")
                            .font(.caption)
                            .foregroundStyle(LOSTheme.textSecondary)
                    }
                }
                .padding(.vertical, LOSTheme.space8)
            } else if state == .underwater {
                HStack(spacing: LOSTheme.space12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.title2)
                        .foregroundStyle(LOSTheme.critical)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Immediate Cash Deficit")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(LOSTheme.critical)
                        Text("Emergency bill exceeds available cash. Immediate risk of debt or liquidation.")
                            .font(.caption)
                            .foregroundStyle(LOSTheme.textSecondary)
                    }
                }
                .padding(.vertical, LOSTheme.space8)
            } else {
                // Native Swift Chart for Cash Depletion Curve
                Chart {
                    ForEach(forecastPoints) { pt in
                        AreaMark(
                            x: .value("Timeline", pt.monthName),
                            y: .value("Remaining Cash", pt.remainingCash)
                        )
                        .foregroundStyle(
                            LinearGradient(
                                colors: [statusColor.opacity(0.3), statusColor.opacity(0.03)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        
                        LineMark(
                            x: .value("Timeline", pt.monthName),
                            y: .value("Remaining Cash", pt.remainingCash)
                        )
                        .foregroundStyle(statusColor)
                        .lineStyle(StrokeStyle(lineWidth: 2.5))
                        
                        PointMark(
                            x: .value("Timeline", pt.monthName),
                            y: .value("Remaining Cash", pt.remainingCash)
                        )
                        .foregroundStyle(statusColor)
                        .symbolSize(32)
                    }
                    
                    // Safety Reserve Floor Rule
                    if minimumReserveFloor > 0 {
                        RuleMark(y: .value("Reserve Floor", minimumReserveFloor))
                            .foregroundStyle(LOSTheme.warning)
                            .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 4]))
                            .annotation(position: .top, alignment: .trailing) {
                                Text("Safety Floor \(LOSTheme.formatRupeeCompact(minimumReserveFloor))")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(LOSTheme.warning)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(LOSTheme.surface)
                                    .clipShape(Capsule())
                            }
                    }
                }
                .frame(height: 180)
                .chartYScale(domain: 0...maxY)
                .chartYAxis {
                    AxisMarks(position: .leading) { val in
                        AxisGridLine().foregroundStyle(LOSTheme.borderHairline)
                        if let num = val.as(Double.self) {
                            AxisValueLabel {
                                Text(LOSTheme.formatRupeeCompact(num))
                                    .font(.caption2)
                                    .foregroundStyle(LOSTheme.textSecondary)
                            }
                        }
                    }
                }
                .chartXAxis {
                    AxisMarks { _ in
                        AxisValueLabel()
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(LOSTheme.textPrimary)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Cash runway depletion chart projecting balance decline over \(forecastPoints.count) months")
            }
        }
        .padding(LOSTheme.space20)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
    }
    
    private var statusColor: Color {
        switch state {
        case .exhausting:
            return runwayMonths < 3.0 ? LOSTheme.critical : LOSTheme.warning
        case .breakEven:
            return LOSTheme.accent
        case .cashSurplus:
            return LOSTheme.positive
        case .underwater:
            return LOSTheme.critical
        }
    }
    
    private var stateIcon: String {
        switch state {
        case .exhausting:
            return "flame.fill"
        case .breakEven:
            return "equal.circle.fill"
        case .cashSurplus:
            return "arrow.up.forward.circle.fill"
        case .underwater:
            return "xmark.octagon.fill"
        }
    }
}

#Preview("Runway Timeline") {
    VStack(spacing: 20) {
        RunwayTimelineView(
            startingCash: 500_000,
            monthlyBurn: 80_000,
            runwayMonths: 6.2,
            state: .exhausting,
            minimumReserveFloor: 50_000
        )
    }
    .padding()
    .background(LOSTheme.background)
}
