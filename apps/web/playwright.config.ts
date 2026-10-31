import { defineConfig, devices } from '@playwright/test';

// Runs the real API (serving the production build) against E2E_DATABASE_URL.
// Start a database first, e.g. `npm --prefix ../../backend run dev:db`.
const port = Number(process.env.E2E_PORT || 3100);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } }, testIgnore: /mobile.spec.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: 'node ../../backend/server.js',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(port),
      DATABASE_URL: process.env.E2E_DATABASE_URL || 'postgres://liquidityos:liquidityos_dev@127.0.0.1:54320/liquidityos_e2e',
      APP_ENCRYPTION_KEY: 'b'.repeat(64),
      NODE_ENV: 'test',
      MARKET_DATA_PROVIDER: 'YAHOO',
      WEB_DIST: './dist',
      // Never call paid AI providers from tests, even if the machine has keys set.
      GEMINI_API_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '',
      MEKO_ENABLED: 'false',
      FORECAST_SERVICE_URL: process.env.E2E_FORECAST_URL || '',
    },
  },
});
