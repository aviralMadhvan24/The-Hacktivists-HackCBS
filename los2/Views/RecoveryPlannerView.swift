import SwiftUI

/// Feature 05: AI Recovery Planner View.
/// Evaluates post-shock cash depletion and calculates deterministic recovery blueprints (Conservative, Balanced, Aggressive)
/// enhanced with Google Gemini AI strategic rationale and trade-off analysis.
struct RecoveryPlannerView: View {
    @ObservedObject var viewModel: ResilienceViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var selectedTierIndex: Int = 1 // Default to Balanced (index 1)
    @State private var showAppliedToast: String? = nil
    
    var response: RecoveryPlanResponse? {
        viewModel.recoveryPlanResponse
    }
    
    var baseline: RecoveryBaseline? {
        viewModel.recoveryBaseline
    }
    
    private let promptSuggestions = [
        "Rebuild emergency fund fast",
        "Stop monthly cash bleed",
        "Protect stock investments"
    ]
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: LOSTheme.space16) {
                    // MARK: - Header Baseline Card
                    headerBaselineCard
                    
                    // MARK: - Plan Selector Tabs & Active Blueprint
                    if let plans = response?.plans, !plans.isEmpty {
                        planSelectionSection(plans: plans)
                    } else if viewModel.isGeneratingRecoveryPlan {
                        loadingPlaceholder
                    }
                    
                    // MARK: - AI Strategic Narrative Card
                    if let res = response {
                        aiNarrativeCard(res: res)
                    }
                    
                    // MARK: - Custom Objective & Re-Analyze Section
                    customObjectiveSection
                }
                .padding(.top, LOSTheme.space8)
                .padding(.bottom, LOSTheme.space32)
            }
            .background(LOSTheme.backgroundGradient.ignoresSafeArea())
            .navigationTitle("AI Recovery Planner")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await viewModel.fetchRecoveryPlans() }
                    } label: {
                        if viewModel.isGeneratingRecoveryPlan {
                            ProgressView()
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.subheadline.weight(.semibold))
                        }
                    }
                    .disabled(viewModel.isGeneratingRecoveryPlan)
                }
            }
            .task {
                if response == nil {
                    await viewModel.fetchRecoveryPlans()
                }
            }
            .overlay(alignment: .bottom) {
                if let toast = showAppliedToast {
                    HStack(spacing: LOSTheme.space8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(LOSTheme.positive)
                        Text(toast)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.white)
                    }
                    .padding(.horizontal, LOSTheme.space16)
                    .padding(.vertical, LOSTheme.space10)
                    .background(Color.black.opacity(0.85))
                    .clipShape(Capsule())
                    .padding(.bottom, LOSTheme.space24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
    }
    
    // MARK: - Header Baseline Card
    private var headerBaselineCard: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("RECOVERY BASELINE")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(LOSTheme.textSecondary)
                        .tracking(0.6)
                    Text("Post-Shock Deficit Analysis")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(LOSTheme.textPrimary)
                }
                
                Spacer()
                
                if let res = response {
                    HStack(spacing: 4) {
                        Image(systemName: res.aiGenerated ? "sparkles" : "shield.checkerboard")
                            .font(.caption2.weight(.bold))
                        Text(res.aiProvider)
                            .font(.caption2.weight(.bold))
                    }
                    .padding(.horizontal, LOSTheme.space8 + 2)
                    .padding(.vertical, LOSTheme.space4)
                    .background(LOSTheme.accent.opacity(0.12))
                    .foregroundStyle(LOSTheme.accent)
                    .clipShape(Capsule())
                }
            }
            
            Divider().overlay(LOSTheme.borderHairline)
            
            // 3 Baseline Metrics
            HStack(spacing: LOSTheme.space12) {
                let postShock = baseline?.immediatePostShockCash ?? max(0, viewModel.profile.liquidCash - viewModel.profile.unexpectedExpense)
                let burn = baseline?.baselineNetBurn ?? viewModel.currentReport.monthlyNetBurn
                let runway = baseline?.baselineRunwayMonths ?? viewModel.currentReport.runwayMonths
                
                baselineTile(
                    title: "POST-SHOCK CASH",
                    value: LOSTheme.formatRupee(postShock),
                    color: postShock < 30_000 ? LOSTheme.critical : LOSTheme.textPrimary
                )
                
                baselineTile(
                    title: "MONTHLY BURN",
                    value: burn > 0 ? "−\(LOSTheme.formatRupee(burn))/mo" : "Break-Even",
                    color: burn > 0 ? LOSTheme.warning : LOSTheme.positive
                )
                
                baselineTile(
                    title: "SURVIVAL RUNWAY",
                    value: String(format: "%.1f mos", runway),
                    color: runway < 3.0 ? LOSTheme.critical : (runway < 6.0 ? LOSTheme.warning : LOSTheme.positive)
                )
            }
        }
        .padding(LOSTheme.space16)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
        .padding(.horizontal)
    }
    
    private func baselineTile(title: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 9.5, weight: .bold))
                .foregroundStyle(LOSTheme.textSecondary)
                .lineLimit(1)
            Text(value)
                .font(.subheadline.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LOSTheme.space8)
        .background(LOSTheme.surfaceElevated)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
    }
    
    // MARK: - Strategy Switcher Tabs & Active Plan Card
    private func planSelectionSection(plans: [RecoveryPlanOption]) -> some View {
        VStack(alignment: .leading, spacing: LOSTheme.space12) {
            Text("CHOOSE RECOVERY STRATEGY")
                .font(.footnote.weight(.bold))
                .foregroundStyle(LOSTheme.textSecondary)
                .tracking(0.6)
                .padding(.horizontal)
            
            // Tier Switcher Buttons
            HStack(spacing: LOSTheme.space8) {
                ForEach(Array(plans.enumerated()), id: \.element.id) { index, plan in
                    let isSelected = selectedTierIndex == index
                    Button {
                        selectedTierIndex = index
                    } label: {
                        VStack(spacing: 3) {
                            Text(plan.tier)
                                .font(.subheadline.weight(.bold))
                            
                            HStack(spacing: 2) {
                                Image(systemName: "arrow.up.right")
                                    .font(.system(size: 8, weight: .bold))
                                Text("+\(String(format: "%.1f", plan.runwayExtensionMonths)) mo")
                                    .font(.caption2.weight(.bold).monospacedDigit())
                            }
                            .foregroundStyle(isSelected ? LOSTheme.positive : LOSTheme.textSecondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, LOSTheme.space10)
                        .background(isSelected ? LOSTheme.surface : LOSTheme.surfaceElevated.opacity(0.6))
                        .foregroundStyle(isSelected ? LOSTheme.textPrimary : LOSTheme.textSecondary)
                        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: LOSTheme.radiusMedium, style: .continuous)
                                .stroke(isSelected ? LOSTheme.accent : LOSTheme.borderHairline, lineWidth: isSelected ? 1.5 : LOSTheme.hairline)
                        )
                    }
                }
            }
            .padding(.horizontal)
            
            // Active Selected Plan Card
            let activePlan = plans[min(selectedTierIndex, plans.count - 1)]
            activePlanDetailCard(plan: activePlan)
                .padding(.horizontal)
        }
    }
    
    // MARK: - Detailed Blueprint for Active Plan
    private func activePlanDetailCard(plan: RecoveryPlanOption) -> some View {
        VStack(alignment: .leading, spacing: LOSTheme.space14) {
            // Plan Title & Tier Badge
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(plan.title)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(LOSTheme.textPrimary)
                    Text(plan.description)
                        .font(.caption)
                        .foregroundStyle(LOSTheme.textSecondary)
                        .lineLimit(2)
                }
                
                Spacer()
                
                Text(plan.tier.uppercased())
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, LOSTheme.space8)
                    .padding(.vertical, LOSTheme.space4)
                    .background(LOSTheme.positive.opacity(0.14))
                    .foregroundStyle(LOSTheme.positive)
                    .clipShape(Capsule())
            }
            
            Divider().overlay(LOSTheme.borderHairline)
            
            // 4 Core Financial Projection Metrics
            LazyVGrid(columns: [GridItem(.flexible(), spacing: LOSTheme.space10), GridItem(.flexible(), spacing: LOSTheme.space10)], spacing: LOSTheme.space10) {
                planMetricPill(
                    label: "MONTHLY SAVINGS",
                    value: "+\(LOSTheme.formatRupee(plan.monthlyExpenseReduction))/mo",
                    highlightColor: LOSTheme.positive
                )
                
                planMetricPill(
                    label: "NEW NET BURN",
                    value: plan.newNetBurn == 0 ? "₹0 (Zero Burn)" : "−\(LOSTheme.formatRupee(plan.newNetBurn))/mo",
                    highlightColor: plan.newNetBurn == 0 ? LOSTheme.positive : LOSTheme.warning
                )
                
                planMetricPill(
                    label: "NEW SURVIVAL RUNWAY",
                    value: String(format: "%.1f months", plan.newRunwayMonths),
                    badge: "+\(String(format: "%.1f", plan.runwayExtensionMonths)) mo",
                    highlightColor: LOSTheme.positive
                )
                
                planMetricPill(
                    label: "BUFFER REBUILD TIME",
                    value: plan.monthsToRebuildEmergencyFund >= 99 ? "N/A" : "\(plan.monthsToRebuildEmergencyFund) Months",
                    highlightColor: LOSTheme.accent
                )
            }
            
            // Recommended Action Steps
            VStack(alignment: .leading, spacing: LOSTheme.space8) {
                Text("TACTICAL ACTION STEPS")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(LOSTheme.textSecondary)
                    .tracking(0.6)
                
                ForEach(plan.actionSteps, id: \.self) { step in
                    HStack(alignment: .top, spacing: LOSTheme.space8) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(LOSTheme.positive)
                            .padding(.top, 1)
                        Text(step)
                            .font(.caption)
                            .foregroundStyle(LOSTheme.textPrimary)
                    }
                }
            }
            .padding(.top, 2)
            
            // Strategic Trade-Offs
            VStack(alignment: .leading, spacing: 3) {
                Text("STRATEGIC TRADE-OFFS")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(LOSTheme.textSecondary)
                    .tracking(0.6)
                Text(plan.tradeOffs)
                    .font(.caption2)
                    .foregroundStyle(LOSTheme.textSecondary)
                    .lineSpacing(2)
            }
            .padding(.top, 2)
            
            // Primary Action: Apply Plan
            Button {
                applyPlan(plan)
            } label: {
                HStack(spacing: LOSTheme.space6) {
                    Image(systemName: "bolt.fill")
                    Text("Apply \(plan.tier) Strategy to Finances")
                        .font(.subheadline.weight(.bold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, LOSTheme.space12)
                .background(LOSTheme.accent)
                .foregroundStyle(Color.white)
                .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
            }
            .padding(.top, LOSTheme.space6)
        }
        .padding(LOSTheme.space16)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
    }
    
    private func planMetricPill(label: String, value: String, badge: String? = nil, highlightColor: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(LOSTheme.textSecondary)
                .lineLimit(1)
            
            HStack(spacing: 4) {
                Text(value)
                    .font(.subheadline.weight(.bold).monospacedDigit())
                    .foregroundStyle(highlightColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                
                if let b = badge {
                    Text(b)
                        .font(.system(size: 9, weight: .bold))
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(highlightColor.opacity(0.12))
                        .foregroundStyle(highlightColor)
                        .clipShape(Capsule())
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(LOSTheme.space8)
        .background(LOSTheme.surfaceElevated)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
    }
    
    // MARK: - AI Narrative
    private func aiNarrativeCard(res: RecoveryPlanResponse) -> some View {
        VStack(alignment: .leading, spacing: LOSTheme.space10) {
            HStack {
                Image(systemName: "sparkles")
                    .foregroundStyle(LOSTheme.accent)
                Text("AI STRATEGIC NARRATIVE")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(LOSTheme.textSecondary)
                    .tracking(0.6)
            }
            
            Text(res.summary)
                .font(.subheadline)
                .foregroundStyle(LOSTheme.textPrimary)
                .lineSpacing(3)
            
            if let advisory = res.riskAdvisory {
                Divider().overlay(LOSTheme.borderHairline)
                
                HStack(alignment: .top, spacing: LOSTheme.space8) {
                    Image(systemName: "shield.lefthalf.filled")
                        .font(.caption)
                        .foregroundStyle(LOSTheme.warning)
                        .padding(.top, 2)
                    Text(advisory)
                        .font(.caption)
                        .foregroundStyle(LOSTheme.textSecondary)
                        .lineSpacing(2)
                }
            }
        }
        .padding(LOSTheme.space16)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
        .padding(.horizontal)
    }
    
    // MARK: - Custom Objective Section
    private var customObjectiveSection: some View {
        VStack(alignment: .leading, spacing: LOSTheme.space10) {
            Text("CUSTOMIZE RECOVERY GOAL")
                .font(.footnote.weight(.bold))
                .foregroundStyle(LOSTheme.textSecondary)
                .tracking(0.6)
            
            // Prompt input
            HStack(spacing: LOSTheme.space8) {
                Image(systemName: "target")
                    .foregroundStyle(LOSTheme.accent)
                
                TextField("e.g. Prioritize emergency fund, keep subscriptions", text: $viewModel.recoveryUserGoals)
                    .font(.subheadline)
                
                if !viewModel.recoveryUserGoals.isEmpty {
                    Button {
                        viewModel.recoveryUserGoals = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(LOSTheme.textSecondary)
                    }
                }
            }
            .padding(LOSTheme.space10)
            .background(LOSTheme.surfaceElevated)
            .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
            
            // Quick suggestions
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: LOSTheme.space6) {
                    ForEach(promptSuggestions, id: \.self) { suggestion in
                        Button {
                            viewModel.recoveryUserGoals = suggestion
                            Task { await viewModel.fetchRecoveryPlans() }
                        } label: {
                            Text(suggestion)
                                .font(.caption2.weight(.medium))
                                .padding(.horizontal, LOSTheme.space10)
                                .padding(.vertical, LOSTheme.space6)
                                .background(LOSTheme.surfaceElevated)
                                .foregroundStyle(LOSTheme.textPrimary)
                                .clipShape(Capsule())
                                .overlay(Capsule().stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline))
                        }
                    }
                }
            }
            
            // Generate button
            Button {
                Task { await viewModel.fetchRecoveryPlans() }
            } label: {
                HStack(spacing: 6) {
                    if viewModel.isGeneratingRecoveryPlan {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: "wand.and.stars")
                    }
                    Text(viewModel.isGeneratingRecoveryPlan ? "Synthesizing AI Blueprint..." : "Re-Analyze with Gemini AI")
                        .font(.subheadline.weight(.bold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, LOSTheme.space12)
                .background(LOSTheme.surfaceElevated)
                .foregroundStyle(LOSTheme.textPrimary)
                .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: LOSTheme.radiusMedium, style: .continuous)
                        .stroke(LOSTheme.accent.opacity(0.4), lineWidth: 1)
                )
            }
            .disabled(viewModel.isGeneratingRecoveryPlan)
        }
        .padding(LOSTheme.space16)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
        )
        .padding(.horizontal)
    }
    
    private var loadingPlaceholder: some View {
        VStack(spacing: LOSTheme.space12) {
            ProgressView()
                .scaleEffect(1.2)
            Text("Calculating Recovery Blueprints...")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(LOSTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(LOSTheme.space32)
        .background(LOSTheme.surface)
        .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
        .padding(.horizontal)
    }
    
    // MARK: - Actions
    private func applyPlan(_ plan: RecoveryPlanOption) {
        viewModel.applyRecoveryPlan(plan)
        
        withAnimation {
            showAppliedToast = "Applied \(plan.tier) Plan: Saved \(LOSTheme.formatRupee(plan.monthlyExpenseReduction))/mo!"
        }
        
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            await MainActor.run {
                withAnimation {
                    showAppliedToast = nil
                }
            }
        }
    }
}

#Preview("AI Recovery Planner") {
    RecoveryPlannerView(viewModel: ResilienceViewModel())
}
