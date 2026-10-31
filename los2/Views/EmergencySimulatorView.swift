import SwiftUI

/// Feature 02: Redesigned Emergency Expense Simulator.
/// Simulates realistic emergency shocks (medical, vehicle, family, job gap), supports one-time vs recurring drains,
/// evaluates minimum reserve breaches, and calculates funding shortfalls with a full before-and-after comparison.
struct EmergencySimulatorView: View {
    @ObservedObject var viewModel: ResilienceViewModel
    
    var sim: EmergencySimulationResult {
        viewModel.emergencySimulationResult
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: LOSTheme.space24) {
                    // MARK: - Hero Before vs After Financial Comparison Card
                    VStack(spacing: LOSTheme.space16) {
                        HStack {
                            VStack(alignment: .leading, spacing: LOSTheme.space4) {
                                Text("EMERGENCY SHOCK IMPACT")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(LOSTheme.textSecondary)
                                    .tracking(0.8)
                                Text(sim.severityRating.uppercased())
                                    .font(.title2.weight(.bold))
                                    .foregroundStyle(sim.statusColor)
                            }
                            
                            Spacer()
                            
                            StatusPill(
                                text: viewModel.emergencyScenario.category.rawValue,
                                icon: viewModel.emergencyScenario.category.iconName,
                                color: sim.statusColor
                            )
                        }
                        
                        Text(sim.summaryHeadline)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(LOSTheme.textPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        
                        Divider().overlay(LOSTheme.borderHairline)
                        
                        // Before vs After Cash & Runway Comparison
                        HStack(spacing: LOSTheme.space16) {
                            // BEFORE
                            VStack(alignment: .leading, spacing: LOSTheme.space4) {
                                Text("BEFORE SHOCK")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(LOSTheme.textSecondary)
                                    .tracking(0.6)
                                Text(LOSTheme.formatRupee(sim.preShockCash))
                                    .font(.headline.weight(.bold))
                                    .monospacedDigit()
                                    .foregroundStyle(LOSTheme.textPrimary)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                                Text("Runway: \(String(format: "%.1f", sim.preShockRunwayMonths)) mos")
                                    .font(.caption)
                                    .foregroundStyle(LOSTheme.textSecondary)
                                    .lineLimit(1)
                            }
                            
                            Spacer()
                            
                            Image(systemName: "arrow.right.circle.fill")
                                .font(.title3)
                                .foregroundStyle(sim.statusColor)
                            
                            Spacer()
                            
                            // AFTER
                            VStack(alignment: .trailing, spacing: LOSTheme.space4) {
                                Text("AFTER SHOCK")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(LOSTheme.textSecondary)
                                    .tracking(0.6)
                                Text(LOSTheme.formatRupee(sim.postShockCash))
                                    .font(.headline.weight(.bold))
                                    .monospacedDigit()
                                    .foregroundStyle(sim.isShortfall ? LOSTheme.critical : LOSTheme.textPrimary)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                                Text("Runway: \(String(format: "%.1f", sim.postShockRunwayMonths)) mos")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(sim.postShockRunwayMonths < 3.0 ? LOSTheme.critical : LOSTheme.positive)
                                    .lineLimit(1)
                            }
                        }
                        
                        // Cash Drained Bar with Reserve Floor Indicator
                        VStack(alignment: .leading, spacing: LOSTheme.space8) {
                            CashDrainFloorBar(
                                drainedPercent: sim.cashDrainedPercentage,
                                isReserveBreached: sim.isReserveBreached,
                                statusColor: sim.statusColor
                            )
                            
                            HStack {
                                Text("\(Int(sim.cashDrainedPercentage))% cash consumed")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(sim.statusColor)
                                Spacer()
                                Text("Total Drain: −\(LOSTheme.formatRupee(sim.totalEmergencyDrain))")
                                    .font(.caption.weight(.bold))
                                    .monospacedDigit()
                                    .foregroundStyle(LOSTheme.critical)
                            }
                        }
                    }
                    .padding(LOSTheme.space20)
                    .background(LOSTheme.surface)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                            .stroke(sim.statusColor.opacity(0.35), lineWidth: LOSTheme.hairline * 2)
                    )
                    .shadow(color: Color.black.opacity(0.04), radius: 10, y: 4)
                    .padding(.horizontal)
                    
                    // MARK: - Funding Shortfall Warning (If Cash Insufficient)
                    if sim.isShortfall {
                        HStack(alignment: .center, spacing: LOSTheme.space12) {
                            Image(systemName: "exclamationmark.octagon.fill")
                                .font(.title3)
                                .foregroundStyle(LOSTheme.critical)
                            
                            VStack(alignment: .leading, spacing: 2) {
                                Text("FUNDING SHORTFALL: \(LOSTheme.formatRupee(sim.fundingShortfall))")
                                    .font(.subheadline.weight(.bold))
                                    .foregroundStyle(LOSTheme.critical)
                                    .minimumScaleFactor(0.85)
                                    .lineLimit(1)
                                Text("Liquid cash cannot cover this shock without debt or liquidation.")
                                    .font(.caption)
                                    .foregroundStyle(LOSTheme.textSecondary)
                                    .lineLimit(1)
                            }
                            Spacer()
                        }
                        .padding(LOSTheme.space16)
                        .background(LOSTheme.critical.opacity(0.12))
                        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: LOSTheme.radiusMedium, style: .continuous)
                                .stroke(LOSTheme.critical.opacity(0.4), lineWidth: LOSTheme.hairline * 2)
                        )
                        .padding(.horizontal)
                    }
                    
                    // MARK: - Minimum Cash Reserve Status
                    HStack(spacing: LOSTheme.space12) {
                        Image(systemName: sim.isReserveBreached ? "shield.slash.fill" : "shield.checkerboard")
                            .font(.title3)
                            .foregroundStyle(sim.isReserveBreached ? LOSTheme.warning : LOSTheme.positive)
                        
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(sim.isReserveBreached ? "SAFETY FLOOR BREACHED" : "SAFETY FLOOR INTACT")
                                    .font(.footnote.weight(.bold))
                                    .foregroundStyle(sim.isReserveBreached ? LOSTheme.warning : LOSTheme.positive)
                                Spacer()
                                Text("Floor: \(LOSTheme.formatRupee(sim.minimumReserveTarget))")
                                    .font(.caption.weight(.semibold))
                                    .monospacedDigit()
                                    .foregroundStyle(LOSTheme.textSecondary)
                            }
                            
                            Text(sim.isReserveBreached ? "Drops \(LOSTheme.formatRupee(sim.reserveBreachAmount)) below your desired cash floor." : "Preserves your minimum reserve floor.")
                                .font(.caption)
                                .foregroundStyle(LOSTheme.textSecondary)
                                .lineLimit(1)
                        }
                    }
                    .padding(LOSTheme.space16)
                    .background(LOSTheme.surface)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusMedium, style: .continuous)
                            .stroke(sim.isReserveBreached ? LOSTheme.warning.opacity(0.3) : LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                    .padding(.horizontal)
                    
                    // MARK: - Emergency Category Presets
                    VStack(alignment: .leading, spacing: LOSTheme.space12) {
                        SectionHeader(
                            title: "Emergency Category",
                            subtitle: "Select a predefined shock scenario"
                        )
                        .padding(.horizontal)
                        
                        ScrollView(.horizontal) {
                            HStack(spacing: LOSTheme.space12) {
                                ForEach(EmergencyCategory.allCases) { cat in
                                    let isSelected = viewModel.emergencyScenario.category == cat
                                    Button {
                                        viewModel.emergencyScenario.category = cat
                                        viewModel.emergencyScenario.amount = cat.defaultAmount
                                        viewModel.profile.unexpectedExpense = viewModel.emergencyScenario.totalEmergencyDrain
                                    } label: {
                                        VStack(alignment: .leading, spacing: LOSTheme.space6) {
                                            HStack {
                                                Image(systemName: cat.iconName)
                                                    .font(.headline)
                                                Spacer()
                                                if isSelected {
                                                    Image(systemName: "checkmark.circle.fill")
                                                        .font(.caption.weight(.bold))
                                                }
                                            }
                                            
                                            Text(cat.rawValue)
                                                .font(.subheadline.weight(.semibold))
                                                .lineLimit(2)
                                                .fixedSize(horizontal: false, vertical: true)
                                            
                                            Text(LOSTheme.formatRupeeCompact(cat.defaultAmount))
                                                .font(.caption.weight(.bold))
                                                .monospacedDigit()
                                                .foregroundStyle(isSelected ? Color.white.opacity(0.9) : LOSTheme.textSecondary)
                                                .lineLimit(1)
                                        }
                                        .frame(width: 140, alignment: .leading)
                                        .padding(LOSTheme.space12)
                                        .background(isSelected ? LOSTheme.accent : LOSTheme.surface)
                                        .foregroundStyle(isSelected ? Color.white : LOSTheme.textPrimary)
                                        .clipShape(.rect(cornerRadius: LOSTheme.radiusMedium, style: .continuous))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: LOSTheme.radiusMedium, style: .continuous)
                                                .stroke(isSelected ? Color.clear : LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                                        )
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("\(cat.rawValue), estimate \(LOSTheme.formatRupee(cat.defaultAmount))")
                                }
                            }
                            .padding(.horizontal)
                        }
                        .scrollIndicators(.hidden)
                    }
                    
                    // MARK: - Frequency & Duration
                    VStack(alignment: .leading, spacing: LOSTheme.space12) {
                        Text("FREQUENCY & DURATION")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(LOSTheme.textSecondary)
                            .tracking(0.8)
                        
                        Picker("Expense Type", selection: $viewModel.emergencyScenario.expenseType) {
                            ForEach(EmergencyExpenseType.allCases) { type in
                                Text(type.shortTitle).tag(type)
                            }
                        }
                        .pickerStyle(.segmented)
                        .onChange(of: viewModel.emergencyScenario.expenseType) { _, _ in
                            viewModel.profile.unexpectedExpense = viewModel.emergencyScenario.totalEmergencyDrain
                        }
                        
                        if viewModel.emergencyScenario.expenseType == .recurring {
                            VStack(alignment: .leading, spacing: LOSTheme.space8) {
                                HStack {
                                    Text("Recurring Duration")
                                        .font(.subheadline.weight(.medium))
                                        .foregroundStyle(LOSTheme.textSecondary)
                                    Spacer()
                                    Text("\(viewModel.emergencyScenario.recurringMonths) Months (\(LOSTheme.formatRupee(viewModel.emergencyScenario.amount))/mo)")
                                        .font(.subheadline.weight(.bold))
                                        .monospacedDigit()
                                        .foregroundStyle(LOSTheme.accent)
                                }
                                
                                Stepper(
                                    value: $viewModel.emergencyScenario.recurringMonths,
                                    in: 2...12
                                ) {
                                    Text("Duration: \(viewModel.emergencyScenario.recurringMonths) months")
                                        .font(.subheadline)
                                }
                                .onChange(of: viewModel.emergencyScenario.recurringMonths) { _, _ in
                                    viewModel.profile.unexpectedExpense = viewModel.emergencyScenario.totalEmergencyDrain
                                }
                            }
                        }
                    }
                    .padding(LOSTheme.space20)
                    .background(LOSTheme.surface)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                    .padding(.horizontal)
                    
                    // MARK: - Amount Adjuster (Slider + Quick Pills)
                    VStack(alignment: .leading, spacing: LOSTheme.space16) {
                        HStack {
                            Text("SHOCK AMOUNT")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(LOSTheme.textSecondary)
                                .tracking(0.8)
                            Spacer()
                            Text(LOSTheme.formatRupee(viewModel.emergencyScenario.amount))
                                .font(.title3.weight(.bold))
                                .monospacedDigit()
                                .foregroundStyle(LOSTheme.critical)
                        }
                        
                        // Preset Pills
                        HStack(spacing: LOSTheme.space8) {
                            ForEach([25_000.0, 50_000.0, 100_000.0, 150_000.0], id: \.self) { val in
                                let isSel = abs(viewModel.emergencyScenario.amount - val) < 1.0
                                Button {
                                    viewModel.emergencyScenario.amount = val
                                    viewModel.profile.unexpectedExpense = viewModel.emergencyScenario.totalEmergencyDrain
                                } label: {
                                    Text(LOSTheme.formatRupeeCompact(val))
                                        .font(.caption.weight(.semibold))
                                        .monospacedDigit()
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, LOSTheme.space8)
                                        .background(isSel ? LOSTheme.critical.opacity(0.18) : LOSTheme.surfaceElevated)
                                        .foregroundStyle(isSel ? LOSTheme.critical : LOSTheme.textSecondary)
                                        .clipShape(.rect(cornerRadius: LOSTheme.radiusSmall, style: .continuous))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        
                        // Fine-tune Slider
                        Slider(
                            value: $viewModel.emergencyScenario.amount,
                            in: 5_000...max(250_000, viewModel.profile.liquidCash * 2.0),
                            step: 5_000
                        )
                        .tint(LOSTheme.critical)
                        .accessibilityLabel("Emergency Expense Amount")
                        .accessibilityValue(LOSTheme.formatRupee(viewModel.emergencyScenario.amount))
                        .onChange(of: viewModel.emergencyScenario.amount) { _, _ in
                            viewModel.profile.unexpectedExpense = viewModel.emergencyScenario.totalEmergencyDrain
                        }
                    }
                    .padding(LOSTheme.space20)
                    .background(LOSTheme.surface)
                    .clipShape(.rect(cornerRadius: LOSTheme.radiusCard, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: LOSTheme.radiusCard, style: .continuous)
                            .stroke(LOSTheme.borderHairline, lineWidth: LOSTheme.hairline)
                    )
                    .padding(.horizontal)
                    .padding(.bottom, LOSTheme.space32 + 24)
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .background(LOSTheme.backgroundGradient.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Reset") {
                        viewModel.resetEmergencyScenario()
                        viewModel.profile.unexpectedExpense = viewModel.emergencyScenario.totalEmergencyDrain
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LOSTheme.accent)
                }
            }
            .onAppear {
                viewModel.emergencyScenario.amount = viewModel.profile.unexpectedExpense
            }
        }
    }
}

/// Bounded cash depletion bar with reserve floor indicator.
private struct CashDrainFloorBar: View {
    let drainedPercent: Double
    let isReserveBreached: Bool
    let statusColor: Color
    
    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let drainedWidth = max(0, min(width, width * CGFloat(drainedPercent / 100.0)))
            
            ZStack(alignment: .leading) {
                // Background Track
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Color.primary.opacity(0.08))
                    .frame(height: 12)
                
                // Drained Segment
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(statusColor)
                    .frame(width: drainedWidth, height: 12)
            }
        }
        .frame(height: 12)
    }
}

#Preview("Emergency Simulator") {
    let vm = ResilienceViewModel()
    EmergencySimulatorView(viewModel: vm)
}
