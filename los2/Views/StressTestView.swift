import SwiftUI
import Charts

/// Feature 01 & 04: Advanced Stress Testing Screen with Native Interactive Swift Charts.
/// Includes Graph A (Before vs After), Graph B (Loss by Scenario), Graph C (Stock Loss Contribution),
/// and Graph D (Continuous Portfolio Decline Curve).
struct StressTestView: View {
    @ObservedObject var viewModel: ResilienceViewModel
    @State private var sliderDecline: Double = 15.0
    @State private var selectedGraphTab: Int = 0
    @State private var isShowingCompareSheet: Bool = false
    
    var report: ResilienceReport {
        viewModel.currentReport
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: LOSTheme.space24) {
                    // MARK: - Stress Test Engine Mode Picker
                    VStack(alignment: .leading, spacing: LOSTheme.space8) {
                        Text("STRESS TEST ENGINE")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(LOSTheme.textSecondary)
                            .tracking(0.8)
                        
                        Picker("Stress Mode", selection: $viewModel.stressTestMode) {
                            Text("Portfolio-Wide").tag(0)
                            Text("Stock-by-Stock").tag(1)
                        }
                        .pickerStyle(.segmented)
                    }
                    .padding(.horizontal)
                    .padding(.top, LOSTheme.space4)
                    
                    // MARK: - Hero Portfolio Overview Card
                    VStack(spacing: LOSTheme.space16) {
                        HStack {
                            VStack(alignment: .leading, spacing: LOSTheme.space4) {
                                Text("PORTFOLIO EXPOSURE")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(LOSTheme.textSecondary)
                                    .tracking(0.8)
                                Text(LOSTheme.formatRupee(viewModel.profile.portfolioValue))
                                    .font(.system(.title, design: .rounded).weight(.bold))
                                    .monospacedDigit()
                                    .foregroundStyle(LOSTheme.textPrimary)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                            }
                            
                            Spacer()
                            
                            StatusPill(
                                text: "−\(String(format: "%.1f%%", report.marketDeclinePercent)) Shock",
                                icon: "arrow.down.right",
                                color: LOSTheme.critical,
                                isProminent: true
                            )
                        }
                        
                        Divider().overlay(LOSTheme.borderHairline)
                        
                        // Retained vs Loss Split
                        HStack(spacing: LOSTheme.space16) {
                            VStack(alignment: .leading, spacing: LOSTheme.space4) {
                                Text("Retained Value")
                                    .font(.caption)
                                    .foregroundStyle(LOSTheme.textSecondary)
                                Text(LOSTheme.formatRupee(report.remainingPortfolioValue))
                                    .font(.headline.weight(.bold))
                                    .monospacedDigit()
                                    .foregroundStyle(LOSTheme.positive)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.8)
                            }
                            
                            Spacer()
                            
                            VStack(alignment: .trailing, spacing: LOSTheme.space4) {
                                Text("Simulated Drawdown")
                                    .font(.caption)
                                    .foregroundStyle(LOSTheme.textSecondary)
                                Text("−\(LOSTheme.formatRupee(report.estimatedPortfolioLoss))")
                                    .font(.headline.weight(.bold))
                                    .monospacedDigit()
                                    .foregroundStyle(LOSTheme.critical)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.8)
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
                    .shadow(color: Color.black.opacity(0.04), radius: 10, y: 4)
                    .padding(.horizontal)
                    
                    // MARK: - Drawdown Visualizer Chart
                    VStack(alignment: .leading, spacing: LOSTheme.space14) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Drawdown Visualizer")
                                .font(.headline.weight(.bold))
                                .foregroundStyle(LOSTheme.textPrimary)
                            Text("Simulated portfolio trajectory under stress")
                                .font(.caption)
                                .foregroundStyle(LOSTheme.textSecondary)
                        }
                        
                        // Chart Selector Tabs (Concise labels to avoid truncation on all screen sizes)
                        Picker("Chart View", selection: $selectedGraphTab) {
                            Text("Compare").tag(0)
                            Text("Scenarios").tag(1)
                            Text("By Stock").tag(2)
                            Text("Curve").tag(3)
                        }
                        .pickerStyle(.segmented)
                        
                        // Active Chart Container
                        Group {
                            switch selectedGraphTab {
                            case 0:
                                GraphABeforeAfterView(
                                    portfolioValue: viewModel.profile.portfolioValue,
                                    remainingValue: report.remainingPortfolioValue,
                                    loss: report.estimatedPortfolioLoss
                                )
                            case 1:
                                GraphBScenarioComparisonView(
                                    portfolioValue: viewModel.profile.portfolioValue,
                                    activeDecline: report.marketDeclinePercent
                                ) { selectedDecline in
                                    viewModel.setCustomDecline(selectedDecline)
                                    sliderDecline = selectedDecline
                                }
                            case 2:
                                GraphCStockContributionView(
                                    items: viewModel.individualLossBreakdown,
                                    totalLoss: viewModel.totalIndividualStockLoss
                                )
                            default:
                                GraphDDeclineCurveView(
                                    portfolioValue: viewModel.profile.portfolioValue,
                                    currentDecline: report.marketDeclinePercent
                                )
                            }
                        }
                        .padding(.top, LOSTheme.space4)
                    }
                    .padding(LOSTheme.space20)
                    .background(LOSTheme.surface)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                    .padding(.horizontal)
                    
