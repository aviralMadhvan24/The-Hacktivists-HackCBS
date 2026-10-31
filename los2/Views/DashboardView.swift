import SwiftUI
import Charts

/// Main Hero Dashboard screen transformed into an interactive Financial Command Center.
/// Displays baseline financial resilience score upfront without requiring stress test selection,
/// provides a prominent "Edit Finances" action, tappable financial summary cards, dynamic "What Needs Attention?" alerts,
/// and quick-action module hubs.
struct DashboardView: View {
    @ObservedObject var viewModel: ResilienceViewModel
    @AppStorage("isLoggedIn") private var isLoggedIn: Bool = false
    @AppStorage("loggedInUserEmail") private var loggedInUserEmail: String = "user@gmail.com"
    @AppStorage("loggedInUserName") private var loggedInUserName: String = "Demo Investor"
    
    @State private var isPreviewingShock: Bool = false
    @State private var isShowingStressSheet: Bool = false
    @State private var isShowingEmergencySheet: Bool = false
    @State private var isShowingRunwaySheet: Bool = false
    @State private var isShowingMarketWatchSheet: Bool = false
    @State private var isShowingSignOutAlert: Bool = false
    
    var baselineReport: ExplainableResilienceReport {
        viewModel.baselineScoreReport
    }
    
