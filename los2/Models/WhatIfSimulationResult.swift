import Foundation
import SwiftUI

/// Models the outcome of a hypothetical stock addition before committing real capital.
struct WhatIfSimulationResult: Identifiable, Equatable {
    var id: String { "\(exchange):\(ticker)" }
    let ticker: String
    let companyName: String
    let exchange: String
    let sector: String
    let shares: Int
    let price: Double
    let simulatedInvestment: Double
    
    // Baseline (Current Portfolio)
    let baselinePortfolioValue: Double
    let baselineResilienceScore: Double
    let baselineEstimatedLoss: Double
    
    // Simulated (With New Stock)
    let newPortfolioValue: Double
    let newResilienceScore: Double
    let newEstimatedLoss: Double
    
    // Deltas & Impact
    let lossDelta: Double
    let scoreDelta: Double
    let newHoldingWeight: Double
    
    var isConcentrationHeavy: Bool {
        newHoldingWeight > 25.0
    }
    
    var scoreImpactDescription: String {
        if scoreDelta > 0.5 {
            return "Improves overall resilience by +\(String(format: "%.1f", scoreDelta)) pts through asset base expansion."
        } else if scoreDelta < -0.5 {
            return "Reduces resilience score by \(String(format: "%.1f", abs(scoreDelta))) pts due to increased market volatility exposure."
        } else {
            return "Neutral resilience impact. Portfolio buffer remains stable."
        }
    }
}
