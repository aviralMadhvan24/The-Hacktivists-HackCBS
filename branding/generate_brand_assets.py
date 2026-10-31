import os

branding_dir = "/Users/kiet37/Desktop/los2/branding"
os.makedirs(branding_dir, exist_ok=True)

# -----------------------------------------------------------------------------
# 1. STANDALONE APP ICON (512x512)
# -----------------------------------------------------------------------------
app_icon_svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <!-- Deep Navy Radial Background -->
    <radialGradient id="appIconBg" cx="50%" cy="30%" r="72%">
      <stop offset="0%" stop-color="#0E1C3D"/>
      <stop offset="55%" stop-color="#081024"/>
      <stop offset="100%" stop-color="#040814"/>
    </radialGradient>
    
    <!-- Signature Fintech Growth Gradient (Royal Blue -> Electric Cyan -> Radiant Emerald) -->
    <linearGradient id="finSightGrad" x1="12%" y1="88%" x2="88%" y2="12%">
      <stop offset="0%" stop-color="#1D4ED8"/>
      <stop offset="28%" stop-color="#2563EB"/>
      <stop offset="68%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>

    <!-- Top Breakout Surge Gradient -->
    <linearGradient id="breakoutGrad" x1="0%" y1="70%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="40%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>

    <!-- Ambient Illumination Field -->
    <radialGradient id="ambientGlow" cx="52%" cy="36%" r="55%">
      <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.24"/>
      <stop offset="60%" stop-color="#06B6D4" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#06B6D4" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- iOS Continuous Squircle Canvas -->
  <rect width="512" height="512" rx="116" fill="url(#appIconBg)"/>
  <rect width="512" height="512" rx="116" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>

  <!-- Soft Ambient Glow behind the Monogram -->
  <circle cx="280" cy="210" r="190" fill="url(#ambientGlow)"/>

  <!-- FinSight Monogram: Geometric "F" + Upward Financial Growth Trajectory -->
  <g id="finsight-monogram" transform="translate(0, 0)">
    <!-- 1. The Resilience Spine (Vertical Fortress Anchor: Capital & Downside Buffer) -->
    <rect x="134" y="124" width="56" height="264" rx="28" fill="url(#finSightGrad)"/>

    <!-- 2. The Support Floor (Middle Crossbar: Baseline Reserve & Risk Containment) -->
    <rect x="190" y="244" width="134" height="54" rx="27" fill="url(#finSightGrad)"/>

    <!-- 3. The Ascending Growth Trajectory (Top Crossbar: Breakout & Foresight) -->
    <path d="M 190 124 
             L 264 124 
             C 288 124 310 114 326 96 
             L 364 54 
             C 374 42 392 42 402 54 
             C 412 66 410 84 398 96 
             L 360 138 
             C 344 156 322 168 298 168 
             L 190 168 Z" 
          fill="url(#breakoutGrad)"/>
  </g>
