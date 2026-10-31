# LiquidityOS

> **“Can you withstand the next financial shock?”**  
> Portfolio risk meets personal cash-flow resilience.

LiquidityOS is an iOS application built with SwiftUI that performs interactive financial stress-testing across investments, liquid emergency cash, monthly burn rate, and AI-powered earnings call intelligence.

---

## 🌟 Why LiquidityOS?

Your money lives in three separate silos:
1. **Investments:** Stocks, mutual funds, and crypto (Zerodha, Groww, Apple Stocks).
2. **Savings:** Liquid cash sitting in bank accounts.
3. **Cash Flow:** Fixed living expenses vs. monthly income.

When financial shocks occur in the real world, they rarely happen one at a time. A market crash combined with an unexpected emergency bill and income disruption forces individuals to sell their crashed investments at a loss. 

LiquidityOS connects all three silos to answer one fundamental question:
> **“If a market crash and an emergency bill hit today, how many months can I survive before running out of cash?”**

---

## 🚀 Key Features

* **Portfolio Stress Testing:** Simulate instant market drops (**Mild 5%**, **Stress 15%**, **Severe 30%**, or custom percentage) to see estimated losses and retained portfolio values.
* **Emergency Expense Simulator:** Dial in unplanned bills (e.g. ₹50,000) and quantify liquid cash depletion instantly.
* **Cash Runway Engine:** Models monthly net burn (`Expenses − Income`) and calculates exact survival runway in months. Intelligently detects break-even and cash surplus states.
* **Unified Resilience Score (0–100):** Real-time weighted resilience metric with a dynamic circular gauge and plain-English verdicts.
* **Multi-Scenario Comparison Matrix:** Side-by-side comparative breakdown of Mild, Stress, and Severe market shocks.
* **AI Concall Intelligence (New):** Analyzes company earnings conference call transcripts to uncover operational risks, margin pressures, management guidance, and analyst Q&A without stock-price speculation.
* **Concall Stress Bridge:** Directly connects company-level business risks to the existing LiquidityOS stress-testing engine to model portfolio drawdown and runway impact under user-selected scenarios.
* **100% On-Device & Private Resilience Calculations:** Sensitive personal finance figures remain encrypted on your device.

---

## 🤖 AI Concall Intelligence Architecture

The Concall Intelligence module connects company-level qualitative earnings call insights to your existing portfolio:

1. **Transcript Input:** Upload a PDF (e.g. BSE/NSE official transcript), text file, or paste raw call text.
2. **Document Parsing:** Native client-side `PDFKit` text extraction + backend `pdf-parse` fallback with file size and type validation (max 15MB).
3. **Secure Backend API:** Node.js + Express backend (`backend/`) keeps LLM keys off client devices. Supports Google Gemini, OpenAI, or Anthropic.
4. **Strict Schema & Anti-Hallucination:**
   - Classification into Positive Developments, Business Risks, Neutral, or Uncertain.
   - Verbatim supporting quotations and page/section locations for every finding.
   - Explicitly displays *"Not mentioned in the transcript."* whenever data is absent.
   - Strict rule: Never claims stock prices will drop; findings represent operational business risks.
5. **Portfolio Connection:** Links to your actual portfolio holdings (e.g., Reliance 35%, TCS 30%) or allows standalone company analysis.
6. **Stress Test Integration:** Open the existing LiquidityOS stress engine from any company analysis to test hypothetical 5%, 15%, or 30% drawdowns.

---

## 🛠️ How to Run

### 1. iOS App (Frontend)
1. Open `los2.xcodeproj` in Xcode.
2. Select an iOS Simulator (e.g., iPhone 16 Pro).
3. Press `⌘ + R` (Run).

### 2. Backend Server (for Live AI Concall Analysis)
```bash
cd backend
npm install
cp .env.example .env
# Add your GEMINI_API_KEY or OPENAI_API_KEY in .env
npm start
```
*Health check:* `http://localhost:3000/api/health`

> **Note:** The app also comes with an authentic preloaded sample (*Reliance Q3 FY25 Earnings Call*) so you can test and explore the full Concall Intelligence dashboard immediately without an API key!