    var activeReport: ResilienceReport {
        viewModel.currentReport
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: LOSTheme.space24) {
                    // MARK: - Top Header with Greeting & Action Hub
                    HStack(alignment: .center) {
                        FinSightHorizontalLogo(showTagline: false, iconSize: 22)
                        
                        Spacer()
                        
                        HStack(spacing: LOSTheme.space8) {
                            // Edit Finances Button
                            Button {
                                viewModel.isShowingEditSheet = true
                            } label: {
                                Label("Edit", systemImage: "pencil.line")
                                    .font(.subheadline.weight(.semibold))
                                    .padding(.horizontal, LOSTheme.space12)
                                    .padding(.vertical, LOSTheme.space8)
                                    .background(LOSTheme.accent)
                                    .foregroundStyle(Color.white)
                                    .clipShape(Capsule())
                            }
                            
                            // Zerodha Kite Connection Icon Button
                            Button {
                                viewModel.isShowingZerodhaSheet = true
                            } label: {
                                Image(systemName: viewModel.isZerodhaConnected ? "checkmark.circle.fill" : "link")
                                    .font(.subheadline.weight(.semibold))
                                    .frame(width: 36, height: 36)
                                    .background(viewModel.isZerodhaConnected ? LOSTheme.positive.opacity(0.14) : Color(red: 1.0, green: 0.34, blue: 0.13).opacity(0.12))
                                    .foregroundStyle(viewModel.isZerodhaConnected ? LOSTheme.positive : Color(red: 1.0, green: 0.34, blue: 0.13))
                                    .clipShape(Circle())
                            }
                            .accessibilityLabel(viewModel.isZerodhaConnected ? "Zerodha Connected" : "Connect Zerodha Account")
                            
                            // Profile & Sign Out Menu
                            Menu {
                                Section {
                                    Label(loggedInUserName, systemImage: "person.text.rectangle")
                                    Label(loggedInUserEmail, systemImage: "envelope")
                                }
                                
                                Button(role: .destructive) {
                                    isShowingSignOutAlert = true
                                } label: {
                                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                                }
                            } label: {
                                Image(systemName: "person.fill")
                                    .font(.subheadline.weight(.semibold))
                                    .frame(width: 36, height: 36)
                                    .background(LOSTheme.surfaceElevated)
                                    .foregroundStyle(LOSTheme.textPrimary)
                                    .clipShape(Circle())
                            }
                            .accessibilityLabel("User Account Profile")
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top, LOSTheme.space4)
                    
                    // MARK: - Empty State (If Profile Unconfigured)
                    if viewModel.isProfileIncomplete && viewModel.profile.portfolioValue == 0 && viewModel.profile.liquidCash == 0 {
                        ContentUnavailableView {
                            Label("Setup Financial Snapshot", systemImage: "wallet.pass.fill")
                        } description: {
                            Text("Add your bank cash, expenses, and investments to calculate your personalized Resilience Score.")
                        } actions: {
                            Button("Enter Finances") {
                                viewModel.isShowingEditSheet = true
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(LOSTheme.accent)
                            .clipShape(Capsule())
                        }
                        .padding(LOSTheme.space16)
                        .background(LOSTheme.surface)
                        .clipShape(.rect(cornerRadius: LOSTheme.radiusLarge, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: LOSTheme.radiusLarge, style: .continuous)
                                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                        )
                        .padding(.horizontal)
                    }
                    
                    // MARK: - Hero Financial Resilience Score Card
                    VStack(spacing: LOSTheme.space16) {
                        HStack {
                            VStack(alignment: .leading, spacing: LOSTheme.space4) {
                                Text("FINANCIAL RESILIENCE")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(LOSTheme.textSecondary)
                                    .tracking(0.8)
                                Text(isPreviewingShock ? "Under −\(Int(viewModel.currentDeclinePercentage))% Shock" : "Baseline Financial Posture")
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(LOSTheme.textSecondary)
                            }
                            
                            Spacer()
                            
                            // Shock Preview Toggle Pill
                            Button {
                                withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                                    isPreviewingShock.toggle()
                                }
                            } label: {
                                HStack(spacing: LOSTheme.space4) {
                                    Image(systemName: isPreviewingShock ? "waveform.path.badge.minus" : "shield.lefthalf.filled")
                                        .font(.caption2.weight(.bold))
                                    Text(isPreviewingShock ? "Shock Active" : "Simulate Shock")
                                        .font(.caption.weight(.semibold))
                                }
                                .padding(.horizontal, LOSTheme.space12)
                                .padding(.vertical, LOSTheme.space8 - 2)
                                .background(isPreviewingShock ? LOSTheme.critical : LOSTheme.accent.opacity(0.12))
                                .foregroundStyle(isPreviewingShock ? Color.white : LOSTheme.accent)
                                .clipShape(Capsule())
                            }
                        }
                        
                        // Active or Baseline Score Gauge
                        let displayedScore = isPreviewingShock ? activeReport.resilienceScore : baselineReport.totalScore
                        let displayedBand = isPreviewingShock ? activeReport.resilienceBand : baselineReport.band
                        
                        ResilienceGaugeView(
                            score: displayedScore,
                            band: displayedBand,
                            headline: isPreviewingShock ? activeReport.summaryHeadline : "Baseline Liquidity Buffer"
                        )
                        
                        // Provisional notice if data is missing
                        if let notice = viewModel.provisionalScoreNotice {
                            HStack(spacing: LOSTheme.space6) {
                                Image(systemName: "exclamationmark.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(LOSTheme.warning)
                                Text(notice)
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(LOSTheme.warning)
                            }
                            .padding(.horizontal, LOSTheme.space12)
                            .padding(.vertical, LOSTheme.space4)
                            .background(LOSTheme.warning.opacity(0.12))
                            .clipShape(Capsule())
                        }
                        
                        Divider().overlay(LOSTheme.borderHairline)
                        
                        // 5-Pillar Score Preview: Sleek segmented bar + breakdown button
                        HStack(spacing: LOSTheme.space8) {
                            HStack(spacing: LOSTheme.space4) {
                                ForEach(baselineReport.pillars) { p in
                                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                                        .fill(p.statusColor)
                                        .frame(height: 5)
                                }
                            }
                            
                            Spacer()
                            
                            Button {
                                viewModel.isShowingScoreBreakdownSheet = true
                            } label: {
                                HStack(spacing: LOSTheme.space4) {
                                    Text("Why this score?")
                                        .font(.caption.weight(.semibold))
                                    Image(systemName: "chevron.right")
                                        .font(.caption2.weight(.bold))
                                }
                                .foregroundStyle(LOSTheme.accent)
                            }
                        }
                    }
                    .padding(LOSTheme.space20)
                    .background(LOSTheme.surface)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                    .shadow(color: Color.black.opacity(0.04), radius: 12, y: 5)
                    .padding(.horizontal)
                    
                    // MARK: - Strategic Tools (What-If Stocks, Reverse Stress, AI Recovery)
                    VStack(alignment: .leading, spacing: LOSTheme.space10) {
                        SectionHeader(
                            title: "Strategic Tools",
                            subtitle: "Instant simulations & intelligence"
                        )
                        .padding(.horizontal)
                        
                        ScrollView(.horizontal) {
                            HStack(spacing: LOSTheme.space12) {
                                StrategicToolCard(
                                    title: "Live Market",
                                    subtitle: "NSE & BSE Tickers",
                                    icon: "chart.line.uptrend.xyaxis",
                                    color: Color(hex: "0284C7")
                                ) {
                                    isShowingMarketWatchSheet = true
                                }
                                
                                StrategicToolCard(
                                    title: "What-If Stocks",
                                    subtitle: "Model NSE/BSE",
                                    icon: "wand.and.stars",
                                    color: LOSTheme.accent
                                ) {
                                    viewModel.isShowingWhatIfSheet = true
                                }
                                
                                StrategicToolCard(
                                    title: "Reverse Stress",
                                    subtitle: "Crash Capacity",
                                    icon: "gauge.with.needle.fill",
                                    color: LOSTheme.warning
                                ) {
                                    viewModel.isShowingReverseStressSheet = true
                                }
                                
                                StrategicToolCard(
                                    title: "AI Recovery",
                                    subtitle: "Reach 85+ Score",
                                    icon: "sparkles",
                                    color: LOSTheme.positive
                                ) {
                                    viewModel.isShowingRecoverySheet = true
                                }
                                
                                StrategicToolCard(
                                    title: "Holdings Audit",
                                    subtitle: "Asset Weights",
                                    icon: "chart.pie.fill",
                                    color: Color(hex: "6366F1")
                                ) {
                                    viewModel.isShowingPortfolioSheet = true
                                }
                            }
                            .padding(.horizontal)
                        }
                        .scrollIndicators(.hidden)
                    }
                    
                    // MARK: - "What Needs Attention?" Actionable Carousel
                    if !viewModel.attentionItems.isEmpty {
                        VStack(alignment: .leading, spacing: LOSTheme.space12) {
                            SectionHeader(
                                title: "Needs Attention",
                                subtitle: "\(viewModel.attentionItems.count) proactive resilience recommendations"
                            )
                            .padding(.horizontal)
                            
                            ScrollView(.horizontal) {
                                HStack(spacing: LOSTheme.space12) {
                                    ForEach(viewModel.attentionItems) { item in
                                        AttentionTile(item: item) {
                                            handleAttentionAction(item.targetAction)
                                        }
                                    }
                                }
                                .padding(.horizontal)
                            }
                            .scrollIndicators(.hidden)
                        }
                    }
                    
                    // MARK: - Financial Snapshot (2-Column StatTile Grid)
                    VStack(alignment: .leading, spacing: LOSTheme.space12) {
                        SectionHeader(
                            title: "Financial Position",
                            subtitle: "Tap any tile to inspect or adjust"
                        )
                        .padding(.horizontal)
                        
                        LazyVGrid(
                            columns: [GridItem(.flexible(), spacing: LOSTheme.space12), GridItem(.flexible(), spacing: LOSTheme.space12)],
                            spacing: LOSTheme.space12
                        ) {
                            // 1. Portfolio Value
                            Button {
                                viewModel.isShowingPortfolioSheet = true
                            } label: {
                                StatTile(
                                    title: "Portfolio",
                                    value: LOSTheme.formatRupee(viewModel.profile.portfolioValue),
                                    subtitle: "\(viewModel.profile.activeHoldings.count) holdings",
                                    icon: "chart.pie.fill",
                                    tint: LOSTheme.accent
                                )
                            }
                            .buttonStyle(.plain)
                            
                            // 2. Liquid Savings
                            Button {
                                isShowingEmergencySheet = true
                            } label: {
                                StatTile(
                                    title: "Liquid Cash",
                                    value: LOSTheme.formatRupee(viewModel.profile.liquidCash),
                                    subtitle: "Immediate reserve",
                                    icon: "banknote.fill",
                                    tint: LOSTheme.positive
                                )
                            }
                            .buttonStyle(.plain)
                            
                            // 3. Monthly Net Burn
                            let netBurn = viewModel.profile.baselineNetCashBurn
                            Button {
                                viewModel.isShowingEditSheet = true
                            } label: {
                                StatTile(
                                    title: "Monthly Burn",
                                    value: "\(LOSTheme.formatRupee(max(0, netBurn)))/mo",
                                    subtitle: netBurn <= 0 ? "Cash Surplus" : "Net Outflow",
                                    icon: "flame.fill",
                                    tint: netBurn <= 0 ? LOSTheme.positive : LOSTheme.warning
                                )
                            }
                            .buttonStyle(.plain)
                            
                            // 4. Cash Runway
                            Button {
                                isShowingRunwaySheet = true
                            } label: {
                                StatTile(
                                    title: "Cash Runway",
                                    value: activeReport.runwayState == .cashSurplus ? "Surplus" : "\(String(format: "%.1f", activeReport.runwayMonths)) mos",
                                    subtitle: activeReport.runwayMonths < 3.0 ? "Tight Buffer" : "Healthy Buffer",
                                    icon: "hourglass.bottomhalf.filled",
                                    tint: activeReport.runwayMonths < 3.0 ? LOSTheme.critical : LOSTheme.positive,
                                    isNegative: activeReport.runwayMonths < 3.0
                                )
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal)
                    }
                    
                    // MARK: - Mini Volatility Exposure Chart
                    VStack(alignment: .leading, spacing: LOSTheme.space12) {
                        ChartCard(
                            title: "Portfolio Volatility Exposure",
                            subtitle: "Simulated decline across market downturns",
                            accessibilityLabel: "Portfolio decline curve comparing drawdown percentage to portfolio value",
                            trailing: {
                                Button("Full Stress Test >") {
                                    isShowingStressSheet = true
                                }
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(LOSTheme.accent)
                            }
                        ) {
                            let points = ResilienceEngine.calculateDeclineCurve(portfolioValue: viewModel.profile.portfolioValue)
                            
                            if viewModel.profile.portfolioValue <= 0 {
                                ContentUnavailableView {
                                    Label("No Portfolio Holdings", systemImage: "chart.line.downtrend.xyaxis")
                                        .font(.subheadline)
                                } description: {
                                    Text("Add investments in Edit Finances to view potential drawdown impact.")
                                        .font(.caption)
                                }
                                .frame(height: 120)
                            } else {
                                Chart(points) { pt in
                                    AreaMark(
                                        x: .value("Decline %", pt.declinePercent),
                                        y: .value("Value", pt.remainingPortfolio)
                                    )
                                    .foregroundStyle(
                                        LinearGradient(
                                            colors: [LOSTheme.accent.opacity(0.25), Color.clear],
                                            startPoint: .top,
                                            endPoint: .bottom
                                        )
                                    )
                                    
                                    LineMark(
                                        x: .value("Decline %", pt.declinePercent),
                                        y: .value("Value", pt.remainingPortfolio)
                                    )
                                    .foregroundStyle(LOSTheme.accent)
                                    .lineStyle(StrokeStyle(lineWidth: 2))
                                }
                                .frame(height: 130)
                                .chartXAxis {
                                    AxisMarks(values: [0, 20, 40, 60]) { val in
                                        if let num = val.as(Int.self) {
                                            AxisValueLabel {
                                                Text("−\(num)%")
                                                    .font(.caption2)
                                                    .foregroundStyle(LOSTheme.textSecondary)
                                            }
                                        }
                                    }
                                }
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
                        }
                        .padding(.horizontal)
                    }
                    .padding(.bottom, LOSTheme.space32)
                }
            }
            .background(LOSTheme.backgroundGradient.ignoresSafeArea())
            .sensoryFeedback(.impact(weight: .light), trigger: isPreviewingShock)
            // Sheet presentations
            .sheet(isPresented: $viewModel.isShowingEditSheet) {
                EditProfileSheet(viewModel: viewModel)
            }
            .sheet(isPresented: $viewModel.isShowingZerodhaSheet) {
                ZerodhaConnectSheet(resilienceViewModel: viewModel)
            }
            .sheet(isPresented: $viewModel.isShowingScoreBreakdownSheet) {
                ResilienceScoreBreakdownSheet(viewModel: viewModel)
            }
            .sheet(isPresented: $viewModel.isShowingPortfolioSheet) {
                PortfolioManagementView(viewModel: viewModel)
            }
            .sheet(isPresented: $viewModel.isShowingReverseStressSheet) {
                ReverseStressTestView(viewModel: viewModel)
            }
            .sheet(isPresented: $viewModel.isShowingRecoverySheet) {
                RecoveryPlannerView(viewModel: viewModel)
            }
            .sheet(isPresented: $viewModel.isShowingWhatIfSheet) {
                WhatIfStockSimulatorView(viewModel: viewModel)
            }
            .sheet(isPresented: $isShowingStressSheet) {
                StressTestView(viewModel: viewModel)
            }
            .sheet(isPresented: $isShowingEmergencySheet) {
                EmergencySimulatorView(viewModel: viewModel)
            }
            .sheet(isPresented: $isShowingRunwaySheet) {
                RunwayView(viewModel: viewModel)
            }
            .sheet(isPresented: $isShowingMarketWatchSheet) {
                LiveMarketWatchView(viewModel: viewModel)
            }
            .alert("Sign Out", isPresented: $isShowingSignOutAlert) {
                Button("Cancel", role: .cancel) { }
                Button("Sign Out", role: .destructive) {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        isLoggedIn = false
                    }
                }
            } message: {
                Text("Are you sure you want to sign out of FinSight?")
            }
        }
    }
    
