import SwiftUI

/// Animated circular gauge visualizing the 0-100 Financial Resilience Score.
/// Follows Apple HIG with dynamic typography, spring animations, and WCAG AA contrast.
struct ResilienceGaugeView: View {
    let score: Int
    let band: ResilienceBand
    let headline: String
    
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animatedScore: Double = 0
    
    var body: some View {
        VStack(spacing: LOSTheme.space12) {
            ZStack {
                // Background Track
                Circle()
                    .trim(from: 0.15, to: 0.85)
                    .stroke(
                        Color.primary.opacity(0.08),
                        style: StrokeStyle(lineWidth: 14, lineCap: .round)
                    )
                    .rotationEffect(.degrees(90))
                
                // Active Gradient Arc
                Circle()
                    .trim(from: 0.15, to: 0.15 + (0.70 * (max(0, min(100, animatedScore)) / 100.0)))
                    .stroke(
                        gradientForBand(band),
                        style: StrokeStyle(lineWidth: 14, lineCap: .round)
                    )
                    .rotationEffect(.degrees(90))
                    .shadow(color: band.color.opacity(0.3), radius: 8, x: 0, y: 4)
                    .animation(reduceMotion ? nil : .spring(response: 0.85, dampingFraction: 0.78), value: animatedScore)
                
                // Centered Score Typography
                VStack(spacing: LOSTheme.space4) {
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text("\(Int(animatedScore))")
                            .font(.system(.largeTitle, design: .rounded).weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(LOSTheme.textPrimary)
                            .contentTransition(.numericText())
                            .minimumScaleFactor(0.8)
                        
                        Text("/ 100")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LOSTheme.textSecondary)
                    }
                    
                    StatusPill(
                        text: band.rawValue,
                        icon: band == .critical ? "exclamationmark.triangle.fill" : "shield.fill",
                        color: band.color
                    )
                }
            }
            .frame(width: 210, height: 175)
            
            // Subtitle headline
            Text(headline)
                .font(.footnote)
                .foregroundStyle(LOSTheme.textSecondary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, LOSTheme.space16)
        }
        .padding(.vertical, LOSTheme.space4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Financial Resilience Score: \(score) out of 100, \(band.rawValue). \(headline)")
        .onAppear {
            animatedScore = Double(score)
        }
        .onChange(of: score) { _, newScore in
            animatedScore = Double(newScore)
        }
    }
    
    private func gradientForBand(_ band: ResilienceBand) -> LinearGradient {
        switch band {
        case .critical:
            return LinearGradient(
                colors: [LOSTheme.critical, Color.orange],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .moderate:
            return LinearGradient(
                colors: [Color.orange, LOSTheme.warning],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .healthy, .bulletproof:
            return LinearGradient(
                colors: [LOSTheme.positive, Color.cyan],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

#Preview("Resilience Gauge") {
    VStack(spacing: 30) {
        ResilienceGaugeView(
            score: 72,
            band: .healthy,
            headline: "Strong runway buffer and positive monthly cashflow."
        )
        ResilienceGaugeView(
            score: 38,
            band: .critical,
            headline: "Emergency bill exceeds available liquid cash."
        )
    }
    .padding()
    .background(LOSTheme.background)
}
