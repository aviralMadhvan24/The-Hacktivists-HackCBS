import Foundation

/// A concrete financial recovery option generated through deterministic arithmetic.
struct RecoveryPlanOption: Identifiable, Codable, Equatable {
    let id: String
    let tier: String // "Conservative", "Balanced", "Aggressive"
    let title: String
    let description: String
    let monthlyExpenseReduction: Double
    let newMonthlyOutflow: Double
    let newNetBurn: Double
    let newRunwayMonths: Double
    let runwayExtensionMonths: Double
    let monthsToRebuildEmergencyFund: Int
    let tradeOffs: String
    let actionSteps: [String]
}

/// Baseline figures used to benchmark recovery plans.
struct RecoveryBaseline: Codable, Equatable {
    let initialCash: Double
    let emergencyExpense: Double
    let immediatePostShockCash: Double
    let totalMonthlyOutflows: Double
    let monthlyIncome: Double
    let baselineNetBurn: Double
    let baselineRunwayMonths: Double
    let portfolioValue: Double
    let simulatedPortfolioLoss: Double
}

/// Overall recovery response containing deterministic plans and AI explanation.
struct RecoveryPlanResponse: Codable, Equatable {
    let aiGenerated: Bool
    let aiProvider: String
    let summary: String
    let recommendedTier: String?
    let riskAdvisory: String?
    let plans: [RecoveryPlanOption]
}
