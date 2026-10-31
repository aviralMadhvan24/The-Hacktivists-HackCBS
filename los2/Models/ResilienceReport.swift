import Foundation
import SwiftUI

enum RunwayState: String {
    case exhausting = "Exhausting Cash"
    case breakEven = "Break-Even"
    case cashSurplus = "Cash Surplus (Growing)"
    case underwater = "Deficit Without Cash"
}

enum ResilienceBand: String {
    case critical = "CRITICAL"
    case moderate = "MODERATE"
    case healthy = "HEALTHY"
    case bulletproof = "BULLETPROOF"
    
    var color: Color {
        switch self {
        case .critical: return LOSTheme.criticalRed
        case .moderate: return LOSTheme.warningAmber
        case .healthy: return LOSTheme.safeGreen
        case .bulletproof: return LOSTheme.primary
        }
    }
}

/// The output report containing all simulated metrics after applying financial stress.
struct ResilienceReport: Equatable {
    // Portfolio Stress
    let marketDeclinePercent: Double
    let estimatedPortfolioLoss: Double
    let remainingPortfolioValue: Double
    let portfolioRetentionPercent: Double
    
    // Emergency Impact
    let initialCash: Double
    let unexpectedBill: Double
    let remainingCashAfterEmergency: Double
    let emergencyCashUsedPercent: Double
    
    // Runway & Cash Flow
    let monthlyIncome: Double
    let monthlyExpenses: Double
    let monthlyNetBurn: Double
    let runwayMonths: Double
    let runwayState: RunwayState
    
    // Overall Resilience
    let resilienceScore: Int
    let resilienceBand: ResilienceBand
    let summaryHeadline: String
    let summaryVerdict: String
    let recommendations: [String]
}
