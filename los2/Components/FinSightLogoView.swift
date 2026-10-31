import SwiftUI

/// Pure native SwiftUI vector implementation of the FinSight brand identity.
/// Features the geometric "F" monogram combined with the upward financial breakout trajectory,
/// supporting standalone icon, horizontal lockup, dark/light modes, and monochrome.
struct FinSightSymbolView: View {
    var style: SymbolStyle = .standardGradient
    var showGlow: Bool = false
    
    enum SymbolStyle {
        case standardGradient
        case lightModeGradient
        case monochromeWhite
        case monochromeDark
    }
    
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let scale = min(w, h) / 512.0
            
            ZStack {
                // Ambient Glow
                if showGlow && (style == .standardGradient) {
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [Color(hex: "06B6D4").opacity(0.35), Color.clear],
                                center: .center,
                                startRadius: 0,
                                endRadius: 180 * scale
                            )
                        )
                        .frame(width: 360 * scale, height: 360 * scale)
                        .position(x: 280 * scale, y: 210 * scale)
                }
                
                // Vector Monogram Path Elements
                Group {
                    // 1. Resilience Spine (Vertical Anchor)
                    RoundedRectangle(cornerRadius: 28 * scale, style: .continuous)
                        .fill(symbolFill)
                        .frame(width: 56 * scale, height: 264 * scale)
                        .position(x: (134 + 28) * scale, y: (124 + 132) * scale)
                    
                    // 2. Support Floor (Middle Crossbar)
                    RoundedRectangle(cornerRadius: 27 * scale, style: .continuous)
                        .fill(symbolFill)
                        .frame(width: 134 * scale, height: 54 * scale)
                        .position(x: (190 + 67) * scale, y: (244 + 27) * scale)
                    
                    // 3. Ascending Breakout Trajectory (Top Crossbar Curve)
                    BreakoutTrajectoryShape()
                        .fill(breakoutFill)
                        .scaleEffect(scale, anchor: .topLeading)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
    }
    
    private var symbolFill: AnyShapeStyle {
        switch style {
        case .standardGradient:
            return AnyShapeStyle(
                LinearGradient(
                    colors: [
                        Color(hex: "1D4ED8"),
                        Color(hex: "2563EB"),
                        Color(hex: "06B6D4"),
                        Color(hex: "10B981")
                    ],
                    startPoint: .bottomLeading,
                    endPoint: .topTrailing
                )
            )
        case .lightModeGradient:
            return AnyShapeStyle(
                LinearGradient(
                    colors: [
                        Color(hex: "1E40AF"),
                        Color(hex: "0284C7"),
                        Color(hex: "0D9488"),
                        Color(hex: "059669")
                    ],
                    startPoint: .bottomLeading,
                    endPoint: .topTrailing
                )
            )
        case .monochromeWhite:
            return AnyShapeStyle(Color.white)
        case .monochromeDark:
            return AnyShapeStyle(Color(hex: "0A0F1D"))
        }
    }
    
    private var breakoutFill: AnyShapeStyle {
        switch style {
        case .standardGradient:
            return AnyShapeStyle(
                LinearGradient(
                    colors: [
                        Color(hex: "2563EB"),
                        Color(hex: "06B6D4"),
                        Color(hex: "10B981")
                    ],
                    startPoint: .leading,
                    endPoint: .topTrailing
                )
            )
        default:
            return symbolFill
        }
    }
}

/// Dynamic upward-curving breakout path for the top crossbar of the F.
private struct BreakoutTrajectoryShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 190, y: 124))
        path.addLine(to: CGPoint(x: 264, y: 124))
        path.addCurve(
            to: CGPoint(x: 326, y: 96),
            control1: CGPoint(x: 288, y: 124),
            control2: CGPoint(x: 310, y: 114)
        )
        path.addLine(to: CGPoint(x: 364, y: 54))
        path.addCurve(
            to: CGPoint(x: 402, y: 54),
            control1: CGPoint(x: 374, y: 42),
            control2: CGPoint(x: 392, y: 42)
        )
        path.addCurve(
            to: CGPoint(x: 398, y: 96),
            control1: CGPoint(x: 412, y: 66),
            control2: CGPoint(x: 410, y: 84)
        )
        path.addLine(to: CGPoint(x: 360, y: 138))
        path.addCurve(
            to: CGPoint(x: 298, y: 168),
            control1: CGPoint(x: 344, y: 156),
            control2: CGPoint(x: 322, y: 168)
        )
        path.addLine(to: CGPoint(x: 190, y: 168))
        path.closeSubpath()
        return path
    }
}

