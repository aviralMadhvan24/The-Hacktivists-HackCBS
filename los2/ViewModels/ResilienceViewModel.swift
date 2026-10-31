import Foundation
import SwiftUI
import Combine

/// Item wrapper for scenario comparison to avoid tuple keypath issues in ForEach.
struct ScenarioComparisonItem: Identifiable {
    var id: String { scenario.rawValue }
    let scenario: StressScenarioLevel
    let report: ResilienceReport
}

/// Main ViewModel managing financial profiles, live market data, granular stress tests, reverse stress, and AI recovery planning.
@MainActor
final class ResilienceViewModel: ObservableObject {
    @Published var profile: FinancialProfile {
        didSet {
            saveToUserDefaults()
        }
    }
    
    // MARK: - Stress Test State (Mode A vs Mode B)
    @Published var stressTestMode: Int = 0 // 0 = Mode A (Portfolio-Wide), 1 = Mode B (Individual Stock)
    @Published var selectedScenario: StressScenarioLevel = .stress
    @Published var customDeclinePercentage: Double = 15.0
    @Published var isUsingCustomDecline: Bool = false
    @Published var stockDeclineOverrides: [String: Double] = [:] // ticker -> decline %
    
    // MARK: - Emergency Shock Simulator State
    @Published var emergencyScenario = EmergencyScenario()
    
    // MARK: - Reverse Stress Testing State
    @Published var reverseStressAssumption = ReverseStressAssumption()
    
    // MARK: - AI Recovery Planner State
    @Published var recoveryPlanResponse: RecoveryPlanResponse? = nil
    @Published var recoveryBaseline: RecoveryBaseline? = nil
    @Published var isGeneratingRecoveryPlan: Bool = false
    @Published var recoveryUserGoals: String = "Protect cash runway & avoid forced stock liquidation"
    
    // MARK: - Market Data Sync State
    @Published var isRefreshingMarketData: Bool = false
    @Published var marketDataMessage: String? = nil
    @Published var marketDataFreshnessSummary: MarketDataFreshness = .demoData
    
    // MARK: - UI Sheet States
    @Published var isShowingEditSheet: Bool = false
    @Published var isShowingZerodhaSheet: Bool = false
    @Published var isShowingScoreBreakdownSheet: Bool = false
    @Published var isShowingPortfolioSheet: Bool = false
    @Published var isShowingReverseStressSheet: Bool = false
    @Published var isShowingRecoverySheet: Bool = false
    @Published var isShowingWhatIfSheet: Bool = false
    
    // MARK: - What-If Stock Simulator State
    @Published var whatIfTicker: String = "RELIANCE"
    @Published var whatIfCompanyName: String = "Reliance Industries Limited"
    @Published var whatIfExchange: String = "NSE"
    @Published var whatIfSector: String = "Energy & Telecom"
    @Published var whatIfShares: Int = 20
    @Published var whatIfPrice: Double = 1190.00
    @Published var whatIfSimulatedDecline: Double = 25.0
    @Published var isFetchingWhatIfPrice: Bool = false
    @Published var whatIfPriceChangePercent: Double? = nil
    @Published var whatIfPriceFreshness: String = "Live NSE"
    
    // Broker Sync State (Zerodha Kite)
    @Published var isZerodhaConnected: Bool = false
    @Published var zerodhaUser: ZerodhaUser? = nil
    @Published var lastZerodhaSyncDate: Date? = nil
    
    init() {
        if let saved = ResilienceViewModel.loadFromUserDefaults() {
            self.profile = saved
        } else {
            self.profile = .pitchDeckSample
        }
        
        loadZerodhaSession()
        recalculatePortfolioValueFromHoldings()
        
        let initialPlans = RecoveryAPIService.localFallbackPlans(
            profile: self.profile,
            simulatedLoss: 0.0
        )
        self.recoveryBaseline = initialPlans.baseline
        self.recoveryPlanResponse = initialPlans.recovery
        
        if ProcessInfo.processInfo.arguments.contains("-showWhatIf") {
            self.isShowingWhatIfSheet = true
        }
        if ProcessInfo.processInfo.arguments.contains("-showPortfolio") {
            self.isShowingPortfolioSheet = true
        }
        if ProcessInfo.processInfo.arguments.contains("-showEditProfile") {
            self.isShowingEditSheet = true
        }
    }
    
    // MARK: - Active Drawdown Percent (Mode A)
    var currentDeclinePercentage: Double {
        if isUsingCustomDecline {
            return customDeclinePercentage
        }
        return selectedScenario.percentage
    }
    
