import SwiftUI

/// Scenario comparison screen (Slide 08) comparing Mild (5%), Stress (15%), and Severe (30%).
struct ScenarioCompareView: View {
    @ObservedObject var viewModel: ResilienceViewModel
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Header Card
                    VStack(alignment: .leading, spacing: 6) {
                        Text("MULTI-SCENARIO STRESS MATRIX")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.secondary)
                            .tracking(0.8)
                        
                        Text("Mild, stress, severe — see the range before you decide.")
                            .font(.system(size: 20, weight: .bold, design: .rounded))
                        
                        Text("Same \(LOSTheme.formatRupee(viewModel.profile.portfolioValue)) portfolio under 3 illustrative shocks.")
                            .font(.system(size: 13))
                            .foregroundStyle(Color.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(18)
                    .background(LOSTheme.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(LOSTheme.cardBorder, lineWidth: 1)
                    )
                    .padding(.horizontal)
                    
                    // Comparison Cards
                    VStack(spacing: 12) {
                        ForEach(viewModel.scenarioComparisons) { item in
                            let scenario = item.scenario
                            let report = item.report
                            
                            VStack(spacing: 12) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack {
                                            Text(scenario.rawValue)
                                                .font(.system(size: 16, weight: .bold, design: .rounded))
                                            Text("(\(Int(scenario.percentage))%)")
                                                .font(.system(size: 13, weight: .bold, design: .monospaced))
                                                .foregroundStyle(scenario.color)
                                        }
                                        Text(scenario.description)
                                            .font(.system(size: 11))
                                            .foregroundStyle(Color.secondary)
                                    }
                                    Spacer()
                                    // Score badge
                                    HStack(spacing: 4) {
                                        Text("Score:")
                                            .font(.system(size: 11, weight: .medium))
                                            .foregroundStyle(Color.secondary)
                                        Text("\(report.resilienceScore)")
                                            .font(.system(size: 16, weight: .bold, design: .rounded))
                                            .foregroundStyle(report.resilienceBand.color)
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(report.resilienceBand.color.opacity(0.12))
                                    .clipShape(Capsule())
                                }
                                
                                Divider()
                                
                                HStack(spacing: 8) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Portfolio Hit")
                                            .font(.system(size: 10, weight: .medium))
                                            .foregroundStyle(Color.secondary)
                                            .lineLimit(1)
                                        Text("−\(LOSTheme.formatRupee(report.estimatedPortfolioLoss))")
                                            .font(.system(size: 14, weight: .bold, design: .rounded))
                                            .foregroundStyle(LOSTheme.criticalRed)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.75)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Remaining Assets")
                                            .font(.system(size: 10, weight: .medium))
                                            .foregroundStyle(Color.secondary)
                                            .lineLimit(1)
                                        Text(LOSTheme.formatRupee(report.remainingPortfolioValue))
                                            .font(.system(size: 14, weight: .bold, design: .rounded))
                                            .foregroundStyle(Color.primary)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.75)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    
                                    VStack(alignment: .trailing, spacing: 2) {
                                        Text("Runway")
                                            .font(.system(size: 10, weight: .medium))
                                            .foregroundStyle(Color.secondary)
                                            .lineLimit(1)
                                        Text(report.runwayState == .cashSurplus ? "Surplus" : "\(String(format: "%.1f", report.runwayMonths)) mos")
                                            .font(.system(size: 14, weight: .bold, design: .rounded))
                                            .foregroundStyle(report.runwayMonths < 3.0 ? LOSTheme.criticalRed : LOSTheme.safeGreen)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.80)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .trailing)
                                }
                            }
                            .padding(16)
                            .background(LOSTheme.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(scenario == viewModel.selectedScenario ? scenario.color : LOSTheme.cardBorder, lineWidth: scenario == viewModel.selectedScenario ? 2 : 1)
                            )
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 24)
                }
            }
            .navigationTitle("Scenarios")
            .background(LOSTheme.background.ignoresSafeArea())
        }
    }
}
