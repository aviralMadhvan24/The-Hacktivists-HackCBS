import SwiftUI

/// Feature: What-If NSE & BSE Stock Simulator.
/// Allows users to model adding any NSE or BSE stock to evaluate portfolio drawdown,
/// concentration risk, and resilience score impact before committing real capital.
struct WhatIfStockSimulatorView: View {
    @ObservedObject var viewModel: ResilienceViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var searchQuery: String = ""
    @State private var selectedExchange: String = "ALL" // "ALL", "NSE", "BSE"
    @State private var isShowingCustomEntry: Bool = false
    @State private var liveQuotesCache: [String: StockQuotePayload] = [:]
    @State private var isLoadingQuotes: Bool = false
    @State private var showRemoveConfirmation: Bool = false
    @State private var toastBannerMessage: String? = nil
    
    private var result: WhatIfSimulationResult {
        viewModel.whatIfSimulationResult
    }
    
    private var searchResults: [StockCatalogItem] {
        IndianStockDirectory.shared.search(
            query: searchQuery,
            exchangeFilter: selectedExchange == "ALL" ? nil : selectedExchange
        )
    }
    
    var body: some View {
        NavigationStack {
            ScrollViewReader { scrollProxy in
                ScrollView {
                    VStack(spacing: LOSTheme.space20) {
                    
                    // MARK: - Hero Explanation Banner
                    VStack(alignment: .leading, spacing: LOSTheme.space8) {
                        HStack {
                            Image(systemName: "wand.and.stars")
                                .font(.title3)
                                .foregroundStyle(LOSTheme.accent)
                            Text("WHAT-IF STOCK SIMULATOR")
                                .font(.footnote.weight(.bold))
                                .foregroundStyle(LOSTheme.accent)
                                .tracking(0.8)
                            Spacer()
                            Text("Hypothetical")
                                .font(.caption2.weight(.bold))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(LOSTheme.accent.opacity(0.15))
                                .foregroundStyle(LOSTheme.accent)
                                .clipShape(Capsule())
                        }
                        
                        Text("Simulate how buying any NSE or BSE stock impacts your portfolio drawdown, diversification, and resilience score during a crash.")
                            .font(.subheadline)
                            .foregroundStyle(LOSTheme.textSecondary)
                    }
                    .padding(LOSTheme.space16)
                    .background(LOSTheme.surface)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                    .padding(.horizontal)
                    
                    // MARK: - Stock Picker & Search Section
                    VStack(alignment: .leading, spacing: LOSTheme.space12) {
                        Text("1. CHOOSE AN NSE / BSE STOCK")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(LOSTheme.textSecondary)
                            .tracking(0.8)
                        
                        // Exchange Filter Tabs
                        Picker("Exchange", selection: $selectedExchange) {
                            Text("All").tag("ALL")
                            Text("NSE").tag("NSE")
                            Text("BSE").tag("BSE")
                        }
                        .pickerStyle(.segmented)
                        
                        // Quick Featured Chips
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: LOSTheme.space8) {
                                ForEach(IndianStockDirectory.shared.featuredPicks) { stock in
                                    let quote = liveQuotesCache[stock.symbol]
                                    Button {
                                        viewModel.selectWhatIfStock(catalogItem: stock)
                                        if let q = quote {
                                            viewModel.whatIfPrice = q.currentPrice
                                            viewModel.whatIfPriceChangePercent = q.changePercent
                                            viewModel.whatIfPriceFreshness = "Live \(stock.exchange)"
                                        }
                                    } label: {
                                        HStack(spacing: 4) {
                                            Text(stock.symbol)
                                                .font(.caption.weight(.bold))
                                                .fontDesign(.monospaced)
                                            Text("(\(stock.exchange))")
                                                .font(.caption2)
                                                .foregroundStyle(LOSTheme.textSecondary)
                                            if let pct = quote?.changePercent {
                                                Text(String(format: "%@%.1f%%", pct >= 0 ? "+" : "", pct))
                                                    .font(.system(size: 8, weight: .bold))
                                                    .foregroundStyle(pct >= 0 ? LOSTheme.positive : LOSTheme.critical)
                                            }
                                        }
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 6)
                                        .background(viewModel.whatIfTicker == stock.symbol ? LOSTheme.accent.opacity(0.2) : LOSTheme.surfaceElevated)
                                        .foregroundStyle(viewModel.whatIfTicker == stock.symbol ? LOSTheme.accent : LOSTheme.textPrimary)
                                        .clipShape(Capsule())
                                        .overlay(
                                            Capsule()
                                                .stroke(viewModel.whatIfTicker == stock.symbol ? LOSTheme.accent : LOSTheme.borderHairline, lineWidth: 1)
                                        )
                                    }
                                }
                            }
                        }
                        
                        // Search Field
                        HStack {
                            Image(systemName: "magnifyingglass")
                                .foregroundStyle(LOSTheme.textSecondary)
                            TextField("Search symbol or company (e.g. ZOMATO, TCS)", text: $searchQuery)
                                .textInputAutocapitalization(.characters)
                            if !searchQuery.isEmpty {
                                Button {
                                    searchQuery = ""
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(LOSTheme.textSecondary)
                                }
                            }
                        }
                        .padding(LOSTheme.space12)
                        .background(LOSTheme.surfaceElevated)
                        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                        
                        // Search Results Dropdown (if searching)
                        if !searchQuery.isEmpty {
                            VStack(spacing: 0) {
                                ForEach(searchResults.prefix(6)) { stock in
                                    let quote = liveQuotesCache[stock.symbol]
                                    let livePrice = quote?.currentPrice ?? stock.defaultPrice
                                    let changePct = quote?.changePercent
                                    
                                    Button {
                                        viewModel.selectWhatIfStock(catalogItem: stock)
                                        if let q = quote {
                                            viewModel.whatIfPrice = q.currentPrice
                                            viewModel.whatIfPriceChangePercent = q.changePercent
                                            viewModel.whatIfPriceFreshness = "Live \(stock.exchange)"
                                        }
                                        searchQuery = ""
                                    } label: {
                                        HStack {
                                            VStack(alignment: .leading, spacing: 2) {
                                                HStack(spacing: 6) {
                                                    Text(stock.symbol)
                                                        .font(.subheadline.weight(.bold))
                                                        .fontDesign(.monospaced)
                                                        .foregroundStyle(LOSTheme.textPrimary)
                                                    Text(stock.exchange)
                                                        .font(.caption2.weight(.bold))
                                                        .padding(.horizontal, 5)
                                                        .padding(.vertical, 1)
                                                        .background(LOSTheme.accent.opacity(0.12))
                                                        .foregroundStyle(LOSTheme.accent)
                                                        .clipShape(Capsule())
                                                }
                                                Text(stock.name)
                                                    .font(.caption)
                                                    .foregroundStyle(LOSTheme.textSecondary)
                                                    .lineLimit(1)
                                            }
                                            Spacer()
                                            VStack(alignment: .trailing, spacing: 2) {
                                                Text(LOSTheme.formatRupee(livePrice))
                                                    .font(.subheadline.weight(.semibold))
                                                    .fontDesign(.rounded)
                                                    .foregroundStyle(LOSTheme.textPrimary)
                                                if let pct = changePct {
                                                    Text(String(format: "%@%.2f%%", pct >= 0 ? "+" : "", pct))
                                                        .font(.caption2.weight(.bold))
                                                        .foregroundStyle(pct >= 0 ? LOSTheme.positive : LOSTheme.critical)
                                                } else {
                                                    Text(stock.sector)
                                                        .font(.caption2)
                                                        .foregroundStyle(LOSTheme.textSecondary)
                                                }
                                            }
                                        }
                                        .padding(.vertical, 10)
                                        .padding(.horizontal, 12)
                                    }
                                    Divider().overlay(LOSTheme.borderHairline)
                                }
                            }
                            .background(LOSTheme.surfaceElevated)
                            .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                        }
                        
                        // Active Selected Stock Card
                        HStack(spacing: LOSTheme.space12) {
                            ZStack {
                                Circle()
                                    .fill(LOSTheme.accent.opacity(0.15))
                                    .frame(width: 44, height: 44)
                                Text(String(viewModel.whatIfTicker.prefix(2)))
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(LOSTheme.accent)
                            }
                            
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(viewModel.whatIfTicker)
                                        .font(.headline.weight(.bold))
                                        .fontDesign(.monospaced)
                                        .foregroundStyle(LOSTheme.textPrimary)
                                        .lineLimit(1)
                                    Text(viewModel.whatIfExchange)
                                        .font(.caption2.weight(.bold))
                                        .lineLimit(1)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(LOSTheme.positive.opacity(0.14))
                                        .foregroundStyle(LOSTheme.positive)
                                        .clipShape(Capsule())
                                }
                                .fixedSize(horizontal: true, vertical: false)
                                Text(viewModel.whatIfCompanyName)
                                    .font(.caption)
                                    .foregroundStyle(LOSTheme.textSecondary)
                                    .lineLimit(1)
                            }
                            .layoutPriority(1)
                            Spacer()
                            VStack(alignment: .trailing, spacing: 3) {
                                HStack(spacing: 4) {
                                    if viewModel.isFetchingWhatIfPrice {
                                        ProgressView()
                                            .scaleEffect(0.6)
                                    }
                                    Text(LOSTheme.formatRupee(viewModel.whatIfPrice))
                                        .font(.headline.weight(.bold))
                                        .fontDesign(.rounded)
                                        .foregroundStyle(LOSTheme.textPrimary)
                                }
                                
                                HStack(spacing: 3) {
                                    Circle()
                                        .fill(viewModel.whatIfPriceFreshness.contains("Live") ? LOSTheme.positive : LOSTheme.warning)
                                        .frame(width: 5, height: 5)
                                    Text(viewModel.whatIfPriceFreshness)
                                        .font(.system(size: 8.5, weight: .bold))
                                        .foregroundStyle(viewModel.whatIfPriceFreshness.contains("Live") ? LOSTheme.positive : LOSTheme.textSecondary)
                                        .lineLimit(1)
                                    
                                    if let pct = viewModel.whatIfPriceChangePercent {
                                        Text(String(format: "%@%.2f%%", pct >= 0 ? "+" : "", pct))
                                            .font(.system(size: 8.5, weight: .bold))
                                            .foregroundStyle(pct >= 0 ? LOSTheme.positive : LOSTheme.critical)
                                            .lineLimit(1)
                                    }
                                    
                                    Button {
                                        Task { await viewModel.fetchLiveWhatIfPrice() }
                                    } label: {
                                        Image(systemName: "arrow.clockwise")
                                            .font(.system(size: 8, weight: .bold))
                                            .foregroundStyle(LOSTheme.textSecondary)
                                    }
                                }
                                .fixedSize(horizontal: true, vertical: false)
                                
                                Text(viewModel.whatIfSector)
                                    .font(.caption2)
                                    .foregroundStyle(LOSTheme.textSecondary)
                            }
                        }
                        .padding(LOSTheme.space12)
                        .background(LOSTheme.surfaceElevated)
                        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                        
                        // Active Portfolio Indicator (if stock already owned)
                        if let existing = viewModel.getHolding(ticker: viewModel.whatIfTicker) {
                            HStack(spacing: 8) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(LOSTheme.positive)
                                    .font(.subheadline)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Currently in Active Portfolio")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(LOSTheme.positive)
                                    Text("\(existing.shares) shares owned @ \(LOSTheme.formatRupee(existing.averageBuyPrice)) avg • Total \(LOSTheme.formatRupee(existing.currentValue))")
                                        .font(.caption2)
                                        .foregroundStyle(LOSTheme.textSecondary)
                                }
                                Spacer()
                            }
                            .padding(LOSTheme.space10)
                            .background(LOSTheme.positive.opacity(0.12))
                            .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: LOSTheme.radiusSmall, style: .continuous)
                                    .stroke(LOSTheme.positive.opacity(0.3), lineWidth: 1)
                            )
                        }
                    }
                    .padding(LOSTheme.space16)
                    .background(LOSTheme.surface)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                    .padding(.horizontal)
                    
                    // MARK: - Simulation Inputs (Shares & Crash Scenario)
                    VStack(alignment: .leading, spacing: LOSTheme.space16) {
                        Text("2. SIMULATION PARAMETERS")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(LOSTheme.textSecondary)
                            .tracking(0.8)
                        
                        // Shares Count Stepper & Slider
                        VStack(alignment: .leading, spacing: LOSTheme.space8) {
                            HStack {
                                Text("Hypothetical Position")
                                    .font(.subheadline)
                                    .foregroundStyle(LOSTheme.textSecondary)
                                Spacer()
                                Text("\(viewModel.whatIfShares) Shares")
                                    .font(.headline.weight(.bold))
                                    .fontDesign(.rounded)
                                    .foregroundStyle(LOSTheme.textPrimary)
                            }
                            
                            Slider(value: Binding(
                                get: { Double(viewModel.whatIfShares) },
                                set: { viewModel.whatIfShares = Int($0) }
                            ), in: 1...500, step: 5)
                            .tint(LOSTheme.accent)
                            
                            HStack {
                                Text("Simulated Outlay:")
                                    .font(.caption)
                                    .foregroundStyle(LOSTheme.textSecondary)
                                Text(LOSTheme.formatRupee(viewModel.whatIfInvestmentAmount))
                                    .font(.caption.weight(.bold))
                                    .fontDesign(.rounded)
                                    .foregroundStyle(LOSTheme.accent)
                                Spacer()
                                Text("Weight: \(String(format: "%.1f%%", result.newHoldingWeight))")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(result.isConcentrationHeavy ? LOSTheme.warning : LOSTheme.textSecondary)
                            }
                        }
                        
                        Divider().overlay(LOSTheme.borderHairline)
                        
                        // Live Buy Price Fine-Tuning
                        VStack(alignment: .leading, spacing: LOSTheme.space8) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Simulated Buy Price")
                                        .font(.subheadline)
                                        .foregroundStyle(LOSTheme.textSecondary)
                                    HStack(spacing: 4) {
                                        Circle()
                                            .fill(viewModel.whatIfPriceFreshness.contains("Live") ? LOSTheme.positive : LOSTheme.warning)
                                            .frame(width: 5, height: 5)
                                        Text(viewModel.whatIfPriceFreshness)
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(viewModel.whatIfPriceFreshness.contains("Live") ? LOSTheme.positive : LOSTheme.textSecondary)
                                    }
                                }
                                
                                Spacer()
                                
                                HStack(spacing: 6) {
                                    Button {
                                        if viewModel.whatIfPrice > 5 {
                                            viewModel.whatIfPrice = max(1.0, round((viewModel.whatIfPrice - 5) * 10) / 10)
                                        }
                                    } label: {
                                        Image(systemName: "minus.circle.fill")
                                            .font(.title3)
                                            .foregroundStyle(LOSTheme.textSecondary)
                                    }
                                    
                                    Text(LOSTheme.formatRupee(viewModel.whatIfPrice))
                                        .font(.headline.weight(.bold))
                                        .fontDesign(.rounded)
                                        .foregroundStyle(LOSTheme.textPrimary)
                                    
                                    Button {
                                        viewModel.whatIfPrice = round((viewModel.whatIfPrice + 5) * 10) / 10
                                    } label: {
                                        Image(systemName: "plus.circle.fill")
                                            .font(.title3)
                                            .foregroundStyle(LOSTheme.textSecondary)
                                    }
                                    
                                    Button {
                                        Task { await viewModel.fetchLiveWhatIfPrice() }
                                    } label: {
                                        Image(systemName: "arrow.counterclockwise.circle.fill")
                                            .font(.title3)
                                            .foregroundStyle(LOSTheme.accent)
                                    }
                                }
                            }
                        }
                        
                        Divider().overlay(LOSTheme.borderHairline)
                        
                        // Market Crash Scenario
                        VStack(alignment: .leading, spacing: LOSTheme.space8) {
                            HStack {
                                Text("Simulated Market Shock")
                                    .font(.subheadline)
                                    .foregroundStyle(LOSTheme.textSecondary)
                                Spacer()
                                StatusPill(
                                    text: "−\(String(format: "%.0f%%", viewModel.whatIfSimulatedDecline)) Drawdown",
                                    icon: "arrow.down.right",
                                    color: LOSTheme.critical,
                                    isProminent: true
                                )
                            }
                            
                            Picker("Shock Scenario", selection: $viewModel.whatIfSimulatedDecline) {
                                Text("Mild (-10%)").tag(10.0)
                                Text("Stress (-25%)").tag(25.0)
                                Text("Severe (-40%)").tag(40.0)
                            }
                            .pickerStyle(.segmented)
                        }
                    }
                    .padding(LOSTheme.space16)
                    .background(LOSTheme.surface)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                    .padding(.horizontal)
                    
                    // MARK: - Simulation Results (Before vs After)
                    VStack(alignment: .leading, spacing: LOSTheme.space16) {
                        Text("3. SIMULATED IMPACT ON RESILIENCE")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(LOSTheme.textSecondary)
                            .tracking(0.8)
                        
                        // Score Comparison Card
                        HStack(spacing: LOSTheme.space12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("CURRENT SCORE")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(LOSTheme.textSecondary)
                                Text("\(Int(result.baselineResilienceScore))/100")
                                    .font(.title2.weight(.bold))
                                    .fontDesign(.rounded)
                                    .foregroundStyle(LOSTheme.textPrimary)
                            }
                            
                            Spacer()
                            Image(systemName: "arrow.right")
                                .font(.headline)
                                .foregroundStyle(LOSTheme.textSecondary)
                            Spacer()
                            
                            VStack(alignment: .trailing, spacing: 4) {
                                Text("SIMULATED SCORE")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(LOSTheme.textSecondary)
                                HStack(spacing: 4) {
                                    Text("\(Int(result.newResilienceScore))/100")
                                        .font(.title2.weight(.bold))
                                        .fontDesign(.rounded)
                                        .foregroundStyle(result.scoreDelta >= 0 ? LOSTheme.positive : LOSTheme.critical)
                                    Text("(\(String(format: "%+.1f", result.scoreDelta)))")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(result.scoreDelta >= 0 ? LOSTheme.positive : LOSTheme.critical)
                                }
                            }
                        }
                        .padding(LOSTheme.space12)
                        .background(LOSTheme.surfaceElevated)
                        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                        
                        // Drawdown Breakdown
                        HStack(spacing: LOSTheme.space12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("BASELINE DRAWDOWN")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(LOSTheme.textSecondary)
                                Text("−\(LOSTheme.formatRupee(result.baselineEstimatedLoss))")
                                    .font(.headline.weight(.bold))
                                    .fontDesign(.rounded)
                                    .foregroundStyle(LOSTheme.textPrimary)
                            }
                            
                            Spacer()
                            
                            VStack(alignment: .trailing, spacing: 4) {
                                Text("SIMULATED DRAWDOWN")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(LOSTheme.textSecondary)
                                Text("−\(LOSTheme.formatRupee(result.newEstimatedLoss))")
                                    .font(.headline.weight(.bold))
                                    .fontDesign(.rounded)
                                    .foregroundStyle(LOSTheme.critical)
                            }
                        }
                        .padding(LOSTheme.space12)
                        .background(LOSTheme.surfaceElevated)
                        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                        
                        // Impact summary text
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: result.isConcentrationHeavy ? "exclamationmark.triangle.fill" : "info.circle.fill")
                                .font(.caption)
                                .foregroundStyle(result.isConcentrationHeavy ? LOSTheme.warning : LOSTheme.accent)
                                .padding(.top, 2)
                            
                            VStack(alignment: .leading, spacing: 2) {
                                Text(result.scoreImpactDescription)
                                    .font(.caption)
                                    .foregroundStyle(LOSTheme.textPrimary)
                                if result.isConcentrationHeavy {
                                    Text("Warning: This position would represent \(String(format: "%.1f%%", result.newHoldingWeight)) of your portfolio, exceeding safe concentration thresholds.")
                                        .font(.caption2)
                                        .foregroundStyle(LOSTheme.warning)
                                }
                            }
                        }
                        .padding(LOSTheme.space10)
                        .background(result.isConcentrationHeavy ? LOSTheme.warning.opacity(0.10) : LOSTheme.accent.opacity(0.08))
                        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                    }
                    .padding(LOSTheme.space16)
                    .background(LOSTheme.surface)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                    .padding(.horizontal)
                    
                    // MARK: - Action Buttons
                    VStack(spacing: LOSTheme.space12) {
                        if let existing = viewModel.getHolding(ticker: viewModel.whatIfTicker) {
                            // Primary Destructive: Remove from Portfolio
                            Button(role: .destructive) {
                                showRemoveConfirmation = true
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "trash.fill")
                                    Text("Remove \(viewModel.whatIfTicker) from Portfolio")
                                }
                                .font(.headline.weight(.bold))
                                .foregroundStyle(Color.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, LOSTheme.space14)
                                .background(LOSTheme.critical)
                                .clipShape(Capsule())
                            }
                            
                            // Secondary: Add More Shares to Existing Position
                            Button {
                                viewModel.addWhatIfSharesToExistingHolding()
                                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                    toastBannerMessage = "Added +\(viewModel.whatIfShares) shares to \(viewModel.whatIfTicker)"
                                }
                                Task {
                                    try? await Task.sleep(nanoseconds: 2_500_000_000)
                                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                        toastBannerMessage = nil
                                    }
                                }
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "plus.circle.fill")
                                    Text("Add +\(viewModel.whatIfShares) Shares (Total \(existing.shares + viewModel.whatIfShares))")
                                }
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(Color.black)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, LOSTheme.space12)
                                .background(LOSTheme.primary)
                                .clipShape(Capsule())
                            }
                        } else {
                            Button {
                                viewModel.commitWhatIfHoldingToRealPortfolio()
                                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                    toastBannerMessage = "Added \(viewModel.whatIfTicker) to active portfolio"
                                }
                                Task {
                                    try? await Task.sleep(nanoseconds: 2_500_000_000)
                                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                        toastBannerMessage = nil
                                    }
                                }
                            } label: {
                                HStack {
                                    Image(systemName: "plus.circle.fill")
                                    Text("Add to Active Portfolio")
                                }
                                .font(.headline.weight(.bold))
                                .foregroundStyle(Color.black)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, LOSTheme.space14)
                                .background(LOSTheme.primary)
                                .clipShape(Capsule())
                            }
                        }
                        
                        Button {
                            dismiss()
                        } label: {
                            Text("Done Simulating")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(LOSTheme.textSecondary)
                        }
                        .padding(.top, 4)
                    }
                    .id("bottom_action_buttons")
                    .padding(.horizontal)
                    .padding(.bottom, LOSTheme.space24)
                }
                .padding(.top, LOSTheme.space8)
            }
            .onAppear {
                if ProcessInfo.processInfo.arguments.contains("-scrollToBottom") {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        withAnimation {
                            scrollProxy.scrollTo("bottom_action_buttons", anchor: .bottom)
                        }
                    }
                }
            }
        }
            .background(LOSTheme.background.ignoresSafeArea())
            .navigationTitle("What-If Stock Simulator")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await viewModel.fetchLiveWhatIfPrice() }
                    } label: {
                        if viewModel.isFetchingWhatIfPrice {
                            ProgressView()
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "arrow.clockwise")
                                .font(.subheadline.weight(.semibold))
                        }
                    }
                    .disabled(viewModel.isFetchingWhatIfPrice)
                }
            }
            .alert("Remove \(viewModel.whatIfTicker) from Portfolio?", isPresented: $showRemoveConfirmation) {
                Button("Remove Stock", role: .destructive) {
                    let ticker = viewModel.whatIfTicker
                    viewModel.removeHoldingByTicker(ticker)
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        toastBannerMessage = "Removed \(ticker) from active portfolio"
                    }
                    Task {
                        try? await Task.sleep(nanoseconds: 2_500_000_000)
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            toastBannerMessage = nil
                        }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                if let existing = viewModel.getHolding(ticker: viewModel.whatIfTicker) {
                    Text("This will remove all \(existing.shares) shares of \(viewModel.whatIfTicker) and update your total portfolio valuation.")
                } else {
                    Text("This will remove \(viewModel.whatIfTicker) from your active portfolio.")
                }
            }
            .overlay(alignment: .top) {
                if let msg = toastBannerMessage {
                    HStack(spacing: 8) {
                        Image(systemName: msg.contains("Removed") ? "trash.fill" : "checkmark.circle.fill")
                            .foregroundStyle(msg.contains("Removed") ? LOSTheme.critical : LOSTheme.positive)
                        Text(msg)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LOSTheme.textPrimary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(LOSTheme.surfaceElevated)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(LOSTheme.borderHairline, lineWidth: 1))
                    .shadow(color: Color.black.opacity(0.35), radius: 8, y: 4)
                    .padding(.top, 10)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .task {
                await loadInitialLiveQuotes()
            }
            .onChange(of: searchQuery) { _ in
                Task {
                    await loadQuotesForSearchResults()
                }
            }
        }
    }
    
    // MARK: - Live Quote Streamers
    private func loadInitialLiveQuotes() async {
        isLoadingQuotes = true
        let popular = IndianStockDirectory.shared.featuredPicks
        
        await withTaskGroup(of: (String, StockQuotePayload?).self) { group in
            for stock in popular {
                group.addTask {
                    let q = try? await MarketDataAPIService.shared.fetchQuote(symbol: stock.symbol, exchange: stock.exchange)
                    return (stock.symbol, q)
                }
            }
            
            for await (sym, quote) in group {
                if let q = quote {
                    await MainActor.run {
                        liveQuotesCache[sym] = q
                        if viewModel.whatIfTicker == sym {
                            viewModel.whatIfPrice = q.currentPrice
                            viewModel.whatIfPriceChangePercent = q.changePercent
                            viewModel.whatIfPriceFreshness = "Live \(q.exchange)"
                        }
                    }
                }
            }
        }
        
        await viewModel.fetchLiveWhatIfPrice()
        
        await MainActor.run {
            isLoadingQuotes = false
        }
    }
    
    private func loadQuotesForSearchResults() async {
        let items = Array(searchResults.prefix(6))
        for item in items {
            if liveQuotesCache[item.symbol] == nil {
                if let q = try? await MarketDataAPIService.shared.fetchQuote(symbol: item.symbol, exchange: item.exchange) {
                    await MainActor.run {
                        liveQuotesCache[item.symbol] = q
                    }
                }
            }
        }
    }
}
