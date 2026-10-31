#!/usr/bin/env python3
import os
import base64
import subprocess

def get_base64_image(path):
    if not os.path.exists(path):
        return ""
    with open(path, "rb") as f:
        data = f.read()
    ext = path.split(".")[-1].lower()
    if ext == "svg":
        mime = "image/svg+xml"
    elif ext in ["png", "jpg", "jpeg"]:
        mime = f"image/{ext}"
    else:
        mime = "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(data).decode('utf-8')}"

def main():
    brain_dir = "/Users/kiet37/.gemini/antigravity/brain/f86d4784-7eb9-4c7f-83c6-11902d797adf"
    workspace_dir = "/Users/kiet37/Desktop/los2"
    
    logo_svg_path = os.path.join(workspace_dir, "branding/finsight_logo_horizontal.svg")
    app_icon_path = os.path.join(workspace_dir, "branding/finsight_app_icon.svg")
    
    dash_img_path = os.path.join(brain_dir, "sim_finsight_dashboard.png")
    stress_img_path = os.path.join(brain_dir, "sim_stresstest_whatif.png")
    whatif_img_path = os.path.join(brain_dir, "sim_whatif_simulator_live.png")
    
    logo_base64 = get_base64_image(logo_svg_path)
    icon_base64 = get_base64_image(app_icon_path)
    dash_base64 = get_base64_image(dash_img_path)
    stress_base64 = get_base64_image(stress_img_path)
    whatif_base64 = get_base64_image(whatif_img_path)

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>FinSight — Executive Pitch Deck & Product Brief</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
    
    @page {{
      size: A4 portrait;
      margin: 12mm 14mm 14mm 14mm;
      @bottom-right {{
        content: counter(page);
      }}
    }}
    
    * {{
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }}
    
    body {{
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      background-color: #FFFFFF;
      margin: 0;
      padding: 0;
      font-size: 10.5pt;
      line-height: 1.5;
    }}
    
    .font-mono {{
      font-family: 'JetBrains Mono', monospace;
    }}
    
    .page {{
      page-break-after: always;
      position: relative;
      min-height: 270mm;
      padding-bottom: 8mm;
    }}
    
    .page:last-child {{
      page-break-after: avoid;
    }}
    
    /* Header & Footer Rules */
    .doc-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1.5pt solid #E2E8F0;
      padding-bottom: 8px;
      margin-bottom: 20px;
    }}
    
    .doc-header img {{
      height: 28px;
    }}
    
    .doc-header .doc-meta {{
      font-size: 8pt;
      font-weight: 600;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }}
    
    .doc-footer {{
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1pt solid #E2E8F0;
      padding-top: 6px;
      font-size: 7.5pt;
      color: #94A3B8;
    }}
    
    /* Cover Page */
    .cover {{
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 265mm;
      padding: 10mm 4mm 4mm 4mm;
    }}
    
    .cover-top {{
      border-left: 4pt solid #06B6D4;
      padding-left: 20px;
      margin-top: 20mm;
    }}
    
    .cover-tag {{
      display: inline-block;
      background: rgba(6, 182, 212, 0.12);
      color: #0284C7;
      border: 1px solid rgba(6, 182, 212, 0.3);
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 8.5pt;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin-bottom: 14px;
    }}
    
    .cover-title {{
      font-size: 34pt;
      font-weight: 800;
      line-height: 1.15;
      color: #040814;
      margin: 0 0 12px 0;
      letter-spacing: -1px;
    }}
    
    .cover-subtitle {{
      font-size: 14pt;
      font-weight: 500;
      color: #475569;
      line-height: 1.4;
      max-width: 650px;
    }}
    
    .cover-highlight {{
      background: linear-gradient(135deg, #070D1E 0%, #0E1C3D 100%);
      color: white;
      border-radius: 16px;
      padding: 24px;
      margin: 25px 0;
      border: 1px solid rgba(6, 182, 212, 0.25);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15);
    }}
    
    .cover-highlight h3 {{
      margin: 0 0 8px 0;
      color: #38BDF8;
      font-size: 13pt;
      font-weight: 700;
      letter-spacing: 0.3px;
    }}
    
    .cover-highlight p {{
      margin: 0;
      font-size: 11pt;
      line-height: 1.6;
      color: #CBD5E1;
    }}
    
    .cover-bottom {{
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      border-top: 1.5pt solid #E2E8F0;
      padding-top: 18px;
    }}
    
    .meta-box {{
      background: #F8FAFC;
      border: 1pt solid #E2E8F0;
      border-radius: 10px;
      padding: 12px 14px;
    }}
    
    .meta-label {{
      font-size: 7.5pt;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 3px;
    }}
    
    .meta-value {{
      font-size: 10pt;
      font-weight: 700;
      color: #0F172A;
    }}
    
    /* Content Headings */
    h1 {{
      font-size: 20pt;
      font-weight: 800;
      color: #040814;
      letter-spacing: -0.5px;
      margin: 0 0 4px 0;
    }}
    
    .section-lead {{
      font-size: 10.5pt;
      color: #64748B;
      margin-bottom: 18px;
    }}
    
    h2 {{
      font-size: 13pt;
      font-weight: 700;
      color: #0F172A;
      margin: 18px 0 8px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    
    h3 {{
      font-size: 11pt;
      font-weight: 700;
      color: #1E293B;
      margin: 12px 0 6px 0;
    }}
    
    /* Cards & Grids */
    .grid-2 {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 16px;
    }}
    
    .grid-3 {{
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }}
    
    .card {{
      background: #F8FAFC;
      border: 1pt solid #E2E8F0;
      border-radius: 12px;
      padding: 14px 16px;
    }}
    
    .card-accent {{
      border-left: 3.5pt solid #0284C7;
    }}
    
    .card-danger {{
      border-left: 3.5pt solid #EF4444;
      background: #FEF2F2;
    }}
    
    .card-success {{
      border-left: 3.5pt solid #10B981;
      background: #ECFDF5;
    }}
    
    .card-dark {{
      background: #080E1E;
      color: white;
      border: 1pt solid #1E293B;
    }}
    
    .card-dark h3 {{
      color: #38BDF8;
    }}
    
    .card-dark p {{
      color: #94A3B8;
    }}
    
    /* Comparison Table */
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 18px 0;
      font-size: 9pt;
    }}
    
    th, td {{
      padding: 8px 10px;
      text-align: left;
      border-bottom: 1pt solid #E2E8F0;
    }}
    
    th {{
      background-color: #F1F5F9;
      color: #334155;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 7.5pt;
      letter-spacing: 0.5px;
    }}
    
    tr:last-child td {{
      border-bottom: none;
    }}
    
    /* Script Callouts */
    .script-block {{
      background: #F1F5F9;
      border-left: 3.5pt solid #6366F1;
      border-radius: 0 10px 10px 0;
      padding: 12px 14px;
      margin-bottom: 14px;
      font-size: 9.5pt;
      line-height: 1.55;
    }}
    
    .script-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }}
    
    .script-role {{
      font-size: 7.5pt;
      font-weight: 700;
      color: #4F46E5;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }}
    
    .script-cue {{
      font-size: 7.5pt;
      font-weight: 600;
      color: #64748B;
      font-style: italic;
    }}
    
    /* Pill & Badges */
    .pill {{
      display: inline-block;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.3px;
    }}
    
    .pill-cyan {{
      background: #E0F2FE;
      color: #0369A1;
    }}
    
    .pill-emerald {{
      background: #D1FAE5;
      color: #065F46;
    }}
    
    .pill-amber {{
      background: #FEF3C7;
      color: #92400E;
    }}
    
    .pill-rose {{
      background: #FFE4E6;
      color: #9F1239;
    }}
    
    /* Showcase Visuals */
    .screenshot-frame {{
      border-radius: 14px;
      border: 1pt solid #CBD5E1;
      box-shadow: 0 6px 16px -3px rgba(0, 0, 0, 0.1);
      width: 100%;
      display: block;
      background: #000;
    }}
    
    .caption {{
      font-size: 7.5pt;
      color: #64748B;
      text-align: center;
      margin-top: 5px;
      font-weight: 600;
    }}
  </style>
</head>
<body>

  <!-- ================= PAGE 1: COVER ================= -->
  <div class="page cover">
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <img src="{logo_base64}" style="height: 48px;" alt="FinSight Logo">
        <span class="cover-tag">INVESTOR & PRODUCT BRIEF</span>
      </div>
      
      <div class="cover-top">
        <h1 class="cover-title">FinSight</h1>
        <div class="cover-subtitle">
          The First Financial Resilience Operating System: Stress-Testing, Downside Protection & AI Earnings Intelligence for Retail Investors.
        </div>
      </div>
      
      <div class="cover-highlight">
        <h3>🎯 The Core Mission</h3>
        <p>
          "Every modern broker is engineered to maximize trading turnover in bull markets. 
          None of them prepare retail investors for crashes or cash emergencies. 
          <strong>FinSight doesn't tell you how to get rich fast. We make sure you never go broke.</strong>"
        </p>
      </div>
    </div>
    
    <div>
      <div class="cover-bottom">
        <div class="meta-box">
          <div class="meta-label">Platform</div>
          <div class="meta-value">Native iOS 17+ (SwiftUI & Swift Charts)</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Integrations</div>
          <div class="meta-value">Zerodha Kite OAuth + All NSE/BSE Stocks</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Core Engine</div>
          <div class="meta-value">AI Concall Intelligence & Stress Simulator</div>
        </div>
      </div>
      
      <div class="doc-footer">
        <span>FinSight Technologies © 2026. Confidential — For Investors & Product Evaluation Only.</span>
        <span>Page 1 of 5</span>
      </div>
    </div>
  </div>

  <!-- ================= PAGE 2: PROBLEM & THE 5 ENGINES ================= -->
  <div class="page">
    <div class="doc-header">
      <img src="{logo_base64}" alt="FinSight">
      <span class="doc-meta">Section 01: Problem & Solution</span>
    </div>

    <h1>The Retail Investor Blindspot</h1>
    <div class="section-lead">Why existing brokerages fail users during financial emergencies and market crashes.</div>

    <div class="grid-2">
      <div class="card card-danger">
        <h3 style="color: #B91C1C; margin-top:0;">The Vanity Metric Trap</h3>
        <p style="font-size: 9pt; margin: 0;">
          Over 160M+ Indian demat accounts look only at daily green/red P&L. Apps reward trading frequency instead of solvency. When a -25% market drawdown hits, users lack hedging or downside visibility and panic-sell at market bottoms.
        </p>
      </div>

      <div class="card card-danger">
        <h3 style="color: #B91C1C; margin-top:0;">The Emergency Liquidity Gap</h3>
        <p style="font-size: 9pt; margin: 0;">
          Investors rarely map their liquid cash reserves against unexpected medical emergencies or job loss. When an unforeseen expense arises, they are forced to break long-term compounding investments to fund immediate survival.
        </p>
      </div>
    </div>

    <h2>The FinSight Solution: 5 Core Resilience Engines</h2>

    <table>
      <thead>
        <tr>
          <th>Resilience Engine</th>
          <th>Core Question Answered</th>
          <th>What It Delivers</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>1. Resilience Score (0–100)</strong></td>
          <td><em>"How financially bulletproof am I right now?"</em></td>
          <td>A standardized solvency index combining cash buffer, burn rate, portfolio diversification, and runway into a single health score with explainable drivers.</td>
        </tr>
        <tr>
          <td><strong>2. Stress Test Engine</strong></td>
          <td><em>"If the market crashes 25% or 40%, what is my exact loss?"</em></td>
          <td>Interactive Swift Charts simulating portfolio drawdowns under Mild (-10%), Stress (-25%), Severe (-40%), or custom shocks with per-stock attribution.</td>
        </tr>
        <tr>
          <td><strong>3. Emergency Simulator</strong></td>
          <td><em>"Can I survive a ₹2 Lakh hospital bill without selling stocks?"</em></td>
          <td>Instant life-crisis testing (medical bills, job disruption, vehicle repair) with live safety floor warning markers.</td>
        </tr>
        <tr>
          <td><strong>4. Cash Runway Clock</strong></td>
          <td><em>"If income stops, how many months until my bank account hits ₹0?"</em></td>
          <td>Precise countdown (e.g. 3.0 Months) with a month-by-month cash depletion trajectory chart before equity liquidation is required.</td>
        </tr>
        <tr>
          <td><strong>5. Concall AI Analyst</strong></td>
          <td><em>"What management risks are hidden in my company's concall?"</em></td>
          <td>Parses 60-page earnings conference calls, extracts operational risks and sentiment, and directly bridges company risks into personal stress tests.</td>
        </tr>
      </tbody>
    </table>

    <div class="card card-accent" style="margin-top: 14px;">
      <h3 style="margin-top: 0; color: #0284C7;">Broker Independence: Zerodha Kite + Any NSE & BSE Stock</h3>
      <p style="font-size: 9pt; margin: 0;">
        Users can sync live portfolio holdings automatically via official <strong>Zerodha Kite OAuth</strong> (100% read-only, bank-grade encryption) OR manually add and model <strong>any NSE and BSE stock</strong> from our 80+ company catalog or custom ticker inputs.
      </p>
    </div>

    <div class="doc-footer">
      <span>FinSight Technologies © 2026. Confidential.</span>
      <span>Page 2 of 5</span>
    </div>
  </div>

  <!-- ================= PAGE 3: VISUAL SHOWCASE ================= -->
  <div class="page">
    <div class="doc-header">
      <img src="{logo_base64}" alt="FinSight">
      <span class="doc-meta">Section 02: Product Interface & Verification</span>
    </div>

    <h1>Production UI & Interface Architecture</h1>
    <div class="section-lead">Engineered with Apple-grade fintech minimalism, Swift Charts, and dark-first aesthetics.</div>

    <div class="grid-3">
      <div>
        <img src="{dash_base64}" class="screenshot-frame" alt="Financial Command">
        <div class="caption">Screen A: Financial Command & Resilience Score (54/100)</div>
      </div>
      <div>
        <img src="{stress_base64}" class="screenshot-frame" alt="Stress Test Engine">
        <div class="caption">Screen B: Interactive Drawdown Visualizer (Swift Charts)</div>
      </div>
      <div>
        <img src="{whatif_base64}" class="screenshot-frame" alt="What-If Stock Simulator">
        <div class="caption">Screen C: What-If NSE & BSE Stock Simulator</div>
      </div>
    </div>

    <h2>Key Architectural Innovations</h2>
    <div class="grid-2">
      <div class="card">
        <h3 style="margin-top:0;">🧪 What-If Stock Simulator (Pre-Trade Testing)</h3>
        <p style="font-size: 8.5pt; color: #475569; margin: 0;">
          Allows retail users to test buying any NSE/BSE stock (e.g. 50 shares of Tata Motors) *before* placing the trade. It live-calculates portfolio weight, concentration warnings (>25%), and shifts in market crash drawdown.
        </p>
      </div>

      <div class="card">
        <h3 style="margin-top:0;">🔒 Local-First Cryptographic Security</h3>
        <p style="font-size: 8.5pt; color: #475569; margin: 0;">
          All sensitive financial profiles and credentials are authenticated and encrypted using <strong>Apple CryptoKit SHA-256 + Salt</strong>. Operates 100% offline with optional cloud database synchronization.
        </p>
      </div>
    </div>

    <div class="doc-footer">
      <span>FinSight Technologies © 2026. Confidential.</span>
      <span>Page 3 of 5</span>
    </div>
  </div>

  <!-- ================= PAGE 4: PITCHING SCRIPTS ================= -->
  <div class="page">
    <div class="doc-header">
      <img src="{logo_base64}" alt="FinSight">
      <span class="doc-meta">Section 03: Executive Pitching Scripts</span>
    </div>

    <h1>Master Spoken Pitching Scripts</h1>
    <div class="section-lead">Word-for-word scripts crafted for Demo Days, Angel/VC meetings, and customer demos.</div>

    <div class="script-block">
      <div class="script-header">
        <span class="script-role">Script A: The 30-Second Elevator Pitch</span>
        <span class="script-cue">Target: 30 Seconds • Fast & Punchy</span>
      </div>
      <p style="margin: 0;">
        "Every investing app in the world—from Zerodha to Robinhood—is designed to make you buy more stocks when markets are green. But <strong>none of them tell you what happens when things go wrong</strong>.<br><br>
        When the market crashes 30% or you face a sudden medical emergency, most retail investors panic and sell at the absolute bottom. 
        <strong>FinSight is the first financial resilience operating system.</strong> It connects to your broker, stress-tests your net worth against market crashes and life emergencies, calculates your exact survival runway, and uses AI to extract hidden business risks from earnings calls. 
        We don't tell you how to get rich fast. We make sure you never go broke."
      </p>
    </div>

    <div class="script-block">
      <div class="script-header">
        <span class="script-role">Script B: The 2-Minute Demo Day Presentation</span>
        <span class="script-cue">Target: 120 Seconds • High Impact</span>
      </div>
      <p style="margin: 0; font-size: 9pt;">
        <strong>[0:00 - 0:30 | The Hook]:</strong> "In India alone, 160 million demat accounts track only one metric: today's green or red P&L. But wealth isn't destroyed in bull markets; it's wiped out in crashes. When a -30% correction or an emergency medical bill arrives, retail investors have no flight manual. They panic and sell at the bottom. Meet <strong>FinSight</strong>—the financial resilience operating system."<br><br>
        <strong>[0:30 - 1:00 | The Score & Stress Test]:</strong> "Just like a credit score, FinSight introduces the <strong>Financial Resilience Score</strong>—a single metric from 0 to 100 measuring your balance-sheet fortress strength. With one tap on our <strong>Stress Test Engine</strong>, you can simulate a -25% market crash and instantly see your exact rupee loss, your top risk contributor, and whether your cash buffer can withstand the shock."<br><br>
        <strong>[1:00 - 1:30 | Runway & What-If Simulator]:</strong> "Our <strong>Cash Runway</strong> gives users their exact survival countdown in months before touching equity. And with our <strong>What-If Stock Simulator</strong>, users can model buying any of the 80+ NSE and BSE stocks *before* buying, testing if it improves diversification or creates dangerous concentration risk."<br><br>
        <strong>[1:30 - 2:00 | Close]:</strong> "FinSight isn't another brokerage. We are the intelligent defense layer for every retail investor. Because the secret to compounding isn't finding the next 10x stock—it's surviving long enough to let compounding work. Thank you."
      </p>
    </div>

    <div class="doc-footer">
      <span>FinSight Technologies © 2026. Confidential.</span>
      <span>Page 4 of 5</span>
    </div>
  </div>

  <!-- ================= PAGE 5: BUSINESS MODEL & FAQ ================= -->
  <div class="page">
    <div class="doc-header">
      <img src="{logo_base64}" alt="FinSight">
      <span class="doc-meta">Section 04: Business Model & Defense</span>
    </div>

    <h1>Monetization, Defensibility & Q&A Prep</h1>
    <div class="section-lead">Commercial strategy, technical defensibility, and responses to investor objections.</div>

    <div class="grid-3">
      <div class="card card-accent">
        <h3 style="margin-top:0;">1. Freemium Core</h3>
        <p style="font-size: 8.5pt; color: #475569; margin: 0;">
          Free Resilience Score, basic market crash stress testing, Zerodha Kite sync, and manual NSE/BSE tracking. Drives rapid organic user acquisition.
        </p>
      </div>

      <div class="card card-accent">
        <h3 style="margin-top:0;">2. FinSight Pro (SaaS)</h3>
        <p style="font-size: 8.5pt; color: #475569; margin: 0;">
          ₹499/mo or ₹3,999/yr for unlimited AI Concall intelligence reports, multi-broker aggregation, advanced Monte Carlo simulations, and automated recovery plans.
        </p>
      </div>

      <div class="card card-accent">
        <h3 style="margin-top:0;">3. B2B Wealth API</h3>
        <p style="font-size: 8.5pt; color: #475569; margin: 0;">
          Licensing the Resilience & Stress-Testing Engine to Registered Investment Advisors (RIAs) and wealth managers to audit client risk posture.
        </p>
      </div>
    </div>

    <h2>Investor Objection Handling (Killer Q&A)</h2>

    <div class="card" style="margin-bottom: 10px;">
      <h3 style="margin: 0 0 4px 0; color: #0284C7; font-size: 10pt;">Q: "How are you differentiated from Zerodha, Groww, or INDmoney?"</h3>
      <p style="margin: 0; font-size: 9pt; color: #334155;">
        <strong>A:</strong> "Zerodha and Groww are execution brokers—their revenue depends on transaction volume. INDmoney is a passive net-worth tracker. <strong>None of them simulate downside risk.</strong> FinSight is conflict-free: we don't push trades; our only job is proving whether your net worth can survive worst-case market and life events."
      </p>
    </div>

    <div class="card" style="margin-bottom: 10px;">
      <h3 style="margin: 0 0 4px 0; color: #0284C7; font-size: 10pt;">Q: "Will retail users pay attention to downside protection during a bull market?"</h3>
      <p style="margin: 0; font-size: 9pt; color: #334155;">
        <strong>A:</strong> "Bull markets actually create maximum anxiety around portfolio overexposure and FOMO. Moreover, life emergencies (medical bills, job shifts) occur regardless of the stock index. Our What-If Simulator and Cash Runway give users immediate clarity on every capital allocation decision."
      </p>
    </div>

    <div class="card">
      <h3 style="margin: 0 0 4px 0; color: #0284C7; font-size: 10pt;">Q: "What prevents a broker from copying this feature?"</h3>
      <p style="margin: 0; font-size: 9pt; color: #334155;">
        <strong>A:</strong> "Brokers have a severe structural disincentive: warning a user that their portfolio is over-leveraged or encouraging them to hold 6 months of liquid cash directly reduces the broker's trading fee revenue. FinSight's broker-agnostic position is its greatest moat."
      </p>
    </div>

    <div class="doc-footer">
      <span>FinSight Technologies © 2026. Confidential — FinSight Pitch Deck v1.0.</span>
      <span>Page 5 of 5</span>
    </div>
  </div>

</body>
</html>
"""

    html_file = os.path.join(workspace_dir, "FinSight_Pitch_Deck.html")
    pdf_file = os.path.join(workspace_dir, "FinSight_Pitch_Deck.pdf")
    
    with open(html_file, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"Generated HTML at: {html_file}")
    
    # Run Headless Chrome to export to PDF
    chrome_bin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    cmd = [
        chrome_bin,
        "--headless=new",
        "--disable-gpu",
        "--user-data-dir=/tmp/chrome-pdf-profile",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_file}",
        html_file
    ]
    
    print("Exporting PDF with headless Chrome...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0 and os.path.exists(pdf_file):
        size_kb = round(os.path.getsize(pdf_file) / 1024, 1)
        print(f"SUCCESS: Generated {pdf_file} ({size_kb} KB)")
    else:
        print("Chrome error:", res.stderr)

if __name__ == "__main__":
    main()