    private func handleAttentionAction(_ target: ResilienceViewModel.AttentionActionTarget) {
        switch target {
        case .editFinances:
            viewModel.isShowingEditSheet = true
        case .emergencySimulator:
            isShowingEmergencySheet = true
        case .stressTest:
            isShowingStressSheet = true
        case .portfolioHoldings:
            viewModel.isShowingPortfolioSheet = true
        case .runway:
            isShowingRunwaySheet = true
        }
    }
}

/// Compact attention recommendation card for the horizontal carousel.
private struct AttentionTile: View {
    let item: ResilienceViewModel.AttentionItem
    let onAction: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space8) {
            HStack(spacing: LOSTheme.space6) {
                Image(systemName: item.iconName)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(item.severityColor)
                
                Text(item.title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(LOSTheme.textPrimary)
                    .lineLimit(1)
                
                Spacer(minLength: 0)
            }
            
            Text(item.message)
                .font(.caption2)
                .foregroundStyle(LOSTheme.textSecondary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            
            Spacer(minLength: 0)
            
            Button(action: onAction) {
                Text(item.actionLabel)
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, LOSTheme.space12)
                    .padding(.vertical, LOSTheme.space4)
                    .background(item.severityColor)
                    .foregroundStyle(Color.white)
                    .clipShape(Capsule())
            }
        }
        .padding(LOSTheme.space12)
        .frame(width: 220, height: 110, alignment: .leading)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusMedium, style: .continuous)
                .stroke(item.severityColor.opacity(0.3), lineWidth: LOSTheme.hairline * 2)
        )
    }
}

/// Dedicated Intelligence Tool Card for high-priority features: What-If Stocks, Reverse Stress, AI Recovery.
private struct StrategicToolCard: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: LOSTheme.space8) {
                HStack {
                    ZStack {
                        Circle()
                            .fill(color.opacity(0.14))
                            .frame(width: 36, height: 36)
                        Image(systemName: icon)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(color)
                    }
                    
                    Spacer()
                    
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(LOSTheme.textSecondary.opacity(0.7))
                }
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(LOSTheme.textPrimary)
                        .lineLimit(1)
                    
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundStyle(LOSTheme.textSecondary)
                        .lineLimit(1)
                }
            }
            .padding(LOSTheme.space12)
            .frame(width: 148, height: 96, alignment: .leading)
            .background(LOSTheme.surface)
            .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                    .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
            )
            .shadow(color: Color.black.opacity(0.03), radius: 6, y: 3)
        }
        .sensoryFeedback(.selection, trigger: title)
    }
}
