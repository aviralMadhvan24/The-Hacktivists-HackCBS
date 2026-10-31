import SwiftUI

/// Premium animated launch/splash screen for FinSight.
/// Displays the glowing geometric brand monogram, stylized typography, and security badge
/// before smoothly transitioning into the main application.
struct SplashScreenView: View {
    var onFinished: () -> Void
    
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var iconScale: CGFloat = 0.80
    @State private var iconOpacity: Double = 0.0
    @State private var textOffset: CGFloat = 16.0
    @State private var textOpacity: Double = 0.0
    @State private var badgeOpacity: Double = 0.0
    @State private var glowPulse: Bool = false
    @State private var isExiting: Bool = false
    
    var body: some View {
        ZStack {
            // Deep Navy Backdrop Gradient
            RadialGradient(
                colors: [
                    Color(hex: "0E1C3D"),
                    Color(hex: "081024"),
                    Color(hex: "030611")
                ],
                center: .center,
                startRadius: 20,
                endRadius: 460
            )
            .ignoresSafeArea()
            
            // Ambient Radial Cyan Glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color(hex: "06B6D4").opacity(glowPulse ? 0.30 : 0.16),
                            Color(hex: "2563EB").opacity(0.12),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: 220
                    )
                )
                .frame(width: 440, height: 440)
                .blur(radius: 28)
                .scaleEffect(glowPulse ? 1.08 : 0.94)
            
            // Centered Brand Monogram & Wordmark
            VStack(spacing: LOSTheme.space24) {
                Spacer()
                
                // FinSight Master App Icon
                ZStack {
                    // Soft Outer Halo
                    RoundedRectangle(cornerRadius: 32, style: .continuous)
                        .fill(Color(hex: "06B6D4").opacity(0.18))
                        .frame(width: 120, height: 120)
                        .blur(radius: 16)
                    
                    FinSightAppIconView(size: 104)
                }
                .scaleEffect(reduceMotion ? 1.0 : iconScale)
                .opacity(iconOpacity)
                
                // Brand Wordmark & Tagline
                VStack(spacing: LOSTheme.space8) {
                    HStack(spacing: 0) {
                        Text("Fin")
                            .font(.system(size: 38, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.white)
                        
                        Text("Sight")
                            .font(.system(size: 38, weight: .bold, design: .rounded))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [
                                        Color(hex: "06B6D4"),
                                        Color(hex: "10B981")
                                    ],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                    }
                    
                    Text("FINANCIAL RESILIENCE & STRESS TESTING")
                        .font(.system(size: 10.5, weight: .bold, design: .rounded))
                        .tracking(2.2)
                        .foregroundStyle(Color(hex: "94A3B8"))
                }
                .offset(y: reduceMotion ? 0 : textOffset)
                .opacity(textOpacity)
                
                Spacer()
                
                // Bottom Security & Engine Pill
                HStack(spacing: LOSTheme.space8) {
                    Image(systemName: "shield.lefthalf.filled.badge.checkmark")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color(hex: "06B6D4"))
                    
                    Text("ON-DEVICE MATHEMATICAL ENGINE")
                        .font(.system(size: 9.5, weight: .bold, design: .monospaced))
                        .tracking(1.4)
                        .foregroundStyle(Color(hex: "64748B"))
                }
                .padding(.horizontal, LOSTheme.space14)
                .padding(.vertical, LOSTheme.space8)
                .background(Color.white.opacity(0.05))
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .stroke(Color.white.opacity(0.08), lineWidth: 0.5)
                )
                .opacity(badgeOpacity)
                .padding(.bottom, LOSTheme.space32)
            }
            .padding(.horizontal, LOSTheme.space24)
            .scaleEffect(isExiting ? 1.04 : 1.0)
            .opacity(isExiting ? 0.0 : 1.0)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            // Tap to skip
            exitSplashScreen()
        }
        .task {
            await runLaunchAnimation()
        }
    }
    
    // MARK: - Animation Sequence
    @MainActor
    private func runLaunchAnimation() async {
        if reduceMotion {
            iconOpacity = 1.0
            iconScale = 1.0
            textOpacity = 1.0
            textOffset = 0
            badgeOpacity = 1.0
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            exitSplashScreen()
            return
        }
        
        // 1. Icon Reveal (Spring Pop)
        withAnimation(.spring(response: 0.65, dampingFraction: 0.72)) {
            iconScale = 1.0
            iconOpacity = 1.0
        }
        
        // 2. Ambient Glow Breathing
        withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) {
            glowPulse = true
        }
        
        // 3. Typography Slide-up
        try? await Task.sleep(nanoseconds: 180_000_000)
        withAnimation(.spring(response: 0.55, dampingFraction: 0.82)) {
            textOffset = 0
            textOpacity = 1.0
        }
        
        // 4. Badge Fade-in
        try? await Task.sleep(nanoseconds: 150_000_000)
        withAnimation(.easeOut(duration: 0.40)) {
            badgeOpacity = 1.0
        }
        
        // 5. Hold presentation briefly, then transition out
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        exitSplashScreen()
    }
    
    @MainActor
    private func exitSplashScreen() {
        guard !isExiting else { return }
        isExiting = true
        withAnimation(.easeInOut(duration: 0.38)) {
            onFinished()
        }
    }
}

#Preview("Splash Screen") {
    SplashScreenView(onFinished: {})
}
