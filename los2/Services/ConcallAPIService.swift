import Foundation

/// Handles networking and API communication with the LiquidityOS Backend Server.
final class ConcallAPIService {
    static let shared = ConcallAPIService()
    
    // User-configurable backend base URL (saved in UserDefaults)
    private static let baseURLKey = "LiquidityOS_Backend_BaseURL"
    
    var baseURLString: String {
        get {
            if let saved = UserDefaults.standard.string(forKey: Self.baseURLKey), !saved.isEmpty {
                return saved
            }
            #if targetEnvironment(simulator)
            return "http://localhost:3000"
            #else
            return "http://10.21.70.139:3000"
            #endif
        }
        set {
            UserDefaults.standard.set(newValue, forKey: Self.baseURLKey)
        }
    }
    
    var baseURL: URL {
        URL(string: baseURLString) ?? URL(string: "http://localhost:3000")!
    }
    
    func endpoint(_ path: String) -> URL {
        let base = baseURLString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let sub = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(base)/\(sub)") ?? URL(string: "http://localhost:3000/\(sub)")!
    }
    
    /// Test server health and check LLM configuration
    func pingHealth() async -> (isHealthy: Bool, message: String) {
        let url = endpoint("api/health")
        var req = URLRequest(url: url)
        req.timeoutInterval = 3.0
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return (false, "HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)")
            }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let status = json["status"] as? String, status == "healthy" {
                let provider = json["activeProvider"] as? String ?? "Active"
                return (true, "Connected • \(provider)")
            }
            return (true, "Connected")
        } catch {
            return (false, error.localizedDescription)
        }
    }
    
    // MARK: - Errors
    enum ConcallAPIError: LocalizedError {
        case offline(String)
        case llmNotConfigured(String, [String])
        case validationFailed(String)
        case serverError(String)
        case decodingError(String)
        
        var errorDescription: String? {
            switch self {
            case .offline(let url):
                return "Cannot reach FinSight Backend at \(url). Please ensure the backend server is running ('cd backend && npm start')."
            case .llmNotConfigured(let message, _):
                return message
            case .validationFailed(let message):
                return message
            case .serverError(let message):
                return "Server error: \(message)"
            case .decodingError(let message):
                return "Failed to parse analysis response: \(message)"
            }
        }
    }
    
    // MARK: - Health Check
    struct HealthResponse: Codable {
        let status: String
        let service: String
        let version: String
        let llmConfigured: Bool
        let activeProvider: String
    }
    
    func checkServerHealth() async throws -> HealthResponse {
        let url = endpoint("api/health")
        var request = URLRequest(url: url)
        request.timeoutInterval = 4.0
        
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw ConcallAPIError.serverError("Health check responded with non-200 status.")
            }
            return try JSONDecoder().decode(HealthResponse.self, from: data)
        } catch let error as ConcallAPIError {
            throw error
        } catch {
            throw ConcallAPIError.offline(baseURLString)
        }
    }
    
    // MARK: - Analyze Transcript
    struct AnalyzeRequestPayload: Codable {
        let companyName: String
        let ticker: String
        let quarter: String
        let fiscalYear: String
        let transcriptText: String
        let priorTranscriptText: String?
        let transcriptSource: String?
        let holdingInfo: String?
    }
    
    struct AnalyzeResponsePayload: Codable {
        let success: Bool
        let analysis: ConcallAnalysis
    }
    
    struct ErrorResponsePayload: Codable {
        let error: String
        let message: String
        let setupGuide: [String: String]?
    }
    
    func analyzeTranscript(
        companyName: String,
        ticker: String,
        quarter: String,
        fiscalYear: String,
        transcriptText: String,
        priorTranscriptText: String? = nil,
        transcriptSource: String? = nil,
        holdingInfo: String? = nil
    ) async throws -> ConcallAnalysis {
        let url = endpoint("api/concall/analyze")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 90.0 // Allow time for LLM transcript ingestion
        
        let payload = AnalyzeRequestPayload(
            companyName: companyName,
            ticker: ticker,
            quarter: quarter,
            fiscalYear: fiscalYear,
            transcriptText: transcriptText,
            priorTranscriptText: priorTranscriptText,
            transcriptSource: transcriptSource,
            holdingInfo: holdingInfo
        )
        
        request.httpBody = try JSONEncoder().encode(payload)
        
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw ConcallAPIError.offline(baseURLString)
        }
        
        guard let http = response as? HTTPURLResponse else {
            throw ConcallAPIError.serverError("Invalid HTTP response received.")
        }
        
        if http.statusCode == 200 {
            do {
                let decoded = try JSONDecoder().decode(AnalyzeResponsePayload.self, from: data)
                return decoded.analysis
            } catch {
                throw ConcallAPIError.decodingError(error.localizedDescription)
            }
        } else if http.statusCode == 503 {
            // LLM Not Configured response
            if let errPayload = try? JSONDecoder().decode(ErrorResponsePayload.self, from: data) {
                var steps: [String] = []
                if let guide = errPayload.setupGuide {
                    steps = guide.values.sorted()
                }
                throw ConcallAPIError.llmNotConfigured(errPayload.message, steps)
            }
            throw ConcallAPIError.llmNotConfigured("LLM provider is not configured on the backend server.", [])
        } else {
            if let errPayload = try? JSONDecoder().decode(ErrorResponsePayload.self, from: data) {
                throw ConcallAPIError.validationFailed(errPayload.message)
            }
            throw ConcallAPIError.serverError("Server returned HTTP \(http.statusCode)")
        }
    }
    
    // MARK: - History Retrieval
    struct HistoryListPayload: Codable {
        let success: Bool
        let total: Int
        let history: [ConcallAnalysis]
    }
}
