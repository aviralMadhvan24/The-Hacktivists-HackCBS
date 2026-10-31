// Phone-width layout: sign-up, onboarding, bottom tab bar and "More" sheet, without horizontal scroll.
import { expect, test } from '@playwright/test';

const SHOTS = process.env.E2E_SHOTS || 'test-results/shots';

test('mobile layout has no horizontal overflow', async ({ page }) => {
  const id = Math.random().toString(36).slice(2, 8);
  await page.goto('/');
  const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await noOverflow();
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Your name').fill('Mobile User');
  await page.getByLabel('Email').fill(`mobile-${id}@example.test`);
  await page.getByLabel('Password').fill('mobile-pass-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Create family' }).click();
  await expect(page.getByText('No financial records yet')).toBeVisible();
  await noOverflow();
  const bar = page.locator('.mobile-nav');
  for (const name of ['Ask', 'Money', 'Stress', 'Overview']) {
    await bar.getByRole('link', { name, exact: true }).click();
    await page.waitForLoadState('networkidle');
    await noOverflow();
  }
  for (const name of ['Decisions', 'Family', 'Settings']) {
    await bar.getByRole('button', { name: 'More' }).click();
    await page.getByRole('dialog').getByRole('link', { name, exact: true }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: name === 'Decisions' ? 'Family decisions' : name })).toBeVisible();
    await noOverflow();
  }
  await page.screenshot({ path: `${SHOTS}/settings-mobile.png`, fullPage: true });
});

test('mobile overview with data', async ({ page }) => {
  const id = Math.random().toString(36).slice(2, 8);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Your name').fill('Mobile Data');
  await page.getByLabel('Email').fill(`mobiledata-${id}@example.test`);
  await page.getByLabel('Password').fill('mobile-pass-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Create family' }).click();
  await expect(page.getByText('No financial records yet')).toBeVisible();
  await page.evaluate(async () => {
    const h = { 'Content-Type': 'application/json', 'X-LOS-CSRF': '1' };
    const me = (await (await fetch('/api/auth/session')).json()).user;
    const fid = (await (await fetch('/api/families')).json()).families[0].id;
    const owners = [{ userId: me.id, sharePct: 100 }];
    const post = (p: string, b: object) => fetch(`/api/families/${fid}/${p}`, { method: 'POST', headers: h, body: JSON.stringify({ ...b, owners }) });
    await post('accounts', { name: 'Savings', kind: 'savings', value: 85000 });
    await post('accounts', { name: 'Equity MF', kind: 'mutual_fund', value: 500000 });
    await post('cashflows', { direction: 'income', category: 'salary', name: 'Salary', amount: 10000 });
    await post('cashflows', { direction: 'expense', category: 'living', name: 'Living', amount: 20000 });
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Resilience score' })).toBeVisible();
  await expect(page.getByText('Needs attention')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/overview-mobile.png`, fullPage: true });
  await page.getByRole('button', { name: /Why this score/ }).click();
  await expect(page.getByText('Key score drivers')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/breakdown-mobile.png` });
});
