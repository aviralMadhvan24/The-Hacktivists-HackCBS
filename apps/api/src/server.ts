// apps/api/src/server.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './routes/auth';
import concallRouter from './routes/concall';
import marketRouter from './routes/market';
import recoveryRouter from './routes/recovery';
import zerodhaRouter from './routes/zerodha';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const isLLMConfigured = hasGemini || hasOpenAI || hasAnthropic;
  let activeProvider = 'None';
  if (hasGemini) activeProvider = 'Google Gemini';
  else if (hasOpenAI) activeProvider = 'OpenAI';
  else if (hasAnthropic) activeProvider = 'Anthropic Claude';
  res.json({
    status: 'healthy',
    service: 'FinSight Backend API',
    version: '1.0.0',
    llmConfigured: isLLMConfigured,
    activeProvider,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
app.use('/api/auth', authRouter);
app.use('/api/concall', concallRouter);
app.use('/api/market', marketRouter);
app.use('/api/recovery', recoveryRouter);
app.use('/api/zerodha', zerodhaRouter);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.send('FinSight Backend API is running. Check /api/health for status.');
});

// Error handling
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message || 'An unknown error occurred.' });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FinSight API Server listening on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

export default app;
