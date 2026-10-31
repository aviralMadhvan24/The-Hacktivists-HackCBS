import Foundation

final class RecoveryAPIService {
    static let shared = RecoveryAPIService()
    
    private func endpoint(_ path: String) -> URL {
        let base = ConcallAPIService.shared.baseURLString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let sub = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(base)/\(sub)") ?? URL(string: "http://localhost:3000/\(sub)")!
    }
    
    func generateRecoveryPlan(
        profile: FinancialProfile,
        simulatedLoss: Double,
        incomeLossMonths: Int = 0,
        userGoals: String = ""
    ) async throws -> (baseline: RecoveryBaseline, recovery: RecoveryPlanResponse) {
        let url = endpoint("api/recovery/plan")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 2.5
        
        let payload: [String: Any] = [
            "currentCash": profile.liquidCash,
            "monthlyIncome": profile.monthlyIncome,
            "monthlyExpenses": profile.monthlyExpenses,
            "monthlyDebtPayments": profile.monthlyDebtPayments,
            "emergencyExpense": profile.unexpectedExpense,
            "incomeLossDurationMonths": incomeLossMonths,
            "portfolioValue": profile.portfolioValue,
            "simulatedPortfolioLoss": simulatedLoss,
            "userGoals": userGoals
        ]
        
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return Self.localFallbackPlans(profile: profile, simulatedLoss: simulatedLoss)
            }
            
            struct PlanAPIResponse: Codable {
                let success: Bool
                let baseline: RecoveryBaseline
                let recovery: RecoveryPlanResponse
            }
            let decoded = try JSONDecoder().decode(PlanAPIResponse.self, from: data)
            return (baseline: decoded.baseline, recovery: decoded.recovery)
        } catch {
            // Graceful fast fallback to client deterministic arithmetic if backend offline
            return Self.localFallbackPlans(profile: profile, simulatedLoss: simulatedLoss)
        }
    }
    
    static func localFallbackPlans(profile: FinancialProfile, simulatedLoss: Double) -> (baseline: RecoveryBaseline, recovery: RecoveryPlanResponse) {
        let postShockCash = max(0, profile.liquidCash - profile.unexpectedExpense)
        let totalOutflow = profile.monthlyExpenses + profile.monthlyDebtPayments
        let netBurn = max(0, totalOutflow - profile.monthlyIncome)
        let baselineRunway = netBurn > 0 ? postShockCash / netBurn : 99.0
        
        let baseline = RecoveryBaseline(
            initialCash: profile.liquidCash,
            emergencyExpense: profile.unexpectedExpense,
            immediatePostShockCash: postShockCash,
            totalMonthlyOutflows: totalOutflow,
            monthlyIncome: profile.monthlyIncome,
            baselineNetBurn: netBurn,
            baselineRunwayMonths: Double(round(baselineRunway * 10) / 10),
            portfolioValue: profile.portfolioValue,
            simulatedPortfolioLoss: simulatedLoss
        )
        
        let disc = profile.monthlyExpenses * 0.40
        
        let consCut = disc * 0.15
        let consBurn = max(0, (totalOutflow - consCut) - profile.monthlyIncome)
        let consRunway = consBurn > 0 ? postShockCash / consBurn : 99.0
        
        let balCut = disc * 0.30
        let balBurn = max(0, (totalOutflow - balCut) - profile.monthlyIncome)
        let balRunway = balBurn > 0 ? postShockCash / balBurn : 99.0
        
        let aggCut = disc * 0.50
        let aggBurn = max(0, (totalOutflow - aggCut) - profile.monthlyIncome)
        let aggRunway = aggBurn > 0 ? postShockCash / aggBurn : 99.0
        
        let recovery = RecoveryPlanResponse(
            aiGenerated: false,
            aiProvider: "Deterministic Fallback",
            summary: "Calculated plans based on your monthly cash flow to extend runway and rebuild safety cushion.",
            recommendedTier: "Balanced",
            riskAdvisory: "Protect non-negotiable living obligations while optimizing discretionary outflows.",
            plans: [
                RecoveryPlanOption(
                    id: "plan-conservative",
                    tier: "Conservative",
                    title: "Mild Expense Optimization",
                    description: "Trims non-essential discretionary subscriptions and lifestyle expenditures by 15%.",
                    monthlyExpenseReduction: consCut,
                    newMonthlyOutflow: totalOutflow - consCut,
                    newNetBurn: consBurn,
                    newRunwayMonths: Double(round(consRunway * 10) / 10),
                    runwayExtensionMonths: Double(round(max(0, consRunway - baselineRunway) * 10) / 10),
                    monthsToRebuildEmergencyFund: consCut > 0 ? Int(ceil(profile.unexpectedExpense / consCut)) : 24,
                    tradeOffs: "Minimal disruption to daily routine.",
                    actionSteps: ["Audit digital subscriptions", "Cap dining out at 85%", "Direct ₹\(Int(consCut))/mo to cash"]
                ),
                RecoveryPlanOption(
                    id: "plan-balanced",
                    tier: "Balanced",
                    title: "Disciplined Budget Rebalance",
                    description: "30% discretionary reduction to restore emergency runway quickly.",
                    monthlyExpenseReduction: balCut,
                    newMonthlyOutflow: totalOutflow - balCut,
                    newNetBurn: balBurn,
                    newRunwayMonths: Double(round(balRunway * 10) / 10),
                    runwayExtensionMonths: Double(round(max(0, balRunway - baselineRunway) * 10) / 10),
                    monthsToRebuildEmergencyFund: balCut > 0 ? Int(ceil(profile.unexpectedExpense / balCut)) : 12,
                    tradeOffs: "Noticeable reduction in optional spending with strong cash extension.",
                    actionSteps: ["Freeze luxury purchases for 90 days", "Renegotiate recurring bills", "Rebuild buffer in \(Int(ceil(profile.unexpectedExpense / max(1, balCut)))) mos"]
                ),
                RecoveryPlanOption(
                    id: "plan-aggressive",
                    tier: "Aggressive",
                    title: "Emergency Austerity & Protection",
                    description: "50% cut to non-essential spending to prevent liquidating depressed stocks.",
                    monthlyExpenseReduction: aggCut,
                    newMonthlyOutflow: totalOutflow - aggCut,
                    newNetBurn: aggBurn,
                    newRunwayMonths: Double(round(aggRunway * 10) / 10),
                    runwayExtensionMonths: Double(round(max(0, aggRunway - baselineRunway) * 10) / 10),
                    monthsToRebuildEmergencyFund: aggCut > 0 ? Int(ceil(profile.unexpectedExpense / aggCut)) : 6,
                    tradeOffs: "High discipline required; avoids selling crashed equities.",
                    actionSteps: ["Restrict outflows to essentials only", "Stop all non-critical spending", "Accelerate emergency fund replenishment"]
                )
            ]
        )
        
        return (baseline, recovery)
    }
}
