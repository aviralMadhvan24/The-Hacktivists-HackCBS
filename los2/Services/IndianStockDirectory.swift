import Foundation

/// Represents a cataloged Indian Equity on NSE or BSE.
struct StockCatalogItem: Identifiable, Hashable, Codable {
    var id: String { "\(exchange):\(symbol)" }
    let symbol: String
    let name: String
    let exchange: String
    let sector: String
    let defaultPrice: Double
}

/// Comprehensive local directory of major NSE & BSE equities.
/// Provides instantaneous offline search, exchange filtering, and default pricing.
final class IndianStockDirectory {
    static let shared = IndianStockDirectory()
    
    let catalog: [StockCatalogItem] = [
        // --- NIFTY 50 & BLUECHIPS ---
        StockCatalogItem(symbol: "RELIANCE", name: "Reliance Industries Limited", exchange: "NSE", sector: "Energy & Telecom", defaultPrice: 1190.00),
        StockCatalogItem(symbol: "TCS", name: "Tata Consultancy Services Limited", exchange: "NSE", sector: "Information Technology", defaultPrice: 2530.00),
        StockCatalogItem(symbol: "HDFCBANK", name: "HDFC Bank Limited", exchange: "NSE", sector: "Banking", defaultPrice: 692.80),
        StockCatalogItem(symbol: "ICICIBANK", name: "ICICI Bank Limited", exchange: "NSE", sector: "Banking", defaultPrice: 1394.20),
        StockCatalogItem(symbol: "INFY", name: "Infosys Limited", exchange: "NSE", sector: "Information Technology", defaultPrice: 1153.80),
        StockCatalogItem(symbol: "BHARTIARTL", name: "Bharti Airtel Limited", exchange: "NSE", sector: "Telecommunications", defaultPrice: 1892.10),
        StockCatalogItem(symbol: "ITC", name: "ITC Limited", exchange: "NSE", sector: "Consumer Goods", defaultPrice: 257.90),
        StockCatalogItem(symbol: "SBIN", name: "State Bank of India", exchange: "NSE", sector: "Banking", defaultPrice: 958.60),
        StockCatalogItem(symbol: "LT", name: "Larsen & Toubro Limited", exchange: "NSE", sector: "Infrastructure", defaultPrice: 3647.00),
        StockCatalogItem(symbol: "TATAMOTORS", name: "Tata Motors Limited", exchange: "NSE", sector: "Automotive", defaultPrice: 264.60),
        StockCatalogItem(symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Limited", exchange: "NSE", sector: "Banking", defaultPrice: 430.50),
        StockCatalogItem(symbol: "AXISBANK", name: "Axis Bank Limited", exchange: "NSE", sector: "Banking", defaultPrice: 1217.50),
        StockCatalogItem(symbol: "HINDUNILVR", name: "Hindustan Unilever Limited", exchange: "NSE", sector: "Consumer Goods", defaultPrice: 1814.70),
        StockCatalogItem(symbol: "MARUTI", name: "Maruti Suzuki India Limited", exchange: "NSE", sector: "Automotive", defaultPrice: 11230.00),
        StockCatalogItem(symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries", exchange: "NSE", sector: "Pharmaceuticals", defaultPrice: 1748.00),
        StockCatalogItem(symbol: "TITAN", name: "Titan Company Limited", exchange: "NSE", sector: "Consumer Discretionary", defaultPrice: 4299.70),
        StockCatalogItem(symbol: "BAJFINANCE", name: "Bajaj Finance Limited", exchange: "NSE", sector: "Financial Services", defaultPrice: 928.95),
        StockCatalogItem(symbol: "BAJAJFINSV", name: "Bajaj Finserv Limited", exchange: "NSE", sector: "Financial Services", defaultPrice: 1655.00),
        StockCatalogItem(symbol: "ADANIENT", name: "Adani Enterprises Limited", exchange: "NSE", sector: "Conglomerate", defaultPrice: 2477.00),
        StockCatalogItem(symbol: "ADANIPORTS", name: "Adani Ports and SEZ Limited", exchange: "NSE", sector: "Logistics & Ports", defaultPrice: 1702.70),
        StockCatalogItem(symbol: "TATASTEEL", name: "Tata Steel Limited", exchange: "NSE", sector: "Metals & Mining", defaultPrice: 167.70),
        StockCatalogItem(symbol: "JSWSTEEL", name: "JSW Steel Limited", exchange: "NSE", sector: "Metals & Mining", defaultPrice: 1185.50),
        StockCatalogItem(symbol: "POWERGRID", name: "Power Grid Corporation of India", exchange: "NSE", sector: "Power Utilities", defaultPrice: 247.40),
        StockCatalogItem(symbol: "NTPC", name: "NTPC Limited", exchange: "NSE", sector: "Power Utilities", defaultPrice: 298.00),
        StockCatalogItem(symbol: "COALINDIA", name: "Coal India Limited", exchange: "NSE", sector: "Metals & Mining", defaultPrice: 397.45),
        StockCatalogItem(symbol: "ONGC", name: "Oil & Natural Gas Corporation", exchange: "NSE", sector: "Energy & Oil", defaultPrice: 284.00),
        StockCatalogItem(symbol: "M&M", name: "Mahindra & Mahindra Limited", exchange: "NSE", sector: "Automotive", defaultPrice: 2920.00),
        StockCatalogItem(symbol: "ULTRACEMCO", name: "UltraTech Cement Limited", exchange: "NSE", sector: "Cement", defaultPrice: 11450.00),
        StockCatalogItem(symbol: "ASIANPAINT", name: "Asian Paints Limited", exchange: "NSE", sector: "Consumer Goods", defaultPrice: 3040.00),
        StockCatalogItem(symbol: "WIPRO", name: "Wipro Limited", exchange: "NSE", sector: "Information Technology", defaultPrice: 538.00),
        StockCatalogItem(symbol: "HCLTECH", name: "HCL Technologies Limited", exchange: "NSE", sector: "Information Technology", defaultPrice: 1765.00),
        StockCatalogItem(symbol: "TECHM", name: "Tech Mahindra Limited", exchange: "NSE", sector: "Information Technology", defaultPrice: 1610.00),
        StockCatalogItem(symbol: "NESTLEIND", name: "Nestle India Limited", exchange: "NSE", sector: "Consumer Goods", defaultPrice: 2420.00),
        StockCatalogItem(symbol: "GRASIM", name: "Grasim Industries Limited", exchange: "NSE", sector: "Diversified", defaultPrice: 2680.00),
        StockCatalogItem(symbol: "CIPLA", name: "Cipla Limited", exchange: "NSE", sector: "Pharmaceuticals", defaultPrice: 1540.00),
        StockCatalogItem(symbol: "DRREDDY", name: "Dr. Reddy's Laboratories", exchange: "NSE", sector: "Pharmaceuticals", defaultPrice: 6620.00),
        StockCatalogItem(symbol: "APOLLOHOSP", name: "Apollo Hospitals Enterprise", exchange: "NSE", sector: "Healthcare", defaultPrice: 6980.00),
        StockCatalogItem(symbol: "EICHERMOT", name: "Eicher Motors Limited", exchange: "NSE", sector: "Automotive", defaultPrice: 4860.00),
        StockCatalogItem(symbol: "TATACONSUM", name: "Tata Consumer Products Limited", exchange: "NSE", sector: "Consumer Goods", defaultPrice: 1180.00),
        StockCatalogItem(symbol: "DIVISLAB", name: "Divi's Laboratories Limited", exchange: "NSE", sector: "Pharmaceuticals", defaultPrice: 5240.00),
        StockCatalogItem(symbol: "BRITANNIA", name: "Britannia Industries Limited", exchange: "NSE", sector: "Consumer Goods", defaultPrice: 5920.00),
        StockCatalogItem(symbol: "BPCL", name: "Bharat Petroleum Corporation", exchange: "NSE", sector: "Energy & Oil", defaultPrice: 345.00),
        StockCatalogItem(symbol: "HEROMOTOCO", name: "Hero MotoCorp Limited", exchange: "NSE", sector: "Automotive", defaultPrice: 5380.00),
        StockCatalogItem(symbol: "INDUSINDBK", name: "IndusInd Bank Limited", exchange: "NSE", sector: "Banking", defaultPrice: 1360.00),
        
        // --- HIGH VOLUME & RETAIL FAVORITES (NSE & BSE) ---
        StockCatalogItem(symbol: "ZOMATO", name: "Zomato Limited", exchange: "NSE", sector: "Consumer Internet", defaultPrice: 254.20),
        StockCatalogItem(symbol: "JIOFIN", name: "Jio Financial Services Limited", exchange: "NSE", sector: "Financial Services", defaultPrice: 332.50),
        StockCatalogItem(symbol: "SUZLON", name: "Suzlon Energy Limited", exchange: "NSE", sector: "Renewable Energy", defaultPrice: 72.80),
        StockCatalogItem(symbol: "TATAPOWER", name: "Tata Power Company Limited", exchange: "NSE", sector: "Power Utilities", defaultPrice: 438.50),
        StockCatalogItem(symbol: "IRFC", name: "Indian Railway Finance Corporation", exchange: "NSE", sector: "Railways & Finance", defaultPrice: 168.20),
        StockCatalogItem(symbol: "IREDA", name: "Indian Renewable Energy Dev Agency", exchange: "NSE", sector: "Green Energy & Finance", defaultPrice: 218.40),
        StockCatalogItem(symbol: "RVNL", name: "Rail Vikas Nigam Limited", exchange: "NSE", sector: "Railways Infrastructure", defaultPrice: 512.00),
        StockCatalogItem(symbol: "IRCTC", name: "Indian Railway Catering & Tourism", exchange: "NSE", sector: "Tourism & Railways", defaultPrice: 890.00),
        StockCatalogItem(symbol: "HAL", name: "Hindustan Aeronautics Limited", exchange: "NSE", sector: "Aerospace & Defense", defaultPrice: 4560.00),
        StockCatalogItem(symbol: "BEL", name: "Bharat Electronics Limited", exchange: "NSE", sector: "Defense Electronics", defaultPrice: 284.00),
        StockCatalogItem(symbol: "MAZDOCK", name: "Mazagon Dock Shipbuilders Limited", exchange: "NSE", sector: "Defense & Shipbuilding", defaultPrice: 4320.00),
        StockCatalogItem(symbol: "CDSL", name: "Central Depository Services Limited", exchange: "BSE", sector: "Capital Markets", defaultPrice: 1480.00),
        StockCatalogItem(symbol: "BSE", name: "BSE Limited", exchange: "BSE", sector: "Stock Exchange", defaultPrice: 4620.00),
        StockCatalogItem(symbol: "PAYTM", name: "One97 Communications Limited", exchange: "NSE", sector: "Fintech", defaultPrice: 710.00),
        StockCatalogItem(symbol: "YESBANK", name: "Yes Bank Limited", exchange: "NSE", sector: "Banking", defaultPrice: 22.40),
        StockCatalogItem(symbol: "IDEA", name: "Vodafone Idea Limited", exchange: "NSE", sector: "Telecommunications", defaultPrice: 8.90),
        StockCatalogItem(symbol: "TRENT", name: "Trent Limited (Westside/Zudio)", exchange: "NSE", sector: "Retail", defaultPrice: 7450.00),
        StockCatalogItem(symbol: "VBL", name: "Varun Beverages Limited", exchange: "NSE", sector: "Beverages & FMCG", defaultPrice: 610.00),
        StockCatalogItem(symbol: "POLYCAB", name: "Polycab India Limited", exchange: "NSE", sector: "Cables & Electricals", defaultPrice: 6850.00),
        StockCatalogItem(symbol: "KPITTECH", name: "KPIT Technologies Limited", exchange: "NSE", sector: "Automotive Software", defaultPrice: 1720.00),
        StockCatalogItem(symbol: "PERSISTENT", name: "Persistent Systems Limited", exchange: "NSE", sector: "Information Technology", defaultPrice: 5410.00),
        StockCatalogItem(symbol: "TATAELXSI", name: "Tata Elxsi Limited", exchange: "NSE", sector: "Technology & Design", defaultPrice: 7120.00),
        StockCatalogItem(symbol: "DIXON", name: "Dixon Technologies Limited", exchange: "NSE", sector: "Electronics Manufacturing", defaultPrice: 14200.00),
        StockCatalogItem(symbol: "NYKAA", name: "FSN E-Commerce Ventures (Nykaa)", exchange: "NSE", sector: "E-Commerce & Beauty", defaultPrice: 188.00),
        StockCatalogItem(symbol: "SWIGGY", name: "Swiggy Limited", exchange: "NSE", sector: "Consumer Internet", defaultPrice: 420.00),
        StockCatalogItem(symbol: "BHEL", name: "Bharat Heavy Electricals Limited", exchange: "NSE", sector: "Capital Goods", defaultPrice: 265.00),
        StockCatalogItem(symbol: "NHPC", name: "NHPC Limited", exchange: "NSE", sector: "Hydro Power", defaultPrice: 94.00),
        StockCatalogItem(symbol: "SAIL", name: "Steel Authority of India Limited", exchange: "NSE", sector: "Metals & Mining", defaultPrice: 128.00),
        
        // --- BSE SPECIFIC LISTINGS ---
        StockCatalogItem(symbol: "500325", name: "Reliance Industries (BSE Scrip 500325)", exchange: "BSE", sector: "Energy & Telecom", defaultPrice: 2916.65),
        StockCatalogItem(symbol: "532540", name: "Tata Consultancy Services (BSE 532540)", exchange: "BSE", sector: "Information Technology", defaultPrice: 3942.10),
        StockCatalogItem(symbol: "500180", name: "HDFC Bank (BSE Scrip 500180)", exchange: "BSE", sector: "Banking", defaultPrice: 1612.30),
        StockCatalogItem(symbol: "532174", name: "ICICI Bank (BSE Scrip 532174)", exchange: "BSE", sector: "Banking", defaultPrice: 1245.80),
        StockCatalogItem(symbol: "500209", name: "Infosys (BSE Scrip 500209)", exchange: "BSE", sector: "Information Technology", defaultPrice: 1784.50),
        StockCatalogItem(symbol: "500875", name: "ITC Limited (BSE Scrip 500875)", exchange: "BSE", sector: "Consumer Goods", defaultPrice: 478.90),
        StockCatalogItem(symbol: "500112", name: "State Bank of India (BSE 500112)", exchange: "BSE", sector: "Banking", defaultPrice: 812.50),
        StockCatalogItem(symbol: "500570", name: "Tata Motors (BSE Scrip 500570)", exchange: "BSE", sector: "Automotive", defaultPrice: 980.40)
    ]
    
    /// Fast in-memory search across symbols, company names, and sectors.
    func search(query: String, exchangeFilter: String? = nil) -> [StockCatalogItem] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !q.isEmpty else {
            if let ex = exchangeFilter, !ex.isEmpty && ex != "ALL" {
                return catalog.filter { $0.exchange.uppercased() == ex.uppercased() }
            }
            return Array(catalog.prefix(15))
        }
        
        return catalog.filter { item in
            let matchesExchange: Bool
            if let ex = exchangeFilter, !ex.isEmpty && ex != "ALL" {
                matchesExchange = item.exchange.uppercased() == ex.uppercased()
            } else {
                matchesExchange = true
            }
            
            let matchesText = item.symbol.contains(q) ||
                              item.name.uppercased().contains(q) ||
                              item.sector.uppercased().contains(q)
            
            return matchesExchange && matchesText
        }
    }
    
    /// Popular featured stock quick-chips for one-tap simulation or portfolio adding
    var featuredPicks: [StockCatalogItem] {
        let popularSymbols = [
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "TATAMOTORS",
            "ZOMATO", "TATAPOWER", "SUZLON", "IRFC", "HAL",
            "BEL", "CDSL", "BSE", "JIOFIN", "TRENT"
        ]
        return catalog.filter { popularSymbols.contains($0.symbol) }
    }
    
    func find(symbol: String) -> StockCatalogItem? {
        let clean = symbol.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        return catalog.first { $0.symbol == clean }
    }
}
