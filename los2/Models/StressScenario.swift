import Foundation
import SwiftUI

/// Defines predefined and custom market stress test scenarios.
enum StressScenarioLevel: String, CaseIterable, Identifiable, Codable {
    case mild = "Mild"
    case stress = "Stress"
    case severe = "Severe"
    
    var id: String { rawValue }
    
    var percentage: Double {
        switch self {
        case .mild: return 5.0
        case .stress: return 15.0
        case .severe: return 30.0
        }
    }
    
    var title: String {
        switch self {
        case .mild: return "Mild 5%"
        case .stress: return "Stress 15%"
        case .severe: return "Severe 30%"
        }
    }
    
    var description: String {
        switch self {
        case .mild: return "Standard cyclical correction"
        case .stress: return "Medium-severity downturn"
        case .severe: return "Full crisis / bear market collapse"
        }
    }
    
    var color: Color {
        switch self {
        case .mild: return LOSTheme.safeGreen
        case .stress: return LOSTheme.warningAmber
        case .severe: return LOSTheme.criticalRed
        }
    }
}

struct StressScenario: Identifiable, Equatable {
    let id = UUID()
    var level: StressScenarioLevel?
    var customPercentage: Double?
    
    var percentage: Double {
        if let custom = customPercentage {
            return custom
        }
        return level?.percentage ?? 15.0
    }
    
    var displayName: String {
        if let level = level {
            return level.title
        }
        return String(format: "Custom %.0f%%", percentage)
    }
}
