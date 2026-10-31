// Intelligence features in the browser, with live market data.
// AI keys are blanked in the test server, so the agent shows its deterministic
// analysis and the "AI not configured" state.
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.E2E_SHOTS || 'test-results/shots';
const id = Math.random().toString(36).slice(2, 8);

async function setup(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Your name').fill('Intel User');
  await page.getByLabel('Email').fill(`intel-${id}-${Math.random().toString(36).slice(2, 6)}@example.test`);
  await page.getByLabel('Password').fill('intel-pass-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Create family' }).click();
  await expect(page.getByText('No financial records yet')).toBeVisible();
  // Minimal records through the API (cookie session + CSRF header).
  await page.evaluate(async () => {
    const h = { 'Content-Type': 'application/json', 'X-LOS-CSRF': '1' };
    const me = (await (await fetch('/api/auth/session')).json()).user;
    const fid = (await (await fetch('/api/families')).json()).families[0].id;
    const owners = [{ userId: me.id, sharePct: 100 }];
    const post = (p: string, b: object) => fetch(`/api/families/${fid}/${p}`, { method: 'POST', headers: h, body: JSON.stringify({ ...b, owners }) }).then((r) => r.json());
    await post('accounts', { name: 'Savings', kind: 'savings', value: 600000 });
    const brk = (await post('accounts', { name: 'Demat', kind: 'brokerage' })).item.id;
    await fetch(`/api/families/${fid}/accounts/${brk}/holdings`, { method: 'POST', headers: h, body: JSON.stringify({ symbol: 'TCS', sector: 'Technology', quantity: 50, avgPrice: 3000 }) });
    await post('cashflows', { direction: 'income', category: 'salary', name: 'Salary', amount: 150000 });
    await post('cashflows', { direction: 'expense', category: 'household', name: 'Household', amount: 70000 });
  });
}

test('evaluate an investment with live data', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page);
  await page.getByRole('link', { name: 'Evaluate investment' }).first().click();
  await page.getByLabel('NSE symbol').fill('HDFCBANK');
  await page.getByLabel('Amount (₹)').fill('100000');
  await page.getByRole('button', { name: 'Evaluate' }).click();
  await expect(page.getByText('What the agent checked')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Possible gains and losses')).toBeVisible();
  await expect(page.getByText('Beta vs NIFTY 50')).toBeVisible();
  await expect(page.getByText(/No AI provider is configured|Turn on "AI analysis/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/invest-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Propose to family' }).click();
  await expect(page.getByRole('heading', { name: /Buy .* of HDFCBANK/ })).toBeVisible();
});

test('forecast shows ranges and backtest', async ({ page }) => {
  test.skip(!process.env.E2E_FORECAST_URL, 'forecast service not running');
  test.setTimeout(180_000);
  await setup(page);
  await page.getByRole('link', { name: 'Price forecast' }).first().click();
  await page.getByLabel('NSE symbol').fill('RELIANCE');
  await page.getByRole('button', { name: 'Forecast' }).click();
  await expect(page.getByText('How accurate has it been?')).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText(/Likely range in 20 trading days/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/forecast-desktop.png`, fullPage: true });
});

test('family memory: consent, save, search (local mode)', async ({ page }) => {
  await setup(page);
  await page.getByRole('link', { name: 'Family memory' }).first().click();
  await expect(page.getByText(/Saving context is off/)).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await page.getByRole('checkbox', { name: 'Remember decisions and preferences' }).check();
  await page.getByRole('link', { name: 'Family memory' }).first().click();
  await page.getByRole('button', { name: 'Add context' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Title').fill('Emergency fund goal');
  await d.getByLabel('What should be remembered?').fill('Keep nine months of essential costs in savings. Old account 123456789012 closed.');
  page.once('dialog', (x) => x.accept());
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Emergency fund goal')).toBeVisible();
  await expect(page.getByText('123456789012')).toHaveCount(0);
  await expect(page.getByText('Saved locally')).toBeVisible();
  await page.getByLabel('Search memory').fill('emergency fund');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText(/Meko is not enabled; used keyword search/)).toBeVisible();
});

test('research: discover transcripts on a company IR page', async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.getByRole('link', { name: 'Company research' }).first().click();
  await page.getByRole('tab', { name: 'Find transcripts' }).click();
  await page.getByLabel('Ticker').fill('HDFCBANK');
  await page.getByLabel('Company').fill('HDFC Bank');
  await page.getByLabel('IR page URL').fill('https://www.hdfcbank.com/personal/about-us/investor-relations/financial-results');
  await page.getByRole('button', { name: 'Save page' }).click();
  await page.getByRole('button', { name: 'Check for transcripts' }).click();
  await expect(page.getByText(/Transcripts found for HDFC Bank/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('link', { name: /Transcript/i }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/research-desktop.png`, fullPage: true });
});

test('Ask FinSight: consent gate, starters, and a clear message when AI is unavailable', async ({ page }) => {
  await setup(page);
  await page.getByRole('link', { name: 'Ask FinSight' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ask FinSight' })).toBeVisible();
  await expect(page.getByText(/turn on/i).first()).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await page.getByRole('checkbox', { name: 'AI analysis of my finances' }).check();
  await page.getByRole('link', { name: 'Ask FinSight' }).first().click();
  await page.getByRole('button', { name: /Kya hum ₹9 lakh ki car/ }).click();
  await expect(page.getByText('Kya hum ₹9 lakh ki car abhi le sakte hain?')).toBeVisible();
  // AI keys are blanked in e2e, so the server answers 503 and the page explains it.
  await expect(page.locator('.bubble.error')).toContainText(/No AI provider is configured|busy/);
  await expect(page.locator('.stage canvas')).toBeVisible(); // 3D orb rendered (WebGL)
  await expect(page.getByRole('button', { name: 'Speak to FinSight' })).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/ask-desktop.png` });
});

test('simulated Zerodha demo connection', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page);
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await page.getByRole('button', { name: 'Try demo connection (simulated)' }).click();
  await expect(page.getByText(/Simulated Zerodha connected: synced \d+ holding/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Simulated demo connection — sample data, not a real Zerodha account.')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/zerodha-sim.png`, fullPage: true });
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('button', { name: 'Try demo connection (simulated)' })).toBeVisible();
});
