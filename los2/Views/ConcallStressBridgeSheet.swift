import SwiftUI

/// Bridges AI Concall business risks directly into the existing LiquidityOS Resilience & Stress-Testing Engine.
struct ConcallStressBridgeSheet: View {
    let analysis: ConcallAnalysis
    @ObservedObject var resilienceViewModel: ResilienceViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var selectedScenario: StressScenarioLevel = .stress
    @State private var customDecline: Double = 15.0
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Header Banner
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("PORTFOLIO STRESS BRIDGE")
                                .font(.system(size: 11, weight: .bold, design: .rounded))
                                .foregroundStyle(Color.secondary)
                                .tracking(0.8)
                            Spacer()
                            Text(analysis.metadata.ticker)
                                .font(.system(size: 12, weight: .bold, design: .monospaced))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(LOSTheme.primary.opacity(0.12))
                                .foregroundStyle(LOSTheme.primary)
                                .clipShape(Capsule())
                        }
                        
                        Text("Stress Test: \(analysis.metadata.companyName)")
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                        
                        Text("Connect identified business risks with your overall portfolio resilience and cash runway.")
                            .font(.system(size: 13))
                            .foregroundStyle(Color.secondary)
                    }
                    .padding(18)
                    .background(LOSTheme.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(LOSTheme.cardBorder, lineWidth: 1)
                    )
                    .padding(.horizontal)
                    
                    // Business Risks Summary Card
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Identified Business Risks from Concall", systemImage: "exclamationmark.triangle.fill")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .foregroundStyle(LOSTheme.warningAmber)
                        
                        ForEach(analysis.portfolioConnection.relevantBusinessRisks, id: \.self) { risk in
                            HStack(alignment: .top, spacing: 6) {
                                Image(systemName: "circle.fill")
                                    .font(.system(size: 5))
                                    .foregroundStyle(LOSTheme.criticalRed)
                                    .padding(.top, 6)
                                Text(risk)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Color.primary)
                            }
                        }
                    }
                    .padding(16)
                    .background(LOSTheme.warningAmber.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .padding(.horizontal)
                    
                    // Hypothetical Scenario Selector
                    VStack(alignment: .leading, spacing: 12) {
                        Text("HYPOTHETICAL SHOCK SCENARIO")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.secondary)
                            .tracking(0.8)
                        
                        SegmentedShockPicker(selected: $selectedScenario) { level in
                            selectedScenario = level
                            customDecline = level.percentage
                        }
                        
                        // Custom Shock Slider
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text("Custom Drawdown")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Color.secondary)
                                Spacer()
                                Text("\(Int(customDecline))%")
                                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                                    .foregroundStyle(LOSTheme.criticalRed)
                            }
                            
                            Slider(value: $customDecline, in: 5...50, step: 1)
                                .tint(LOSTheme.criticalRed)
                        }
                        .padding(.top, 6)
                    }
                    .padding(18)
                    .background(LOSTheme.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(LOSTheme.cardBorder, lineWidth: 1)
                    )
                    .padding(.horizontal)
                    
                    // Stress Engine Result using existing ResilienceEngine
                    let simulatedReport = ResilienceEngine.analyze(
                        profile: resilienceViewModel.profile,
                        declinePercent: customDecline
                    )
                    
                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            Text("SIMULATED SHOCK IMPACT")
                                .font(.system(size: 11, weight: .bold, design: .rounded))
                                .foregroundStyle(Color.secondary)
                                .tracking(0.8)
                            Spacer()
                            Text("Resilience: \(simulatedReport.resilienceScore)/100")
                                .font(.system(size: 12, weight: .bold, design: .rounded))
                                .foregroundStyle(simulatedReport.resilienceBand.color)
                        }
                        
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Est. Hit")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(Color.secondary)
                                Text("−\(LOSTheme.formatRupee(simulatedReport.estimatedPortfolioLoss))")
                                    .font(.system(size: 17, weight: .bold, design: .rounded))
                                    .foregroundStyle(LOSTheme.criticalRed)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.70)
                            }
                            
                            Spacer()
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Remaining")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(Color.secondary)
                                Text(LOSTheme.formatRupee(simulatedReport.remainingPortfolioValue))
                                    .font(.system(size: 17, weight: .bold, design: .rounded))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.70)
                            }
                            
                            Spacer()
                            
                            VStack(alignment: .trailing, spacing: 4) {
                                Text("Runway")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(Color.secondary)
                                Text("\(String(format: "%.1f", simulatedReport.runwayMonths)) mos")
                                    .font(.system(size: 17, weight: .bold, design: .rounded))
                                    .foregroundStyle(simulatedReport.runwayMonths < 3.0 ? LOSTheme.criticalRed : LOSTheme.safeGreen)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.85)
                            }
                        }
                        
                        Divider()
                        
                        Text(simulatedReport.summaryVerdict)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Color.primary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(18)
                    .background(LOSTheme.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(LOSTheme.cardBorder, lineWidth: 1)
                    )
                    .padding(.horizontal)
                    .padding(.bottom, 24)
                }
            }
            .navigationTitle("Stress Engine Bridge")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .background(LOSTheme.background.ignoresSafeArea())
        }
    }
}
