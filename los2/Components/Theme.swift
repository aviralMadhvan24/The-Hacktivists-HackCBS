import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Adaptive dynamic color helper supporting cross-platform iOS & macOS.
extension Color {
    static func losAdaptive(dark: Color, light: Color) -> Color {
        #if canImport(UIKit)
        return Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
        #elseif canImport(AppKit)
        return Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? NSColor(dark) : NSColor(light)
        })
        #else
        return dark
        #endif
    }
}

/// Design system constants and modern fintech styling tokens for FinSight (formerly LiquidityOS).
/// Dark-first with high-contrast WCAG AA compliance in both light and dark appearances.
typealias FinSightTheme = LOSTheme

enum LOSTheme {
    // MARK: - Semantic Color Tokens
    
    /// Deep ink/navy in dark mode (#080D1A); crisp clean slate in light mode (#F8FAFC)
    static let background = Color.losAdaptive(
        dark: Color(red: 0.031, green: 0.051, blue: 0.102),
        light: Color(red: 0.973, green: 0.980, blue: 0.988)
    )
    
    /// Elevated card surface (#111827 in dark; pure white in light)
    static let surface = Color.losAdaptive(
        dark: Color(red: 0.067, green: 0.094, blue: 0.153),
        light: Color.white
    )
    
    /// Floating sheets, modals, and raised controls (#1E293B in dark; #F1F5F9 in light)
    static let surfaceElevated = Color.losAdaptive(
        dark: Color(red: 0.118, green: 0.161, blue: 0.231),
        light: Color(red: 0.945, green: 0.961, blue: 0.976)
    )
    
    /// Subtle vertical backdrop gradient
    static let backgroundGradient = LinearGradient(
        colors: [
            Color.losAdaptive(dark: Color(red: 0.047, green: 0.071, blue: 0.137), light: Color(red: 0.988, green: 0.992, blue: 1.0)),
            Color.losAdaptive(dark: Color(red: 0.024, green: 0.039, blue: 0.078), light: Color(red: 0.949, green: 0.961, blue: 0.976))
        ],
        startPoint: .top,
        endPoint: .bottom
    )
    
    // High-contrast semantic typography colors
    static let textPrimary = Color.losAdaptive(
        dark: Color.white,
        light: Color(red: 0.059, green: 0.090, blue: 0.165)
    )
    
    static let textSecondary = Color.losAdaptive(
        dark: Color(red: 0.580, green: 0.639, blue: 0.722),
        light: Color(red: 0.392, green: 0.455, blue: 0.545)
    )
    
    static let textTertiary = Color.losAdaptive(
        dark: Color(red: 0.400, green: 0.455, blue: 0.545),
        light: Color(red: 0.600, green: 0.655, blue: 0.730)
    )
    
    // Brand & Status Accents
    static let accent = Color(red: 0.231, green: 0.510, blue: 0.965) // Electric Indigo / Blue (#3B82F6)
    static let primary = accent
    
    static let positive = Color(red: 0.063, green: 0.725, blue: 0.506) // Emerald (#10B981)
    static let safeGreen = positive
    
    static let warning = Color(red: 0.961, green: 0.620, blue: 0.043) // Amber (#F59E0B)
    static let warningAmber = warning
    
    static let critical = Color(red: 0.937, green: 0.267, blue: 0.267) // Rose Red (#EF4444)
    static let criticalRed = critical
    
    static let purpleAccent = Color(red: 0.620, green: 0.360, blue: 0.950)
    
    // Hairline border
    static let borderHairline = Color.primary.opacity(0.08)
    static let cardBorder = borderHairline
    static let cardBackground = surface
    
    // Hairline stroke width
    static let hairline: CGFloat = 0.5
    
    // MARK: - Spacing Scale
    static let space4: CGFloat = 4
    static let space6: CGFloat = 6
    static let space8: CGFloat = 8
    static let space10: CGFloat = 10
    static let space12: CGFloat = 12
    static let space14: CGFloat = 14
    static let space16: CGFloat = 16
    static let space20: CGFloat = 20
    static let space24: CGFloat = 24
    static let space32: CGFloat = 32
    
    // Backwards compatibility spacing tokens
    static let paddingSmall: CGFloat = space8
    static let paddingMedium: CGFloat = space16
    static let paddingLarge: CGFloat = space24
    
    // MARK: - Corner Radii
    static let radiusSmall: CGFloat = 10
    static let radiusMedium: CGFloat = 14
    static let radiusLarge: CGFloat = 18
    static let radiusCard: CGFloat = 22
    
    // MARK: - Shadows
    static let shadowRadius: CGFloat = 8
    static let shadowY: CGFloat = 4
    
    // MARK: - Currency Formatters
    static func formatRupee(_ value: Double, showSign: Bool = false) -> String {
        let absValue = abs(value)
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencySymbol = "₹"
        formatter.maximumFractionDigits = 0
        formatter.locale = Locale(identifier: "en_IN")
        
        let formatted = formatter.string(from: NSNumber(value: absValue)) ?? "₹\(Int(absValue))"
        if value < 0 {
            return "−\(formatted)"
        } else if showSign && value > 0 {
            return "+\(formatted)"
        }
        return formatted
    }
    
    static func formatRupeeCompact(_ value: Double) -> String {
        let absVal = abs(value)
        let prefix = value < 0 ? "−₹" : "₹"
        if absVal >= 10_000_000 {
            return String(format: "%@%.1f Cr", prefix, absVal / 10_000_000)
        } else if absVal >= 100_000 {
            return String(format: "%@%.1f L", prefix, absVal / 100_000)
        } else if absVal >= 1_000 {
            return String(format: "%@%.0f k", prefix, absVal / 1_000)
        } else {
            return String(format: "%@%.0f", prefix, absVal)
        }
    }
}

/// Hero glow shadow modifier for primary visual anchors.
struct HeroGlowModifier: ViewModifier {
    var color: Color = LOSTheme.accent
    func body(content: Content) -> some View {
        content
            .shadow(color: color.opacity(0.22), radius: 16, x: 0, y: 8)
    }
}

extension View {
    func heroGlow(color: Color = LOSTheme.accent) -> some View {
        modifier(HeroGlowModifier(color: color))
    }
}
