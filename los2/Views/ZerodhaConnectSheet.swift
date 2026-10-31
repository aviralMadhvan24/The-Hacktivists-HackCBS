import SwiftUI
#if canImport(SafariServices)
import SafariServices
#endif

/// Zerodha Kite Connect integration sheet for syncing user's real equity portfolio and cash margins.
struct ZerodhaConnectSheet: View {
    @ObservedObject var resilienceViewModel: ResilienceViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var isLoading: Bool = false
    @State private var errorMessage: String? = nil
    @State private var portfolioData: ZerodhaPortfolioResponse? = nil
    @State private var isConfigured: Bool = false
    @State private var loginURL: URL? = nil
    
    // Kite Brand Color
    private let kiteOrange = Color(red: 1.0, green: 0.34, blue: 0.13)
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Hero Kite Branding Header
                    VStack(spacing: 8) {
                        ZStack {
                            Circle()
                                .fill(kiteOrange.opacity(0.14))
                                .frame(width: 72, height: 72)
                            Image(systemName: "chart.line.uptrend.xyaxis.circle.fill")
                                .font(.system(size: 40))
                                .foregroundStyle(kiteOrange)
                        }
                        
                        Text("Kite by Zerodha")
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                        
                        Text("Connect your Zerodha account to sync real-time portfolio holdings and cash balances into FinSight.")
                            .font(.system(size: 13))
                            .foregroundStyle(Color.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 20)
                    }
                    .padding(.top, 10)
                    
