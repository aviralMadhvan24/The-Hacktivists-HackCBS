const test = require('node:test');
const assert = require('node:assert/strict');
const { validateInput, prepareTranscriptText, LLMNotConfiguredError } = require('../services/concallAnalyzer');
const { extractTextFromPDF } = require('../services/pdfExtractor');
const storage = require('../services/storage');

test('Validation: Rejects missing company name', () => {
  assert.throws(
    () => {
      validateInput({
        companyName: '',
        ticker: 'RELIANCE',
        quarter: 'Q3',
        fiscalYear: 'FY25',
        transcriptText: 'Valid long text...'
      });
    },
    { message: /Company name is required/ }
  );
});

test('Validation: Rejects missing ticker', () => {
  assert.throws(
    () => {
      validateInput({
        companyName: 'Reliance Industries',
        ticker: '',
        quarter: 'Q3',
        fiscalYear: 'FY25',
        transcriptText: 'Valid long text...'
      });
    },
    { message: /Ticker symbol is required/ }
  );
});

test('Validation: Rejects too short transcript', () => {
  assert.throws(
    () => {
      validateInput({
        companyName: 'Reliance Industries',
        ticker: 'RELIANCE',
        quarter: 'Q3',
        fiscalYear: 'FY25',
        transcriptText: 'Too short'
      });
    },
    { message: /Transcript text is too short/ }
  );
});

test('Validation: Accepts complete valid metadata and transcript', () => {
  assert.doesNotThrow(() => {
    validateInput({
      companyName: 'Reliance Industries',
      ticker: 'RELIANCE',
      quarter: 'Q3',
      fiscalYear: 'FY25',
      transcriptText: 'This is a long transcript of an earnings call where revenue was reported as 2.4 lakh crore and EBITDA margins expanded by 50 basis points. The CEO discussed future capital expenditures and debt management.'
    });
  });
});

test('Chunking: Prepares text safely within thresholds', () => {
  const shortText = 'Short sample text for testing purposes.';
  assert.equal(prepareTranscriptText(shortText), shortText);

  // Large text
  const largeText = 'A'.repeat(150000);
  const chunked = prepareTranscriptText(largeText, 100000);
  assert.ok(chunked.length < 150000);
  assert.ok(chunked.includes('[... Transcript section condensed for context length ...]'));
});

test('PDF Extractor: Rejects empty or invalid non-PDF buffers', async () => {
  await assert.rejects(
    async () => {
      await extractTextFromPDF(Buffer.from('not a pdf at all'));
    },
    { message: /Invalid file format/ }
  );
});

test('Storage: Saves and retrieves analysis correctly', () => {
  const testId = `test-analysis-${Date.now()}`;
  const mockReport = {
    id: testId,
    createdAt: new Date().toISOString(),
    metadata: {
      companyName: 'Test Corp',
      ticker: 'TEST',
      quarter: 'Q1',
      fiscalYear: 'FY26'
    },
    executiveSummary: 'Test summary.',
    findings: [
      {
        id: 'f-1',
        topic: 'Margin Expansion',
        classification: 'positiveDevelopment',
        explanation: 'Margins improved by 40 bps.',
        exactQuote: 'Our EBITDA margin expanded by 40 bps.',
        location: 'Page 3'
      }
    ]
  };

  storage.saveAnalysis(mockReport);
  const retrieved = storage.getAnalysisById(testId);
  assert.ok(retrieved);
  assert.equal(retrieved.metadata.companyName, 'Test Corp');
  assert.equal(retrieved.findings.length, 1);

  // Clean up
  storage.deleteAnalysis(testId);
  const afterDelete = storage.getAnalysisById(testId);
  assert.equal(afterDelete, null);
});

test('LLM Configuration: Throws LLMNotConfiguredError when no keys provided', async () => {
  const { analyzeConcallTranscript } = require('../services/concallAnalyzer');
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevOpenAI = process.env.OPENAI_API_KEY;
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;

  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    await assert.rejects(
      async () => {
        await analyzeConcallTranscript({
          companyName: 'Infosys',
          ticker: 'INFY',
          quarter: 'Q3',
          fiscalYear: 'FY25',
          transcriptText: 'This is a sufficiently long sample earnings call transcript that easily exceeds eighty characters so it passes metadata validation and tests the LLM caller.'
        });
      },
      (err) => {
        assert.equal(err.code, 'LLM_NOT_CONFIGURED');
        assert.ok(err.message.includes('No LLM API key configured'));
        return true;
      }
    );
  } finally {
    process.env.GEMINI_API_KEY = prevGemini;
    process.env.OPENAI_API_KEY = prevOpenAI;
    process.env.ANTHROPIC_API_KEY = prevAnthropic;
  }
});
