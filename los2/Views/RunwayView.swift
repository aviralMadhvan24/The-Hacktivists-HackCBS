import SwiftUI

/// Dedicated screen for Feature 03: Cash Runway.
/// Built strictly following the swiftui-pro design system and layout principles:
/// Hero Runway metric -> Swift Charts Depletion Curve -> 2-Column Stat Grid -> Detailed Cash Breakdown.
struct RunwayView: View {
    @ObservedObject var viewModel: ResilienceViewModel
    @State private var isScheduleExpanded = false
    
    var body: some View {
        let report = viewModel.currentReport
        
        NavigationStack {
            ScrollView {
                VStack(spacing: LOSTheme.space20) {
                    // MARK: - 1. Hero Runway Metric
                    heroMetricSection(report: report)
                    
                    // MARK: - 2. Native Depletion Trajectory Chart
                    RunwayTimelineView(
                        startingCash: report.remainingCashAfterEmergency,
                        monthlyBurn: report.monthlyNetBurn,
                        runwayMonths: report.runwayMonths,
                        state: report.runwayState,
                        minimumReserveFloor: viewModel.profile.minimumCashReserve
                    )
                    
                    // MARK: - 3. Key Cash Flow Stats Grid
                    LazyVGrid(
                        columns: [
                            GridItem(.flexible(), spacing: LOSTheme.space12),
                            GridItem(.flexible(), spacing: LOSTheme.space12)
                        ],
                        spacing: LOSTheme.space12
                    ) {
                        StatTile(
                            title: "POST-EMERGENCY CASH",
                            value: LOSTheme.formatRupee(report.remainingCashAfterEmergency),
                            subtitle: "Liquid reserve balance",
                            icon: "banknote.fill",
                            tint: LOSTheme.accent
                        )
                        
                        StatTile(
                            title: "MONTHLY BURN",
                            value: report.monthlyNetBurn > 0 ? "−\(LOSTheme.formatRupee(report.monthlyNetBurn))" : "+\(LOSTheme.formatRupee(abs(report.monthlyNetBurn)))",
                            subtitle: report.monthlyNetBurn > 0 ? "Net outflow per month" : "Net accumulation",
                            icon: "flame.fill",
                            tint: report.monthlyNetBurn > 0 ? LOSTheme.critical : LOSTheme.positive,
                            isNegative: report.monthlyNetBurn > 0
                        )
                        
                        StatTile(
                            title: "MONTHLY INCOME",
                            value: LOSTheme.formatRupee(report.monthlyIncome),
                            subtitle: "Net cash inflows",
                            icon: "arrow.down.circle.fill",
                            tint: LOSTheme.positive
                        )
                        
                        StatTile(
                            title: "TOTAL COMMITMENTS",
                            value: LOSTheme.formatRupee(report.monthlyExpenses + viewModel.profile.monthlyDebtPayments),
                            subtitle: "Living costs + EMI debt",
                            icon: "cart.fill",
                            tint: LOSTheme.warning
                        )
                    }
                    
                    // MARK: - 4. Breakdown & Progressive Disclosure
                    VStack(alignment: .leading, spacing: LOSTheme.space12) {
                        SectionHeader(
                            title: "Cash Flow Breakdown",
                            subtitle: "Underlying monthly liquidity mechanics"
                        )
                        
                        VStack(spacing: 0) {
                            InsightRow(
                                title: "Post-Emergency Cash",
                                value: LOSTheme.formatRupee(report.remainingCashAfterEmergency),
                                subtitle: "Available liquid reserves after shocks",
                                icon: "banknote.fill",
                                tint: LOSTheme.accent
                            )
                            
                            Divider().overlay(LOSTheme.borderHairline)
                                .padding(.leading, 56)
                            
                            InsightRow(
                                title: "Monthly Income",
                                value: LOSTheme.formatRupee(report.monthlyIncome),
                                subtitle: "Primary take-home salary & inflows",
                                icon: "arrow.down.left.circle.fill",
                                tint: LOSTheme.positive
                            )
                            
                            Divider().overlay(LOSTheme.borderHairline)
                                .padding(.leading, 56)
                            
                            InsightRow(
                                title: "Monthly Living Expenses",
                                value: LOSTheme.formatRupee(report.monthlyExpenses),
                                subtitle: "Essential living and fixed outlays",
                                icon: "arrow.up.right.circle.fill",
                                tint: LOSTheme.warning
                            )
                            
                            if viewModel.profile.monthlyDebtPayments > 0 {
                                Divider().overlay(LOSTheme.borderHairline)
                                    .padding(.leading, 56)
                                
                                InsightRow(
                                    title: "Debt & EMIs",
                                    value: LOSTheme.formatRupee(viewModel.profile.monthlyDebtPayments),
                                    subtitle: "Contractual loan payments",
                                    icon: "creditcard.fill",
                                    tint: LOSTheme.critical,
                                    isNegative: true
                                )
                            }
                            
                            Divider().overlay(LOSTheme.borderHairline)
                                .padding(.leading, 56)
                            
                            InsightRow(
                                title: "Net Cash Burn",
                                value: report.monthlyNetBurn > 0 ? "−\(LOSTheme.formatRupee(report.monthlyNetBurn))/mo" : "+\(LOSTheme.formatRupee(abs(report.monthlyNetBurn)))/mo",
                                subtitle: report.monthlyNetBurn > 0 ? "Expenses exceed cash income" : "Savings accumulating",
                                icon: "flame.fill",
                                tint: report.monthlyNetBurn > 0 ? LOSTheme.critical : LOSTheme.positive,
                                isNegative: report.monthlyNetBurn > 0
                            )
                        }
                        .background(LOSTheme.surface)
                        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                        )
                        
                        // Collapsible Depletion Schedule Table
                        DisclosureGroup(isExpanded: $isScheduleExpanded) {
                            VStack(spacing: LOSTheme.space8) {
                                let maxMonths = min(12, max(3, Int(ceil(report.runwayMonths)) + 1))
                                ForEach(0...maxMonths, id: \.self) { m in
                                    let balance = max(0, report.remainingCashAfterEmergency - (report.monthlyNetBurn * Double(m)))
                                    HStack {
                                        Text(m == 0 ? "Starting Cash (Now)" : "Month \(m)")
                                            .font(.subheadline)
                                            .foregroundStyle(m == 0 ? LOSTheme.textPrimary : LOSTheme.textSecondary)
                                        Spacer()
                                        Text(LOSTheme.formatRupee(balance))
                                            .font(.subheadline.weight(.semibold))
                                            .monospacedDigit()
                                            .foregroundStyle(balance <= viewModel.profile.minimumCashReserve ? LOSTheme.warning : LOSTheme.textPrimary)
                                    }
                                    .padding(.vertical, 4)
                                    
                                    if m < maxMonths {
                                        Divider().overlay(LOSTheme.borderHairline)
                                    }
                                }
                            }
                            .padding(.top, LOSTheme.space12)
                        } label: {
                            HStack {
                                Image(systemName: "calendar.badge.clock")
                                    .foregroundStyle(LOSTheme.accent)
                                Text("Month-by-Month Depletion Schedule")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(LOSTheme.textPrimary)
                            }
                        }
                        .padding(LOSTheme.space16)
                        .background(LOSTheme.surface)
                        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                        )
                    }
                }
                .padding(.horizontal, LOSTheme.space16)
                .padding(.top, LOSTheme.space12)
                .padding(.bottom, 64)
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .background(LOSTheme.backgroundGradient.ignoresSafeArea())
        }
    }
    
    // MARK: - Subviews
    
    @ViewBuilder
    private func heroMetricSection(report: ResilienceReport) -> some View {
        switch report.runwayState {
        case .cashSurplus:
            HeroMetricCard(
                category: "Cash Runway",
                value: "Perpetual",
                subtitle: "Monthly income exceeds expenses. Reserves are actively accumulating.",
                statusPill: StatusPill(text: "Surplus", icon: "arrow.up.forward.circle.fill", color: LOSTheme.positive)
            )
            
        case .breakEven:
            HeroMetricCard(
                category: "Cash Runway",
                value: "Balanced",
                subtitle: "Monthly cash inflows exactly balance outflows. Zero net cash burn.",
                statusPill: StatusPill(text: "Break-Even", icon: "equal.circle.fill", color: LOSTheme.accent)
            )
            
        case .underwater:
            HeroMetricCard(
                category: "Cash Runway",
                value: "0.0 Months",
                subtitle: "Immediate cash deficit. Liquid cash reserves cannot cover current commitments.",
                statusPill: StatusPill(text: "Deficit", icon: "exclamationmark.octagon.fill", color: LOSTheme.critical)
            )
            
        case .exhausting:
            let monthsVal = String(format: "%.1f Months", report.runwayMonths)
            let isCritical = report.runwayMonths < 3.0
            let isWarning = report.runwayMonths < 6.0
            
            HeroMetricCard(
                category: "Estimated Cash Runway",
                value: monthsVal,
                subtitle: isCritical
                    ? "Reserves will deplete rapidly under sustained monthly burn. Immediate action advised."
                    : "Survival window before liquid cash reserves are fully exhausted.",
                statusPill: StatusPill(
                    text: isCritical ? "Critical" : (isWarning ? "Caution" : "Healthy"),
                    icon: isCritical ? "exclamationmark.triangle.fill" : (isWarning ? "clock.fill" : "shield.fill"),
                    color: isCritical ? LOSTheme.critical : (isWarning ? LOSTheme.warning : LOSTheme.positive)
                )
            )
        }
    }
}

#Preview("Runway View - Sample") {
    RunwayView(viewModel: ResilienceViewModel())
}
