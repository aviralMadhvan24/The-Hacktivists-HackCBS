import Foundation
import SwiftUI

/// Core mathematical engine that models financial shock waves, runway, and transparent resilience scoring.
struct ResilienceEngine {
    
    /// Computes a full resilience assessment given a financial profile and a simulated market drop percentage.
    static func analyze(profile: FinancialProfile, declinePercent: Double) -> ResilienceReport {
        // 1. Portfolio Stress Impact
        let marketDeclinePercent = max(0, min(100, declinePercent))
        let portfolioLoss = profile.portfolioValue * (marketDeclinePercent / 100.0)
        let remainingPortfolio = max(0, profile.portfolioValue - portfolioLoss)
        let portfolioRetentionPercent = profile.portfolioValue > 0
            ? (remainingPortfolio / profile.portfolioValue) * 100.0
            : 100.0
        
        // 2. Emergency Shock Impact
        let initialCash = profile.liquidCash
        let unexpectedBill = profile.unexpectedExpense
        let remainingCash = initialCash - unexpectedBill
        let emergencyCashUsedPercent = initialCash > 0
            ? min(100.0, max(0.0, (unexpectedBill / initialCash) * 100.0))
            : 100.0
        
        // 3. Cash Burn & Runway (incorporating optional monthly debt commitments)
        let income = profile.monthlyIncome
        let expenses = profile.monthlyExpenses + profile.monthlyDebtPayments
        let netBurn = expenses - income // positive = burning cash, negative = surplus
        
        let runwayMonths: Double
        let runwayState: RunwayState
        
        if remainingCash <= 0 {
            runwayMonths = 0.0
            runwayState = .underwater
        } else if netBurn > 0 {
            runwayMonths = remainingCash / netBurn
            runwayState = .exhausting
        } else if netBurn == 0 {
            runwayMonths = 99.0 // Infinite/stable
            runwayState = .breakEven
        } else {
            runwayMonths = 99.0 // Cash growing each month
            runwayState = .cashSurplus
        }
        
        // 4. Resilience Score Calculation (0 - 100)
        let explainable = calculateExplainableScore(profile: profile, declinePercent: marketDeclinePercent)
        let score = explainable.totalScore
        let band = explainable.band
        
        // 5. Summary Headline and Plain-English Verdict
        let headline: String
        let formattedLoss = LOSTheme.formatRupee(portfolioLoss)
        let formattedRemainingCash = LOSTheme.formatRupee(remainingCash)
        let formattedBill = LOSTheme.formatRupee(unexpectedBill)
        
        if runwayState == .cashSurplus {
            headline = "\(band.rawValue) - CASH SURPLUS"
        } else if runwayState == .breakEven {
            headline = "\(band.rawValue) - BREAK EVEN"
        } else {
            headline = "\(band.rawValue) - \(String(format: "%.1f", runwayMonths)) MONTHS RUNWAY"
        }
        
        let verdict = "\(band.rawValue.capitalized): \(Int(marketDeclinePercent))% crash + \(formattedBill) bill leaves \(formattedRemainingCash) cash, \(runwayState == .cashSurplus ? "cash surplus" : String(format: "%.1f months runway", runwayMonths))."
        
        // 6. Actionable Recommendations
        var recommendations: [String] = []
        if remainingCash < (expenses * 3) {
            let targetCash = expenses * 3
            recommendations.append("Build emergency buffer to at least \(LOSTheme.formatRupee(targetCash)) (3 months expenses).")
        }
        if runwayMonths < 6.0 && netBurn > 0 {
            recommendations.append("Reduce monthly burn of \(LOSTheme.formatRupee(netBurn))/mo to extend runway past 6 months.")
        }
        if marketDeclinePercent >= 15.0 && portfolioLoss > (profile.portfolioValue * 0.2) {
            recommendations.append("Review portfolio asset allocation to minimize drawdown exposure.")
        }
        if recommendations.isEmpty {
            recommendations.append("Financial cushion is resilient against combined market and expense shocks.")
        }
        
        return ResilienceReport(
            marketDeclinePercent: marketDeclinePercent,
            estimatedPortfolioLoss: portfolioLoss,
            remainingPortfolioValue: remainingPortfolio,
            portfolioRetentionPercent: portfolioRetentionPercent,
            initialCash: initialCash,
            unexpectedBill: unexpectedBill,
            remainingCashAfterEmergency: remainingCash,
            emergencyCashUsedPercent: emergencyCashUsedPercent,
            monthlyIncome: income,
            monthlyExpenses: expenses,
            monthlyNetBurn: max(0, netBurn),
            runwayMonths: runwayMonths,
            runwayState: runwayState,
            resilienceScore: score,
            resilienceBand: band,
            summaryHeadline: headline,
            summaryVerdict: verdict,
            recommendations: recommendations
        )
    }
    
