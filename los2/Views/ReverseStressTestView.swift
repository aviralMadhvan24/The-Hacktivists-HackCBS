import SwiftUI

/// Feature 03: Reverse Stress Testing View.
/// Deterministically calculates the threshold market drawdown (%) that causes a user's defined financial safety limit to be breached.
struct ReverseStressTestView: View {
    @ObservedObject var viewModel: ResilienceViewModel
    @Environment(\.dismiss) private var dismiss
    
    var result: ReverseStressResult {
        viewModel.reverseStressResult
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // MARK: - Hero Breaking Point Card
                    VStack(spacing: 16) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("REVERSE STRESS BREAKING POINT")
                                    .font(.system(size: 11, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color.secondary)
                                    .tracking(0.8)
                                
                                if let breakingPercent = result.breakingPointDeclinePercent {
                                    if breakingPercent == 0 {
                                        Text("0% Decline")
                                            .font(.system(size: 32, weight: .bold, design: .rounded))
                                            .foregroundStyle(LOSTheme.criticalRed)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.75)
                                    } else {
                                        Text("\(String(format: "%.1f%%", breakingPercent)) Crash")
                                            .font(.system(size: 32, weight: .bold, design: .rounded))
                                            .foregroundStyle(breakingPercent < 20 ? LOSTheme.criticalRed : LOSTheme.warningAmber)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.75)
                                    }
                                } else {
                                    Text("Safe > 100%")
                                        .font(.system(size: 32, weight: .bold, design: .rounded))
                                        .foregroundStyle(LOSTheme.safeGreen)
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.75)
                                }
                            }
                            
                            Spacer()
                            
                            ZStack {
                                Circle()
                                    .fill(statusColor.opacity(0.12))
                                    .frame(width: 52, height: 52)
                                Image(systemName: statusIcon)
                                    .font(.system(size: 24, weight: .bold))
                                    .foregroundStyle(statusColor)
                            }
                        }
                        
                        Text(result.explanation)
                            .font(.system(size: 13, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.primary)
                            .lineSpacing(2)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        
                        Divider()
                            .overlay(LOSTheme.cardBorder)
                        
                        // 3 Sub-Metrics at Breaking Point
                        HStack(spacing: 8) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("REMAINING CASH")
                                    .font(.system(size: 10, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color.secondary)
                                Text(LOSTheme.formatRupee(result.remainingCashAtBreach))
                                    .font(.system(size: 13, weight: .bold, design: .rounded))
                                    .foregroundStyle(result.remainingCashAtBreach < 0 ? LOSTheme.criticalRed : Color.primary)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                            }
                            
                            Spacer()
                            
                            VStack(alignment: .center, spacing: 3) {
                                Text("SIMULATED EQUITY")
                                    .font(.system(size: 10, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color.secondary)
                                Text(LOSTheme.formatRupee(result.remainingPortfolioAtBreach))
                                    .font(.system(size: 13, weight: .bold, design: .rounded))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                            }
                            
                            Spacer()
                            
                            VStack(alignment: .trailing, spacing: 3) {
                                Text("EST. RUNWAY")
                                    .font(.system(size: 10, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color.secondary)
                                Text(result.estimatedRunwayAtBreach >= 90 ? "Surplus" : String(format: "%.1f mos", result.estimatedRunwayAtBreach))
                                    .font(.system(size: 13, weight: .bold, design: .rounded))
                                    .foregroundStyle(result.estimatedRunwayAtBreach < 3.0 ? LOSTheme.criticalRed : LOSTheme.safeGreen)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.85)
                            }
                        }
                    }
                    .padding(18)
                    .background(LOSTheme.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(statusColor.opacity(0.35), lineWidth: 1.5)
                    )
                    .padding(.horizontal)
                    
                    // MARK: - Primary Sensitivity Driver Card
                    HStack {
                        Image(systemName: "gauge.with.needle.fill")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(LOSTheme.primary)
                        Text("SENSITIVITY DRIVER")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.secondary)
                            .tracking(0.8)
                        Spacer()
                        Text(result.primaryDriver)
                            .font(.system(size: 12, weight: .bold, design: .rounded))
                            .padding(.horizontal, 9)
                            .padding(.vertical, 4)
                            .background(LOSTheme.primary.opacity(0.12))
                            .foregroundStyle(LOSTheme.primary)
                            .clipShape(Capsule())
                    }
                    .padding(14)
                    .background(LOSTheme.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(LOSTheme.cardBorder, lineWidth: 1)
                    )
                    .padding(.horizontal)
                    
                    // MARK: - Preset Scenarios
                    VStack(alignment: .leading, spacing: 10) {
                        Text("QUICK STRESS PRESETS")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.secondary)
                            .tracking(0.8)
                            .padding(.horizontal)
                        
                        ScrollView(.horizontal) {
                            HStack(spacing: 10) {
                                PresetPill(title: "Baseline Setup", icon: "shield") {
                                    viewModel.reverseStressAssumption = ReverseStressAssumption()
                                }
                                PresetPill(title: "Job Loss (6 Mo)", icon: "person.crop.circle.badge.xmark") {
                                    viewModel.reverseStressAssumption.scenarioDurationMonths = 6
                                    viewModel.reverseStressAssumption.incomeDisruptionPercent = 100
                                    viewModel.reverseStressAssumption.emergencyExpense = 25_000
                                }
                                PresetPill(title: "Medical Crisis", icon: "cross.case.fill") {
                                    viewModel.reverseStressAssumption.emergencyExpense = 150_000
                                    viewModel.reverseStressAssumption.scenarioDurationMonths = 3
                                }
                                PresetPill(title: "Prolonged Slump", icon: "chart.line.downtrend.xyaxis") {
                                    viewModel.reverseStressAssumption.scenarioDurationMonths = 12
                                    viewModel.reverseStressAssumption.incomeDisruptionPercent = 40
                                }
                            }
                            .padding(.horizontal)
                        }
                        .scrollIndicators(.hidden)
                    }
                    
                    // MARK: - Safety Limit Definition
                    VStack(alignment: .leading, spacing: 14) {
                        Text("SAFETY LIMIT")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.secondary)
                            .tracking(0.8)
                        
                        Picker("Failure Condition", selection: $viewModel.reverseStressAssumption.breachCondition) {
                            ForEach(SafetyBreachCondition.allCases) { condition in
                                Text(condition.shortTitle).tag(condition)
                            }
                        }
                        .pickerStyle(.segmented)
                        
                        if viewModel.reverseStressAssumption.breachCondition == .minimumCashReserve {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text("Minimum Safety Floor")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(Color.secondary)
                                    Spacer()
                                    Text(LOSTheme.formatRupee(viewModel.reverseStressAssumption.targetCashFloor))
                                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                                        .foregroundStyle(LOSTheme.primary)
                                }
                                
                                Slider(
                                    value: $viewModel.reverseStressAssumption.targetCashFloor,
                                    in: 0...100_000,
                                    step: 5_000
                                )
                                .tint(LOSTheme.primary)
                            }
                        }
                    }
                    .padding(18)
                    .background(LOSTheme.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(LOSTheme.cardBorder, lineWidth: 1)
                    )
                    .padding(.horizontal)
                    
                    // MARK: - Scenario Duration & Income Shock
                    VStack(alignment: .leading, spacing: 16) {
                        Text("SHOCK ASSUMPTIONS")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.secondary)
                            .tracking(0.8)
                        
                        // Duration Slider
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("Scenario Duration")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(Color.secondary)
                                Spacer()
                                Text("\(viewModel.reverseStressAssumption.scenarioDurationMonths) Months")
                                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                            }
                            
                            Slider(
                                value: Binding(
                                    get: { Double(viewModel.reverseStressAssumption.scenarioDurationMonths) },
                                    set: { viewModel.reverseStressAssumption.scenarioDurationMonths = Int($0) }
                                ),
                                in: 1...12,
                                step: 1
                            )
                            .tint(LOSTheme.primary)
                        }
                        
                        // Income Disruption Slider
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("Income Disruption / Loss")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(Color.secondary)
                                Spacer()
                                Text("\(Int(viewModel.reverseStressAssumption.incomeDisruptionPercent))%")
                                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                                    .foregroundStyle(viewModel.reverseStressAssumption.incomeDisruptionPercent > 0 ? LOSTheme.criticalRed : Color.primary)
                            }
                            
                            Slider(
                                value: $viewModel.reverseStressAssumption.incomeDisruptionPercent,
                                in: 0...100,
                                step: 10
                            )
                            .tint(LOSTheme.criticalRed)
                        }
                        
                        // Emergency Expense Slider
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("Unexpected Emergency Expense")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(Color.secondary)
                                Spacer()
                                Text(LOSTheme.formatRupee(viewModel.reverseStressAssumption.emergencyExpense))
                                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                                    .foregroundStyle(LOSTheme.warningAmber)
                            }
                            
                            Slider(
                                value: $viewModel.reverseStressAssumption.emergencyExpense,
                                in: 0...200_000,
                                step: 10_000
                            )
                            .tint(LOSTheme.warningAmber)
                        }
                    }
                    .padding(18)
                    .background(LOSTheme.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(LOSTheme.cardBorder, lineWidth: 1)
                    )
                    .padding(.horizontal)
                    
                    // MARK: - Shock Target (Portfolio-Wide vs Single Stock)
                    if !viewModel.profile.activeHoldings.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("SHOCK TARGET")
                                .font(.system(size: 11, weight: .bold, design: .rounded))
                                .foregroundStyle(Color.secondary)
                                .tracking(0.8)
                            
                            HStack {
                                Button {
                                    viewModel.reverseStressAssumption.targetStockTicker = nil
                                } label: {
                                    HStack(spacing: 5) {
                                        Image(systemName: viewModel.reverseStressAssumption.targetStockTicker == nil ? "checkmark.circle.fill" : "circle")
                                        Text("Portfolio-Wide")
                                            .font(.system(size: 12, weight: .bold, design: .rounded))
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(viewModel.reverseStressAssumption.targetStockTicker == nil ? LOSTheme.primary.opacity(0.15) : LOSTheme.cardBackground)
                                    .foregroundStyle(viewModel.reverseStressAssumption.targetStockTicker == nil ? LOSTheme.primary : Color.secondary)
                                    .clipShape(Capsule())
                                }
                                
                                ScrollView(.horizontal) {
                                    HStack(spacing: 8) {
                                        ForEach(viewModel.profile.activeHoldings) { holding in
                                            let isSelected = viewModel.reverseStressAssumption.targetStockTicker?.uppercased() == holding.ticker.uppercased()
                                            Button {
                                                viewModel.reverseStressAssumption.targetStockTicker = holding.ticker
                                            } label: {
                                                Text(holding.ticker)
                                                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                                                    .padding(.horizontal, 12)
                                                    .padding(.vertical, 8)
                                                    .background(isSelected ? LOSTheme.primary.opacity(0.15) : LOSTheme.cardBackground)
                                                    .foregroundStyle(isSelected ? LOSTheme.primary : Color.secondary)
                                                    .clipShape(Capsule())
                                            }
                                        }
                                    }
                                }
                                .scrollIndicators(.hidden)
                            }
                        }
                        .padding(18)
                        .background(LOSTheme.cardBackground)
                        .clipShape(.rect(cornerRadius: LOSTheme.radiusLarge))
                        .overlay(
                            RoundedRectangle(cornerRadius: LOSTheme.radiusLarge)
                                .stroke(LOSTheme.cardBorder, lineWidth: 1)
                        )
                        .padding(.horizontal)
                        .padding(.bottom, 24)
                    }
                }
            }
            .navigationTitle("Reverse Stress Test")
            .navigationBarTitleDisplayMode(.inline)
            .background(LOSTheme.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
    }
    
    private var statusColor: Color {
        guard let p = result.breakingPointDeclinePercent else { return LOSTheme.safeGreen }
        if p == 0 { return LOSTheme.criticalRed }
        if p < 25 { return LOSTheme.criticalRed }
        return LOSTheme.warningAmber
    }
    
    private var statusIcon: String {
        guard let p = result.breakingPointDeclinePercent else { return "shield.lefthalf.filled.badge.checkmark" }
        if p == 0 { return "exclamationmark.octagon.fill" }
        if p < 25 { return "bolt.shield.fill" }
        return "exclamationmark.triangle.fill"
    }
}

private struct PresetPill: View {
    let title: String
    let icon: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .bold))
                Text(title)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(LOSTheme.cardBackground)
            .foregroundStyle(Color.primary)
            .clipShape(Capsule())
            .overlay(
                Capsule().stroke(LOSTheme.cardBorder, lineWidth: 1)
            )
        }
    }
}
