import Foundation
import SwiftUI
import Combine

enum ServerStatus: Equatable {
    case checking
    case online(provider: String, llmReady: Bool)
    case offline(url: String)
}

@MainActor
final class ConcallViewModel: ObservableObject {
    // Current Form State
    @Published var selectedHolding: PortfolioHolding?
    @Published var companyNameInput: String = "Reliance Industries"
    @Published var tickerInput: String = "RELIANCE"
    @Published var selectedQuarter: String = "Q3"
    @Published var selectedFiscalYear: String = "FY25"
    @Published var transcriptSourceInput: String = "Official Filing Transcript"
    @Published var transcriptTextInput: String = ""
    @Published var priorTranscriptTextInput: String = ""
    @Published var uploadedFileName: String?
    
    // UI & Execution State
    @Published var isAnalyzing: Bool = false
    @Published var analysisProgressMessage: String = ""
    @Published var errorMessage: String?
    @Published var llmSetupNotice: (message: String, steps: [String])?
    @Published var isShowingUploadSheet: Bool = false
    @Published var isShowingStressBridge: Bool = false
    @Published var isShowingSettingsSheet: Bool = false
    
    // Current Selected Analysis for Detailed Reading
    @Published var currentAnalysis: ConcallAnalysis?
    
    // Saved Analyses History (Persisted)
    @Published var savedAnalyses: [ConcallAnalysis] = []
    
    // Server Health Status
    @Published var serverStatus: ServerStatus = .checking
    
    // Quarters & Years options
    let quarterOptions = ["Q1", "Q2", "Q3", "Q4"]
    let fiscalYearOptions = ["FY24", "FY25", "FY26", "FY27"]
    
    // Common market search suggestions
    let marketSearchList: [(name: String, ticker: String, sector: String)] = [
        ("Reliance Industries", "RELIANCE", "Energy & Telecom"),
        ("Tata Consultancy Services", "TCS", "Information Technology"),
        ("HDFC Bank", "HDFCBANK", "Financial Services"),
        ("Infosys", "INFY", "Information Technology"),
        ("ICICI Bank", "ICICIBANK", "Financial Services"),
        ("Bharti Airtel", "BHARTIARTL", "Telecommunications"),
        ("State Bank of India", "SBIN", "Banking"),
        ("Tata Motors", "TATAMOTORS", "Automotive"),
        ("Larsen & Toubro", "LT", "Infrastructure"),
        ("Zomato", "ZOMATO", "Consumer Tech")
    ]
    
    private let storageKey = "LiquidityOS_SavedConcallAnalyses_v1"
    
    init() {
        loadSavedAnalyses()
        // If empty, preload with authentic Reliance Q3 FY25 sample for immediate out-of-the-box review
        if savedAnalyses.isEmpty {
            savedAnalyses = [ConcallAnalysis.sampleRelianceAnalysis]
            saveToStorage()
        }
        currentAnalysis = savedAnalyses.first
        
        Task {
            await checkServerStatus()
        }
    }
    
    // MARK: - Server Health
    func checkServerStatus() async {
        serverStatus = .checking
        do {
            let health = try await ConcallAPIService.shared.checkServerHealth()
            serverStatus = .online(provider: health.activeProvider, llmReady: health.llmConfigured)
        } catch {
            serverStatus = .offline(url: ConcallAPIService.shared.baseURLString)
        }
    }
    
    // MARK: - Company Selection
    func selectHolding(_ holding: PortfolioHolding) {
        selectedHolding = holding
        companyNameInput = holding.companyName
        tickerInput = holding.ticker
    }
    
    func selectCustomCompany(name: String, ticker: String) {
        selectedHolding = nil
        companyNameInput = name
        tickerInput = ticker
    }
    
    // MARK: - Instant Offline Sample Loader
    func loadSampleRelianceConcall() {
        currentAnalysis = ConcallAnalysis.sampleRelianceAnalysis
        // Add to saved if not present
        if !savedAnalyses.contains(where: { $0.id == ConcallAnalysis.sampleRelianceAnalysis.id }) {
            savedAnalyses.insert(ConcallAnalysis.sampleRelianceAnalysis, at: 0)
            saveToStorage()
        }
        errorMessage = nil
        llmSetupNotice = nil
    }
    
    // MARK: - Run Analysis
    func analyzeTranscript(portfolioValue: Double) async {
        guard !transcriptTextInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "Please upload a transcript document or paste transcript text."
            return
        }
        
        isAnalyzing = true
        errorMessage = nil
        llmSetupNotice = nil
        analysisProgressMessage = "Validating transcript and extracting business commentary..."
        
        // Build portfolio context string if available
        var holdingContext: String? = nil
        if let holding = selectedHolding {
            holdingContext = "\(holding.companyName) constitutes \(LOSTheme.formatRupee(holding.currentValue)) (\(String(format: "%.1f", holding.portfolioWeightPercent))%) of the user's \(LOSTheme.formatRupee(portfolioValue)) portfolio."
        } else {
            holdingContext = "Standalone company analysis. User does not currently hold this stock in their active portfolio."
        }
        
        do {
            analysisProgressMessage = "Sending to FinSight AI Engine for multi-dimensional concall intelligence..."
            
            let result = try await ConcallAPIService.shared.analyzeTranscript(
                companyName: companyNameInput,
                ticker: tickerInput,
                quarter: selectedQuarter,
                fiscalYear: selectedFiscalYear,
                transcriptText: transcriptTextInput,
                priorTranscriptText: priorTranscriptTextInput.isEmpty ? nil : priorTranscriptTextInput,
                transcriptSource: transcriptSourceInput,
                holdingInfo: holdingContext
            )
            
            // Success
            currentAnalysis = result
            saveAnalysis(result)
            isShowingUploadSheet = false
            isAnalyzing = false
        } catch let apiError as ConcallAPIService.ConcallAPIError {
            isAnalyzing = false
            switch apiError {
            case .llmNotConfigured(let message, let steps):
                llmSetupNotice = (message: message, steps: steps)
                errorMessage = message
            default:
                errorMessage = apiError.localizedDescription
            }
        } catch {
            isAnalyzing = false
            errorMessage = error.localizedDescription
        }
    }
    
    // MARK: - Local Persistence
    func saveAnalysis(_ analysis: ConcallAnalysis) {
        var list = savedAnalyses.filter { $0.id != analysis.id }
        list.insert(analysis, at: 0)
        savedAnalyses = Array(list.prefix(40))
        saveToStorage()
    }
    
    func deleteAnalysis(id: String) {
        savedAnalyses.removeAll { $0.id == id }
        if currentAnalysis?.id == id {
            currentAnalysis = savedAnalyses.first
        }
        saveToStorage()
    }
    
    private func saveToStorage() {
        if let encoded = try? JSONEncoder().encode(savedAnalyses) {
            UserDefaults.standard.set(encoded, forKey: storageKey)
        }
    }
    
    private func loadSavedAnalyses() {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([ConcallAnalysis].self, from: data) else {
            return
        }
        savedAnalyses = decoded
    }
    
    func resetUploadForm() {
        transcriptTextInput = ""
        priorTranscriptTextInput = ""
        uploadedFileName = nil
        errorMessage = nil
        llmSetupNotice = nil
    }
}