                    // MARK: - Mode A Shock Controls (Portfolio-Wide)
                    if viewModel.stressTestMode == 0 {
                        VStack(alignment: .leading, spacing: LOSTheme.space16) {
                            Text("MARKET DECLINE SCENARIO")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(LOSTheme.textSecondary)
                                .tracking(0.8)
                            
                            SegmentedShockPicker(selected: $viewModel.selectedScenario) { level in
                                viewModel.selectScenario(level)
                                sliderDecline = level.percentage
                            }
                            
                            // Fine-tune Slider
                            VStack(alignment: .leading, spacing: LOSTheme.space8) {
                                HStack {
                                    Text("Custom Shock Slider")
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(LOSTheme.textPrimary)
                                    Spacer()
                                    Text("−\(Int(sliderDecline))%")
                                        .font(.headline.weight(.bold))
                                        .monospacedDigit()
                                        .foregroundStyle(LOSTheme.critical)
                                        .contentTransition(.numericText())
                                }
                                
                                Slider(value: $sliderDecline, in: 1...60, step: 1) {
                                    Text("Market Decline")
                                }
                                .tint(LOSTheme.critical)
                                .accessibilityLabel("Market Shock Decline Percentage")
                                .accessibilityValue("\(Int(sliderDecline)) percent")
                                .onChange(of: sliderDecline) { _, val in
                                    viewModel.setCustomDecline(val)
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
                        .padding(.horizontal)
                    }
                    
                    // MARK: - Mode B Shock Controls (Individual Stock Shocks)
                    if viewModel.stressTestMode == 1 {
                        VStack(alignment: .leading, spacing: LOSTheme.space16) {
                            HStack {
                                Text("INDIVIDUAL STOCK SHOCKS")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(LOSTheme.textSecondary)
                                    .tracking(0.8)
                                Spacer()
                                Button {
                                    viewModel.isShowingWhatIfSheet = true
                                } label: {
                                    HStack(spacing: 4) {
                                        Image(systemName: "plus.circle.fill")
                                        Text("Simulate New Stock")
                                    }
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(LOSTheme.positive)
                                }
                                
                                Button("Reset") {
                                    viewModel.resetIndividualStockDeclines()
                                }
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(LOSTheme.textSecondary)
                            }
                            
                            // Top Loss Contributor Highlight Card
                            if let top = viewModel.individualLossBreakdown.first, top.simulatedLoss > 0 {
                                HStack(spacing: LOSTheme.space12) {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .font(.title3)
                                        .foregroundStyle(LOSTheme.warning)
                                    
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Top Contributor: \(top.holding.ticker)")
                                            .font(.subheadline.weight(.bold))
                                            .foregroundStyle(LOSTheme.textPrimary)
                                        Text("\(String(format: "%.0f%%", top.lossContributionPercent)) of total drawdown (−\(LOSTheme.formatRupee(top.simulatedLoss)))")
                                            .font(.caption)
                                            .foregroundStyle(LOSTheme.textSecondary)
                                            .lineLimit(1)
                                    }
                                    Spacer()
                                }
                                .padding(LOSTheme.space12)
                                .background(LOSTheme.warning.opacity(0.12))
                                .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                            }
                            
                            if viewModel.profile.activeHoldings.isEmpty {
                                Text("No holdings configured. Add stocks in Portfolio Management to run individual stress tests.")
                                    .font(.subheadline)
                                    .foregroundStyle(LOSTheme.textSecondary)
                                    .padding(.vertical, LOSTheme.space8)
                            } else {
                                ForEach(viewModel.individualLossBreakdown) { item in
                                    IndividualStockShockCard(
                                        item: item,
                                        onShockChange: { newDecline in
                                            viewModel.setIndividualStockDecline(ticker: item.holding.ticker, percentage: newDecline)
                                        }
                                    )
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
                        .padding(.horizontal)
                    }
                    
                    // MARK: - Cascading Liquidity & Runway Impact Card
                    VStack(alignment: .leading, spacing: LOSTheme.space16) {
                        SectionHeader(
                            title: "Cascading Runway Impact",
                            subtitle: "Projected liquidity under active market shock"
                        )
                        
                        LazyVGrid(
                            columns: [GridItem(.flexible(), spacing: LOSTheme.space12), GridItem(.flexible(), spacing: LOSTheme.space12)],
                            spacing: LOSTheme.space12
                        ) {
                            StatTile(
                                title: "Post-Shock Cash",
                                value: LOSTheme.formatRupee(report.remainingCashAfterEmergency),
                                subtitle: "After unexpected drain",
                                icon: "banknote",
                                tint: report.remainingCashAfterEmergency < 0 ? LOSTheme.critical : LOSTheme.positive,
                                isNegative: report.remainingCashAfterEmergency < 0
                            )
                            
                            StatTile(
                                title: "Monthly Burn",
                                value: "\(LOSTheme.formatRupee(report.monthlyNetBurn))/mo",
                                subtitle: "Outflow vs income",
                                icon: "flame.fill",
                                tint: LOSTheme.warning
                            )
                            
                            StatTile(
                                title: "Cash Runway",
                                value: report.runwayState == .cashSurplus ? "Surplus" : "\(String(format: "%.1f", report.runwayMonths)) mos",
                                subtitle: "Before liquidation",
                                icon: "hourglass",
                                tint: report.runwayMonths < 3.0 ? LOSTheme.critical : LOSTheme.positive,
                                isNegative: report.runwayMonths < 3.0
                            )
                            
                            StatTile(
                                title: "Stress Score",
                                value: "\(report.resilienceScore)/100",
                                subtitle: report.resilienceBand.rawValue,
                                icon: "shield.fill",
                                tint: report.resilienceBand.color,
                                isNegative: report.resilienceScore < 50
                            )
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom, LOSTheme.space32 + 24)
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .background(LOSTheme.backgroundGradient.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: LOSTheme.space8) {
                        Button {
                            viewModel.isShowingWhatIfSheet = true
                        } label: {
                            HStack(spacing: LOSTheme.space4) {
                                Image(systemName: "wand.and.stars")
                                Text("Simulate Stock")
                                    .font(.caption.weight(.semibold))
                            }
                            .padding(.horizontal, LOSTheme.space12)
                            .padding(.vertical, LOSTheme.space6)
                            .background(LOSTheme.positive.opacity(0.12))
                            .foregroundStyle(LOSTheme.positive)
                            .clipShape(Capsule())
                        }
                        
                        Button {
                            isShowingCompareSheet = true
                        } label: {
                            HStack(spacing: LOSTheme.space4) {
                                Image(systemName: "rectangle.split.3x1")
                                Text("Compare")
                                    .font(.caption.weight(.semibold))
                            }
                            .padding(.horizontal, LOSTheme.space12)
                            .padding(.vertical, LOSTheme.space6)
                            .background(LOSTheme.accent.opacity(0.12))
                            .foregroundStyle(LOSTheme.accent)
                            .clipShape(Capsule())
                        }
                    }
                }
            }
            .sheet(isPresented: $isShowingCompareSheet) {
                ScenarioCompareView(viewModel: viewModel)
            }
            .sheet(isPresented: $viewModel.isShowingWhatIfSheet) {
                WhatIfStockSimulatorView(viewModel: viewModel)
            }
            .onAppear {
                sliderDecline = viewModel.currentDeclinePercentage
            }
        }
    }
}

// MARK: - Graph A: Before vs After Bar Chart
private struct GraphABeforeAfterView: View {
    let portfolioValue: Double
    let remainingValue: Double
    let loss: Double
    
    struct ValueBarItem: Identifiable {
        let id: String
        let category: String
        let amount: Double
        let color: Color
    }
    
    var items: [ValueBarItem] {
        [
            ValueBarItem(id: "pre", category: "Pre-Shock", amount: portfolioValue, color: LOSTheme.accent),
            ValueBarItem(id: "rem", category: "Remaining", amount: remainingValue, color: LOSTheme.positive),
            ValueBarItem(id: "loss", category: "Loss", amount: loss, color: LOSTheme.critical)
        ]
    }
    
    var maxY: Double {
        max(10_000, max(portfolioValue, max(remainingValue, loss)) * 1.20)
    }
    
    var body: some View {
        if portfolioValue <= 0 {
            ContentUnavailableView {
                Label("No Portfolio Data", systemImage: "chart.bar.xaxis")
                    .font(.subheadline)
            } description: {
                Text("Add investments in Edit Finances to view drawdown comparisons.")
                    .font(.caption)
            }
            .frame(height: 180)
        } else {
            Chart(items) { item in
                BarMark(
                    x: .value("Stage", item.category),
                    y: .value("Rupees", item.amount)
                )
                .foregroundStyle(item.color)
                .clipShape(.rect(cornerRadius: 8, style: .continuous))
                .annotation(position: .top, spacing: 4) {
                    Text(LOSTheme.formatRupeeCompact(item.amount))
                        .font(.caption2.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(item.color)
                }
            }
            .frame(height: 200)
            .chartYScale(domain: 0...maxY)
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisGridLine().foregroundStyle(LOSTheme.borderHairline)
                    if let num = value.as(Double.self) {
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
            .accessibilityLabel("Drawdown comparison: Pre-shock \(LOSTheme.formatRupee(portfolioValue)), remaining \(LOSTheme.formatRupee(remainingValue)), loss \(LOSTheme.formatRupee(loss))")
        }
    }
}

// MARK: - Graph B: Loss by Scenario Comparison Bar Chart
private struct GraphBScenarioComparisonView: View {
    let portfolioValue: Double
    let activeDecline: Double
    let onSelectScenario: (Double) -> Void
    
    var points: [ResilienceEngine.ScenarioComparisonPoint] {
        ResilienceEngine.calculateScenarioComparisons(portfolioValue: portfolioValue, activeDecline: activeDecline)
    }
    
    var maxY: Double {
        let maxLoss = points.map(\.loss).max() ?? 10_000
        return max(10_000, maxLoss * 1.22)
    }
    
    var body: some View {
        if portfolioValue <= 0 {
            ContentUnavailableView {
                Label("No Portfolio Data", systemImage: "chart.bar.fill")
                    .font(.subheadline)
            } description: {
                Text("Add investments to compare shock scenarios.")
                    .font(.caption)
            }
            .frame(height: 180)
        } else {
            Chart(points) { point in
                BarMark(
                    x: .value("Scenario", point.scenarioName),
                    y: .value("Loss", point.loss)
                )
                .foregroundStyle(point.isSelected ? LOSTheme.critical : LOSTheme.critical.opacity(0.35))
                .clipShape(.rect(cornerRadius: 8, style: .continuous))
                .annotation(position: .top, spacing: 4) {
                    Text("−\(LOSTheme.formatRupeeCompact(point.loss))")
                        .font(.caption2.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(point.isSelected ? LOSTheme.critical : LOSTheme.textSecondary)
                }
            }
            .frame(height: 200)
            .chartYScale(domain: 0...maxY)
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisGridLine().foregroundStyle(LOSTheme.borderHairline)
                    if let num = value.as(Double.self) {
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
            .accessibilityLabel("Loss comparison across Mild, Stress, and Severe scenarios")
        }
    }
}

// MARK: - Graph C: Individual Stock Loss Contribution Chart
private struct GraphCStockContributionView: View {
    let items: [ResilienceViewModel.IndividualStockLossItem]
    let totalLoss: Double
    
    var maxX: Double {
        let maxVal = items.map(\.simulatedLoss).max() ?? 10_000
        return max(10_000, maxVal * 1.25)
    }
    
    var body: some View {
        if items.isEmpty {
            ContentUnavailableView {
                Label("No Stock Holdings", systemImage: "chart.pie")
                    .font(.subheadline)
            } description: {
                Text("Add stock holdings in Portfolio Management to view simulated losses.")
                    .font(.caption)
            }
            .frame(height: 180)
        } else {
            let chartHeight = CGFloat(max(150, min(300, items.count * 44 + 40)))
            
            Chart(items) { item in
                BarMark(
                    x: .value("Simulated Loss", item.simulatedLoss),
                    y: .value("Stock", item.holding.ticker)
                )
                .foregroundStyle(LOSTheme.critical.opacity(0.85))
                .clipShape(.rect(cornerRadius: 6, style: .continuous))
                .annotation(position: .trailing, spacing: 6) {
                    Text("\(String(format: "%.1f%%", item.lossContributionPercent))")
                        .font(.caption2.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(LOSTheme.critical)
                }
            }
            .frame(height: chartHeight)
            .chartXScale(domain: 0...maxX)
            .chartXAxis {
                AxisMarks(position: .bottom) { value in
                    AxisGridLine().foregroundStyle(LOSTheme.borderHairline)
                    if let num = value.as(Double.self) {
                        AxisValueLabel {
                            Text(LOSTheme.formatRupeeCompact(num))
                                .font(.caption2)
                                .foregroundStyle(LOSTheme.textSecondary)
                        }
                    }
                }
            }
            .chartYAxis {
                AxisMarks { _ in
                    AxisValueLabel()
                        .font(.caption.weight(.bold))
                        .foregroundStyle(LOSTheme.textPrimary)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Stock loss contribution chart with \(items.count) holdings")
        }
    }
}

// MARK: - Graph D: Continuous Portfolio Decline Curve Area Chart
private struct GraphDDeclineCurveView: View {
    let portfolioValue: Double
    let currentDecline: Double
    
    var curvePoints: [ResilienceEngine.DeclineCurvePoint] {
        ResilienceEngine.calculateDeclineCurve(portfolioValue: portfolioValue)
    }
    
    var activeRemaining: Double {
        max(0, portfolioValue * (1.0 - (currentDecline / 100.0)))
    }
    
    var maxDomainX: Double {
        max(60.0, currentDecline + 10.0)
    }
    
    var body: some View {
        if portfolioValue <= 0 {
            ContentUnavailableView {
                Label("No Portfolio Data", systemImage: "chart.line.downtrend.xyaxis")
                    .font(.subheadline)
            } description: {
                Text("Add investments to view continuous portfolio decline curve.")
                    .font(.caption)
            }
            .frame(height: 180)
        } else {
            Chart {
                // Area Under Curve
                ForEach(curvePoints) { point in
                    AreaMark(
                        x: .value("Shock %", point.declinePercent),
                        y: .value("Remaining Value", point.remainingPortfolio)
                    )
                    .foregroundStyle(
                        LinearGradient(
                            colors: [LOSTheme.positive.opacity(0.35), LOSTheme.positive.opacity(0.04)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                }
                
                // Continuous Curve Line
                ForEach(curvePoints) { point in
                    LineMark(
                        x: .value("Shock %", point.declinePercent),
                        y: .value("Remaining Value", point.remainingPortfolio)
                    )
                    .foregroundStyle(LOSTheme.positive)
                    .lineStyle(StrokeStyle(lineWidth: 2.5))
                }
                
                // Active Shock Vertical Marker Rule
                RuleMark(x: .value("Current Shock", currentDecline))
                    .foregroundStyle(LOSTheme.critical)
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 4]))
                    .annotation(position: currentDecline > 25 ? .topLeading : .topTrailing, spacing: 4) {
                        Text("\(Int(currentDecline))% Shock: \(LOSTheme.formatRupeeCompact(activeRemaining))")
                            .font(.caption2.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(LOSTheme.critical)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(LOSTheme.surface)
                            .clipShape(.rect(cornerRadius: 6, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .stroke(LOSTheme.critical.opacity(0.4), lineWidth: 1)
                            )
                    }
                
                // Active Point Marker
                PointMark(
                    x: .value("Current Shock", currentDecline),
                    y: .value("Current Remaining", activeRemaining)
                )
                .foregroundStyle(LOSTheme.critical)
                .symbolSize(45)
            }
            .frame(height: 200)
            .chartXScale(domain: 0...maxDomainX)
            .chartXAxis {
                AxisMarks(values: [0, 15, 30, 45, 60]) { val in
                    AxisGridLine().foregroundStyle(LOSTheme.borderHairline)
                    if let num = val.as(Int.self) {
                        AxisValueLabel {
                            Text("\(num)%")
                                .font(.caption2)
                                .foregroundStyle(LOSTheme.textSecondary)
                        }
                    }
                }
            }
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
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Continuous decline curve from 0 to 60 percent shock, current shock \(Int(currentDecline)) percent")
        }
    }
}

/// Card row for adjusting individual stock shock percentages.
private struct IndividualStockShockCard: View {
    let item: ResilienceViewModel.IndividualStockLossItem
    let onShockChange: (Double) -> Void
    
    @State private var shockPercent: Double = 15.0
    
    var body: some View {
        VStack(spacing: LOSTheme.space8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: LOSTheme.space6) {
                        Text(item.holding.ticker)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(LOSTheme.textPrimary)
                        Text(item.holding.companyName)
                            .font(.caption)
                            .foregroundStyle(LOSTheme.textSecondary)
                            .lineLimit(1)
                    }
                    Text("Value: \(LOSTheme.formatRupee(item.holding.currentValue)) (\(String(format: "%.0f%%", item.holding.portfolioWeightPercent)))")
                        .font(.caption2)
                        .foregroundStyle(LOSTheme.textSecondary)
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 2) {
                    Text("−\(Int(shockPercent))%")
                        .font(.headline.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(shockPercent > 0 ? LOSTheme.critical : LOSTheme.textSecondary)
                    Text("Loss: −\(LOSTheme.formatRupee(item.simulatedLoss))")
                        .font(.caption2.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(LOSTheme.critical)
                }
            }
            
            Slider(value: $shockPercent, in: 0...60, step: 5)
                .tint(LOSTheme.critical)
                .onChange(of: shockPercent) { _, val in
                    onShockChange(val)
                }
        }
        .padding(LOSTheme.space12)
        .background(LOSTheme.surfaceElevated)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
        .onAppear {
            shockPercent = item.assumedDecline
        }
    }
}

#Preview("Stress Test View") {
    let vm = ResilienceViewModel()
    StressTestView(viewModel: vm)
}
