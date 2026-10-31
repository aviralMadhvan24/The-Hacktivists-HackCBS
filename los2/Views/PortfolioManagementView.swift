import SwiftUI

/// Feature 02: Portfolio Holdings Management View.
/// Displays total market value, invested capital, unrealized P/L, asset allocation weights,
/// explicit market data freshness badges, and supports full CRUD with live quote refresh.
struct PortfolioManagementView: View {
    @ObservedObject var viewModel: ResilienceViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var showingAddSheet: Bool = false
    @State private var editingHolding: PortfolioHolding? = nil
    @State private var holdingToDelete: PortfolioHolding? = nil
    @State private var showDeleteConfirmation: Bool = false
    @State private var toastMessage: String? = nil
    
    var totalInvested: Double {
        viewModel.profile.activeHoldings.reduce(0.0) { $0 + $1.investedValue }
    }
    
    var totalMarketValue: Double {
        viewModel.profile.portfolioValue
    }
    
    var totalUnrealizedPnL: Double {
        totalMarketValue - totalInvested
    }
    
    var totalUnrealizedPnLPercent: Double {
        guard totalInvested > 0 else { return 0.0 }
        return (totalUnrealizedPnL / totalInvested) * 100.0
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    // MARK: - Header Valuation Card
                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("TOTAL PORTFOLIO VALUE")
                                    .font(.system(size: 11, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color.secondary)
                                    .tracking(0.8)
                                Text(LOSTheme.formatRupee(totalMarketValue))
                                    .font(.system(size: 30, weight: .bold, design: .rounded))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.70)
                            }
                            Spacer()
                            
