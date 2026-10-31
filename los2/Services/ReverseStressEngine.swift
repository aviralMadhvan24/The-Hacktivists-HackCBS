import Foundation

/// Pure deterministic calculation engine for Reverse Stress Testing.
/// Uses numerical bisection to identify the precise threshold market shock that breaches user-defined safety limits.
struct ReverseStressEngine {
    
    static func calculateBreakingPoint(
        profile: FinancialProfile,
        assumption: ReverseStressAssumption
    ) -> ReverseStressResult {
        let duration = max(1, assumption.scenarioDurationMonths)
        let incomeDisruption = max(0, min(100, assumption.incomeDisruptionPercent))
        let emergencyBill = max(0, assumption.emergencyExpense)
        let fixedOutflows = profile.monthlyExpenses + profile.monthlyDebtPayments
        
        // Disrupted Monthly Cash Flow
        let effectiveIncome = profile.monthlyIncome * (1.0 - (incomeDisruption / 100.0))
        let monthlyBurn = max(0, fixedOutflows - effectiveIncome)
        let totalCashDrain = emergencyBill + (monthlyBurn * Double(duration))
        
        let initialCash = profile.liquidCash
        let cashRemainingBeforePortfolio = initialCash - totalCashDrain
        
        // Target Cash Floor based on chosen safety condition
        let targetFloor: Double
        switch assumption.breachCondition {
        case .minimumCashReserve:
            targetFloor = max(0, assumption.targetCashFloor)
        case .completeCashDepletion:
            targetFloor = 0
        case .runwayUnder3Months:
            targetFloor = monthlyBurn * 3.0
        case .runwayUnder1Month:
            targetFloor = monthlyBurn * 1.0
        }
        
        // Determine primary sensitivity driver
        let driverExplanation = determinePrimaryDriver(
            emergencyBill: emergencyBill,
            monthlyBurn: monthlyBurn,
            duration: duration,
            incomeLost: (profile.monthlyIncome - effectiveIncome) * Double(duration),
            debtPayments: profile.monthlyDebtPayments * Double(duration)
        )
        
        // Base evaluation function at market decline d %
        func isBreachedAt(declinePercent: Double) -> Bool {
            let d = max(0, min(100, declinePercent))
            let simulatedPortfolio: Double
            
            if let targetTicker = assumption.targetStockTicker,
               let holding = profile.activeHoldings.first(where: { $0.ticker.uppercased() == targetTicker.uppercased() }) {
                let otherHoldingsValue = profile.activeHoldings
                    .filter { $0.ticker.uppercased() != targetTicker.uppercased() }
                    .reduce(0.0) { $0 + $1.currentValue }
                let shockedHolding = holding.currentValue * (1.0 - (d / 100.0))
                simulatedPortfolio = otherHoldingsValue + shockedHolding
            } else {
                simulatedPortfolio = profile.portfolioValue * (1.0 - (d / 100.0))
            }
            
            // Available total financial buffer = Remaining Cash + Liquid Portfolio
            let totalLiquidity = cashRemainingBeforePortfolio + simulatedPortfolio
            let cashBuffer = cashRemainingBeforePortfolio
            
            switch assumption.breachCondition {
            case .minimumCashReserve, .completeCashDepletion:
                // If cash alone falls below floor AND total liquidity falls below target floor + minimum buffer
                return cashBuffer < targetFloor || totalLiquidity < (targetFloor + (profile.portfolioValue * 0.25))
            case .runwayUnder3Months, .runwayUnder1Month:
                if monthlyBurn <= 0 { return false }
                let effectiveRunway = max(0, totalLiquidity) / monthlyBurn
                let targetMonths = assumption.breachCondition == .runwayUnder3Months ? 3.0 : 1.0
                return effectiveRunway < targetMonths
            }
        }
        
        // Check 0% decline (is it already breached by cash drain alone?)
        if isBreachedAt(declinePercent: 0.0) {
            let runway = monthlyBurn > 0 ? max(0, cashRemainingBeforePortfolio) / monthlyBurn : 99.0
            return ReverseStressResult(
                isBreached: true,
                breakingPointDeclinePercent: 0.0,
                remainingCashAtBreach: cashRemainingBeforePortfolio,
                remainingPortfolioAtBreach: profile.portfolioValue,
                estimatedRunwayAtBreach: runway,
                monthlyCashDrain: totalCashDrain / Double(duration),
                primaryDriver: driverExplanation.driver,
                explanation: "Breached immediately at 0% market decline: Cash drain of \(LOSTheme.formatRupee(totalCashDrain)) alone exceeds your chosen safety threshold without any market shock.",
                testedRangeMax: 100.0
            )
        }
        
        // Check 100% decline (if even a total collapse does NOT breach, return not breached)
        if !isBreachedAt(declinePercent: 100.0) {
            let runway = monthlyBurn > 0 ? max(0, cashRemainingBeforePortfolio) / monthlyBurn : 99.0
            return ReverseStressResult(
                isBreached: false,
                breakingPointDeclinePercent: nil,
                remainingCashAtBreach: cashRemainingBeforePortfolio,
                remainingPortfolioAtBreach: 0.0,
                estimatedRunwayAtBreach: runway,
                monthlyCashDrain: totalCashDrain / Double(duration),
                primaryDriver: driverExplanation.driver,
                explanation: "No threshold breached within tested range (0% to 100% decline). Your liquid cash buffer and low burn rate protect you against a complete market collapse under these assumptions.",
                testedRangeMax: 100.0
            )
        }
        
        // Deterministic Bisection Search (0.0% to 100.0%, precision 0.1%)
        var low = 0.0
        var high = 100.0
        var breakingPoint = 100.0
        
        for _ in 0..<20 { // 20 iterations achieves ~0.0001% precision
            let mid = (low + high) / 2.0
            if isBreachedAt(declinePercent: mid) {
                breakingPoint = mid
                high = mid // search lower for first breach
            } else {
                low = mid
            }
        }
        
        let roundedPoint = MathRound(breakingPoint, decimals: 1)
        let postShockPortfolio = profile.portfolioValue * (1.0 - (roundedPoint / 100.0))
        let totalLiquid = max(0, cashRemainingBeforePortfolio + postShockPortfolio)
        let runway = monthlyBurn > 0 ? totalLiquid / monthlyBurn : 99.0
        
        let targetText: String
        if let ticker = assumption.targetStockTicker {
            targetText = "\(ticker) stock decline"
        } else {
            targetText = "portfolio-wide decline"
        }
        
        let explanation = "A \(targetText) of \(String(format: "%.1f%%", roundedPoint)) breaches your \(assumption.breachCondition.shortTitle)."
        
        return ReverseStressResult(
            isBreached: true,
            breakingPointDeclinePercent: roundedPoint,
            remainingCashAtBreach: cashRemainingBeforePortfolio,
            remainingPortfolioAtBreach: postShockPortfolio,
            estimatedRunwayAtBreach: runway,
            monthlyCashDrain: totalCashDrain / Double(duration),
            primaryDriver: driverExplanation.driver,
            explanation: explanation,
            testedRangeMax: 100.0
        )
    }
    