</svg>
'''

# -----------------------------------------------------------------------------
# 2. HORIZONTAL LOGO WITH WORDMARK (DARK NAVY BACKGROUND - 760x180)
# -----------------------------------------------------------------------------
logo_horizontal_svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 180" width="100%" height="100%">
  <defs>
    <radialGradient id="horizBg" cx="25%" cy="40%" r="80%">
      <stop offset="0%" stop-color="#0E1C3D"/>
      <stop offset="50%" stop-color="#070E20"/>
      <stop offset="100%" stop-color="#040712"/>
    </radialGradient>

    <linearGradient id="horizSymbolGrad" x1="12%" y1="88%" x2="88%" y2="12%">
      <stop offset="0%" stop-color="#1D4ED8"/>
      <stop offset="28%" stop-color="#2563EB"/>
      <stop offset="68%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>

    <linearGradient id="horizWordmarkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>

    <radialGradient id="horizGlow" cx="90" cy="90" r="90">
      <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#06B6D4" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Deep Navy Card Background -->
  <rect width="760" height="180" rx="28" fill="url(#horizBg)"/>
  <rect width="760" height="180" rx="28" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>

  <!-- Ambient Glow Behind Symbol -->
  <circle cx="95" cy="90" r="85" fill="url(#horizGlow)"/>

  <!-- FinSight Standalone Monogram (X: 42 to 148, Y: 36 to 144) -->
  <g transform="translate(42, 34) scale(0.276)">
    <!-- 1. Resilience Spine -->
    <rect x="134" y="124" width="56" height="264" rx="28" fill="url(#horizSymbolGrad)"/>
    <!-- 2. Support Floor -->
    <rect x="190" y="244" width="134" height="54" rx="27" fill="url(#horizSymbolGrad)"/>
    <!-- 3. Breakout Trajectory -->
    <path d="M 190 124 
             L 264 124 
             C 288 124 310 114 326 96 
             L 364 54 
             C 374 42 392 42 402 54 
             C 412 66 410 84 398 96 
             L 360 138 
             C 344 156 322 168 298 168 
             L 190 168 Z" 
          fill="url(#horizSymbolGrad)"/>
  </g>

  <!-- FinSight Wordmark Typography -->
  <g transform="translate(182, 0)">
    <!-- Main Brandmark Text -->
    <text x="0" y="98" font-family="'Plus Jakarta Sans', system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif" font-size="62" font-weight="700" letter-spacing="-0.025em">
      <tspan fill="#FFFFFF">Fin</tspan><tspan fill="url(#horizWordmarkGrad)">Sight</tspan>
    </text>
    
    <!-- Subtitle Tagline -->
    <text x="2" y="128" font-family="'Plus Jakarta Sans', system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif" font-size="13" font-weight="600" letter-spacing="0.14em" fill="#64748B">
      PORTFOLIO RISK &amp; RESILIENCE
    </text>
  </g>
</svg>
'''

# -----------------------------------------------------------------------------
# 3. HORIZONTAL LOGO FOR LIGHT BACKGROUNDS (760x180)
# -----------------------------------------------------------------------------
logo_horizontal_light_svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 180" width="100%" height="100%">
  <defs>
    <linearGradient id="lightSymbolGrad" x1="12%" y1="88%" x2="88%" y2="12%">
      <stop offset="0%" stop-color="#1E40AF"/>
      <stop offset="35%" stop-color="#0284C7"/>
      <stop offset="75%" stop-color="#0D9488"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>

    <linearGradient id="lightWordmarkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0284C7"/>
      <stop offset="100%" stop-color="#0D9488"/>
    </linearGradient>
  </defs>

  <!-- Clean Light Canvas -->
  <rect width="760" height="180" rx="28" fill="#F8FAFC"/>
  <rect width="760" height="180" rx="28" fill="none" stroke="#E2E8F0" stroke-width="1"/>

  <!-- FinSight Standalone Monogram -->
  <g transform="translate(42, 34) scale(0.276)">
    <!-- 1. Resilience Spine -->
    <rect x="134" y="124" width="56" height="264" rx="28" fill="url(#lightSymbolGrad)"/>
    <!-- 2. Support Floor -->
    <rect x="190" y="244" width="134" height="54" rx="27" fill="url(#lightSymbolGrad)"/>
    <!-- 3. Breakout Trajectory -->
    <path d="M 190 124 
             L 264 124 
             C 288 124 310 114 326 96 
             L 364 54 
             C 374 42 392 42 402 54 
             C 412 66 410 84 398 96 
             L 360 138 
             C 344 156 322 168 298 168 
             L 190 168 Z" 
          fill="url(#lightSymbolGrad)"/>
  </g>

  <!-- FinSight Wordmark Typography -->
  <g transform="translate(182, 0)">
    <text x="0" y="98" font-family="'Plus Jakarta Sans', system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif" font-size="62" font-weight="700" letter-spacing="-0.025em">
      <tspan fill="#0F172A">Fin</tspan><tspan fill="url(#lightWordmarkGrad)">Sight</tspan>
    </text>
    
    <text x="2" y="128" font-family="'Plus Jakarta Sans', system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif" font-size="13" font-weight="600" letter-spacing="0.14em" fill="#64748B">
      PORTFOLIO RISK &amp; RESILIENCE
    </text>
  </g>
