const { randomUUID } = require('crypto');

class LLMNotConfiguredError extends Error {
  constructor(message = 'No LLM API key configured.') {
    super(message);
    this.name = 'LLMNotConfiguredError';
    this.code = 'LLM_NOT_CONFIGURED';
  }
}

/**
 * Validates the metadata and transcript before analysis.
 */
function validateInput({ companyName, ticker, quarter, fiscalYear, transcriptText }) {
  if (!companyName || typeof companyName !== 'string' || companyName.trim().length === 0) {
    throw new Error('Company name is required.');
  }
  if (!ticker || typeof ticker !== 'string' || ticker.trim().length === 0) {
    throw new Error('Ticker symbol is required.');
  }
  if (!quarter || typeof quarter !== 'string') {
    throw new Error('Quarter is required (e.g. Q1, Q2, Q3, Q4).');
  }
  if (!fiscalYear || typeof fiscalYear !== 'string') {
    throw new Error('Fiscal year is required (e.g. FY25).');
  }
  if (!transcriptText || typeof transcriptText !== 'string' || transcriptText.trim().length < 80) {
    throw new Error('Transcript text is too short or empty. Please provide at least 80 characters of transcript text.');
  }
}

/**
 * Cleanly chunks large text transcripts if needed.
 */
function prepareTranscriptText(text, maxChars = 120000) {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (clean.length <= maxChars) {
    return clean;
  }
  // If extremely long, keep the introductory management presentation and analyst Q&A highlights
  const introPart = clean.slice(0, 70000);
  const concludingPart = clean.slice(clean.length - 45000);
  return `${introPart}\n\n[... Transcript section condensed for context length ...]\n\n${concludingPart}`;
}

/**
 * System prompt enforcing strict anti-hallucination and evidence requirements.
 */
function buildAnalysisPrompt({ companyName, ticker, quarter, fiscalYear, transcriptText, priorTranscriptText, holdingInfo }) {
  return `You are an expert financial analyst assistant analyzing an earnings conference call (concall) transcript for FinSight.
Target Company: ${companyName} (${ticker})
Call Period: ${quarter} ${fiscalYear}
${holdingInfo ? `User Portfolio Context: ${holdingInfo}` : 'User Portfolio Context: Standalone analysis (no holdings data supplied).'}

${priorTranscriptText ? `Earlier Concall Transcript for Comparison:\n${priorTranscriptText.slice(0, 20000)}\n---` : ''}

TRANSCRIPT TO ANALYZE:
"""
${transcriptText}
"""

CRITICAL INSTRUCTIONS & RULES:
1. Grounded Accuracy: Extract findings ONLY from the provided transcript. NEVER fabricate or assume metrics, quotations, guidance numbers, or financial facts.
2. If any metric, comment, or topic is not discussed in the transcript, you MUST explicitly write "Not mentioned in the transcript."
3. Classification of findings: Each finding MUST be categorized as: "positiveDevelopment", "risk", "neutralInformation", or "uncertainty".
4. Verbatim Quotations: Every finding MUST have an exact supporting quote from the transcript and a location reference (e.g. "Management Opening Remarks", "Q&A Session", "Page X" if indicated in text).
5. No Stock Predictions: Never present findings as guaranteed stock price predictions or buy/sell recommendations.
6. Portfolio Connection: Explain how business operational risks could affect the company's fundamentals and the user's exposure, but DO NOT claim stock prices will fall automatically.
7. Return ONLY valid JSON matching the exact schema below.

REQUIRED JSON OUTPUT FORMAT:
{
  "executiveSummary": "Concise 2-4 sentence executive overview of the concall.",
  "financialPerformance": {
    "revenueCommentary": "Commentary or 'Not mentioned in the transcript.'",
    "profitCommentary": "Commentary or 'Not mentioned in the transcript.'",
    "marginPressure": "Commentary or 'Not mentioned in the transcript.'",
    "risingCostsOrDebt": "Commentary or 'Not mentioned in the transcript.'"
  },
  "growthAndGuidance": {
    "growthGuidance": "Commentary or 'Not mentioned in the transcript.'",
    "businessOutlook": "Commentary or 'Not mentioned in the transcript.'",
    "guidanceComparison": "${priorTranscriptText ? 'Comparison with prior transcript...' : 'Not mentioned in the transcript (no prior transcript provided).'}"
  },
  "operationalDynamics": {
    "demandTrends": "Commentary or 'Not mentioned in the transcript.'",
    "orderBookUpdates": "Commentary or 'Not mentioned in the transcript.'",
    "customerRisks": "Commentary or 'Not mentioned in the transcript.'",
    "industryCompetition": "Commentary or 'Not mentioned in the transcript.'",
    "operationalChallenges": "Commentary or 'Not mentioned in the transcript.'"
  },
  "findings": [
    {
      "id": "find-1",
      "topic": "Short title of finding",
      "classification": "positiveDevelopment | risk | neutralInformation | uncertainty",
      "explanation": "Clear, simple-language explanation of what this means for the business.",
      "exactQuote": "Direct verbatim quote from transcript",
      "location": "Location in transcript (e.g. Management Remarks, Q&A)"
    }
  ],
  "managementStatements": [
    {
      "speaker": "Speaker Name & Title",
      "quote": "Verbatim quote",
      "context": "Context of the statement",
      "location": "Transcript section"
    }
  ],
  "analystQuestions": [
    {
      "analystNameAndFirm": "Analyst name and firm if mentioned",
      "questionSummary": "Summary of analyst question",
      "managementAnswerSummary": "Summary of management answer",
      "keyTakeaway": "Key takeaway from this exchange"
    }
  ],
  "keyUncertainties": [
    "Uncertainty 1...",
    "Uncertainty 2..."
  ],
  "portfolioConnection": {
    "holdingSummary": "User holding summary or 'Analyzed as a standalone watchlist company.'",
    "relevantBusinessRisks": [
      "Key business risk 1 relevant to exposure",
      "Key business risk 2 relevant to exposure"
    ],
    "potentialExposureExplanation": "Clear, objective explanation of how these business risks could impact company fundamentals without speculating on exact stock price movements.",
    "disclaimer": "AI-generated business analysis of company earnings call. This is not investment advice or a stock price forecast."
  }
}`;
}

