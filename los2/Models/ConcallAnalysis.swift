import Foundation
import SwiftUI

/// Classification of an extracted concall insight.
enum FindingClassification: String, Codable, CaseIterable, Identifiable {
    case positiveDevelopment = "positiveDevelopment"
    case risk = "risk"
    case neutralInformation = "neutralInformation"
    case uncertainty = "uncertainty"
    
    var id: String { rawValue }
    
    var displayName: String {
        switch self {
        case .positiveDevelopment: return "Positive"
        case .risk: return "Business Risk"
        case .neutralInformation: return "Neutral"
        case .uncertainty: return "Uncertainty"
        }
    }
    
    var iconName: String {
        switch self {
        case .positiveDevelopment: return "arrow.up.right.circle.fill"
        case .risk: return "exclamationmark.triangle.fill"
        case .neutralInformation: return "info.circle.fill"
        case .uncertainty: return "questionmark.circle.fill"
        }
    }
    
    var color: Color {
        switch self {
        case .positiveDevelopment: return LOSTheme.safeGreen
        case .risk: return LOSTheme.criticalRed
        case .neutralInformation: return LOSTheme.primary
        case .uncertainty: return LOSTheme.warningAmber
        }
    }
}

/// An individual insight extracted from the concall with exact quotation and location.
struct ConcallFinding: Identifiable, Codable, Equatable {
    var id: String
    var topic: String
    var classification: FindingClassification
    var explanation: String
    var exactQuote: String
    var location: String
}

struct ConcallFinancialPerformance: Codable, Equatable {
    var revenueCommentary: String
    var profitCommentary: String
    var marginPressure: String
    var risingCostsOrDebt: String
}

struct ConcallGrowthAndGuidance: Codable, Equatable {
    var growthGuidance: String
    var businessOutlook: String
    var guidanceComparison: String
}

struct ConcallOperationalDynamics: Codable, Equatable {
    var demandTrends: String
    var orderBookUpdates: String
    var customerRisks: String
    var industryCompetition: String
    var operationalChallenges: String
}

struct ConcallManagementStatement: Identifiable, Codable, Equatable {
    var id: String { quote }
    var speaker: String
    var quote: String
    var context: String
    var location: String
}

struct ConcallAnalystQuestion: Identifiable, Codable, Equatable {
    var id: String { questionSummary }
    var analystNameAndFirm: String
    var questionSummary: String
    var managementAnswerSummary: String
    var keyTakeaway: String
}

struct ConcallPortfolioConnection: Codable, Equatable {
    var holdingSummary: String
    var relevantBusinessRisks: [String]
    var potentialExposureExplanation: String
    var disclaimer: String
}

struct ConcallMetadata: Codable, Equatable {
    var companyName: String
    var ticker: String
    var quarter: String
    var fiscalYear: String
    var transcriptSource: String?
    var characterCount: Int?
    var hasPriorComparison: Bool?
}

/// The complete structured analysis output for an earnings conference call.
struct ConcallAnalysis: Identifiable, Codable, Equatable {
    var id: String
    var createdAt: String
    var metadata: ConcallMetadata
    var executiveSummary: String
    var financialPerformance: ConcallFinancialPerformance
    var growthAndGuidance: ConcallGrowthAndGuidance
    var operationalDynamics: ConcallOperationalDynamics
    var findings: [ConcallFinding]
    var managementStatements: [ConcallManagementStatement]
    var analystQuestions: [ConcallAnalystQuestion]
    var keyUncertainties: [String]
    var portfolioConnection: ConcallPortfolioConnection
    
    var risks: [ConcallFinding] {
        findings.filter { $0.classification == .risk }
    }
    
    var positives: [ConcallFinding] {
        findings.filter { $0.classification == .positiveDevelopment }
    }
}