    // MARK: - 5-Pillar Explainable Resilience Score Engine
    static func calculateExplainableScore(
        profile: FinancialProfile,
        declinePercent: Double
    ) -> ExplainableResilienceReport {
        let totalOutflows = profile.monthlyExpenses + profile.monthlyDebtPayments
        let postShockCash = max(0, profile.liquidCash - profile.unexpectedExpense)
        let netBurn = max(0, totalOutflows - profile.monthlyIncome)
        
        var missingDataNotes: [String] = []
        var scoreDrivers: [String] = []
        
        // Pillar 1: Emergency Cash Coverage (Weight: 30 pts)
        // 6+ months of total monthly outflows = 30 pts
        let coverageMonths = totalOutflows > 0 ? postShockCash / totalOutflows : 6.0
        let p1Earned: Double
        let p1Rating: String
        let p1Color: Color
        if coverageMonths >= 6.0 {
            p1Earned = 30.0
            p1Rating = "Optimal"
            p1Color = LOSTheme.safeGreen
            scoreDrivers.append("+30 pts: Emergency cash covers over 6 months of living expenses.")
        } else if coverageMonths >= 3.0 {
            p1Earned = 15.0 + ((coverageMonths - 3.0) / 3.0) * 15.0
            p1Rating = "Moderate"
            p1Color = LOSTheme.warningAmber
        } else if coverageMonths >= 1.0 {
            p1Earned = 5.0 + ((coverageMonths - 1.0) / 2.0) * 10.0
            p1Rating = "Fragile"
            p1Color = LOSTheme.warningAmber
            scoreDrivers.append("−15 pts: Emergency cash covers under 3 months of expenses.")
        } else {
            p1Earned = max(0, coverageMonths * 5.0)
            p1Rating = "Critical"
            p1Color = LOSTheme.criticalRed
            scoreDrivers.append("Critical: Under 1 month cash buffer after emergency shock.")
        }
        
        let pillar1 = ResiliencePillar(
            name: "Emergency Cash Coverage",
            earnedPoints: round(p1Earned * 10) / 10,
            maxPoints: 30.0,
            weightPercent: 30.0,
            rating: p1Rating,
            statusColor: p1Color,
            formulaDescription: "Evaluates post-emergency cash divided by monthly fixed outflows (target: 6+ months).",
            currentMetricValue: "\(String(format: "%.1f", coverageMonths)) months covered",
            improvementTip: "Increasing cash buffer to \(LOSTheme.formatRupee(totalOutflows * 6)) maximizes this pillar (+30 pts)."
        )
        
        // Pillar 2: Cash Flow & Burn Rate (Weight: 25 pts)
        let p2Earned: Double
        let p2Rating: String
        let p2Color: Color
        if profile.monthlyIncome >= totalOutflows {
            let surplusRate = profile.monthlyIncome > 0 ? (profile.monthlyIncome - totalOutflows) / profile.monthlyIncome : 0
            if surplusRate >= 0.20 {
                p2Earned = 25.0
                p2Rating = "Strong Surplus"
                p2Color = LOSTheme.safeGreen
            } else {
                p2Earned = 18.0 + (surplusRate / 0.20) * 7.0
                p2Rating = "Mild Surplus"
                p2Color = LOSTheme.safeGreen
            }
        } else {
            // Deficit
            let deficitRatio = totalOutflows > 0 ? netBurn / totalOutflows : 0.5
            p2Earned = max(2.0, (1.0 - min(1.0, deficitRatio)) * 12.0)
            p2Rating = "Monthly Burn"
            p2Color = LOSTheme.warningAmber
            scoreDrivers.append("−\(Int(25.0 - p2Earned)) pts: Spending exceeds income by \(LOSTheme.formatRupee(netBurn))/mo.")
        }
        
        let pillar2 = ResiliencePillar(
            name: "Cash Flow & Burn",
            earnedPoints: round(p2Earned * 10) / 10,
            maxPoints: 25.0,
            weightPercent: 25.0,
            rating: p2Rating,
            statusColor: p2Color,
            formulaDescription: "Measures whether your income covers monthly expenses without eating into savings.",
            currentMetricValue: netBurn == 0 ? "Zero Burn (Break-Even)" : "\(LOSTheme.formatRupee(netBurn))/mo Burn",
            improvementTip: "Eliminating monthly cash burn adds up to +\(Int(25.0 - p2Earned)) pts to your resilience score."
        )
        
        // Pillar 3: Debt & EMI Burden (Weight: 15 pts)
        let p3Earned: Double
        let p3Rating: String
        let p3Color: Color
        if profile.monthlyDebtPayments == 0 {
            p3Earned = 15.0
            p3Rating = "Debt-Free"
            p3Color = LOSTheme.safeGreen
        } else {
            let debtRatio = profile.monthlyIncome > 0 ? profile.monthlyDebtPayments / profile.monthlyIncome : 1.0
            if debtRatio <= 0.20 {
                p3Earned = 13.0
                p3Rating = "Safe (< 20%)"
                p3Color = LOSTheme.safeGreen
            } else if debtRatio <= 0.40 {
                p3Earned = 8.0
                p3Rating = "Moderate (20-40%)"
                p3Color = LOSTheme.warningAmber
            } else {
                p3Earned = 3.0
                p3Rating = "High Debt Burden"
                p3Color = LOSTheme.criticalRed
                scoreDrivers.append("−12 pts: Debt obligations take up \(Int(debtRatio * 100))% of monthly income.")
            }
        }
        
        let pillar3 = ResiliencePillar(
            name: "Debt & EMI Burden",
            earnedPoints: round(p3Earned * 10) / 10,
            maxPoints: 15.0,
            weightPercent: 15.0,
            rating: p3Rating,
            statusColor: p3Color,
            formulaDescription: "Evaluates monthly debt service ratio (EMI divided by income; safe is under 20%).",
            currentMetricValue: profile.monthlyDebtPayments == 0 ? "No Debt / 0% EMI" : "\(LOSTheme.formatRupee(profile.monthlyDebtPayments))/mo EMI",
            improvementTip: "Keeping EMI commitments under 20% of income preserves liquid safety buffers."
        )
        
        // Pillar 4: Portfolio Concentration (Weight: 15 pts)
        let p4Earned: Double
        let p4Rating: String
        let p4Color: Color
        let holdings = profile.activeHoldings
        let topWeight = holdings.map { $0.portfolioWeightPercent }.max() ?? 35.0
        
        if topWeight <= 25.0 {
            p4Earned = 15.0
            p4Rating = "Well Diversified"
            p4Color = LOSTheme.safeGreen
        } else if topWeight <= 40.0 {
            p4Earned = 11.0
            p4Rating = "Balanced (35% top)"
            p4Color = LOSTheme.primary
        } else if topWeight <= 60.0 {
            p4Earned = 6.0
            p4Rating = "Concentrated"
            p4Color = LOSTheme.warningAmber
            scoreDrivers.append("−9 pts: Top stock accounts for \(Int(topWeight))% of portfolio.")
        } else {
            p4Earned = 2.0
            p4Rating = "Extremely Concentrated"
            p4Color = LOSTheme.criticalRed
        }
        
        let pillar4 = ResiliencePillar(
            name: "Portfolio Diversification",
            earnedPoints: round(p4Earned * 10) / 10,
            maxPoints: 15.0,
            weightPercent: 15.0,
            rating: p4Rating,
            statusColor: p4Color,
            formulaDescription: "Evaluates concentration risk. A single stock holding over 40% reduces resilience.",
            currentMetricValue: "Largest Holding: \(Int(topWeight))%",
            improvementTip: "Spreading holdings so that no single stock exceeds 25% allocation adds +4 pts."
        )
        
        // Pillar 5: Shock Survival Under Stress (Weight: 15 pts)
        let p5Earned: Double
        let p5Rating: String
        let p5Color: Color
        let d = max(0, min(100, declinePercent))
        let retention = 1.0 - (d / 100.0)
        
        if retention >= 0.85 {
            p5Earned = 14.0 // ~20 pts scaled across combined resilience
            p5Rating = "Resilient Retention"
            p5Color = LOSTheme.safeGreen
        } else if retention >= 0.70 {
            p5Earned = 9.0
            p5Rating = "Moderate Drawdown"
            p5Color = LOSTheme.warningAmber
        } else {
            p5Earned = max(1.0, retention * 8.0)
            p5Rating = "Heavy Drawdown"
            p5Color = LOSTheme.criticalRed
        }
        
        let pillar5 = ResiliencePillar(
            name: "Market Shock Absorption",
            earnedPoints: round(p5Earned * 10) / 10,
            maxPoints: 15.0,
            weightPercent: 15.0,
            rating: p5Rating,
            statusColor: p5Color,
            formulaDescription: "Measures wealth retention and runway duration under user-selected market shock.",
            currentMetricValue: "\(Int(retention * 100))% Retained under \(Int(d))% Shock",
            improvementTip: "Pairing market equities with short-duration debt or liquid savings buffers shock impact."
        )
        
        let rawSum = p1Earned + p2Earned + p3Earned + p4Earned + p5Earned
        let finalScore = max(5, min(100, Int(round(rawSum))))
        
        let band: ResilienceBand
        switch finalScore {
        case ..<40: band = .critical
        case 40..<70: band = .moderate
        case 70..<85: band = .healthy
        default: band = .bulletproof
        }
        
        if profile.monthlyIncome == 0 {
            missingDataNotes.append("Monthly income is set to ₹0. Enter actual earnings for accurate cash flow scoring.")
        }
        
        return ExplainableResilienceReport(
            totalScore: finalScore,
            band: band,
            pillars: [pillar1, pillar2, pillar3, pillar4, pillar5],
            scoreChangeDrivers: scoreDrivers,
            missingDataPenalties: missingDataNotes,
            disclaimer: "Illustrative internal resilience index based on deterministic math. Not an official credit rating or investment guarantee."
        )
    }
    
