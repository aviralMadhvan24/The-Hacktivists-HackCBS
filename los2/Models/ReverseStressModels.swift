import Foundation
import SwiftUI

/// User-defined failure condition for reverse stress testing.
enum SafetyBreachCondition: String, CaseIterable, Identifiable, Codable {
    case minimumCashReserve = "Cash Falls Below Minimum Safety Reserve"
    case runwayUnder3Months = "Runway Drops Below 3.0 Months"
    case runwayUnder1Month = "Runway Drops Below 1.0 Month"
    case completeCashDepletion = "Cash Fully Depleted (₹0 - Forced Asset Sale)"
    
    var id: String { rawValue }
    
    var shortTitle: String {
        switch self {
        case .minimumCashReserve: return "Min Floor"
        case .runwayUnder3Months: return "< 3 Mos"
        case .runwayUnder1Month: return "< 1 Mo"
        case .completeCashDepletion: return "Zero Cash"
        }
    }
}

/// Reverse stress testing assumptions configured by the user.
struct ReverseStressAssumption: Equatable {
    var scenarioDurationMonths: Int = 3
    var incomeDisruptionPercent: Double = 0.0 // 0% to 100%
    var emergencyExpense: Double = 50_000
    var breachCondition: SafetyBreachCondition = .minimumCashReserve
    var targetCashFloor: Double = 20_000
    var targetStockTicker: String? = nil // nil = portfolio-wide, otherwise specific holding
}

/// Output of the deterministic reverse stress calculation.
struct ReverseStressResult: Equatable {
    let isBreached: Bool
    let breakingPointDeclinePercent: Double? // e.g. 42.5%
    let remainingCashAtBreach: Double
    let remainingPortfolioAtBreach: Double
    let estimatedRunwayAtBreach: Double
    let monthlyCashDrain: Double
    let primaryDriver: String
    let explanation: String
    let testedRangeMax: Double // e.g. 100%
}