    // MARK: - Live Report (Mode A or Mode B)
    var currentReport: ResilienceReport {
        if stressTestMode == 1 {
            // Mode B: Calculate total loss from individual stock shocks
            let totalLoss = totalIndividualStockLoss
            let effectiveDecline = profile.portfolioValue > 0 ? (totalLoss / profile.portfolioValue) * 100.0 : currentDeclinePercentage
            return ResilienceEngine.analyze(profile: profile, declinePercent: effectiveDecline)
        }
        return ResilienceEngine.analyze(profile: profile, declinePercent: currentDeclinePercentage)
    }
    
    // MARK: - Baseline Financial Resilience Score (Permanent, Independent of Scenarios)
    var baselineScoreReport: ExplainableResilienceReport {
        return ResilienceEngine.calculateBaselineScore(profile: profile)
    }
    
    var isProfileIncomplete: Bool {
        return profile.monthlyIncome <= 0 || profile.monthlyExpenses <= 0 || profile.liquidCash <= 0
    }
    
    var provisionalScoreNotice: String? {
        if profile.monthlyIncome <= 0 && profile.monthlyExpenses <= 0 {
            return "Provisional Score: Enter monthly income & expenses to unlock cash flow scoring."
        } else if profile.monthlyIncome <= 0 {
            return "Provisional Score: Monthly earnings set to ₹0."
        } else if profile.liquidCash <= 0 {
            return "Provisional Score: Liquid savings set to ₹0."
        }
        return nil
    }
    
    // MARK: - Emergency Simulation Result
    var emergencySimulationResult: EmergencySimulationResult {
        return ResilienceEngine.calculateEmergencySimulation(profile: profile, scenario: emergencyScenario)
    }
    
    func resetEmergencyScenario() {
        emergencyScenario = EmergencyScenario()
    }
    
    // MARK: - "What Needs Attention?" Engine
    struct AttentionItem: Identifiable, Equatable {
        let id: String
        let title: String
        let message: String
        let severityColor: Color
        let iconName: String
        let actionLabel: String
        let targetAction: AttentionActionTarget
    }
    
    enum AttentionActionTarget: Equatable {
        case editFinances
        case emergencySimulator
        case stressTest
        case portfolioHoldings
        case runway
    }
    
    var attentionItems: [AttentionItem] {
        var items: [AttentionItem] = []
        let totalOutflows = profile.monthlyExpenses + profile.monthlyDebtPayments
        
        // 1. Incomplete Profile
        if profile.monthlyIncome == 0 {
            items.append(AttentionItem(
                id: "missing_income",
                title: "Income Data Missing",
                message: "Enter your regular monthly take-home income to calculate true runway and cash burn.",
                severityColor: LOSTheme.warningAmber,
                iconName: "questionmark.circle.fill",
                actionLabel: "Edit Income",
                targetAction: .editFinances
            ))
        }
        
        // 2. Net Cash Burn / Deficit
        let netBurn = totalOutflows - profile.monthlyIncome
        if netBurn > 0 {
            items.append(AttentionItem(
                id: "monthly_deficit",
                title: "Negative Monthly Cash Flow",
                message: "Fixed outflows (\(LOSTheme.formatRupee(totalOutflows))) exceed income by \(LOSTheme.formatRupee(netBurn))/mo.",
                severityColor: LOSTheme.criticalRed,
                iconName: "flame.fill",
                actionLabel: "Inspect Runway",
                targetAction: .runway
            ))
        }
        
        // 3. Low Emergency Cash Buffer
        let postEmergencyCash = profile.liquidCash - profile.unexpectedExpense
        let coverageMonths = totalOutflows > 0 ? max(0, postEmergencyCash) / totalOutflows : 6.0
        if coverageMonths < 2.0 {
            items.append(AttentionItem(
                id: "low_cash_buffer",
                title: "Low Emergency Coverage",
                message: "Liquid cash covers only \(String(format: "%.1f", coverageMonths)) months of living expenses after the configured emergency.",
                severityColor: LOSTheme.criticalRed,
                iconName: "cross.case.fill",
                actionLabel: "Simulate Shock",
                targetAction: .emergencySimulator
            ))
        }
        
        // 4. Minimum Safety Reserve Breached
        if postEmergencyCash < profile.minimumCashReserve {
            let breach = max(0, profile.minimumCashReserve - postEmergencyCash)
            items.append(AttentionItem(
                id: "reserve_floor_breached",
                title: "Safety Floor Breached",
                message: "Emergency expense breaches your desired \(LOSTheme.formatRupee(profile.minimumCashReserve)) minimum reserve by \(LOSTheme.formatRupee(breach)).",
                severityColor: LOSTheme.warningAmber,
                iconName: "shield.slash.fill",
                actionLabel: "Adjust Reserve",
                targetAction: .emergencySimulator
            ))
        }
        
        // 5. Portfolio Concentration Risk
        let maxWeight = profile.activeHoldings.map { $0.portfolioWeightPercent }.max() ?? 0.0
        if maxWeight > 40.0, let topStock = profile.activeHoldings.max(by: { $0.portfolioWeightPercent < $1.portfolioWeightPercent }) {
            items.append(AttentionItem(
                id: "high_concentration",
                title: "Portfolio Concentration Risk",
                message: "\(topStock.ticker) represents \(Int(maxWeight))% of total equities, leaving you vulnerable to single-stock shocks.",
                severityColor: LOSTheme.warningAmber,
                iconName: "chart.pie.fill",
                actionLabel: "Stress Stock",
                targetAction: .stressTest
            ))
        }
        
        return items
    }
    
