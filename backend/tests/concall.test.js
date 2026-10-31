const test = require('node:test');
const assert = require('node:assert/strict');
const { validateInput, prepareTranscriptText, LLMNotConfiguredError } = require('../services/concallAnalyzer');
const { extractTextFromPDF } = require('../services/pdfExtractor');

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

test('Quote verification: flags quotes not found in the transcript', () => {
  const { verifyQuotes } = require('../services/concallAnalyzer');
  const transcript = 'Moderator: Welcome. CFO: Our EBITDA margin expanded by 40 bps this quarter, driven by “pricing discipline”.';
  const out = verifyQuotes({ findings: [
    { exactQuote: 'our ebitda margin expanded   by 40 bps this quarter' },
    { exactQuote: 'Revenue grew 25% year on year across all segments' },
  ], managementStatements: [{ quote: 'driven by "pricing discipline"' }] }, transcript);
  assert.equal(out.findings[0].quoteVerified, true);
  assert.equal(out.findings[1].quoteVerified, false);
  assert.equal(out.managementStatements[0].quoteVerified, true);
  assert.equal(out.quoteVerification.unverified, 1);
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
    if (prevGemini !== undefined) process.env.GEMINI_API_KEY = prevGemini;
    if (prevOpenAI !== undefined) process.env.OPENAI_API_KEY = prevOpenAI;
    if (prevAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = prevAnthropic;
  }
});

test('Discovery: finds transcript PDFs and ignores audio/intimations', () => {
  const { extractTranscriptLinks } = require('../services/concallDiscovery');
  const html = `
    <a href="/ir/Q2FY27-earnings-call-transcript.pdf">Transcript of Q2 FY27 earnings call</a>
    <a href="https://cdn.example.com/files/HDFCB-Transcript-Oct17-2026.pdf">Download</a>
    <a href="/ir/audio-recording-q2.mp3">Audio recording</a>
    <a href="/ir/intimation-of-earnings-call.pdf">Intimation of earnings call</a>
    <a href="/ir/annual-report.pdf">Annual report</a>`;
  const links = extractTranscriptLinks(html, 'https://company.example.com/investors/');
  assert.equal(links.length, 2);
  assert.equal(links[0].url, 'https://company.example.com/ir/Q2FY27-earnings-call-transcript.pdf');
  assert.deepEqual([links[0].quarter, links[0].fiscalYear], ['Q2', 'FY27']);
  assert.deepEqual([links[1].quarter, links[1].fiscalYear, links[1].inferredFromDate], ['Q2', 'FY27', true]);
});

test('Discovery: period inference handles common formats', () => {
  const { inferPeriod } = require('../services/concallDiscovery');
  assert.deepEqual(inferPeriod('Q3 FY 2025-26 Earnings Call'), { quarter: 'Q3', fiscalYear: 'FY26', inferredFromDate: false });
  assert.equal(inferPeriod('earnings-call-transcript Q1FY25.pdf').fiscalYear, 'FY25');
  assert.deepEqual(inferPeriod('Transcript 20 May 2026'), { quarter: 'Q4', fiscalYear: 'FY26', inferredFromDate: true });
});

test('SafeFetch: blocks private, loopback, metadata and non-http targets', async () => {
  const { checkUrl, isPrivateIp } = require('../lib/safeFetch');
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ['8.8.8.8', '13.234.1.1', '2606:4700::1111']) assert.ok(!isPrivateIp(ip), ip);
  for (const u of ['http://127.0.0.1/', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'ftp://x.com/a', 'http://user:pw@example.com/', 'http://example.com:8080/']) {
    await assert.rejects(() => checkUrl(u), { code: 'FETCH_BLOCKED' }, u);
  }
});
