import SwiftUI

/// Detailed view showing structured findings, quotations, and guidance from a concall.
/// Built following swiftui-pro guidelines for prose-heavy financial data:
/// Collapsed scannable finding cards with tap-to-expand verbatim quotations,
/// segmented classification filtering with counts, and progressive disclosure for commentary.
struct ConcallDetailView: View {
    let analysis: ConcallAnalysis
    @ObservedObject var resilienceViewModel: ResilienceViewModel
    
    @State private var selectedFilter: FindingFilter = .all
    @State private var expandedFindingIDs: Set<String> = []
    @State private var isFinancialCommentaryExpanded: Bool = false
    @State private var isShowingStressBridge: Bool = false
    
    enum FindingFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case risks = "Risks"
        case positives = "Positives"
        
        var id: String { rawValue }
    }
    
    var body: some View {
        ScrollView {
            VStack(spacing: LOSTheme.space20) {
                // MARK: - 1. Company Header
                headerCard
                
                // MARK: - 2. Portfolio Connection Banner
                portfolioConnectionCard
                
                // MARK: - 3. Executive Summary
                executiveSummaryCard
                
                // MARK: - 4. Findings Section with Filter & Tap-to-Expand
                findingsSection
                
                // MARK: - 5. Financial Commentary (Progressive Disclosure)
                financialCommentarySection
                
                // MARK: - 6. Key Management Statements
                if !analysis.managementStatements.isEmpty {
                    managementStatementsSection
                }
                
                // MARK: - 7. Key Uncertainties
                if !analysis.keyUncertainties.isEmpty {
                    uncertaintiesSection
                }
                
                // MARK: - 8. Regulatory Disclaimer
                Text(analysis.portfolioConnection.disclaimer)
                    .font(.caption2)
                    .foregroundStyle(LOSTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, LOSTheme.space24)
                    .padding(.bottom, LOSTheme.space24)
            }
            .padding(.horizontal, LOSTheme.space16)
            .padding(.top, LOSTheme.space12)
            .padding(.bottom, 64)
        }
        .navigationTitle(analysis.metadata.ticker)
        .navigationBarTitleDisplayMode(.inline)
        .background(LOSTheme.backgroundGradient.ignoresSafeArea())
        .sheet(isPresented: $isShowingStressBridge) {
            ConcallStressBridgeSheet(
                analysis: analysis,
                resilienceViewModel: resilienceViewModel
            )
        }
    }
    
    // MARK: - Subviews
    
    private var headerCard: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: LOSTheme.space4) {
                    Text("\(analysis.metadata.quarter) \(analysis.metadata.fiscalYear) EARNINGS CALL")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(LOSTheme.textSecondary)
                        .tracking(0.8)
                    
                    Text(analysis.metadata.companyName)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(LOSTheme.textPrimary)
                }
                
                Spacer()
                
                Text(analysis.metadata.ticker)
                    .font(.subheadline.weight(.bold))
                    .fontDesign(.monospaced)
                    .foregroundStyle(LOSTheme.accent)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(LOSTheme.accent.opacity(0.12))
                    .clipShape(Capsule())
            }
            
            if let source = analysis.metadata.transcriptSource {
                HStack(spacing: 4) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.caption2)
                    Text("Source: \(source)")
                        .font(.caption2)
                }
                .foregroundStyle(LOSTheme.textSecondary)
            }
        }
        .padding(LOSTheme.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
    }
    
    private var portfolioConnectionCard: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space12) {
            HStack {
                Label("Portfolio Impact Bridge", systemImage: "briefcase.fill")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(LOSTheme.accent)
                Spacer()
            }
            
            Text(analysis.portfolioConnection.holdingSummary)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(LOSTheme.textPrimary)
            
            Text(analysis.portfolioConnection.potentialExposureExplanation)
                .font(.footnote)
                .foregroundStyle(LOSTheme.textSecondary)
                .lineSpacing(2)
            
            Button {
                isShowingStressBridge = true
            } label: {
                HStack {
                    Image(systemName: "chart.line.downtrend.xyaxis")
                    Text("Stress Test Portfolio Under Risks")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Image(systemName: "arrow.right")
                        .font(.caption.weight(.bold))
                }
                .padding(.vertical, 10)
                .padding(.horizontal, LOSTheme.space16)
                .background(LOSTheme.accent)
                .foregroundStyle(Color.white)
                .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(LOSTheme.space16)
        .background(LOSTheme.accent.opacity(0.08))
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.accent.opacity(0.25), lineWidth: LOSTheme.hairline)
        )
    }
    
    private var executiveSummaryCard: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space8) {
            Text("EXECUTIVE SUMMARY")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(LOSTheme.textSecondary)
                .tracking(0.8)
            
            Text(analysis.executiveSummary)
                .font(.subheadline)
                .foregroundStyle(LOSTheme.textPrimary)
                .lineSpacing(3)
        }
        .padding(LOSTheme.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
    }
    
    private var findingsSection: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space12) {
            SectionHeader(
                title: "Evidence-Backed Findings",
                subtitle: "Verbatim quotes and classification from transcript"
            )
            
            // Segmented Filter Bar with Counts
            Picker("Findings Filter", selection: $selectedFilter) {
                Text("All (\(analysis.findings.count))").tag(FindingFilter.all)
                Text("Risks (\(analysis.risks.count))").tag(FindingFilter.risks)
                Text("Positives (\(analysis.positives.count))").tag(FindingFilter.positives)
            }
            .pickerStyle(.segmented)
            
            let filteredFindings = currentFilteredFindings
            
            if filteredFindings.isEmpty {
                VStack(spacing: LOSTheme.space8) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.title2)
                        .foregroundStyle(LOSTheme.textSecondary)
                    Text("No findings in this category")
                        .font(.footnote)
                        .foregroundStyle(LOSTheme.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(LOSTheme.space24)
                .background(LOSTheme.surface)
                .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
            } else {
                VStack(spacing: LOSTheme.space8) {
                    ForEach(filteredFindings) { item in
                        findingCard(item: item)
                    }
                }
            }
        }
    }
    
    private var currentFilteredFindings: [ConcallFinding] {
        switch selectedFilter {
        case .all:
            return analysis.findings
        case .risks:
            return analysis.risks
        case .positives:
            return analysis.positives
        }
    }
    
    private func findingCard(item: ConcallFinding) -> some View {
        let isExpanded = expandedFindingIDs.contains(item.id)
        
        return Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                if isExpanded {
                    expandedFindingIDs.remove(item.id)
                } else {
                    expandedFindingIDs.insert(item.id)
                }
            }
        } label: {
            VStack(alignment: .leading, spacing: LOSTheme.space8) {
                // Top row: Classification Pill + Location + Chevron
                HStack {
                    StatusPill(
                        text: item.classification.displayName,
                        icon: item.classification.iconName,
                        color: item.classification.color
                    )
                    
                    Spacer()
                    
                    Text(item.location)
                        .font(.caption2)
                        .foregroundStyle(LOSTheme.textSecondary)
                    
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(LOSTheme.textSecondary)
                }
                
                // Topic Headline
                Text(item.topic)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LOSTheme.textPrimary)
                    .lineLimit(isExpanded ? nil : 2)
                
                // 1-line Explanation (collapsible)
                Text(item.explanation)
                    .font(.footnote)
                    .foregroundStyle(LOSTheme.textSecondary)
                    .lineLimit(isExpanded ? nil : 1)
                
                // Expanded Details: Verbatim Quote Block
                if isExpanded {
                    VStack(alignment: .leading, spacing: LOSTheme.space6) {
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "quote.opening")
                                .font(.caption2)
                                .foregroundStyle(item.classification.color)
                                .padding(.top, 2)
                            
                            Text(item.exactQuote)
                                .font(.footnote.italic())
                                .foregroundStyle(LOSTheme.textPrimary)
                        }
                    }
                    .padding(LOSTheme.space12)
                    .background(LOSTheme.surfaceElevated)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
                    .padding(.top, LOSTheme.space4)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .padding(LOSTheme.space12)
            .background(LOSTheme.surface)
            .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: LOSTheme.radiusMedium, style: .continuous)
                    .stroke(
                        isExpanded ? item.classification.color.opacity(0.4) : LOSTheme.borderHairline,
                        lineWidth: LOSTheme.hairline
                    )
            )
        }
        .buttonStyle(.plain)
    }
    
    private var financialCommentarySection: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space12) {
            DisclosureGroup(isExpanded: $isFinancialCommentaryExpanded) {
                VStack(spacing: LOSTheme.space8) {
                    commentaryTile(title: "Revenue Commentary", content: analysis.financialPerformance.revenueCommentary, icon: "indianrupeesign.circle")
                    commentaryTile(title: "Profit Commentary", content: analysis.financialPerformance.profitCommentary, icon: "chart.bar.fill")
                    commentaryTile(title: "Margin Pressure", content: analysis.financialPerformance.marginPressure, icon: "gauge.with.needle", isWarning: true)
                    commentaryTile(title: "Costs & Debt", content: analysis.financialPerformance.risingCostsOrDebt, icon: "creditcard.fill")
                    commentaryTile(title: "Growth Guidance", content: analysis.growthAndGuidance.growthGuidance, icon: "arrow.up.right.circle")
                    commentaryTile(title: "Guidance vs Past", content: analysis.growthAndGuidance.guidanceComparison, icon: "clock.arrow.2.circlepath")
                }
                .padding(.top, LOSTheme.space12)
            } label: {
                HStack(spacing: LOSTheme.space8) {
                    Image(systemName: "chart.xyaxis.line")
                        .foregroundStyle(LOSTheme.accent)
                    Text("Financial Guidance & Margins")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LOSTheme.textPrimary)
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
    }
    
    private func commentaryTile(title: String, content: String, icon: String, isWarning: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: LOSTheme.space4) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(isWarning ? LOSTheme.warning : LOSTheme.accent)
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(LOSTheme.textSecondary)
            }
            Text(content)
                .font(.footnote)
                .foregroundStyle(content.contains("Not mentioned") ? LOSTheme.textSecondary.opacity(0.7) : LOSTheme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LOSTheme.space8)
        .background(LOSTheme.surfaceElevated.opacity(0.5))
        .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
    }
    
    private var managementStatementsSection: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space12) {
            SectionHeader(
                title: "Management Statements",
                subtitle: "Direct commentary from executives on the call"
            )
            
            VStack(spacing: LOSTheme.space8) {
                ForEach(analysis.managementStatements) { stmt in
                    VStack(alignment: .leading, spacing: LOSTheme.space6) {
                        HStack {
                            Text(stmt.speaker)
                                .font(.caption.weight(.bold))
                                .foregroundStyle(LOSTheme.accent)
                            Spacer()
                            Text(stmt.location)
                                .font(.caption2)
                                .foregroundStyle(LOSTheme.textSecondary)
                        }
                        
                        Text("\"\(stmt.quote)\"")
                            .font(.footnote.italic())
                            .foregroundStyle(LOSTheme.textPrimary)
                        
                        Text(stmt.context)
                            .font(.caption2)
                            .foregroundStyle(LOSTheme.textSecondary)
                    }
                    .padding(LOSTheme.space12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(LOSTheme.surface)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusMedium, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                }
            }
        }
    }
    
    private var uncertaintiesSection: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space12) {
            Label("Uncertainties & Open Questions", systemImage: "questionmark.circle.fill")
                .font(.footnote.weight(.bold))
                .foregroundStyle(LOSTheme.warning)
            
            VStack(alignment: .leading, spacing: LOSTheme.space8) {
                ForEach(analysis.keyUncertainties, id: \.self) { item in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "circle.fill")
                            .font(.system(size: 5))
                            .foregroundStyle(LOSTheme.warning)
                            .padding(.top, 6)
                        Text(item)
                            .font(.footnote)
                            .foregroundStyle(LOSTheme.textSecondary)
                    }
                }
            }
        }
        .padding(LOSTheme.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
    }
}

#Preview("Concall Detail") {
    let sample = ConcallAnalysis.sampleRelianceAnalysis
    let rvm = ResilienceViewModel()
    NavigationStack {
        ConcallDetailView(analysis: sample, resilienceViewModel: rvm)
    }
}