    // MARK: - Explainable 5-Pillar Score
    var explainableScoreReport: ExplainableResilienceReport {
        let decline = stressTestMode == 1 ? effectiveIndividualDeclinePercent : currentDeclinePercentage
        return ResilienceEngine.calculateExplainableScore(profile: profile, declinePercent: decline)
    }
    
    // MARK: - Mode B: Individual Stock Shock Calculations
    var effectiveIndividualDeclinePercent: Double {
        guard profile.portfolioValue > 0 else { return currentDeclinePercentage }
        return (totalIndividualStockLoss / profile.portfolioValue) * 100.0
    }
    
    var totalIndividualStockLoss: Double {
        profile.activeHoldings.reduce(0.0) { sum, h in
            let decline = stockDeclineOverrides[h.ticker] ?? currentDeclinePercentage
            let loss = h.currentValue * (decline / 100.0)
            return sum + loss
        }
    }
    
    struct IndividualStockLossItem: Identifiable {
        var id: String { holding.ticker }
        let holding: PortfolioHolding
        let assumedDecline: Double
        let simulatedLoss: Double
        let simulatedRemainingValue: Double
        let lossContributionPercent: Double
    }
    
    var individualLossBreakdown: [IndividualStockLossItem] {
        let totalLoss = max(1.0, totalIndividualStockLoss)
        return profile.activeHoldings.map { h in
            let decline = stockDeclineOverrides[h.ticker] ?? currentDeclinePercentage
            let loss = h.currentValue * (decline / 100.0)
            let remaining = max(0, h.currentValue - loss)
            let contribution = (loss / totalLoss) * 100.0
            return IndividualStockLossItem(
                holding: h,
                assumedDecline: decline,
                simulatedLoss: loss,
                simulatedRemainingValue: remaining,
                lossContributionPercent: contribution
            )
        }.sorted { $0.simulatedLoss > $1.simulatedLoss }
    }
    
    func setIndividualStockDecline(ticker: String, percentage: Double) {
        stockDeclineOverrides[ticker] = max(0, min(100, percentage))
    }
    
    func resetIndividualStockDeclines() {
        stockDeclineOverrides.removeAll()
    }
    
    // MARK: - Reverse Stress Result (Computed Live)
    var reverseStressResult: ReverseStressResult {
        ReverseStressEngine.calculateBreakingPoint(
            profile: profile,
            assumption: reverseStressAssumption
        )
    }
    
    // MARK: - Scenario Comparison Items
    var scenarioComparisons: [ScenarioComparisonItem] {
        StressScenarioLevel.allCases.map { level in
            ScenarioComparisonItem(
                scenario: level,
                report: ResilienceEngine.analyze(profile: profile, declinePercent: level.percentage)
            )
        }
    }
    
    func selectScenario(_ scenario: StressScenarioLevel) {
        isUsingCustomDecline = false
        selectedScenario = scenario
        customDeclinePercentage = scenario.percentage
    }
    
    func setCustomDecline(_ value: Double) {
        isUsingCustomDecline = true
        customDeclinePercentage = value
    }
    
    func resetToDefaults() {
        profile = .pitchDeckSample
        selectedScenario = .stress
        customDeclinePercentage = 15.0
        isUsingCustomDecline = false
        resetIndividualStockDeclines()
    }
    
