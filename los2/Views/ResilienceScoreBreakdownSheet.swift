import SwiftUI

/// Feature 06: Explainable Financial Resilience Score Breakdown Sheet.
/// Provides a fully transparent, 5-pillar mathematical breakdown of the 0–100 score,
/// detailing formulas, metrics, earned vs max points, and actionable improvement steps.
struct ResilienceScoreBreakdownSheet: View {
    @ObservedObject var viewModel: ResilienceViewModel
    @Environment(\.dismiss) private var dismiss
    
    var report: ExplainableResilienceReport {
        viewModel.explainableScoreReport
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // MARK: - Hero Score Card
                    VStack(spacing: 14) {
                        Text("FINANCIAL RESILIENCE SCORE")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.secondary)
                            .tracking(0.8)
                        
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(report.totalScore)")
                                .font(.system(size: 56, weight: .bold, design: .rounded))
                                .foregroundStyle(report.band.color)
                            Text("/100")
                                .font(.system(size: 22, weight: .semibold, design: .rounded))
                                .foregroundStyle(Color.secondary)
                        }
                        
                        Text(report.band.rawValue)
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 5)
                            .background(report.band.color.opacity(0.15))
                            .foregroundStyle(report.band.color)
                            .clipShape(Capsule())
                    }
                    .padding(20)
                    .frame(maxWidth: .infinity)
                    .background(LOSTheme.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(report.band.color.opacity(0.3), lineWidth: 1.5)
                    )
                    .padding(.horizontal)
                    
                    // MARK: - Key Score Drivers
                    if !report.scoreChangeDrivers.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Image(systemName: "flag.fill")
                                    .font(.system(size: 11))
                                    .foregroundStyle(LOSTheme.primary)
                                Text("KEY SCORE DRIVERS")
                                    .font(.system(size: 11, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color.secondary)
                                    .tracking(0.8)
                            }
                            
                            ForEach(report.scoreChangeDrivers, id: \.self) { driver in
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: driver.contains("+") ? "arrow.up.circle.fill" : "arrow.down.circle.fill")
                                        .font(.system(size: 12))
                                        .foregroundStyle(driver.contains("+") ? LOSTheme.safeGreen : LOSTheme.criticalRed)
                                        .padding(.top, 2)
                                    Text(driver)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(Color.primary)
                                }
                            }
                        }
                        .padding(16)
                        .background(LOSTheme.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(LOSTheme.cardBorder, lineWidth: 1)
                        )
                        .padding(.horizontal)
                    }
                    
                    // MARK: - 5 Pillars Detailed Breakdown
                    VStack(alignment: .leading, spacing: 12) {
                        Text("5 RESILIENCE PILLARS")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.secondary)
                            .tracking(0.8)
                            .padding(.horizontal)
                        
                        VStack(spacing: 12) {
                            ForEach(report.pillars) { pillar in
                                PillarDetailCard(pillar: pillar)
                            }
                        }
                        .padding(.horizontal)
                    }
                    
                    // MARK: - Missing Data & Penalties Notice
                    if !report.missingDataPenalties.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 6) {
                                Image(systemName: "exclamationmark.circle.fill")
                                    .font(.system(size: 12))
                                    .foregroundStyle(LOSTheme.warningAmber)
                                Text("DATA COMPLETENESS")
                                    .font(.system(size: 11, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color.secondary)
                            }
                            ForEach(report.missingDataPenalties, id: \.self) { note in
                                Text(note)
                                    .font(.system(size: 11))
                                    .foregroundStyle(Color.secondary)
                            }
                        }
                        .padding(14)
                        .background(LOSTheme.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .padding(.horizontal)
                    }
                    
                    // MARK: - Regulatory & Financial Disclaimer
                    Text(report.disclaimer)
                        .font(.system(size: 11))
                        .foregroundStyle(Color.secondary.opacity(0.8))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 24)
                }
            }
            .navigationTitle("Score Breakdown")
            .navigationBarTitleDisplayMode(.inline)
            .background(LOSTheme.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

/// Detail Card for Each Score Pillar
private struct PillarDetailCard: View {
    let pillar: ResiliencePillar
    
    var progressPercent: Double {
        guard pillar.maxPoints > 0 else { return 0.0 }
        return min(1.0, max(0.0, pillar.earnedPoints / pillar.maxPoints))
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Title & Earned Points
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(pillar.name)
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                    Text(pillar.formulaDescription)
                        .font(.system(size: 11))
                        .foregroundStyle(Color.secondary)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                
                VStack(alignment: .trailing, spacing: 2) {
                    HStack(spacing: 2) {
                        Text(String(format: "%.1f", pillar.earnedPoints))
                            .font(.system(size: 15, weight: .bold, design: .rounded))
                            .foregroundStyle(pillar.statusColor)
                        Text("/ \(Int(pillar.maxPoints)) pts")
                            .font(.system(size: 11, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color.secondary)
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                    
                    Text(pillar.rating)
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(pillar.statusColor.opacity(0.12))
                        .foregroundStyle(pillar.statusColor)
                        .clipShape(Capsule())
                }
                .layoutPriority(1)
            }
            
            // Progress Bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(LOSTheme.cardBorder)
                        .frame(height: 6)
                    
                    RoundedRectangle(cornerRadius: 4)
                        .fill(pillar.statusColor)
                        .frame(width: geo.size.width * CGFloat(progressPercent), height: 6)
                }
            }
            .frame(height: 6)
            
            // Current Metric
            HStack {
                Text("Current Metric:")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Color.secondary)
                Text(pillar.currentMetricValue)
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(Color.primary)
            }
            
            Divider()
                .overlay(LOSTheme.cardBorder.opacity(0.5))
            
            // Actionable Improvement Tip
            HStack(alignment: .top, spacing: 6) {
                Image(systemName: "lightbulb.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(LOSTheme.warningAmber)
                    .padding(.top, 2)
                Text(pillar.improvementTip)
                    .font(.system(size: 11))
                    .foregroundStyle(Color.secondary)
                    .lineSpacing(2)
            }
        }
        .padding(14)
        .background(LOSTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(LOSTheme.cardBorder, lineWidth: 1)
        )
    }
}