                            // Freshness Indicator Capsule
                            HStack(spacing: 5) {
                                Circle()
                                    .fill(viewModel.marketDataFreshnessSummary.color)
                                    .frame(width: 7, height: 7)
                                Text(viewModel.marketDataFreshnessSummary.displayName)
                                    .font(.system(size: 10, weight: .bold, design: .rounded))
                                    .foregroundStyle(viewModel.marketDataFreshnessSummary.color)
                            }
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(viewModel.marketDataFreshnessSummary.color.opacity(0.12))
                            .clipShape(Capsule())
                        }
                        
                        Divider()
                            .overlay(LOSTheme.cardBorder)
                        
                        // Invested vs Unrealized P/L
                        HStack(spacing: 16) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("INVESTED CAPITAL")
                                    .font(.system(size: 10, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color.secondary)
                                Text(LOSTheme.formatRupee(totalInvested))
                                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                            }
                            
                            Spacer()
                            
                            VStack(alignment: .trailing, spacing: 3) {
                                Text("UNREALIZED P/L")
                                    .font(.system(size: 10, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color.secondary)
                                HStack(spacing: 4) {
                                    Image(systemName: totalUnrealizedPnL >= 0 ? "arrow.up.right" : "arrow.down.right")
                                        .font(.system(size: 11, weight: .bold))
                                    Text("\(LOSTheme.formatRupee(abs(totalUnrealizedPnL))) (\(String(format: "%+.1f%%", totalUnrealizedPnLPercent)))")
                                        .font(.system(size: 14, weight: .bold, design: .rounded))
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.75)
                                }
                                .foregroundStyle(totalUnrealizedPnL >= 0 ? LOSTheme.safeGreen : LOSTheme.criticalRed)
                            }
                        }
                    }
                    .padding(18)
                    .background(LOSTheme.cardBackground)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusLarge))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusLarge)
                            .stroke(LOSTheme.cardBorder, lineWidth: 1)
                    )
                    .padding(.horizontal)
                    
                    // MARK: - Action Buttons (Refresh & Add)
                    VStack(spacing: 8) {
                        HStack(spacing: 12) {
                            Button {
                                Task {
                                    await viewModel.refreshMarketPrices()
                                }
                            } label: {
                                HStack(spacing: 6) {
                                    if viewModel.isRefreshingMarketData {
                                        ProgressView()
                                            .tint(LOSTheme.primary)
                                            .scaleEffect(0.8)
                                    } else {
                                        Image(systemName: "arrow.clockwise")
                                            .font(.system(size: 13, weight: .semibold))
                                    }
                                    Text(viewModel.isRefreshingMarketData ? "Refreshing..." : "Refresh Quotes")
                                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 11)
                                .background(LOSTheme.cardBackground)
                                .foregroundStyle(LOSTheme.primary)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .stroke(LOSTheme.primary.opacity(0.3), lineWidth: 1)
                                )
                            }
                            .disabled(viewModel.isRefreshingMarketData)
                            
                            Button {
                                showingAddSheet = true
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "plus.circle.fill")
                                        .font(.system(size: 13, weight: .semibold))
                                    Text("Add Holding")
                                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 11)
                                .background(LOSTheme.primary)
                                .foregroundStyle(Color.black)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                        }
                        
                        Button {
                            viewModel.isShowingWhatIfSheet = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "wand.and.stars")
                                    .font(.system(size: 12, weight: .semibold))
                                Text("What-If Simulator (Model Any NSE / BSE Stock)")
                                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(LOSTheme.positive.opacity(0.12))
                            .foregroundStyle(LOSTheme.positive)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                    }
                    .padding(.horizontal)
                    
                    // Status banner if any
                    if let msg = viewModel.marketDataMessage {
                        HStack(spacing: 8) {
                            Image(systemName: "info.circle.fill")
                                .font(.system(size: 12))
                                .foregroundStyle(LOSTheme.primary)
                            Text(msg)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(Color.secondary)
                            Spacer()
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .background(LOSTheme.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .padding(.horizontal)
                    }
                    
                    // MARK: - Holdings List Header
                    HStack {
                        Text("EQUITY HOLDINGS (\(viewModel.profile.activeHoldings.count))")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.secondary)
                            .tracking(0.8)
                        Spacer()
                    }
                    .padding(.horizontal)
                    .padding(.top, 4)
                    
                    if viewModel.profile.activeHoldings.isEmpty {
                        ContentUnavailableView {
                            Label("No Holdings in Portfolio", systemImage: "chart.pie")
                        } description: {
                            Text("Add your Indian stock holdings to model portfolio drawdown and evaluate liquidity risk.")
                        } actions: {
                            Button("Add First Holding") {
                                showingAddSheet = true
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(LOSTheme.primary)
                            .foregroundStyle(Color.black)
                            .clipShape(Capsule())
                        }
                        .padding(20)
                        .background(LOSTheme.cardBackground)
                        .clipShape(.rect(cornerRadius: LOSTheme.radiusLarge))
                        .overlay(
                            RoundedRectangle(cornerRadius: LOSTheme.radiusLarge)
                                .stroke(LOSTheme.cardBorder, lineWidth: 1)
                        )
                        .padding(.horizontal)
                    } else {
                        VStack(spacing: 10) {
                            ForEach(viewModel.profile.activeHoldings) { holding in
                                HoldingRowCard(
                                    holding: holding,
                                    onEdit: {
                                        editingHolding = holding
                                    },
                                    onDelete: {
                                        holdingToDelete = holding
                                        showDeleteConfirmation = true
                                    }
                                )
                            }
                        }
                        .padding(.horizontal)
                        .padding(.bottom, 24)
                    }
                }
            }
            .navigationTitle("Portfolio Holdings")
            .navigationBarTitleDisplayMode(.inline)
            .background(LOSTheme.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showingAddSheet) {
                HoldingEditorSheet(viewModel: viewModel)
            }
            .sheet(item: $editingHolding) { holding in
                HoldingEditorSheet(viewModel: viewModel, existingHolding: holding)
            }
            .sheet(isPresented: $viewModel.isShowingWhatIfSheet) {
                WhatIfStockSimulatorView(viewModel: viewModel)
            }
            .alert("Remove \(holdingToDelete?.ticker ?? "Holding") from Portfolio?", isPresented: $showDeleteConfirmation) {
                Button("Remove", role: .destructive) {
                    if let h = holdingToDelete {
                        let ticker = h.ticker
                        viewModel.deleteHolding(id: h.id)
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                            toastMessage = "Removed \(ticker) from portfolio"
                        }
                        Task {
                            try? await Task.sleep(nanoseconds: 2_500_000_000)
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                toastMessage = nil
                            }
                        }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                if let h = holdingToDelete {
                    Text("This will remove \(h.shares) shares of \(h.companyName) and update your portfolio total valuation.")
                } else {
                    Text("This holding will be permanently removed from your portfolio.")
                }
            }
            .overlay(alignment: .top) {
                if let msg = toastMessage {
                    HStack(spacing: 8) {
                        Image(systemName: "trash.fill")
                            .foregroundStyle(LOSTheme.critical)
                        Text(msg)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LOSTheme.textPrimary)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(LOSTheme.surfaceElevated)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(LOSTheme.borderHairline, lineWidth: 1))
                    .shadow(color: Color.black.opacity(0.35), radius: 8, y: 4)
                    .padding(.top, 10)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
    }
}

