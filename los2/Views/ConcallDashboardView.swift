import SwiftUI

/// Main Hub for Feature: AI Concall Intelligence.
/// Overhauled strictly according to swiftui-pro standards:
/// Compact header with tiny status dot, horizontal holdings chip row,
/// single focused active analysis hero card, and clean historical analyses list.
struct ConcallDashboardView: View {
    @ObservedObject var viewModel: ConcallViewModel
    @ObservedObject var resilienceViewModel: ResilienceViewModel
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: LOSTheme.space20) {
                    // MARK: - 1. Top Header with AI Intelligence & Server Status
                    headerBar
                    
                    // MARK: - 2. Quick Action Strip (New Transcript / Load Sample)
                    quickActionCard
                    
                    // MARK: - 3. Holdings Horizontal Chip Selector
                    portfolioHoldingsSelector
                    
                    // MARK: - 4. Active Analysis Hero Card
                    if let analysis = viewModel.currentAnalysis {
                        activeAnalysisCard(analysis: analysis)
                    }
                    
                    // MARK: - 5. Saved Analyses History
                    savedAnalysesSection
                }
                .padding(.horizontal, LOSTheme.space16)
                .padding(.top, LOSTheme.space8)
                .padding(.bottom, 64)
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .background(LOSTheme.backgroundGradient.ignoresSafeArea())
            .sheet(isPresented: $viewModel.isShowingUploadSheet) {
                ConcallUploadSheet(
                    viewModel: viewModel,
                    portfolioValue: resilienceViewModel.profile.portfolioValue
                )
            }
            .sheet(isPresented: $viewModel.isShowingStressBridge) {
                if let analysis = viewModel.currentAnalysis {
                    ConcallStressBridgeSheet(
                        analysis: analysis,
                        resilienceViewModel: resilienceViewModel
                    )
                }
            }
        }
    }
    
    // MARK: - Subviews
    
    private var headerBar: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: LOSTheme.space4) {
                Text("AI EARNINGS INTELLIGENCE")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(LOSTheme.textSecondary)
                    .tracking(0.8)
                Text("Concall Analysis")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(LOSTheme.textPrimary)
            }
            
            Spacer()
            
            HStack(spacing: 6) {
                Circle()
                    .fill(statusIndicatorColor)
                    .frame(width: 8, height: 8)
                Text(statusIndicatorText)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(LOSTheme.textSecondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(LOSTheme.surface)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
            )
        }
    }
    
    private var quickActionCard: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space12) {
            HStack(spacing: LOSTheme.space12) {
                Button {
                    viewModel.resetUploadForm()
                    viewModel.isShowingUploadSheet = true
                } label: {
                    HStack(spacing: LOSTheme.space8) {
                        Image(systemName: "plus.circle.fill")
                            .font(.subheadline)
                        Text("New Transcript")
                            .font(.subheadline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(LOSTheme.accent)
                    .foregroundStyle(Color.white)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                }
                .buttonStyle(.plain)
                
                Button {
                    viewModel.loadSampleRelianceConcall()
                } label: {
                    HStack(spacing: LOSTheme.space6) {
                        Image(systemName: "sparkles")
                            .font(.subheadline)
                        Text("Sample Call")
                            .font(.subheadline.weight(.semibold))
                    }
                    .padding(.horizontal, LOSTheme.space16)
                    .padding(.vertical, 12)
                    .background(LOSTheme.surfaceElevated)
                    .foregroundStyle(LOSTheme.textPrimary)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusMedium, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
    
    private var portfolioHoldingsSelector: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space12) {
            SectionHeader(
                title: "Portfolio Companies",
                subtitle: "Select a holding to view or link earnings insights"
            )
            
            ScrollView(.horizontal) {
                HStack(spacing: LOSTheme.space12) {
                    ForEach(resilienceViewModel.profile.activeHoldings) { holding in
                        let isSelected = viewModel.selectedHolding?.id == holding.id || viewModel.tickerInput == holding.ticker
                        Button {
                            viewModel.selectHolding(holding)
                            if let found = viewModel.savedAnalyses.first(where: { $0.metadata.ticker == holding.ticker }) {
                                viewModel.currentAnalysis = found
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: LOSTheme.space6) {
                                HStack {
                                    Text(holding.ticker)
                                        .font(.caption.weight(.bold))
                                        .fontDesign(.monospaced)
                                        .foregroundStyle(LOSTheme.textPrimary)
                                    Spacer()
                                    Text(String(format: "%.0f%%", holding.portfolioWeightPercent))
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(LOSTheme.accent)
                                }
                                
                                Text(holding.companyName)
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(LOSTheme.textSecondary)
                                    .lineLimit(1)
                                
                                Text(LOSTheme.formatRupee(holding.currentValue))
                                    .font(.caption2.weight(.semibold))
                                    .monospacedDigit()
                                    .foregroundStyle(LOSTheme.textPrimary)
                            }
                            .frame(width: 140, alignment: .leading)
                            .padding(LOSTheme.space12)
                            .background(isSelected ? LOSTheme.accent.opacity(0.12) : LOSTheme.surface)
                            .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: LOSTheme.radiusMedium, style: .continuous)
                                    .stroke(isSelected ? LOSTheme.accent : LOSTheme.borderHairline, lineWidth: isSelected ? 1.5 : LOSTheme.hairline)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }
    
    private func activeAnalysisCard(analysis: ConcallAnalysis) -> some View {
        VStack(alignment: .leading, spacing: LOSTheme.space16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: LOSTheme.space4) {
                    HStack(spacing: LOSTheme.space8) {
                        Text(analysis.metadata.companyName)
                            .font(.headline.weight(.bold))
                            .foregroundStyle(LOSTheme.textPrimary)
                        
                        Text(analysis.metadata.ticker)
                            .font(.caption.weight(.bold))
                            .fontDesign(.monospaced)
                            .foregroundStyle(LOSTheme.accent)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(LOSTheme.accent.opacity(0.12))
                            .clipShape(Capsule())
                    }
                    
                    Text("\(analysis.metadata.quarter) \(analysis.metadata.fiscalYear) • Earnings Call")
                        .font(.caption)
                        .foregroundStyle(LOSTheme.textSecondary)
                }
                
                Spacer()
                
                NavigationLink {
                    ConcallDetailView(
                        analysis: analysis,
                        resilienceViewModel: resilienceViewModel
                    )
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(LOSTheme.textSecondary)
                        .padding(8)
                        .background(LOSTheme.surfaceElevated)
                        .clipShape(Circle())
                }
            }
            
            Text(analysis.executiveSummary)
                .font(.subheadline)
                .foregroundStyle(LOSTheme.textPrimary)
                .lineLimit(3)
                .lineSpacing(3)
            
            // Key findings tally row
            HStack(spacing: LOSTheme.space12) {
                StatusPill(
                    text: "\(analysis.risks.count) Risks",
                    icon: "exclamationmark.triangle.fill",
                    color: LOSTheme.critical
                )
                
                StatusPill(
                    text: "\(analysis.positives.count) Positives",
                    icon: "arrow.up.right.circle.fill",
                    color: LOSTheme.positive
                )
                
                Spacer()
                
                Text("\(analysis.findings.count) Citations")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(LOSTheme.textSecondary)
            }
            
            Divider().overlay(LOSTheme.borderHairline)
            
            // Action Buttons
            HStack(spacing: LOSTheme.space12) {
                NavigationLink {
                    ConcallDetailView(
                        analysis: analysis,
                        resilienceViewModel: resilienceViewModel
                    )
                } label: {
                    HStack {
                        Image(systemName: "doc.text.magnifyingglass")
                        Text("View Analysis")
                            .fontWeight(.semibold)
                    }
                    .font(.subheadline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(LOSTheme.accent)
                    .foregroundStyle(Color.white)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
                }
                
                Button {
                    viewModel.isShowingStressBridge = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "bolt.shield.fill")
                        Text("Stress Test")
                            .fontWeight(.semibold)
                    }
                    .font(.subheadline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(LOSTheme.warning.opacity(0.12))
                    .foregroundStyle(LOSTheme.warning)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(LOSTheme.space16)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
    }
    
    private var savedAnalysesSection: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: LOSTheme.space4) {
                    Text("Recent Analyses")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(LOSTheme.textPrimary)
                    Text("Stored earnings transcripts and extractions")
                        .font(.caption)
                        .foregroundStyle(LOSTheme.textSecondary)
                }
                Spacer()
                NavigationLink {
                    ConcallHistoryView(
                        viewModel: viewModel,
                        resilienceViewModel: resilienceViewModel
                    )
                } label: {
                    Text("See All (\(viewModel.savedAnalyses.count))")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LOSTheme.accent)
                }
            }
            
            if viewModel.savedAnalyses.isEmpty {
                VStack(spacing: LOSTheme.space8) {
                    Image(systemName: "tray")
                        .font(.title2)
                        .foregroundStyle(LOSTheme.textSecondary)
                    Text("No transcripts analyzed yet")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(LOSTheme.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(LOSTheme.space24)
                .background(LOSTheme.surface)
                .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(viewModel.savedAnalyses.prefix(3).enumerated()), id: \.element.id) { index, item in
                        NavigationLink {
                            ConcallDetailView(
                                analysis: item,
                                resilienceViewModel: resilienceViewModel
                            )
                        } label: {
                            HStack(spacing: LOSTheme.space12) {
                                Image(systemName: "waveform")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(LOSTheme.accent)
                                    .frame(width: 32, height: 32)
                                    .background(LOSTheme.accent.opacity(0.12))
                                    .clipShape(Circle())
                                
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack {
                                        Text(item.metadata.companyName)
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(LOSTheme.textPrimary)
                                        Text(item.metadata.ticker)
                                            .font(.caption2.weight(.bold))
                                            .fontDesign(.monospaced)
                                            .foregroundStyle(LOSTheme.accent)
                                    }
                                    
                                    Text("\(item.metadata.quarter) \(item.metadata.fiscalYear) • \(item.findings.count) insights extracted")
                                        .font(.caption)
                                        .foregroundStyle(LOSTheme.textSecondary)
                                }
                                
                                Spacer()
                                
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(LOSTheme.textSecondary)
                            }
                            .padding(LOSTheme.space16)
                        }
                        .buttonStyle(.plain)
                        
                        if index < min(3, viewModel.savedAnalyses.count) - 1 {
                            Divider().overlay(LOSTheme.borderHairline)
                                .padding(.leading, 60)
                        }
                    }
                }
                .background(LOSTheme.surface)
                .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                        .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                )
            }
        }
    }
    
    private var statusIndicatorColor: Color {
        switch viewModel.serverStatus {
        case .online(_, let llmReady):
            return llmReady ? LOSTheme.positive : LOSTheme.warning
        case .offline:
            return LOSTheme.textSecondary
        case .checking:
            return LOSTheme.accent
        }
    }
    
    private var statusIndicatorText: String {
        switch viewModel.serverStatus {
        case .online(let provider, let llmReady):
            return llmReady ? provider : "Setup Key"
        case .offline:
            return "Local"
        case .checking:
            return "Connecting..."
        }
    }
}

#Preview("Concall Dashboard") {
    let vm = ConcallViewModel()
    let rvm = ResilienceViewModel()
    ConcallDashboardView(viewModel: vm, resilienceViewModel: rvm)
}