    // MARK: - Baseline Resilience Score (Without Scenario Precondition)
    /// Calculates the user's permanent baseline resilience score under normal conditions (0% market shock).
    static func calculateBaselineScore(profile: FinancialProfile) -> ExplainableResilienceReport {
        return calculateExplainableScore(profile: profile, declinePercent: 0.0)
    }
    
    // MARK: - Emergency Shock Simulation Engine
    /// Computes full before-and-after liquidity, shortfall, reserve breach, and runway dynamics for emergency shocks.
    static func calculateEmergencySimulation(
        profile: FinancialProfile,
        scenario: EmergencyScenario
    ) -> EmergencySimulationResult {
        let preCash = max(0, profile.liquidCash)
        let totalDrain = scenario.totalEmergencyDrain
        let rawRemaining = preCash - totalDrain
        let postCash = max(0, rawRemaining)
        let shortfall = rawRemaining < 0 ? abs(rawRemaining) : 0.0
        let isShortfall = shortfall > 0
        
        let reserveTarget = max(0, profile.minimumCashReserve)
        let isBreached = rawRemaining < reserveTarget
        let breachAmount = isBreached ? max(0, reserveTarget - rawRemaining) : 0.0
        
        let preBurn = max(0, profile.totalMonthlyOutflows - profile.monthlyIncome)
        let additionalMonthly = scenario.expenseType == .recurring ? scenario.amount : 0.0
        let postBurn = max(0, (profile.totalMonthlyOutflows + additionalMonthly) - profile.monthlyIncome)
        
        let preRunway = preBurn > 0 ? (preCash / preBurn) : 99.0
        let postRunway: Double
        if isShortfall || postCash == 0 {
            postRunway = 0.0
        } else if postBurn > 0 {
            postRunway = postCash / postBurn
        } else {
            postRunway = 99.0
        }
        
        let runwayReduction = max(0, preRunway - postRunway)
        let cashDrainedPercent = preCash > 0 ? min(100.0, (totalDrain / preCash) * 100.0) : 100.0
        
        let severity: String
        let color: Color
        let headline: String
        
        if isShortfall {
            severity = "Critical Shortfall"
            color = LOSTheme.criticalRed
            headline = "Funding Deficit of \(LOSTheme.formatRupee(shortfall)). Liquid cash exhausted."
        } else if isBreached {
            severity = "Reserve Breached"
            color = LOSTheme.warningAmber
            headline = "Safety floor of \(LOSTheme.formatRupee(reserveTarget)) breached by \(LOSTheme.formatRupee(breachAmount))."
        } else if cashDrainedPercent > 50 {
            severity = "High Absorption"
            color = LOSTheme.warningAmber
            headline = "Absorbed, but drains \(Int(cashDrainedPercent))% of your liquid safety reserve."
        } else {
            severity = "Manageable"
            color = LOSTheme.safeGreen
            headline = "Emergency fully absorbed within cash reserves without breaching safety floor."
        }
        
        return EmergencySimulationResult(
            preShockCash: preCash,
            totalEmergencyDrain: totalDrain,
            postShockCash: postCash,
            fundingShortfall: shortfall,
            isShortfall: isShortfall,
            minimumReserveTarget: reserveTarget,
            isReserveBreached: isBreached,
            reserveBreachAmount: breachAmount,
            preShockMonthlyBurn: preBurn,
            postShockMonthlyBurn: postBurn,
            preShockRunwayMonths: Double(round(preRunway * 10) / 10),
            postShockRunwayMonths: Double(round(postRunway * 10) / 10),
            runwayReductionMonths: Double(round(runwayReduction * 10) / 10),
            cashDrainedPercentage: cashDrainedPercent,
            summaryHeadline: headline,
            severityRating: severity,
            statusColor: color
        )
    }
    
