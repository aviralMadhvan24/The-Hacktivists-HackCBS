import Foundation

/// Represents the user's complete financial profile across investments, cash reserves, and monthly cash flow.
struct FinancialProfile: Equatable, Codable {
    var portfolioValue: Double
    var liquidCash: Double
    var monthlyIncome: Double
    var monthlyExpenses: Double
    var unexpectedExpense: Double
    var monthlyDebtPayments: Double
    var minimumCashReserve: Double
    var holdings: [PortfolioHolding]?
    
    /// Default values based directly on the illustrative hackathon pitch deck:
    /// - Portfolio: ₹5,00,000
    /// - Liquid Cash: ₹80,000
    /// - Monthly Income: ₹10,000
    /// - Monthly Expenses: ₹20,000
    /// - Emergency Bill: ₹50,000
    /// - Monthly Debt / EMI: ₹0
    /// - Minimum Safety Reserve: ₹20,000
    static let pitchDeckSample = FinancialProfile(
        portfolioValue: 500_000,
        liquidCash: 80_000,
        monthlyIncome: 10_000,
        monthlyExpenses: 20_000,
        unexpectedExpense: 50_000,
        monthlyDebtPayments: 0,
        minimumCashReserve: 20_000,
        holdings: PortfolioHolding.pitchDeckHoldings
    )
    
    /// Total fixed monthly commitments = Expenses + Debt / EMI payments
    var totalMonthlyOutflows: Double {
        return monthlyExpenses + monthlyDebtPayments
    }
    
    /// Monthly burn rate without any shocks: Total Outflows minus Income
    var baselineNetCashBurn: Double {
        return totalMonthlyOutflows - monthlyIncome
    }
    
    /// Returns active holdings or standard defaults
    var activeHoldings: [PortfolioHolding] {
        if let h = holdings {
            return h
        }
        return PortfolioHolding.pitchDeckHoldings
    }
    
    // Explicit Codable keys ensuring backwards compatibility
    enum CodingKeys: String, CodingKey {
        case portfolioValue, liquidCash, monthlyIncome, monthlyExpenses, unexpectedExpense
        case monthlyDebtPayments, minimumCashReserve, holdings
    }
    
    init(
        portfolioValue: Double,
        liquidCash: Double,
        monthlyIncome: Double,
        monthlyExpenses: Double,
        unexpectedExpense: Double,
        monthlyDebtPayments: Double = 0,
        minimumCashReserve: Double = 20_000,
        holdings: [PortfolioHolding]? = nil
    ) {
        self.portfolioValue = portfolioValue
        self.liquidCash = liquidCash
        self.monthlyIncome = monthlyIncome
        self.monthlyExpenses = monthlyExpenses
        self.unexpectedExpense = unexpectedExpense
        self.monthlyDebtPayments = monthlyDebtPayments
        self.minimumCashReserve = minimumCashReserve
        self.holdings = holdings
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.portfolioValue = try container.decode(Double.self, forKey: .portfolioValue)
        self.liquidCash = try container.decode(Double.self, forKey: .liquidCash)
        self.monthlyIncome = try container.decode(Double.self, forKey: .monthlyIncome)
        self.monthlyExpenses = try container.decode(Double.self, forKey: .monthlyExpenses)
        self.unexpectedExpense = try container.decode(Double.self, forKey: .unexpectedExpense)
        self.monthlyDebtPayments = try container.decodeIfPresent(Double.self, forKey: .monthlyDebtPayments) ?? 0.0
        self.minimumCashReserve = try container.decodeIfPresent(Double.self, forKey: .minimumCashReserve) ?? 20_000.0
        self.holdings = try container.decodeIfPresent([PortfolioHolding].self, forKey: .holdings) ?? PortfolioHolding.pitchDeckHoldings
    }
}