/// Standalone Full App Icon with Squircle & Ambient Background
struct FinSightAppIconView: View {
    var size: CGFloat = 120
    
    var body: some View {
        ZStack {
            // Squircle Canvas
            RoundedRectangle(cornerRadius: size * 0.226, style: .continuous)
                .fill(
                    RadialGradient(
                        colors: [Color(hex: "0E1C3D"), Color(hex: "081024"), Color(hex: "040814")],
                        center: .top,
                        startRadius: 0,
                        endRadius: size * 0.72
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: size * 0.226, style: .continuous)
                        .stroke(Color.white.opacity(0.10), lineWidth: max(0.5, size * 0.003))
                )
                .shadow(color: Color(hex: "06B6D4").opacity(0.20), radius: size * 0.12, y: size * 0.04)
            
            // Scaled Monogram Symbol
            FinSightSymbolView(style: .standardGradient, showGlow: true)
                .frame(width: size, height: size)
        }
        .frame(width: size, height: size)
    }
}

/// Horizontal Lockup: Monogram Icon + "FinSight" Wordmark + Optional Tagline
struct FinSightHorizontalLogo: View {
    var isLightMode: Bool = false
    var showTagline: Bool = true
    var iconSize: CGFloat = 40
    
    init(isLightMode: Bool = false, showTagline: Bool = true, iconSize: CGFloat = 40) {
        self.isLightMode = isLightMode
        self.showTagline = showTagline
        self.iconSize = iconSize
    }
    
    var body: some View {
        HStack(spacing: iconSize * 0.32) {
            // Icon
            FinSightSymbolView(
                style: isLightMode ? .lightModeGradient : .standardGradient,
                showGlow: !isLightMode
            )
            .frame(width: iconSize, height: iconSize)
            
            // Typography Lockup
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 0) {
                    Text("Fin")
                        .font(.system(size: iconSize * 0.88, weight: .bold, design: .rounded))
                        .foregroundStyle(isLightMode ? Color(hex: "0F172A") : Color.white)
                    
                    Text("Sight")
                        .font(.system(size: iconSize * 0.88, weight: .bold, design: .rounded))
                        .foregroundStyle(
                            LinearGradient(
                                colors: isLightMode
                                    ? [Color(hex: "0284C7"), Color(hex: "0D9488")]
                                    : [Color(hex: "06B6D4"), Color(hex: "10B981")],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                }
                
                if showTagline {
                    Text("PORTFOLIO RISK & RESILIENCE")
                        .font(.system(size: max(8, iconSize * 0.20), weight: .bold))
                        .tracking(1.4)
                        .foregroundStyle(Color(hex: "64748B"))
                }
            }
        }
    }
}

// Helper for Color(hex:)
extension Color {
    init(hex: String) {
        let scanner = Scanner(string: hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted))
        var int: UInt64 = 0
        scanner.scanHexInt64(&int)
        let r, g, b: UInt64
        switch hex.count {
        case 6:
            (r, g, b) = ((int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        default:
            (r, g, b) = (255, 255, 255)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: 1
        )
    }
}

#Preview("FinSight Identity System") {
    VStack(spacing: 32) {
        FinSightAppIconView(size: 100)
        
        FinSightHorizontalLogo(isLightMode: false, showTagline: true, iconSize: 44)
            .padding(20)
            .background(Color(hex: "070D1E"))
            .clipShape(RoundedRectangle(cornerRadius: 16))
        
        FinSightHorizontalLogo(isLightMode: true, showTagline: true, iconSize: 44)
            .padding(20)
            .background(Color(hex: "F8FAFC"))
            .clipShape(RoundedRectangle(cornerRadius: 16))
    }
    .padding(40)
    .background(Color(hex: "040814"))
}