    // MARK: - Stress Chart Data Calculators
    struct DeclineCurvePoint: Identifiable, Equatable {
        var id: Double { declinePercent }
        let declinePercent: Double
        let remainingPortfolio: Double
        let estimatedLoss: Double
    }
    
    static func calculateDeclineCurve(portfolioValue: Double) -> [DeclineCurvePoint] {
        let percentages = [0.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0, 40.0, 50.0, 60.0]
        return percentages.map { pct in
            let loss = portfolioValue * (pct / 100.0)
            let remaining = max(0, portfolioValue - loss)
            return DeclineCurvePoint(
                declinePercent: pct,
                remainingPortfolio: remaining,
                estimatedLoss: loss
            )
        }
    }
    
    struct ScenarioComparisonPoint: Identifiable, Equatable {
        var id: String { scenarioName }
        let scenarioName: String
        let declinePercent: Double
        let remainingPortfolio: Double
        let loss: Double
        let isSelected: Bool
    }
    
    static func calculateScenarioComparisons(portfolioValue: Double, activeDecline: Double) -> [ScenarioComparisonPoint] {
        let scenarios: [(name: String, pct: Double)] = [
            ("Mild", 5.0),
            ("Stress", 15.0),
            ("Severe", 30.0),
            ("Crisis", 50.0)
        ]
        
        var points = scenarios.map { item in
            let loss = portfolioValue * (item.pct / 100.0)
            let remaining = max(0, portfolioValue - loss)
            let selected = abs(item.pct - activeDecline) < 0.5
            return ScenarioComparisonPoint(
                scenarioName: item.name,
                declinePercent: item.pct,
                remainingPortfolio: remaining,
                loss: loss,
                isSelected: selected
            )
        }
        
        // If activeDecline is a custom value not matching standard presets, append Custom
        if !scenarios.contains(where: { abs($0.pct - activeDecline) < 0.5 }) {
            let customLoss = portfolioValue * (activeDecline / 100.0)
            let customRemaining = max(0, portfolioValue - customLoss)
            points.append(ScenarioComparisonPoint(
                scenarioName: "Custom (\(Int(activeDecline))%)",
                declinePercent: activeDecline,
                remainingPortfolio: customRemaining,
                loss: customLoss,
                isSelected: true
            ))
        }
        
        return points
    }
}