                    // Connected State
                    if let portfolio = portfolioData, portfolio.connected {
                        connectedView(portfolio: portfolio)
                    } else if resilienceViewModel.isZerodhaConnected, let user = resilienceViewModel.zerodhaUser {
                        // Previously connected session
                        VStack(spacing: 14) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("ACTIVE BROKER SESSION")
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundStyle(Color.secondary)
                                    Text(user.userName)
                                        .font(.system(size: 18, weight: .bold))
                                    Text("Kite ID: \(user.userId) • \(user.broker)")
                                        .font(.system(size: 12))
                                        .foregroundStyle(Color.secondary)
                                }
                                Spacer()
                                Image(systemName: "checkmark.seal.fill")
                                    .font(.title2)
                                    .foregroundStyle(LOSTheme.safeGreen)
                            }
                            
                            Divider()
                            
                            HStack(spacing: 12) {
                                Button {
                                    Task { await refreshPortfolio() }
                                } label: {
                                    HStack {
                                        Image(systemName: "arrow.triangle.2.circlepath")
                                        Text("Refresh Holdings")
                                    }
                                    .font(.system(size: 13, weight: .bold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 10)
                                    .background(kiteOrange.opacity(0.12))
                                    .foregroundStyle(kiteOrange)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                }
                                
                                Button {
                                    resilienceViewModel.disconnectZerodha()
                                    portfolioData = nil
                                } label: {
                                    Text("Disconnect")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(LOSTheme.criticalRed)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 10)
                                        .background(LOSTheme.criticalRed.opacity(0.1))
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                }
                            }
                        }
                        .padding(18)
                        .background(LOSTheme.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                        .overlay(RoundedRectangle(cornerRadius: 18).stroke(LOSTheme.cardBorder, lineWidth: 1))
                        .padding(.horizontal)
                    } else {
                        // Unconnected: Connect Options
                        unconnectedView
                    }
                    
                    // Trust & Privacy Box
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Read-Only & Secure Integration", systemImage: "lock.shield.fill")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(LOSTheme.safeGreen)
                        
                        Text("• We only read your current holdings and cash balance.\n• FinSight never places trades or accesses your funds.\n• Credentials stay encrypted via Zerodha's official OAuth.")
                            .font(.system(size: 12))
                            .foregroundStyle(Color.secondary)
                            .lineSpacing(3)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.primary.opacity(0.04))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .padding(.horizontal)
                    .padding(.bottom, 24)
                }
            }
            .navigationTitle("Zerodha Kite")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .background(LOSTheme.background.ignoresSafeArea())
            .onAppear {
                Task { await checkStatus() }
            }
        }
    }
    
    // MARK: - Unconnected View
    @ViewBuilder
    private var unconnectedView: some View {
        VStack(spacing: 14) {
            // Live Kite OAuth Connect Button (If API Key is configured in backend)
            if isConfigured {
                Button {
                    openZerodhaLogin()
                } label: {
                    HStack {
                        Image(systemName: "link.badge.plus")
                        Text("Login with Kite (Official OAuth)")
                            .bold()
                    }
                    .font(.system(size: 15))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(kiteOrange)
                    .foregroundStyle(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
            
            // Demo Sandbox Connect Button (Instant Testing)
            Button {
                Task { await connectDemoAccount() }
            } label: {
                HStack {
                    if isLoading {
                        ProgressView()
                            .padding(.trailing, 4)
                        Text("Connecting...")
                    } else {
                        Image(systemName: "sparkles")
                        Text(isConfigured ? "Or Test with Demo Zerodha Sandbox" : "Connect Demo Zerodha Account (Sandbox)")
                            .bold()
                    }
                }
                .font(.system(size: 15))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(isConfigured ? Color.primary.opacity(0.06) : kiteOrange)
                .foregroundStyle(isConfigured ? Color.primary : Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .disabled(isLoading)
            
            if let error = errorMessage {
                Text(error)
                    .font(.system(size: 12))
                    .foregroundStyle(LOSTheme.criticalRed)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(18)
        .background(LOSTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(LOSTheme.cardBorder, lineWidth: 1))
        .padding(.horizontal)
    }
    
    // MARK: - Connected View
    @ViewBuilder
    private func connectedView(portfolio: ZerodhaPortfolioResponse) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("CONNECTED ACCOUNT")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Color.secondary)
                    Text(portfolio.user?.userName ?? "Zerodha User")
                        .font(.system(size: 18, weight: .bold))
                    Text("Kite ID: \(portfolio.user?.userId ?? "") • \(portfolio.broker)")
                        .font(.system(size: 12))
                        .foregroundStyle(kiteOrange)
                }
                Spacer()
                Image(systemName: "checkmark.circle.fill")
                    .font(.title)
                    .foregroundStyle(LOSTheme.safeGreen)
            }
            
            Divider()
            
            // Total Portfolio & Liquid Cash
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Equity Portfolio")
                        .font(.system(size: 11))
                        .foregroundStyle(Color.secondary)
                    Text(LOSTheme.formatRupee(portfolio.totalPortfolioValue))
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Available Cash Margin")
                        .font(.system(size: 11))
                        .foregroundStyle(Color.secondary)
                    Text(LOSTheme.formatRupee(portfolio.availableCash))
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundStyle(LOSTheme.safeGreen)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
            }
            
            Divider()
            
            // Holdings List Preview
            VStack(alignment: .leading, spacing: 8) {
                Text("IMPORTED HOLDINGS (\(portfolio.holdingsCount))")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Color.secondary)
                
                ForEach(portfolio.holdings) { item in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.companyName)
                                .font(.system(size: 13, weight: .semibold))
                                .lineLimit(2)
                                .fixedSize(horizontal: false, vertical: true)
                            Text("\(item.ticker) • \(item.shares ?? 0) shares")
                                .font(.system(size: 11))
                                .foregroundStyle(Color.secondary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(LOSTheme.formatRupee(item.currentValue))
                                .font(.system(size: 13, weight: .bold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                            Text("\(String(format: "%.1f", item.portfolioWeightPercent))%")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(kiteOrange)
                                .lineLimit(1)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            
            // Primary Sync CTA
            Button {
                applyPortfolioSync(portfolio: portfolio)
                dismiss()
            } label: {
                HStack {
                    Image(systemName: "arrow.triangle.2.circlepath")
                    Text("Apply to FinSight Dashboard")
                        .bold()
                }
                .font(.system(size: 15))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(kiteOrange)
                .foregroundStyle(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .padding(.top, 4)
        }
        .padding(18)
        .background(LOSTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(LOSTheme.cardBorder, lineWidth: 1))
        .padding(.horizontal)
    }
    
    // MARK: - Actions
    private func checkStatus() async {
        do {
            let status = try await ZerodhaAPIService.shared.fetchStatus()
            isConfigured = status.isConfigured
            if status.isConnected {
                await refreshPortfolio()
            }
        } catch {
            // Backend offline or not ready
            isConfigured = false
        }
    }
    
    private func refreshPortfolio() async {
        isLoading = true
        errorMessage = nil
        do {
            let res = try await ZerodhaAPIService.shared.fetchPortfolio()
            portfolioData = res
            isLoading = false
        } catch {
            isLoading = false
            errorMessage = error.localizedDescription
        }
    }
    
    private func connectDemoAccount() async {
        isLoading = true
        errorMessage = nil
        do {
            let res = try await ZerodhaAPIService.shared.connectDemo()
            portfolioData = res
            isLoading = false
        } catch {
            isLoading = false
            errorMessage = "Unable to connect to market service. Please try again."
        }
    }
    
    private func openZerodhaLogin() {
        Task {
            do {
                let url = try await ZerodhaAPIService.shared.getLoginURL()
                await MainActor.run {
                    #if os(iOS)
                    UIApplication.shared.open(url)
                    #endif
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
    
    private func applyPortfolioSync(portfolio: ZerodhaPortfolioResponse) {
        let mappedHoldings = portfolio.holdings.map { item in
            let sh = max(1, item.shares ?? 1)
            let avg = item.averageBuyPrice ?? (item.currentValue / Double(sh))
            return PortfolioHolding(
                companyName: item.companyName,
                ticker: item.ticker,
                sector: item.sector,
                shares: sh,
                averageBuyPrice: avg,
                currentPrice: item.currentValue / Double(sh),
                portfolioWeightPercent: item.portfolioWeightPercent,
                freshness: .realtime,
                lastUpdated: Date()
            )
        }
        
        resilienceViewModel.syncWithZerodha(
            portfolioValue: portfolio.totalPortfolioValue,
            cashBalance: portfolio.availableCash > 0 ? portfolio.availableCash : nil,
            holdings: mappedHoldings,
            user: portfolio.user
        )
    }
}