    // MARK: - Portfolio Holdings Management
    func addOrUpdateHolding(
        ticker: String,
        companyName: String,
        shares: Int,
        averageBuyPrice: Double,
        sector: String = "Equity",
        currentPrice: Double? = nil
    ) {
        var list = profile.activeHoldings
        let cleanTicker = ticker.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        
        if let existingIndex = list.firstIndex(where: { $0.ticker.uppercased() == cleanTicker }) {
            // Update existing holding
            var existing = list[existingIndex]
            existing.shares = shares
            existing.averageBuyPrice = averageBuyPrice
            if let cp = currentPrice { existing.currentPrice = cp }
            existing.lastUpdated = Date()
            list[existingIndex] = existing
        } else {
            // Add new holding
            let newHolding = PortfolioHolding(
                companyName: companyName,
                ticker: cleanTicker,
                sector: sector,
                shares: shares,
                averageBuyPrice: averageBuyPrice,
                currentPrice: currentPrice ?? averageBuyPrice,
                freshness: .demoData,
                lastUpdated: Date()
            )
            list.append(newHolding)
        }
        
        profile.holdings = list
        recalculatePortfolioValueFromHoldings()
        saveToUserDefaults()
    }
    
    func deleteHolding(id: UUID) {
        var list = profile.activeHoldings
        list.removeAll { $0.id == id }
        profile.holdings = list
        recalculatePortfolioValueFromHoldings()
        saveToUserDefaults()
    }

    func removeHoldingByTicker(_ ticker: String) {
        let cleanTicker = ticker.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        var list = profile.activeHoldings
        list.removeAll { $0.ticker.uppercased() == cleanTicker }
        profile.holdings = list
        recalculatePortfolioValueFromHoldings()
        saveToUserDefaults()
    }
    
    func isHoldingInPortfolio(ticker: String) -> Bool {
        let cleanTicker = ticker.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return profile.activeHoldings.contains { $0.ticker.uppercased() == cleanTicker }
    }
    
    func getHolding(ticker: String) -> PortfolioHolding? {
        let cleanTicker = ticker.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return profile.activeHoldings.first { $0.ticker.uppercased() == cleanTicker }
    }
    
    func recalculatePortfolioValueFromHoldings() {
        let list = profile.activeHoldings
        guard !list.isEmpty else {
            profile.portfolioValue = 0.0
            return
        }
        
        let totalVal = list.reduce(0.0) { $0 + $1.currentValue }
        profile.portfolioValue = totalVal
        
        // Update weights
        if totalVal > 0 {
            profile.holdings = list.map { h in
                var updated = h
                updated.portfolioWeightPercent = Double(round((h.currentValue / totalVal) * 1000) / 10)
                return updated
            }
        }
    }
    
    // MARK: - What-If Stock Simulation Logic
    var whatIfInvestmentAmount: Double {
        Double(max(1, whatIfShares)) * max(1.0, whatIfPrice)
    }
    
    var whatIfSimulationResult: WhatIfSimulationResult {
        let currentHoldings = profile.activeHoldings
        let currentPortVal = profile.portfolioValue
        let simulatedStockVal = whatIfInvestmentAmount
        let newPortVal = currentPortVal + simulatedStockVal
        
        let baselineLoss = currentPortVal * (whatIfSimulatedDecline / 100.0)
        let newLoss = newPortVal * (whatIfSimulatedDecline / 100.0)
        let lossDelta = newLoss - baselineLoss
        
        var simProfile = profile
        simProfile.portfolioValue = newPortVal
        
        let newHolding = PortfolioHolding(
            companyName: whatIfCompanyName,
            ticker: whatIfTicker,
            sector: whatIfSector,
            shares: whatIfShares,
            averageBuyPrice: whatIfPrice,
            currentPrice: whatIfPrice
        )
        
        var simHoldings = currentHoldings
        if let idx = simHoldings.firstIndex(where: { $0.ticker.uppercased() == whatIfTicker.uppercased() }) {
            var existing = simHoldings[idx]
            existing.shares += whatIfShares
            simHoldings[idx] = existing
        } else {
            simHoldings.append(newHolding)
        }
        simProfile.holdings = simHoldings
        
        let baselineReport = ResilienceEngine.analyze(
            profile: profile,
            declinePercent: whatIfSimulatedDecline
        )
        let simReport = ResilienceEngine.analyze(
            profile: simProfile,
            declinePercent: whatIfSimulatedDecline
        )
        
        let newWeight = newPortVal > 0 ? (simulatedStockVal / newPortVal) * 100.0 : 0.0
        
        return WhatIfSimulationResult(
            ticker: whatIfTicker,
            companyName: whatIfCompanyName,
            exchange: whatIfExchange,
            sector: whatIfSector,
            shares: whatIfShares,
            price: whatIfPrice,
            simulatedInvestment: simulatedStockVal,
            baselinePortfolioValue: currentPortVal,
            baselineResilienceScore: Double(baselineReport.resilienceScore),
            baselineEstimatedLoss: baselineLoss,
            newPortfolioValue: newPortVal,
            newResilienceScore: Double(simReport.resilienceScore),
            newEstimatedLoss: newLoss,
            lossDelta: lossDelta,
            scoreDelta: Double(simReport.resilienceScore - baselineReport.resilienceScore),
            newHoldingWeight: newWeight
        )
    }
    
