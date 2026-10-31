import Foundation
import SwiftUI

/// Preset category for financial emergencies.
enum EmergencyCategory: String, CaseIterable, Identifiable, Codable {
    case medical = "Medical Emergency"
    case vehicle = "Vehicle Repair"
    case family = "Urgent Family Expense"
    case home = "Home / Appliance Repair"
    case jobGap = "Job Loss / Income Buffer"
    case custom = "Custom Emergency"
    
    var id: String { rawValue }
    
    var iconName: String {
        switch self {
        case .medical: return "cross.case.fill"
        case .vehicle: return "car.fill"
        case .family: return "person.2.fill"
        case .home: return "house.fill"
        case .jobGap: return "briefcase.fill"
        case .custom: return "bolt.shield.fill"
        }
    }
    
    var defaultAmount: Double {
        switch self {
        case .medical: return 75_000
        case .vehicle: return 35_000
        case .family: return 50_000
        case .home: return 25_000
        case .jobGap: return 120_000
        case .custom: return 50_000
        }
    }
    
    var suggestedDescription: String {
        switch self {
        case .medical: return "Hospitalization, urgent medication, or non-covered treatments."
        case .vehicle: return "Engine breakdown, transmission, or collision deductibles."
        case .family: return "Supporting family members or urgent emergency travel."
        case .home: return "Plumbing, roof repair, or essential appliance failure."
        case .jobGap: return "Buffer to survive 2-3 months of transition between roles."
        case .custom: return "User-defined unforeseen liquidity demand."
        }
    }
}

/// Frequency of the emergency expense.
enum EmergencyExpenseType: String, CaseIterable, Identifiable, Codable {
    case oneTime = "One-Time Expense"
    case recurring = "Recurring Monthly"
    
    var id: String { rawValue }
    
    var shortTitle: String {
        switch self {
        case .oneTime: return "One-Time"
        case .recurring: return "Recurring"
        }
    }
}

/// User configurable parameters for simulating an emergency shock.
struct EmergencyScenario: Equatable, Codable {
    var category: EmergencyCategory = .medical
    var expenseType: EmergencyExpenseType = .oneTime
    var amount: Double = 50_000
    var recurringMonths: Int = 3 // If recurring
    var customTitle: String = ""
    
    var totalEmergencyDrain: Double {
        switch expenseType {
        case .oneTime:
            return max(0, amount)
        case .recurring:
            return max(0, amount) * Double(max(1, recurringMonths))
        }
    }
}

/// Output of an emergency simulation comparing before vs after states.
struct EmergencySimulationResult: Equatable {
    let preShockCash: Double
    let totalEmergencyDrain: Double
    let postShockCash: Double
    let fundingShortfall: Double
    let isShortfall: Bool
    
    let minimumReserveTarget: Double
    let isReserveBreached: Bool
    let reserveBreachAmount: Double
    
    let preShockMonthlyBurn: Double
    let postShockMonthlyBurn: Double
    
    let preShockRunwayMonths: Double
    let postShockRunwayMonths: Double
    let runwayReductionMonths: Double
    
    let cashDrainedPercentage: Double
    let summaryHeadline: String
    let severityRating: String // "Manageable", "Concerning", "Critical"
    let statusColor: Color
}
