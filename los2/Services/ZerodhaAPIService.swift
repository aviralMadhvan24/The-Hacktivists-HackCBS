import Foundation

struct ZerodhaUser: Codable, Equatable {
    let userId: String
    let userName: String
    let broker: String
    let isDemo: Bool?
}

struct ZerodhaStatusResponse: Codable {
    let success: Bool
    let isConfigured: Bool
    let isConnected: Bool
    let user: ZerodhaUser?
}

struct ZerodhaHoldingItem: Codable, Identifiable {
    let id: String
    let companyName: String
    let ticker: String
    let sector: String
    let currentValue: Double
    let shares: Int?
    let averageBuyPrice: Double?
    let pnl: Double?
    let portfolioWeightPercent: Double
}

struct ZerodhaPortfolioResponse: Codable {
    let success: Bool
    let connected: Bool
    let broker: String
    let user: ZerodhaUser?
    let totalPortfolioValue: Double
    let availableCash: Double
    let holdingsCount: Int
    let holdings: [ZerodhaHoldingItem]
}

final class ZerodhaAPIService {
    static let shared = ZerodhaAPIService()
    
    // Tracks if user activated the demo sandbox locally
    private var isLocalDemoActive: Bool = false
    
    // Built-in offline demo sandbox portfolio (Nifty 50 leaders)
    static let offlineDemoPortfolio = ZerodhaPortfolioResponse(
        success: true,
        connected: true,
        broker: "ZERODHA KITE",
        user: ZerodhaUser(
            userId: "ZD8492",
            userName: "Aviral Madhvan (Zerodha Kite)",
            broker: "ZERODHA KITE",
            isDemo: true
        ),
        totalPortfolioValue: 500_000,
        availableCash: 80_000,
        holdingsCount: 4,
        holdings: [
            ZerodhaHoldingItem(
                id: "INE002A01018",
                companyName: "Reliance Industries",
                ticker: "RELIANCE",
                sector: "Energy & Telecom",
                currentValue: 175_000,
                shares: 60,
                averageBuyPrice: 2850,
                pnl: 4000,
                portfolioWeightPercent: 35.0
            ),
            ZerodhaHoldingItem(
                id: "INE467B01029",
                companyName: "Tata Consultancy Services",
                ticker: "TCS",
                sector: "Information Technology",
                currentValue: 150_000,
                shares: 38,
                averageBuyPrice: 3800,
                pnl: 5600,
                portfolioWeightPercent: 30.0
            ),
            ZerodhaHoldingItem(
                id: "INE040A01034",
                companyName: "HDFC Bank",
                ticker: "HDFCBANK",
                sector: "Financial Services",
                currentValue: 100_000,
                shares: 62,
                averageBuyPrice: 1550,
                pnl: 3900,
                portfolioWeightPercent: 20.0
            ),
            ZerodhaHoldingItem(
                id: "INE009A01021",
                companyName: "Infosys",
                ticker: "INFY",
                sector: "Information Technology",
                currentValue: 75_000,
                shares: 42,
                averageBuyPrice: 1720,
                pnl: 2760,
                portfolioWeightPercent: 15.0
            )
        ]
    )
    
    private func endpoint(_ path: String) -> URL {
        let base = ConcallAPIService.shared.baseURLString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let sub = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(base)/\(sub)") ?? URL(string: "http://localhost:3000/\(sub)")!
    }
    
    func fetchStatus() async throws -> ZerodhaStatusResponse {
        if isLocalDemoActive {
            return ZerodhaStatusResponse(
                success: true,
                isConfigured: true,
                isConnected: true,
                user: Self.offlineDemoPortfolio.user
            )
        }
        
        let url = endpoint("api/zerodha/status")
        var request = URLRequest(url: url)
        request.timeoutInterval = 2.0
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(ZerodhaStatusResponse.self, from: data)
    }
    
    func getLoginURL() async throws -> URL {
        let url = endpoint("api/zerodha/login-url")
        var request = URLRequest(url: url)
        request.timeoutInterval = 4.0
        
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            struct Err: Codable { let message: String? }
            let err = try? JSONDecoder().decode(Err.self, from: data)
            throw NSError(domain: "Zerodha", code: 400, userInfo: [NSLocalizedDescriptionKey: err?.message ?? "Kite credentials not set in backend/.env"])
        }
        
        struct LoginRes: Codable {
            let success: Bool
            let loginUrl: String
        }
        let res = try JSONDecoder().decode(LoginRes.self, from: data)
        guard let targetURL = URL(string: res.loginUrl) else {
            throw URLError(.badURL)
        }
        return targetURL
    }
    
    func connectDemo() async throws -> ZerodhaPortfolioResponse {
        // Try live backend first if available
        let url = endpoint("api/zerodha/demo-connect")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 2.0
        
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                let livePortfolio = try await fetchPortfolio()
                isLocalDemoActive = true
                return livePortfolio
            }
        } catch {
            // Backend server is not running or unreachable — fall back seamlessly to local sandbox
        }
        
        // Instant offline demo sandbox fallback
        isLocalDemoActive = true
        return Self.offlineDemoPortfolio
    }
    
    func fetchPortfolio() async throws -> ZerodhaPortfolioResponse {
        let url = endpoint("api/zerodha/portfolio")
        var request = URLRequest(url: url)
        request.timeoutInterval = 2.5
        
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                return try JSONDecoder().decode(ZerodhaPortfolioResponse.self, from: data)
            }
        } catch {
            // Backend offline
        }
        
        if isLocalDemoActive {
            return Self.offlineDemoPortfolio
        }
        
        throw URLError(.cannotConnectToHost)
    }
    
    func disconnect() async throws {
        isLocalDemoActive = false
        let url = endpoint("api/zerodha/disconnect")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 2.0
        _ = try? await URLSession.shared.data(for: request)
    }
}
