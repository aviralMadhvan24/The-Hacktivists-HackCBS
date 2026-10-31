import SwiftUI

/// Modal sheet for adding a new holding or editing an existing holding across NSE and BSE.
/// Includes instant offline Indian stock directory, exchange filtering, custom ticker input,
/// popular quick-picks, live quote lookups, and real-time position valuation.
struct HoldingEditorSheet: View {
    @ObservedObject var viewModel: ResilienceViewModel
    var existingHolding: PortfolioHolding? = nil
    @Environment(\.dismiss) private var dismiss
    
    @State private var searchQuery: String = ""
    @State private var selectedExchangeFilter: String = "ALL" // "ALL", "NSE", "BSE"
    @State private var isSearchingAPI: Bool = false
    @State private var apiSearchResults: [StockSearchResult] = []
    
    // Form fields
    @State private var ticker: String = ""
    @State private var exchange: String = "NSE"
    @State private var companyName: String = ""
    @State private var sector: String = "Equity"
    @State private var sharesText: String = "10"
    @State private var avgBuyPriceText: String = "1000"
    @State private var currentPrice: Double = 1000.0
    @State private var freshness: MarketDataFreshness = .demoData
    @State private var isFetchingQuote: Bool = false
    @State private var showDeleteConfirmation: Bool = false
    
    private let availableSectors = [
        "Banking",
        "Information Technology",
        "Automotive",
        "Energy & Telecom",
        "Consumer Goods",
        "Pharmaceuticals",
        "Infrastructure",
        "Financial Services",
        "Metals & Mining",
        "Aerospace & Defense",
        "Renewable Energy",
        "Railways & Logistics",
        "Capital Markets",
        "Fintech",
        "Retail",
        "Power Utilities",
        "Equity"
    ]
    
    var shares: Int {
        Int(sharesText) ?? 1
    }
    
    var avgBuyPrice: Double {
        Double(avgBuyPriceText) ?? 0.0
    }
    
    var investedValue: Double {
        Double(shares) * avgBuyPrice
    }
    
    var marketValue: Double {
        Double(shares) * currentPrice
    }
    
    var unrealizedPnL: Double {
        marketValue - investedValue
    }
    
    var unrealizedPnLPercent: Double {
        guard investedValue > 0 else { return 0 }
        return (unrealizedPnL / investedValue) * 100.0
    }
    
    // Directory search results
    private var localSearchResults: [StockCatalogItem] {
        IndianStockDirectory.shared.search(
            query: searchQuery,
            exchangeFilter: selectedExchangeFilter == "ALL" ? nil : selectedExchangeFilter
        )
    }
    
