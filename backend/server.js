require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const concallRouter = require('./routes/concall');
const zerodhaRouter = require('./routes/zerodha');
const marketRouter = require('./routes/market');
const recoveryRouter = require('./routes/recovery');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Health Check & LLM Configuration Status
app.get('/api/health', (req, res) => {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const isLLMConfigured = hasGemini || hasOpenAI || hasAnthropic;

  let activeProvider = 'None';
  if (hasGemini) activeProvider = 'Google Gemini';
  else if (hasOpenAI) activeProvider = 'OpenAI';
  else if (hasAnthropic) activeProvider = 'Anthropic Claude';

  res.status(200).json({
    status: 'healthy',
    service: 'FinSight Backend API',
    version: '1.0.0',
    llmConfigured: isLLMConfigured,
    activeProvider: activeProvider,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Mount Concall Intelligence routes
app.use('/api/concall', concallRouter);

// Mount Zerodha Kite Connect routes
app.use('/api/zerodha', zerodhaRouter);

// Mount Stock Market Data routes
app.use('/api/market', marketRouter);

// Mount AI Financial Recovery Planner routes
app.use('/api/recovery', recoveryRouter);

// Mount Authentication & User Database routes
app.use('/api/auth', authRouter);

// Root informative endpoint
app.get('/', (req, res) => {
  res.send('FinSight Backend API is running. Check /api/health for system status.');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unknown error occurred.'
  });
});

// Start listening if run directly
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FinSight API Server listening on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