/// Card view for an individual holding row
private struct HoldingRowCard: View {
    let holding: PortfolioHolding
    let onEdit: () -> Void
    let onDelete: () -> Void
    
    var body: some View {
        VStack(spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(holding.ticker)
                            .font(.system(size: 15, weight: .bold, design: .monospaced))
                        
                        Text(holding.freshness.displayName)
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(holding.freshness.color.opacity(0.12))
                            .foregroundStyle(holding.freshness.color)
                            .clipShape(Capsule())
                    }
                    
                    Text(holding.companyName)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.secondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 3) {
                    Text(LOSTheme.formatRupee(holding.currentValue))
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    
                    HStack(spacing: 3) {
                        Image(systemName: holding.unrealizedPnL >= 0 ? "arrow.up.right" : "arrow.down.right")
                            .font(.system(size: 10, weight: .bold))
                        Text("\(LOSTheme.formatRupee(abs(holding.unrealizedPnL))) (\(String(format: "%+.1f%%", holding.unrealizedPnLPercent)))")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                    .foregroundStyle(holding.unrealizedPnL >= 0 ? LOSTheme.safeGreen : LOSTheme.criticalRed)
                }
            }
            
            Divider()
                .overlay(LOSTheme.cardBorder.opacity(0.5))
            
            // Sub-details: Shares, Avg, Current Price, Weight
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("QUANTITY & AVG")
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.secondary)
                    Text("\(holding.shares) @ \(LOSTheme.formatRupee(holding.averageBuyPrice))")
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                }
                
                Spacer()
                
                VStack(alignment: .center, spacing: 2) {
                    Text("CURRENT PRICE")
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.secondary)
                    Text(LOSTheme.formatRupee(holding.currentPrice))
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                }
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 2) {
                    Text("WEIGHT")
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.secondary)
                    Text(String(format: "%.1f%%", holding.portfolioWeightPercent))
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(LOSTheme.primary)
                }
                
                // Action Menu & Fast Delete
                HStack(spacing: 6) {
                    Button(action: onEdit) {
                        Image(systemName: "pencil")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(Color.secondary)
                            .padding(6)
                            .background(Color.secondary.opacity(0.12))
                            .clipShape(Circle())
                    }
                    .accessibilityLabel("Edit \(holding.ticker)")
                    
                    Button(role: .destructive, action: onDelete) {
                        Image(systemName: "trash")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(LOSTheme.critical)
                            .padding(6)
                            .background(LOSTheme.critical.opacity(0.12))
                            .clipShape(Circle())
                    }
                    .accessibilityLabel("Remove \(holding.ticker) from portfolio")
                    
                    Menu {
                        Button(action: onEdit) {
                            Label("Edit Holding", systemImage: "pencil")
                        }
                        Button(role: .destructive, action: onDelete) {
                            Label("Remove Holding", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.secondary)
                            .padding(.leading, 4)
                            .padding(.vertical, 4)
                    }
                }
            }
        }
        .padding(14)
        .background(LOSTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(LOSTheme.cardBorder, lineWidth: 1)
        )
    }
}