    private static func determinePrimaryDriver(
        emergencyBill: Double,
        monthlyBurn: Double,
        duration: Int,
        incomeLost: Double,
        debtPayments: Double
    ) -> (driver: String, percentage: Double) {
        let burnTotal = monthlyBurn * Double(duration)
        let totalDrain = emergencyBill + burnTotal
        guard totalDrain > 0 else {
            return ("Balanced Outflows", 100.0)
        }
        
        let billShare = (emergencyBill / totalDrain) * 100.0
        let incomeLostShare = (incomeLost / totalDrain) * 100.0
        let debtShare = (debtPayments / totalDrain) * 100.0
        let livingShare = max(0, 100.0 - billShare - incomeLostShare - debtShare)
        
        if billShare >= incomeLostShare && billShare >= debtShare && billShare >= livingShare {
            return ("Emergency Bill (\(Int(billShare))% of total cash drain)", billShare)
        } else if incomeLostShare >= debtShare && incomeLostShare >= livingShare {
            return ("Income Interruption (\(Int(incomeLostShare))% of drain)", incomeLostShare)
        } else if debtShare >= livingShare {
            return ("Debt & EMI Commitments (\(Int(debtShare))% of drain)", debtShare)
        } else {
            return ("Fixed Living Expenses (\(Int(livingShare))% of drain)", livingShare)
        }
    }
    
    private static func MathRound(_ val: Double, decimals: Int) -> Double {
        let factor = pow(10.0, Double(decimals))
        return round(val * factor) / factor
    }
}