</svg>
'''

# -----------------------------------------------------------------------------
# 4. TRANSPARENT BACKGROUND LOGO (760x180)
# -----------------------------------------------------------------------------
logo_transparent_svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 180" width="100%" height="100%">
  <defs>
    <linearGradient id="transSymbolGrad" x1="12%" y1="88%" x2="88%" y2="12%">
      <stop offset="0%" stop-color="#1D4ED8"/>
      <stop offset="28%" stop-color="#2563EB"/>
      <stop offset="68%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>

    <linearGradient id="transWordmarkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>
  </defs>

  <!-- Transparent Background: No rect element -->

  <!-- FinSight Standalone Monogram -->
  <g transform="translate(42, 34) scale(0.276)">
    <!-- 1. Resilience Spine -->
    <rect x="134" y="124" width="56" height="264" rx="28" fill="url(#transSymbolGrad)"/>
    <!-- 2. Support Floor -->
    <rect x="190" y="244" width="134" height="54" rx="27" fill="url(#transSymbolGrad)"/>
    <!-- 3. Breakout Trajectory -->
    <path d="M 190 124 
             L 264 124 
             C 288 124 310 114 326 96 
             L 364 54 
             C 374 42 392 42 402 54 
             C 412 66 410 84 398 96 
             L 360 138 
             C 344 156 322 168 298 168 
             L 190 168 Z" 
          fill="url(#transSymbolGrad)"/>
  </g>

  <!-- FinSight Wordmark Typography -->
  <g transform="translate(182, 0)">
    <text x="0" y="98" font-family="'Plus Jakarta Sans', system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif" font-size="62" font-weight="700" letter-spacing="-0.025em">
      <tspan fill="#FFFFFF">Fin</tspan><tspan fill="url(#transWordmarkGrad)">Sight</tspan>
    </text>
    
    <text x="2" y="128" font-family="'Plus Jakarta Sans', system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif" font-size="13" font-weight="600" letter-spacing="0.14em" fill="#94A3B8">
      PORTFOLIO RISK &amp; RESILIENCE
    </text>
  </g>
</svg>
'''

# -----------------------------------------------------------------------------
# 5. MONOCHROME WHITE LOGO (FOR DARK SURFACES / 1-COLOR PRINT - 760x180)
# -----------------------------------------------------------------------------
logo_monochrome_white_svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 180" width="100%" height="100%">
  <!-- Transparent Background -->

  <!-- Monogram in 100% Solid White -->
  <g transform="translate(42, 34) scale(0.276)">
    <!-- 1. Resilience Spine -->
    <rect x="134" y="124" width="56" height="264" rx="28" fill="#FFFFFF"/>
    <!-- 2. Support Floor -->
    <rect x="190" y="244" width="134" height="54" rx="27" fill="#FFFFFF"/>
    <!-- 3. Breakout Trajectory -->
    <path d="M 190 124 
             L 264 124 
             C 288 124 310 114 326 96 
             L 364 54 
             C 374 42 392 42 402 54 
             C 412 66 410 84 398 96 
             L 360 138 
             C 344 156 322 168 298 168 
             L 190 168 Z" 
          fill="#FFFFFF"/>
  </g>

  <!-- Wordmark in 100% Solid White -->
  <g transform="translate(182, 0)">
    <text x="0" y="98" font-family="'Plus Jakarta Sans', system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif" font-size="62" font-weight="700" letter-spacing="-0.025em" fill="#FFFFFF">
      FinSight
    </text>
    
    <text x="2" y="128" font-family="'Plus Jakarta Sans', system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif" font-size="13" font-weight="600" letter-spacing="0.14em" fill="#CBD5E1">
      PORTFOLIO RISK &amp; RESILIENCE
    </text>
  </g>
</svg>
'''

# -----------------------------------------------------------------------------
# 6. MONOCHROME BLACK / DARK SLATE LOGO (FOR LIGHT PAPER / INVOICES - 760x180)
# -----------------------------------------------------------------------------
logo_monochrome_black_svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 180" width="100%" height="100%">
  <!-- Transparent Background -->

  <!-- Monogram in 100% Solid Obsidian / Dark Slate -->
  <g transform="translate(42, 34) scale(0.276)">
    <!-- 1. Resilience Spine -->
    <rect x="134" y="124" width="56" height="264" rx="28" fill="#0A0F1D"/>
    <!-- 2. Support Floor -->
    <rect x="190" y="244" width="134" height="54" rx="27" fill="#0A0F1D"/>
    <!-- 3. Breakout Trajectory -->
    <path d="M 190 124 
             L 264 124 
             C 288 124 310 114 326 96 
             L 364 54 
             C 374 42 392 42 402 54 
             C 412 66 410 84 398 96 
             L 360 138 
             C 344 156 322 168 298 168 
             L 190 168 Z" 
          fill="#0A0F1D"/>
  </g>

  <!-- Wordmark in 100% Solid Obsidian -->
  <g transform="translate(182, 0)">
    <text x="0" y="98" font-family="'Plus Jakarta Sans', system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif" font-size="62" font-weight="700" letter-spacing="-0.025em" fill="#0A0F1D">
      FinSight
    </text>
    
    <text x="2" y="128" font-family="'Plus Jakarta Sans', system-ui, -apple-system, 'SF Pro Display', 'Inter', sans-serif" font-size="13" font-weight="600" letter-spacing="0.14em" fill="#475569">
      PORTFOLIO RISK &amp; RESILIENCE
    </text>
  </g>
</svg>
'''

