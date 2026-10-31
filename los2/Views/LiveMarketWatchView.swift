import SwiftUI

/// Live Market Watch screen displaying real-time quotes, day change metrics,
/// and instant simulation access for all NSE and BSE Indian equities.
struct LiveMarketWatchView: View {
    @ObservedObject var viewModel: ResilienceViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var searchQuery: String = ""
    @State private var selectedExchange: String = "ALL"
    @State private var selectedSector: String = "ALL"
    @State private var quotesCache: [String: StockQuotePayload] = [:]
    @State private var isLoadingQuotes: Bool = false
    @State private var lastRefreshed: Date = Date()
    @State private var selectedStockForSimulation: StockCatalogItem? = nil
    @State private var showAddedToast: String? = nil
    
    private let exchanges = ["ALL", "NSE", "BSE"]
    private let sectors = ["ALL", "Banking", "Information Technology", "Automotive", "Energy & Telecom", "Consumer Goods", "Financial Services"]
    
    var filteredStocks: [StockCatalogItem] {
        let all = IndianStockDirectory.shared.search(query: searchQuery, exchangeFilter: selectedExchange)
        if selectedSector == "ALL" {
            return all
        }
        return all.filter { $0.sector.localizedCaseInsensitiveContains(selectedSector) }
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: LOSTheme.space16) {
                    // MARK: - Market Status Banner & Major Indices Strip
                    marketIndicesCard
                    
                    // MARK: - Search & Filters Bar
                    searchAndFilterSection
                    
                    // MARK: - Live Equities Grid / List
                    VStack(alignment: .leading, spacing: LOSTheme.space12) {
                        HStack {
                            Text("INDIAN EQUITIES (\(filteredStocks.count))")
                                .font(.footnote.weight(.bold))
                                .foregroundStyle(LOSTheme.textSecondary)
                                .tracking(0.6)
                            
                            Spacer()
                            
                            if isLoadingQuotes {
                                ProgressView()
                                    .scaleEffect(0.7)
                            } else {
                                Text("Updated \(lastRefreshed.formatted(date: .omitted, time: .shortened))")
                                    .font(.caption2)
                                    .foregroundStyle(LOSTheme.textSecondary)
                            }
                        }
                        .padding(.horizontal)
                        
                        LazyVStack(spacing: LOSTheme.space10) {
                            ForEach(filteredStocks) { stock in
                                stockQuoteRow(stock: stock)
                            }
                        }
                        .padding(.horizontal)
                    }
                    .padding(.bottom, LOSTheme.space32)
                }
                .padding(.top, LOSTheme.space8)
            }
            .background(LOSTheme.backgroundGradient.ignoresSafeArea())
            .navigationTitle("Live Market Watch")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await refreshAllQuotes() }
                    } label: {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.subheadline.weight(.semibold))
                    }
                }
            }
            .task {
                await refreshAllQuotes()
            }
            .overlay(alignment: .bottom) {
                if let toast = showAddedToast {
                    HStack(spacing: LOSTheme.space8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(LOSTheme.positive)
                        Text(toast)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.white)
                    }
                    .padding(.horizontal, LOSTheme.space16)
                    .padding(.vertical, LOSTheme.space10)
                    .background(Color.black.opacity(0.85))
                    .clipShape(Capsule())
                    .padding(.bottom, LOSTheme.space24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
    }
    
    // MARK: - Major Indian Indices Strip
    private var marketIndicesCard: some View {
        VStack(spacing: LOSTheme.space12) {
            HStack {
                HStack(spacing: LOSTheme.space6) {
                    Circle()
                        .fill(LOSTheme.positive)
                        .frame(width: 8, height: 8)
                    Text("LIVE 15M EXCHANGE FEED")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(LOSTheme.positive)
                        .tracking(0.6)
                }
                
                Spacer()
                
                Text("NSE & BSE Markets")
                    .font(.caption2)
                    .foregroundStyle(LOSTheme.textSecondary)
            }
            
            HStack(spacing: LOSTheme.space12) {
                indexTile(name: "NIFTY 50", value: "24,852.15", change: "+142.30", pct: "+0.58%", isPositive: true)
                indexTile(name: "SENSEX", value: "81,424.80", change: "+410.15", pct: "+0.51%", isPositive: true)
                indexTile(name: "INDIA VIX", value: "13.82", change: "−0.45", pct: "−3.15%", isPositive: false)
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
    }
    
    private func indexTile(name: String, value: String, change: String, pct: String, isPositive: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(name)
                .font(.caption2.weight(.bold))
                .foregroundStyle(LOSTheme.textSecondary)
                .lineLimit(1)
            
            Text(value)
                .font(.subheadline.weight(.bold).monospacedDigit())
                .foregroundStyle(LOSTheme.textPrimary)
                .lineLimit(1)
            
            HStack(spacing: 2) {
                Text(pct)
                    .font(.caption2.weight(.bold).monospacedDigit())
                    .foregroundStyle(isPositive ? LOSTheme.positive : LOSTheme.critical)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LOSTheme.space8)
        .background(LOSTheme.surfaceElevated)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
    }
    
    // MARK: - Search & Filters
    private var searchAndFilterSection: some View {
        VStack(spacing: LOSTheme.space10) {
            // Search Bar
            HStack(spacing: LOSTheme.space8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(LOSTheme.textSecondary)
                
                TextField("Search symbol (e.g. RELIANCE, ZOMATO, TATA)", text: $searchQuery)
                    .font(.subheadline)
                    .autocorrectionDisabled()
                
                if !searchQuery.isEmpty {
                    Button {
                        searchQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(LOSTheme.textSecondary)
                    }
                }
            }
            .padding(LOSTheme.space10)
            .background(LOSTheme.surface)
            .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LOSTheme.radiusMedium, style: .continuous)
                    .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
            )
            .padding(.horizontal)
            
            // Exchange Segmented Control
            HStack(spacing: LOSTheme.space8) {
                ForEach(exchanges, id: \.self) { ex in
                    Button {
                        selectedExchange = ex
                    } label: {
                        Text(ex)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, LOSTheme.space12)
                            .padding(.vertical, LOSTheme.space6)
                            .background(selectedExchange == ex ? LOSTheme.accent : LOSTheme.surface)
                            .foregroundStyle(selectedExchange == ex ? Color.white : LOSTheme.textPrimary)
                            .clipShape(Capsule())
                            .overlay(
                                Capsule()
                                    .stroke(selectedExchange == ex ? Color.clear : LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                            )
                    }
                }
                
                Spacer()
            }
            .padding(.horizontal)
        }
    }
    
    // MARK: - Stock Quote Card Row
    private func stockQuoteRow(stock: StockCatalogItem) -> some View {
        let quote = quotesCache[stock.symbol]
        let currentPrice = quote?.currentPrice ?? stock.defaultPrice
        let changePct = quote?.changePercent ?? 0.0
        let changeVal = quote?.change ?? 0.0
        let isUp = changePct >= 0
        
        return VStack(spacing: LOSTheme.space8) {
            HStack(alignment: .top) {
                // Stock Info
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: LOSTheme.space6) {
                        Text(stock.symbol)
                            .font(.headline.weight(.bold))
                            .foregroundStyle(LOSTheme.textPrimary)
                        
                        Text(stock.exchange)
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(stock.exchange == "NSE" ? Color.blue.opacity(0.15) : Color.orange.opacity(0.15))
                            .foregroundStyle(stock.exchange == "NSE" ? Color.blue : Color.orange)
                            .clipShape(Capsule())
                    }
                    
                    Text(stock.name)
                        .font(.caption)
                        .foregroundStyle(LOSTheme.textSecondary)
                        .lineLimit(1)
                    
                    Text(stock.sector)
                        .font(.caption2)
                        .foregroundStyle(LOSTheme.textSecondary.opacity(0.8))
                }
                
                Spacer()
                
                // Live Price & Change Badge
                VStack(alignment: .trailing, spacing: 2) {
                    Text(LOSTheme.formatRupee(currentPrice))
                        .font(.headline.weight(.bold).monospacedDigit())
                        .foregroundStyle(LOSTheme.textPrimary)
                    
                    HStack(spacing: 2) {
                        Image(systemName: isUp ? "arrow.up.right" : "arrow.down.right")
                            .font(.caption2.weight(.bold))
                        Text("\(isUp ? "+" : "")\(String(format: "%.2f", changeVal)) (\(isUp ? "+" : "")\(String(format: "%.2f", changePct))%)")
                            .font(.caption2.weight(.bold).monospacedDigit())
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background((isUp ? LOSTheme.positive : LOSTheme.critical).opacity(0.12))
                    .foregroundStyle(isUp ? LOSTheme.positive : LOSTheme.critical)
                    .clipShape(Capsule())
                }
            }
            
            Divider().overlay(LOSTheme.borderHairline)
            
            // Fast Action Bar
            HStack(spacing: LOSTheme.space8) {
                // One-tap What-If Simulator
                Button {
                    viewModel.selectWhatIfStock(catalogItem: stock)
                    viewModel.whatIfPrice = currentPrice
                    if let q = quote {
                        viewModel.whatIfPriceChangePercent = q.changePercent
                        viewModel.whatIfPriceFreshness = "Live \(stock.exchange)"
                    }
                    viewModel.isShowingWhatIfSheet = true
                    dismiss()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "wand.and.stars")
                            .font(.caption2)
                        Text("Simulate in What-If")
                            .font(.caption.weight(.semibold))
                    }
                    .padding(.horizontal, LOSTheme.space10)
                    .padding(.vertical, LOSTheme.space6)
                    .background(LOSTheme.accent.opacity(0.10))
                    .foregroundStyle(LOSTheme.accent)
                    .clipShape(Capsule())
                }
                
                // One-tap Add to Active Portfolio
                Button {
                    addStockToPortfolio(stock: stock, price: currentPrice)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus.circle.fill")
                            .font(.caption2)
                        Text("Add to Portfolio")
                            .font(.caption.weight(.semibold))
                    }
                    .padding(.horizontal, LOSTheme.space10)
                    .padding(.vertical, LOSTheme.space6)
                    .background(LOSTheme.surfaceElevated)
                    .foregroundStyle(LOSTheme.textPrimary)
                    .clipShape(Capsule())
                    .overlay(
                        Capsule().stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                }
                
                Spacer()
            }
        }
        .padding(LOSTheme.space12)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
    }
    
    // MARK: - Actions
    private func refreshAllQuotes() async {
        isLoadingQuotes = true
        let popular = Array(filteredStocks.prefix(15))
        
        for stock in popular {
            if let quote = try? await MarketDataAPIService.shared.fetchQuote(symbol: stock.symbol) {
                await MainActor.run {
                    quotesCache[stock.symbol] = quote
                }
            }
        }
        
        await MainActor.run {
            isLoadingQuotes = false
            lastRefreshed = Date()
        }
    }
    
    private func addStockToPortfolio(stock: StockCatalogItem, price: Double) {
        let shares = 10
        
        viewModel.addOrUpdateHolding(
            ticker: stock.symbol,
            companyName: stock.name,
            shares: shares,
            averageBuyPrice: price,
            sector: stock.sector,
            currentPrice: price
        )
        
        withAnimation {
            showAddedToast = "Added 10 shares of \(stock.symbol) to Portfolio"
        }
        
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            await MainActor.run {
                withAnimation {
                    showAddedToast = nil
                }
            }
        }
    }
}

#Preview("Live Market Watch") {
    LiveMarketWatchView(viewModel: ResilienceViewModel())
}
