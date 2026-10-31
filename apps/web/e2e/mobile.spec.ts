// Phone-width layout: sign-up, onboarding and dashboard without horizontal scroll.
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
  for (const name of ['Money & records', 'Stress test', 'Decisions', 'Family', 'Settings']) {
    await page.locator('.mobile-nav').getByRole('link', { name }).click();
    await page.waitForLoadState('networkidle');
    await noOverflow();
  }
  await page.screenshot({ path: `${SHOTS}/settings-mobile.png`, fullPage: true });
});