/**
 * Dispatches prompt to configured LLM provider or throws LLMNotConfiguredError.
 */
async function callLLM(prompt) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (geminiKey) {
    return await callGemini(prompt, geminiKey);
  } else if (openaiKey) {
    return await callOpenAI(prompt, openaiKey);
  } else if (anthropicKey) {
    return await callAnthropic(prompt, anthropicKey);
  } else {
    throw new LLMNotConfiguredError(
      'No LLM API key configured. Please set GEMINI_API_KEY or OPENAI_API_KEY in backend/.env to perform live concall intelligence analysis.'
    );
  }
}

async function callGemini(prompt, apiKey) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawContent) {
    throw new Error('Gemini returned an empty response.');
  }

  return JSON.parse(rawContent);
}

async function callOpenAI(prompt, apiKey) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: 'You are a financial intelligence assistant that only responds in valid JSON.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error('OpenAI returned an empty response.');
  }

  return JSON.parse(rawContent);
}

async function callAnthropic(prompt, apiKey) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  const url = 'https://api.anthropic.com/v1/messages';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 4096,
      messages: [
        { role: 'user', content: prompt + '\nRespond with JSON only, without any markdown code fences.' }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawContent = data.content?.[0]?.text;
  if (!rawContent) {
    throw new Error('Anthropic returned an empty response.');
  }

  // Strip code fences if present
  const cleaned = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Validates the parsed analysis object matches the expected schema.
 */
function validateAnalysisSchema(analysis) {
  if (!analysis.executiveSummary) {
    analysis.executiveSummary = 'No executive summary could be generated from the provided transcript.';
  }
  if (!analysis.findings || !Array.isArray(analysis.findings)) {
    analysis.findings = [];
  }
  if (!analysis.financialPerformance) {
    analysis.financialPerformance = {
      revenueCommentary: 'Not mentioned in the transcript.',
      profitCommentary: 'Not mentioned in the transcript.',
      marginPressure: 'Not mentioned in the transcript.',
      risingCostsOrDebt: 'Not mentioned in the transcript.'
    };
  }
  if (!analysis.growthAndGuidance) {
    analysis.growthAndGuidance = {
      growthGuidance: 'Not mentioned in the transcript.',
      businessOutlook: 'Not mentioned in the transcript.',
      guidanceComparison: 'Not mentioned in the transcript.'
    };
  }
  if (!analysis.operationalDynamics) {
    analysis.operationalDynamics = {
      demandTrends: 'Not mentioned in the transcript.',
      orderBookUpdates: 'Not mentioned in the transcript.',
      customerRisks: 'Not mentioned in the transcript.',
      industryCompetition: 'Not mentioned in the transcript.',
      operationalChallenges: 'Not mentioned in the transcript.'
    };
  }
  if (!analysis.managementStatements || !Array.isArray(analysis.managementStatements)) {
    analysis.managementStatements = [];
  }
  if (!analysis.analystQuestions || !Array.isArray(analysis.analystQuestions)) {
    analysis.analystQuestions = [];
  }
  if (!analysis.keyUncertainties || !Array.isArray(analysis.keyUncertainties)) {
    analysis.keyUncertainties = [];
  }
  if (!analysis.portfolioConnection) {
    analysis.portfolioConnection = {
      holdingSummary: 'Standalone analysis',
      relevantBusinessRisks: [],
      potentialExposureExplanation: 'Business risks identified in concall may impact operational margins.',
      disclaimer: 'AI-generated business analysis of company earnings call. This is not investment advice or a stock price forecast.'
    };
  }
  return analysis;
}

/**
 * Main analysis function.
 */
async function analyzeConcallTranscript({
  companyName,
  ticker,
  quarter,
  fiscalYear,
  transcriptText,
  priorTranscriptText = null,
  transcriptSource = 'User Upload',
  holdingInfo = null
}) {
  validateInput({ companyName, ticker, quarter, fiscalYear, transcriptText });

  const preparedText = prepareTranscriptText(transcriptText);
  const prompt = buildAnalysisPrompt({
    companyName,
    ticker,
    quarter,
    fiscalYear,
    transcriptText: preparedText,
    priorTranscriptText,
    holdingInfo
  });

  const rawAnalysis = await callLLM(prompt);
  const validatedAnalysis = validateAnalysisSchema(rawAnalysis);

  const reportId = `concall-${randomUUID()}`;
  const timestamp = new Date().toISOString();

  return {
    id: reportId,
    createdAt: timestamp,
    metadata: {
      companyName,
      ticker,
      quarter,
      fiscalYear,
      transcriptSource,
      characterCount: transcriptText.length,
      hasPriorComparison: !!priorTranscriptText
    },
    ...validatedAnalysis
  };
}

module.exports = {
  analyzeConcallTranscript,
  validateInput,
  prepareTranscriptText,
  LLMNotConfiguredError
};