# -----------------------------------------------------------------------------
# 7. iOS APP STORE MASTER ICON (1024x1024 FULL-BLEED SQUARE)
# Apple guidelines require a full-bleed 1024x1024 square with no corner mask,
# as iOS masks the corners dynamically on home screens and App Store.
# -----------------------------------------------------------------------------
ios_master_icon_1024_svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <defs>
    <!-- Full-Bleed Deep Navy Background -->
    <radialGradient id="iosMasterBg" cx="50%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#0E1C3D"/>
      <stop offset="55%" stop-color="#081024"/>
      <stop offset="100%" stop-color="#040814"/>
    </radialGradient>
    
    <!-- Signature Fintech Gradient -->
    <linearGradient id="iosGrad" x1="12%" y1="88%" x2="88%" y2="12%">
      <stop offset="0%" stop-color="#1D4ED8"/>
      <stop offset="28%" stop-color="#2563EB"/>
      <stop offset="68%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>

    <!-- Breakout Surge Gradient -->
    <linearGradient id="iosBreakoutGrad" x1="0%" y1="70%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="40%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>

    <!-- Ambient Illumination Field -->
    <radialGradient id="iosAmbientGlow" cx="52%" cy="36%" r="55%">
      <stop offset="0%" stop-color="#06B6D4" stop-opacity="0.26"/>
      <stop offset="60%" stop-color="#06B6D4" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#06B6D4" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Full-bleed background (Square, ready for iOS App Store mask) -->
  <rect width="1024" height="1024" fill="url(#iosMasterBg)"/>

  <!-- Ambient Light Halo -->
  <circle cx="560" cy="420" r="380" fill="url(#iosAmbientGlow)"/>

  <!-- Monogram centered at 2x scale (offset X: 512 - 275 = 237, Y: 512 - 264 = 248) -->
  <g transform="translate(237, 240) scale(2.0)">
    <!-- 1. The Resilience Spine -->
    <rect x="0" y="0" width="56" height="264" rx="28" fill="url(#iosGrad)"/>

    <!-- 2. The Support Floor -->
    <rect x="56" y="120" width="134" height="54" rx="27" fill="url(#iosGrad)"/>

    <!-- 3. The Ascending Growth Trajectory -->
    <path d="M 56 0 
             L 130 0 
             C 154 0 176 -10 192 -28 
             L 230 -70 
             C 240 -82 258 -82 268 -70 
             C 278 -58 276 -40 264 -28 
             L 226 14 
             C 210 32 188 44 164 44 
             L 56 44 Z" 
          fill="url(#iosBreakoutGrad)"/>
  </g>
</svg>
'''

files = {
    "finsight_app_icon.svg": app_icon_svg,
    "finsight_logo_horizontal.svg": logo_horizontal_svg,
    "finsight_logo_horizontal_light.svg": logo_horizontal_light_svg,
    "finsight_logo_transparent.svg": logo_transparent_svg,
    "finsight_logo_monochrome_white.svg": logo_monochrome_white_svg,
    "finsight_logo_monochrome_black.svg": logo_monochrome_black_svg,
    "finsight_ios_icon_1024.svg": ios_master_icon_1024_svg
}

for filename, content in files.items():
    file_path = os.path.join(branding_dir, filename)
    with open(file_path, "w") as f:
        f.write(content.strip())
    print(f"Generated {file_path}")

print("All 7 production branding SVGs generated successfully.")
