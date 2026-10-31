import SwiftUI

/// Top-level navigation tabs for LiquidityOS.
enum AppTab: String, CaseIterable, Identifiable, Hashable {
    case overview = "Overview"
    case stressTest = "Stress Test"
    case emergency = "Emergency"
    case runway = "Runway"
    case concall = "Concall"
    
    var id: String { rawValue }
    
    var iconName: String {
        switch self {
        case .overview:
            return "chart.bar.xaxis"
        case .stressTest:
            return "chart.line.downtrend.xyaxis"
        case .emergency:
            return "bolt.shield.fill"
        case .runway:
            return "hourglass"
        case .concall:
            return "waveform.badge.magnifyingglass"
        }
    }
}