    func selectWhatIfStock(catalogItem: StockCatalogItem) {
        whatIfTicker = catalogItem.symbol
        whatIfCompanyName = catalogItem.name
        whatIfExchange = catalogItem.exchange
        whatIfSector = catalogItem.sector
        whatIfPrice = catalogItem.defaultPrice
        whatIfPriceFreshness = "Live \(catalogItem.exchange)"
        whatIfPriceChangePercent = nil
        
        Task { @MainActor in
            await fetchLiveWhatIfPrice()
        }
    }
    
    func selectWhatIfStock(symbol: String, name: String, exchange: String, sector: String?, initialPrice: Double? = nil) {
        whatIfTicker = symbol
        whatIfCompanyName = name
        whatIfExchange = exchange
        whatIfSector = sector ?? "Equity"
        if let p = initialPrice, p > 0 {
            whatIfPrice = p
        }
        whatIfPriceFreshness = "Live \(exchange)"
        whatIfPriceChangePercent = nil
        
        Task { @MainActor in
            await fetchLiveWhatIfPrice()
        }
    }
    
    func fetchLiveWhatIfPrice() async {
        isFetchingWhatIfPrice = true
        let symbol = whatIfTicker
        let exchange = whatIfExchange
        
        do {
            let quote = try await MarketDataAPIService.shared.fetchQuote(symbol: symbol, exchange: exchange)
            if whatIfTicker == symbol {
                whatIfPrice = quote.currentPrice
                whatIfPriceChangePercent = quote.changePercent
                whatIfPriceFreshness = quote.freshness == "REFERENCE_CATALOG" ? "Benchmark Price" : "Live \(quote.exchange)"
            }
        } catch {
            // Keep default benchmark price
        }
        isFetchingWhatIfPrice = false
    }
    
    func commitWhatIfHoldingToRealPortfolio() {
        addOrUpdateHolding(
            ticker: whatIfTicker,
            companyName: whatIfCompanyName,
            shares: whatIfShares,
            averageBuyPrice: whatIfPrice,
            sector: whatIfSector,
            currentPrice: whatIfPrice
        )
    }
    
    func addWhatIfSharesToExistingHolding() {
        if let existing = getHolding(ticker: whatIfTicker) {
            let combinedShares = existing.shares + whatIfShares
            let totalInvested = (Double(existing.shares) * existing.averageBuyPrice) + (Double(whatIfShares) * whatIfPrice)
            let newAvgPrice = combinedShares > 0 ? (totalInvested / Double(combinedShares)) : whatIfPrice
            
            addOrUpdateHolding(
                ticker: whatIfTicker,
                companyName: whatIfCompanyName,
                shares: combinedShares,
                averageBuyPrice: newAvgPrice,
                sector: whatIfSector,
                currentPrice: whatIfPrice
            )
        } else {
            commitWhatIfHoldingToRealPortfolio()
        }
    }
    
