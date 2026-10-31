import Foundation
import SwiftUI

/// Represents one transparent pillar of the 0-100 Resilience Score.
struct ResiliencePillar: Identifiable, Equatable {
    var id: String { name }
    let name: String
    let earnedPoints: Double
    let maxPoints: Double
    let weightPercent: Double
    let rating: String // "Critical", "Moderate", "Healthy", "Strong"
    let statusColor: Color
    let formulaDescription: String
    let currentMetricValue: String
    let improvementTip: String
}

/// Detailed breakdown report explaining every point of the Resilience Score.
struct ExplainableResilienceReport: Equatable {
    let totalScore: Int
    let band: ResilienceBand
    let pillars: [ResiliencePillar]
    let scoreChangeDrivers: [String]
    let missingDataPenalties: [String]
    let disclaimer: String
}