// MARK: - Authentic Sample Data for Preview & Immediate Offline Exploration
extension ConcallAnalysis {
    static let sampleRelianceAnalysis = ConcallAnalysis(
        id: "concall-sample-reliance-q3fy25",
        createdAt: "2025-01-20T18:30:00Z",
        metadata: ConcallMetadata(
            companyName: "Reliance Industries",
            ticker: "RELIANCE",
            quarter: "Q3",
            fiscalYear: "FY25",
            transcriptSource: "BSE/NSE Filing Official Transcript",
            characterCount: 68400,
            hasPriorComparison: true
        ),
        executiveSummary: "Reliance Industries delivered resilient quarterly EBITDA growth supported by robust digital subscriber additions in Jio and continuous retail store expansion. However, O2C (Oil-to-Chemicals) downstream margins faced pressure from global refining margin softness and volatile crude differentials.",
        financialPerformance: ConcallFinancialPerformance(
            revenueCommentary: "Consolidated revenue expanded by 3.5% YoY led by retail and digital services, while upstream energy volumes remained steady.",
            profitCommentary: "Net profit was steady at ₹19,641 crore; consumer businesses now contribute over 51% of consolidated EBITDA.",
            marginPressure: "Global refining margins declined sharply due to excess supply from new Asian and Middle Eastern capacity.",
            risingCostsOrDebt: "Net debt remained contained under 0.6x Net Debt/EBITDA despite ongoing 5G and green energy capex cycle."
        ),
        growthAndGuidance: ConcallGrowthAndGuidance(
            growthGuidance: "Management reiterated long-term targets of doubling retail EBITDA every 3-4 years and full commercial rollout of 5G fixed wireless broadband.",
            businessOutlook: "Consumer retail footfalls and grocery e-commerce momentum expected to remain resilient in upcoming festive quarters.",
            guidanceComparison: "O2C margin outlook tempered downwards compared to Q1 guidance due to sustained global product crack compression."
        ),
        operationalDynamics: ConcallOperationalDynamics(
            demandTrends: "Strong rural FMCG consumption uptick; domestic telecom data traffic grew 31% YoY.",
            orderBookUpdates: "New solar giga-factory pilot line commissioned on schedule in Jamnagar.",
            customerRisks: "Post-tariff price sensitivity in prepaid low-tier telecom subscribers in tier 3/4 towns.",
            industryCompetition: "Intense price competition in quick-commerce retail impacting traditional grocery delivery turnaround.",
            operationalChallenges: "Extended shipping lead times and higher freight rates from Red Sea transit disruptions."
        ),
        findings: [
            ConcallFinding(
                id: "find-1",
                topic: "Downstream O2C Refining Margin Headwind",
                classification: .risk,
                explanation: "Global crude crack spreads dropped by over $2.5/barrel, putting downward pressure on refining segment cash flows.",
                exactQuote: "Regional refining cracks softened significantly during the quarter due to global demand normalization and ramp-up of new overseas refining capacities.",
                location: "Section 1, Energy Business Review"
            ),
            ConcallFinding(
                id: "find-2",
                topic: "Telecom 5G Monetization & ARPU Expansion",
                classification: .positiveDevelopment,
                explanation: "Tariff revisions successfully flowed through to Average Revenue Per User (ARPU) without material customer churn.",
                exactQuote: "Monthly ARPU reached ₹195.1 following the tariff adjustment, with 5G users now comprising more than 35% of total wireless traffic.",
                location: "Jio Presentation, Slide 8"
            ),
            ConcallFinding(
                id: "find-3",
                topic: "Quick Commerce Competitive Pricing Pressure",
                classification: .risk,
                explanation: "Hyperlocal delivery competition requires increased promotions and micro-warehouse investments.",
                exactQuote: "In selected metro pockets, promotional intensity from venture-funded quick delivery operators has required tactical margin investments in grocery fulfillment.",
                location: "Analyst Q&A, Response by Retail CFO"
            ),
            ConcallFinding(
                id: "find-4",
                topic: "Capex Trajectory Peak",
                classification: .positiveDevelopment,
                explanation: "Peak 5G network rollout capital expenditures have passed, enabling higher free cash flow generation.",
                exactQuote: "Pan-India 5G deployment is virtually complete, leading to a structural moderation in telecommunications capital expenditure going forward.",
                location: "Group Financial Presentation"
            ),
            ConcallFinding(
                id: "find-5",
                topic: "Green Energy Commercialization Timeline",
                classification: .uncertainty,
                explanation: "Pace of solar giga-factory revenue realization depends on domestic supply chain localization and grid approvals.",
                exactQuote: "Commercial shipments of heterojunction solar modules will scale progressively through FY26, subject to final certification.",
                location: "Management Opening Remarks"
            )
        ],
        managementStatements: [
            ConcallManagementStatement(
                speaker: "Shri Mukesh Ambani, Chairman & Managing Director",
                quote: "Our consumer businesses have firmly established leadership scale, while our transition towards integrated new energy platforms is progressing with rigorous execution discipline.",
                context: "Opening Strategic Address",
                location: "Page 2, Transcript"
            ),
            ConcallManagementStatement(
                speaker: "Srikanth Venkatachari, Chief Financial Officer",
                quote: "Capital efficiency and balance sheet resilience remain foundational as we move from a capex-heavy phase into a cash-generation phase.",
                context: "Financial Strategy Discussion",
                location: "Page 6, Transcript"
            )
        ],
        analystQuestions: [
            ConcallAnalystQuestion(
                analystNameAndFirm: "Pinakin Parekh (JP Morgan)",
                questionSummary: "Inquired about the sustainability of O2C downstream margins and expected timeline for recovery in petchem spreads.",
                managementAnswerSummary: "Management noted that global supply additions are peaking, but recovery depends on European industrial demand recovery in late 2025.",
                keyTakeaway: "Downstream margins will likely remain range-bound in the near term rather than seeing a sharp rebound."
            ),
            ConcallAnalystQuestion(
                analystNameAndFirm: "Sachin Salgaonkar (Bank of America)",
                questionSummary: "Asked about tariff hike elasticity and customer retention in digital services.",
                managementAnswerSummary: "Management confirmed retention exceeded expectations with SIM consolidation effects remaining below 1.2%.",
                keyTakeaway: "Pricing power in Indian telecom has structurally strengthened."
            )
        ],
        keyUncertainties: [
            "Trajectory of global crude oil benchmark volatility and geopolitical shipping lane disruptions.",
            "Timing and regulatory approvals for potential value-unlocking IPOs in retail and telecom arms.",
            "Ramp-up speed and margin yields from green hydrogen and solar panel manufacturing units."
        ],
        portfolioConnection: ConcallPortfolioConnection(
            holdingSummary: "Reliance constitutes ₹1,75,000 (35.0%) of your ₹5,00,000 portfolio.",
            relevantBusinessRisks: [
                "Softening refining crack margins may slow near-term earnings growth in the energy division.",
                "Intense quick-commerce competition in urban retail requires promotional spend."
            ],
            potentialExposureExplanation: "Because Reliance represents 35% of your total holdings, prolonged weakness in refining margins could moderate overall portfolio returns. However, expanding consumer telecom cash flows provide defensive diversification. This is an objective operational assessment, not a stock price prediction.",
            disclaimer: "AI-generated business analysis of company earnings call. This is not investment advice or a stock price forecast."
        )
    )
}
