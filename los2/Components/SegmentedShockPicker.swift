import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Segmented selector for Stress Test levels (Mild 5%, Stress 15%, Severe 30%).
/// Scales gracefully with accessibility Dynamic Type.
struct SegmentedShockPicker: View {
    @Binding var selected: StressScenarioLevel
    let onSelect: (StressScenarioLevel) -> Void
    
    var body: some View {
        HStack(spacing: 8) {
            ForEach(StressScenarioLevel.allCases) { level in
                let isSelected = selected == level
                Button {
                    #if os(iOS)
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    #endif
                    selected = level
                    onSelect(level)
                } label: {
                    VStack(spacing: 3) {
                        Text(level.rawValue)
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Text("\(Int(level.percentage))%")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(
                        isSelected
                            ? level.color.opacity(0.18)
                            : Color.primary.opacity(0.04)
                    )
                    .foregroundStyle(isSelected ? level.color : Color.secondary)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(isSelected ? level.color.opacity(0.5) : Color.clear, lineWidth: 1.5)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
}
