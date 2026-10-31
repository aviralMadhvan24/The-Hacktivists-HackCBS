import Foundation
import SwiftUI

/// Data freshness indicator as mandated by financial market regulations.
enum MarketDataFreshness: String, Codable {
    case realtime = "REALTIME"
    case delayed = "DELAYED_15MIN"
    case endOfDay = "END_OF_DAY"
    case demoData = "DEMO_DATA"
    case stale = "STALE"
    case unavailable = "UNAVAILABLE"
    
    var displayName: String {
        switch self {
        case .realtime: return "LIVE"
        case .delayed: return "DELAYED 15M"
        case .endOfDay: return "END OF DAY"
        case .demoData: return "DEMO DATA"
        case .stale: return "STALE"
        case .unavailable: return "OFFLINE"
        }
    }
    
    var color: Color {
        switch self {
        case .realtime: return LOSTheme.safeGreen
        case .delayed: return LOSTheme.warningAmber
        case .endOfDay: return Color.secondary
        case .demoData: return LOSTheme.primary
        case .stale: return LOSTheme.criticalRed
        case .unavailable: return Color.gray
        }
    }
    
    var badgeColor: Color {
        return color
    }
}

/// Represents an individual stock holding within the user's investment portfolio.
struct PortfolioHolding: Identifiable, Equatable, Codable {
    var id: UUID = UUID()
    var companyName: String
    var ticker: String
    var sector: String
    var shares: Int
    var averageBuyPrice: Double
    var currentPrice: Double
    var previousClose: Double?
    var priceChange: Double?
    var priceChangePercent: Double?
    var portfolioWeightPercent: Double
    var freshness: MarketDataFreshness
    var lastUpdated: Date?
    var staleWarning: String?
    
    /// Total current market valuation = shares * currentPrice
    var currentValue: Double {
        return Double(shares) * currentPrice
    }
    
    /// Total invested capital = shares * averageBuyPrice
    var investedValue: Double {
        return Double(shares) * averageBuyPrice
    }
    
    /// Total unrealized profit / loss = market value - invested capital
    var unrealizedPnL: Double {
        return currentValue - investedValue
    }
    
    /// Unrealized return percentage
    var unrealizedPnLPercent: Double {
        guard investedValue > 0 else { return 0.0 }
        return (unrealizedPnL / investedValue) * 100.0
    }
    
    init(
        id: UUID = UUID(),
        companyName: String,
        ticker: String,
        sector: String = "Equity",
        shares: Int = 1,
        averageBuyPrice: Double,
        currentPrice: Double? = nil,
        previousClose: Double? = nil,
        priceChange: Double? = nil,
        priceChangePercent: Double? = nil,
        portfolioWeightPercent: Double = 0.0,
        freshness: MarketDataFreshness = .demoData,
        lastUpdated: Date? = nil,
        staleWarning: String? = nil,
        // Legacy initializer support
        currentValue: Double? = nil
    ) {
        self.id = id
        self.companyName = companyName
        self.ticker = ticker.uppercased()
        self.sector = sector
        self.shares = max(1, shares)
        self.averageBuyPrice = averageBuyPrice
        
        // If currentPrice is provided, use it. Else derive from legacy currentValue or averageBuyPrice
        if let cp = currentPrice {
            self.currentPrice = cp
        } else if let cv = currentValue, shares > 0 {
            self.currentPrice = cv / Double(shares)
        } else {
            self.currentPrice = averageBuyPrice
        }
        
        self.previousClose = previousClose
        self.priceChange = priceChange
        self.priceChangePercent = priceChangePercent
        self.portfolioWeightPercent = portfolioWeightPercent
        self.freshness = freshness
        self.lastUpdated = lastUpdated ?? Date()
        self.staleWarning = staleWarning
    }
    
    /// Convenience initializer supporting legacy mappings and broker sync
    init(
        id: UUID = UUID(),
        companyName: String,
        ticker: String,
        sector: String = "Equity",
        currentValue: Double,
        portfolioWeightPercent: Double = 0.0,
        shares: Int? = nil,
        averageBuyPrice: Double? = nil,
        freshness: MarketDataFreshness = .realtime,
        lastUpdated: Date? = nil
    ) {
        let sh = max(1, shares ?? 1)
        let avg = averageBuyPrice ?? (currentValue / Double(sh))
        self.init(
            id: id,
            companyName: companyName,
            ticker: ticker,
            sector: sector,
            shares: sh,
            averageBuyPrice: avg,
            currentPrice: currentValue / Double(sh),
            portfolioWeightPercent: portfolioWeightPercent,
            freshness: freshness,
            lastUpdated: lastUpdated ?? Date()
        )
    }
    
    /// Default holdings representing the ₹5,00,000 portfolio from the pitch deck.
    static let pitchDeckHoldings: [PortfolioHolding] = [
        PortfolioHolding(
            companyName: "Reliance Industries",
            ticker: "RELIANCE",
            sector: "Energy & Telecom",
            shares: 60,
            averageBuyPrice: 2850,
            currentPrice: 2916.65,
            previousClose: 2890.00,
            priceChange: 26.65,
            priceChangePercent: 0.92,
            portfolioWeightPercent: 35.0,
            freshness: .demoData
        ),
        PortfolioHolding(
            companyName: "Tata Consultancy Services",
            ticker: "TCS",
            sector: "Information Technology",
            shares: 38,
            averageBuyPrice: 3800,
            currentPrice: 3942.10,
            previousClose: 3915.50,
            priceChange: 26.60,
            priceChangePercent: 0.68,
            portfolioWeightPercent: 30.0,
            freshness: .demoData
        ),
        PortfolioHolding(
            companyName: "HDFC Bank",
            ticker: "HDFCBANK",
            sector: "Financial Services",
            shares: 62,
            averageBuyPrice: 1550,
            currentPrice: 1612.30,
            previousClose: 1604.80,
            priceChange: 7.50,
            priceChangePercent: 0.47,
            portfolioWeightPercent: 20.0,
            freshness: .demoData
        ),
        PortfolioHolding(
            companyName: "Infosys",
            ticker: "INFY",
            sector: "Information Technology",
            shares: 42,
            averageBuyPrice: 1720,
            currentPrice: 1784.50,
            previousClose: 1792.00,
            priceChange: -7.50,
            priceChangePercent: -0.42,
            portfolioWeightPercent: 15.0,
            freshness: .demoData
        )
    ]
}