    var body: some View {
        NavigationStack {
            Form {
                // MARK: - Section 1: Stock Discovery & Search (Only for New Holdings)
                if existingHolding == nil {
                    Section {
                        // Exchange filter tabs
                        Picker("Exchange Filter", selection: $selectedExchangeFilter) {
                            Text("All").tag("ALL")
                            Text("NSE").tag("NSE")
                            Text("BSE").tag("BSE")
                        }
                        .pickerStyle(.segmented)
                        
                        // Popular Stock Quick Chips
                        VStack(alignment: .leading, spacing: 6) {
                            Text("POPULAR PICKS")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(Color.secondary)
                            
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(IndianStockDirectory.shared.featuredPicks) { stock in
                                        Button {
                                            applyCatalogItem(stock)
                                        } label: {
                                            HStack(spacing: 4) {
                                                Text(stock.symbol)
                                                    .font(.caption.weight(.bold))
                                                    .fontDesign(.monospaced)
                                                Text("(\(stock.exchange))")
                                                    .font(.caption2)
                                                    .foregroundStyle(Color.secondary)
                                            }
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 5)
                                            .background(ticker == stock.symbol ? LOSTheme.accent.opacity(0.18) : Color.primary.opacity(0.06))
                                            .foregroundStyle(ticker == stock.symbol ? LOSTheme.accent : Color.primary)
                                            .clipShape(Capsule())
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 4)
                        
                        // Search Field
                        HStack {
                            Image(systemName: "magnifyingglass")
                                .foregroundStyle(Color.secondary)
                            TextField("Search stock (e.g. RELIANCE, ZOMATO, TCS)", text: $searchQuery)
                                .textInputAutocapitalization(.characters)
                                .onChange(of: searchQuery) { _, q in
                                    Task { await performAPISearch(q) }
                                }
                            if !searchQuery.isEmpty {
                                Button {
                                    searchQuery = ""
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(Color.secondary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        
                        // Local + API Search Results List
                        if !searchQuery.isEmpty {
                            if !localSearchResults.isEmpty {
                                ForEach(localSearchResults.prefix(8)) { item in
                                    Button {
                                        applyCatalogItem(item)
                                    } label: {
                                        HStack {
                                            VStack(alignment: .leading, spacing: 2) {
                                                HStack(spacing: 6) {
                                                    Text(item.symbol)
                                                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                                                        .foregroundStyle(Color.primary)
                                                    Text(item.exchange)
                                                        .font(.system(size: 10, weight: .bold))
                                                        .padding(.horizontal, 5)
                                                        .padding(.vertical, 1)
                                                        .background(LOSTheme.accent.opacity(0.12))
                                                        .foregroundStyle(LOSTheme.accent)
                                                        .clipShape(Capsule())
                                                }
                                                Text(item.name)
                                                    .font(.system(size: 12))
                                                    .foregroundStyle(Color.secondary)
                                                    .lineLimit(1)
                                            }
                                            Spacer()
                                            VStack(alignment: .trailing, spacing: 2) {
                                                Text(LOSTheme.formatRupee(item.defaultPrice))
                                                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                                                    .foregroundStyle(Color.primary)
                                                Text(item.sector)
                                                    .font(.system(size: 10))
                                                    .foregroundStyle(Color.secondary)
                                            }
                                        }
                                    }
                                    .buttonStyle(.plain)
                                }
                            } else if isSearchingAPI {
                                HStack {
                                    Spacer()
                                    ProgressView("Searching NSE / BSE...")
                                        .font(.caption)
                                    Spacer()
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    } header: {
                        Text("Search Indian Stocks (NSE / BSE)")
                    }
                }
                
                // MARK: - Section 2: Stock Details & Custom Input
                Section {
                    // Ticker (Editable so user can type ANY custom or unlisted stock)
                    HStack {
                        Label("Ticker Symbol", systemImage: "chart.line.uptrend.xyaxis")
                        Spacer()
                        TextField("e.g. TATAPOWER", text: $ticker)
                            .textInputAutocapitalization(.characters)
                            .font(.system(size: 14, weight: .bold, design: .monospaced))
                            .multilineTextAlignment(.trailing)
                            .foregroundStyle(LOSTheme.primary)
                    }
                    
                    // Exchange Selector (NSE / BSE)
                    Picker("Exchange", selection: $exchange) {
                        Text("NSE (National Stock Exchange)").tag("NSE")
                        Text("BSE (Bombay Stock Exchange)").tag("BSE")
                    }
                    
                    // Company Name
                    HStack {
                        Label("Company Name", systemImage: "building.2")
                        Spacer()
                        TextField("e.g. Tata Power Ltd", text: $companyName)
                            .multilineTextAlignment(.trailing)
                            .foregroundStyle(Color.primary)
                    }
                    
                    // Sector Picker
                    Picker("Sector", selection: $sector) {
                        ForEach(availableSectors, id: \.self) { s in
                            Text(s).tag(s)
                        }
                    }
                    
                    // Market Price with Live Fetch
                    HStack {
                        Label("Market Price", systemImage: "indianrupeesign")
                        Spacer()
                        Text(LOSTheme.formatRupee(currentPrice))
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .monospacedDigit()
                        
                        Button {
                            Task { await fetchCurrentQuote(ticker) }
                        } label: {
                            if isFetchingQuote {
                                ProgressView()
                                    .scaleEffect(0.7)
                            } else {
                                Image(systemName: "arrow.clockwise.circle.fill")
                                    .foregroundStyle(LOSTheme.accent)
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(ticker.isEmpty || isFetchingQuote)
                        
                        Text(freshness.displayName)
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(freshness.color.opacity(0.15))
                            .foregroundStyle(freshness.color)
                            .clipShape(Capsule())
                    }
                } header: {
                    Text("Stock Identity & Quote")
                } footer: {
                    Text("You can select from the search list or type any custom NSE/BSE ticker.")
                }
                
                // MARK: - Section 3: Quantity & Average Purchase Price
                Section {
                    HStack {
                        Label("Quantity (Shares)", systemImage: "number")
                        Spacer()
                        #if os(iOS)
                        TextField("Shares", text: $sharesText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .font(.system(.body, design: .rounded).weight(.semibold))
                        #else
                        TextField("Shares", text: $sharesText)
                            .multilineTextAlignment(.trailing)
                        #endif
                    }
                    
                    HStack {
                        Label("Avg Purchase Price", systemImage: "tag")
                        Spacer()
                        #if os(iOS)
                        TextField("Price", text: $avgBuyPriceText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .font(.system(.body, design: .rounded).weight(.semibold))
                        #else
                        TextField("Price", text: $avgBuyPriceText)
                            .multilineTextAlignment(.trailing)
                        #endif
                    }
                } header: {
                    Text("Your Investment")
                } footer: {
                    Text("Enter the number of shares owned and your average purchase cost.")
                }
                
                // MARK: - Section 4: Live Calculated Position Valuation
                Section {
                    HStack {
                        Text("Invested Capital")
                        Spacer()
                        Text(LOSTheme.formatRupee(investedValue))
                            .fontWeight(.semibold)
                            .monospacedDigit()
                    }
                    
                    HStack {
                        Text("Current Market Value")
                        Spacer()
                        Text(LOSTheme.formatRupee(marketValue))
                            .bold()
                            .monospacedDigit()
                    }
                    
                    HStack {
                        Text("Unrealized Profit / Loss")
                        Spacer()
                        HStack(spacing: 4) {
                            Text(LOSTheme.formatRupee(unrealizedPnL, showSign: true))
                                .bold()
                                .monospacedDigit()
                            Text("(\(String(format: "%+.1f%%", unrealizedPnLPercent)))")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundStyle(unrealizedPnL >= 0 ? LOSTheme.safeGreen : LOSTheme.criticalRed)
                    }
                } header: {
                    Text("Valuation Summary")
                }
                
                // MARK: - Section 5: Remove Holding (Only when editing existing)
                if let holding = existingHolding {
                    Section {
                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            HStack {
                                Spacer()
                                Image(systemName: "trash.fill")
                                Text("Remove \(holding.ticker) from Portfolio")
                                    .fontWeight(.bold)
                                Spacer()
                            }
                            .foregroundStyle(LOSTheme.critical)
                        }
                    } footer: {
                        Text("Removing this stock will delete all \(holding.shares) shares and update your total portfolio valuation.")
                    }
                }
            }
            .navigationTitle(existingHolding == nil ? "Add NSE / BSE Stock" : "Edit Holding")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saveHolding()
                    }
                    .bold()
                    .disabled(ticker.isEmpty || shares <= 0 || avgBuyPrice <= 0)
                }
            }
            .alert("Remove \(existingHolding?.ticker ?? "Holding") from Portfolio?", isPresented: $showDeleteConfirmation) {
                Button("Remove Stock", role: .destructive) {
                    if let h = existingHolding {
                        viewModel.deleteHolding(id: h.id)
                        dismiss()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                if let h = existingHolding {
                    Text("Are you sure you want to remove \(h.shares) shares of \(h.companyName) from your portfolio?")
                } else {
                    Text("This stock will be permanently removed.")
                }
            }
            .onAppear {
                if let h = existingHolding {
                    ticker = h.ticker
                    companyName = h.companyName
                    sector = h.sector
                    sharesText = "\(h.shares)"
                    avgBuyPriceText = String(format: "%.2f", h.averageBuyPrice)
                    currentPrice = h.currentPrice
                    freshness = h.freshness
                } else if ticker.isEmpty {
                    // Default to Reliance Industries
                    if let defaultStock = IndianStockDirectory.shared.find(symbol: "RELIANCE") {
                        applyCatalogItem(defaultStock)
                        sharesText = "20"
                        avgBuyPriceText = "2850"
                    }
                }
            }
        }
    }
    
    private func applyCatalogItem(_ item: StockCatalogItem) {
        ticker = item.symbol
        exchange = item.exchange
        companyName = item.name
        sector = item.sector
        currentPrice = item.defaultPrice
        avgBuyPriceText = String(format: "%.0f", item.defaultPrice)
        searchQuery = ""
        Task { await fetchCurrentQuote(item.symbol) }
    }
    
    private func performAPISearch(_ query: String) async {
        guard query.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 else {
            apiSearchResults = []
            return
        }
        isSearchingAPI = true
        do {
            let res = try await MarketDataAPIService.shared.searchStocks(query: query)
            apiSearchResults = res
            isSearchingAPI = false
        } catch {
            isSearchingAPI = false
        }
    }
    
    private func fetchCurrentQuote(_ sym: String) async {
        guard !sym.isEmpty else { return }
        isFetchingQuote = true
        do {
            let quote = try await MarketDataAPIService.shared.fetchQuote(symbol: sym)
            currentPrice = quote.currentPrice
            if let f = MarketDataFreshness(rawValue: quote.freshness) {
                freshness = f
            }
            isFetchingQuote = false
        } catch {
            isFetchingQuote = false
        }
    }
    
    private func saveHolding() {
        viewModel.addOrUpdateHolding(
            ticker: ticker,
            companyName: companyName.isEmpty ? ticker : companyName,
            shares: shares,
            averageBuyPrice: avgBuyPrice,
            sector: sector,
            currentPrice: currentPrice
        )
        dismiss()
    }
}
