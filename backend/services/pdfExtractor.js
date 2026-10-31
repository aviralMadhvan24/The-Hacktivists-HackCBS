const pdfParse = require('pdf-parse');

/**
 * Extracts raw text from a PDF Buffer with safety checks and error handling.
 * @param {Buffer} buffer
 * @returns {Promise<{text: string, numPages: number, info: object}>}
 */
async function extractTextFromPDF(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error('PDF buffer is empty or missing.');
  }

  // Validate PDF magic bytes: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  if (buffer.length < 5 || buffer.toString('utf-8', 0, 5) !== '%PDF-') {
    throw new Error('Invalid file format: File does not appear to be a valid PDF document.');
  }

  try {
    const data = await pdfParse(buffer, {
      max: 100 // Safe maximum page threshold
    });

    const cleanText = (data.text || '').trim();
    if (cleanText.length < 50) {
      throw new Error('PDF text extraction yielded insufficient text. The document may be scanned images or password-protected.');
    }

    return {
      text: cleanText,
      numPages: data.numpages || 1,
      info: data.info || {}
    };
  } catch (err) {
    if (err.message && err.message.includes('password')) {
      throw new Error('The uploaded PDF is password-protected. Please provide an unprotected transcript.');
    }
    throw new Error(`PDF extraction failed: ${err.message}`);
  }
}

module.exports = {
  extractTextFromPDF
};
