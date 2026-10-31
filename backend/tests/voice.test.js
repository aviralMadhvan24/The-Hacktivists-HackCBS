const test = require('node:test');
const assert = require('node:assert/strict');
const { pcmToWav } = require('../routes/voice');

test('pcmToWav writes a valid 16-bit mono WAV header', () => {
  const pcm = Buffer.alloc(4800);
  const wav = pcmToWav(pcm, 24000);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 4800);
  assert.equal(wav.length, 44 + 4800);
});