    // MARK: - Live Market Data Refresh
    func refreshMarketPrices() async {
        isRefreshingMarketData = true
        marketDataMessage = nil
        
        let tickers = profile.activeHoldings.map { $0.ticker }
        do {
            let quotes = try await MarketDataAPIService.shared.fetchBatchQuotes(symbols: tickers, force: true)
            var updatedList = profile.activeHoldings
            var primaryFreshness: MarketDataFreshness = .demoData
            
            for i in 0..<updatedList.count {
                let sym = updatedList[i].ticker
                if let q = quotes[sym] {
                    updatedList[i].currentPrice = q.currentPrice
                    updatedList[i].previousClose = q.previousClose
                    updatedList[i].priceChange = q.change
                    updatedList[i].priceChangePercent = q.changePercent
                    let f = MarketDataFreshness(rawValue: q.freshness) ?? .demoData
                    updatedList[i].freshness = f
                    primaryFreshness = f
                    updatedList[i].lastUpdated = Date()
                    updatedList[i].staleWarning = q.staleWarning
                }
            }
            
            profile.holdings = updatedList
            recalculatePortfolioValueFromHoldings()
            marketDataFreshnessSummary = primaryFreshness
            isRefreshingMarketData = false
            marketDataMessage = "Quotes refreshed (\(primaryFreshness.displayName))."
        } catch {
            isRefreshingMarketData = false
            marketDataMessage = "Refresh failed: \(error.localizedDescription)"
        }
    }
    
    // MARK: - AI Recovery Planner
    func fetchRecoveryPlans() async {
        isGeneratingRecoveryPlan = true
        do {
            let res = try await RecoveryAPIService.shared.generateRecoveryPlan(
                profile: profile,
                simulatedLoss: currentReport.estimatedPortfolioLoss,
                incomeLossMonths: reverseStressAssumption.scenarioDurationMonths,
                userGoals: recoveryUserGoals
            )
            recoveryBaseline = res.baseline
            recoveryPlanResponse = res.recovery
            isGeneratingRecoveryPlan = false
        } catch {
            let fallback = RecoveryAPIService.localFallbackPlans(
                profile: profile,
                simulatedLoss: currentReport.estimatedPortfolioLoss
            )
            recoveryBaseline = fallback.baseline
            recoveryPlanResponse = fallback.recovery
            isGeneratingRecoveryPlan = false
        }
    }
    
    func applyRecoveryPlan(_ plan: RecoveryPlanOption) {
        // Optimize monthly expenses by applying the reduction
        let optimizedExpenses = max(2_000, profile.monthlyExpenses - plan.monthlyExpenseReduction)
        profile.monthlyExpenses = optimizedExpenses
        saveToUserDefaults()
        
        // Re-generate fresh recovery options with updated baseline
        let freshPlans = RecoveryAPIService.localFallbackPlans(
            profile: profile,
            simulatedLoss: currentReport.estimatedPortfolioLoss
        )
        recoveryBaseline = freshPlans.baseline
        recoveryPlanResponse = freshPlans.recovery
    }
    
    // MARK: - Zerodha Kite Sync
    func syncWithZerodha(portfolioValue: Double, cashBalance: Double?, holdings: [PortfolioHolding], user: ZerodhaUser?) {
        profile.portfolioValue = portfolioValue
        if let cash = cashBalance, cash > 0 {
            profile.liquidCash = cash
        }
        if !holdings.isEmpty {
            profile.holdings = holdings
        }
        self.zerodhaUser = user
        self.isZerodhaConnected = true
        self.lastZerodhaSyncDate = Date()
        saveZerodhaSession()
        recalculatePortfolioValueFromHoldings()
    }
    
    func disconnectZerodha() {
        isZerodhaConnected = false
        zerodhaUser = nil
        lastZerodhaSyncDate = nil
        UserDefaults.standard.removeObject(forKey: zerodhaStorageKey)
        Task {
            try? await ZerodhaAPIService.shared.disconnect()
        }
    }
    
    private let zerodhaStorageKey = "LiquidityOS_ZerodhaUser_v1"
    
    private func saveZerodhaSession() {
        if let user = zerodhaUser, let encoded = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(encoded, forKey: zerodhaStorageKey)
        }
    }
    
    private func loadZerodhaSession() {
        guard let data = UserDefaults.standard.data(forKey: zerodhaStorageKey),
              let decoded = try? JSONDecoder().decode(ZerodhaUser.self, from: data) else {
            return
        }
        self.zerodhaUser = decoded
        self.isZerodhaConnected = true
    }
    
    // MARK: - Persistence
    private static let storageKey = "LiquidityOS_FinancialProfile_v1"
    
    private func saveToUserDefaults() {
        if let encoded = try? JSONEncoder().encode(profile) {
            UserDefaults.standard.set(encoded, forKey: Self.storageKey)
        }
    }
    
    private static func loadFromUserDefaults() -> FinancialProfile? {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode(FinancialProfile.self, from: data) else {
            return nil
        }
        return decoded
    }
}
