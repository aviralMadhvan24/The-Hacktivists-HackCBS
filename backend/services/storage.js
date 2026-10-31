const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'saved_analyses.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

function getAllAnalyses() {
  try {
    ensureDataFile();
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading saved analyses:', err);
    return [];
  }
}

function saveAnalysis(analysis) {
  ensureDataFile();
  const all = getAllAnalyses();
  // Filter out duplicate if id exists, prepend to beginning
  const updated = [analysis, ...all.filter(item => item.id !== analysis.id)];
  // Limit to 50 most recent
  const capped = updated.slice(0, 50);
  fs.writeFileSync(DATA_FILE, JSON.stringify(capped, null, 2), 'utf-8');
  return analysis;
}

function getAnalysisById(id) {
  const all = getAllAnalyses();
  return all.find(item => item.id === id) || null;
}

function deleteAnalysis(id) {
  ensureDataFile();
  const all = getAllAnalyses();
  const filtered = all.filter(item => item.id !== id);
  fs.writeFileSync(DATA_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  return true;
}

module.exports = {
  getAllAnalyses,
  saveAnalysis,
  getAnalysisById,
  deleteAnalysis
};
