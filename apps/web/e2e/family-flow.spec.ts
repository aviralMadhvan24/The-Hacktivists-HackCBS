// Full browser flow: two people, one family, shared + private records,
// dashboard, stress test and a family decision.
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.E2E_SHOTS || 'test-results/shots';
const uid = Math.random().toString(36).slice(2, 8);
const asha = { name: 'Asha Rao', email: `asha-${uid}@example.test`, password: 'e2e-password-1' };
const ravi = { name: 'Ravi Rao', email: `ravi-${uid}@example.test`, password: 'e2e-password-2' };

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function register(page: Page, u: typeof asha) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Your name').fill(u.name);
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(`Welcome, ${u.name}`)).toBeVisible();
}

async function addRecord(page: Page, fill: (dialog: ReturnType<Page['getByRole']>) => Promise<void>) {
  const dialog = page.getByRole('dialog');
  await fill(dialog);
  await dialog.getByRole('button', { name: /^Add$/ }).click();
  await expect(dialog).toBeHidden();
}

test.describe.serial('family flow', () => {
  let inviteLink = '';

  test('owner signs up, creates a family and invites a member', async ({ page }) => {
    const errors = watchErrors(page);
    await register(page, asha);
    await expect(page.getByText(`Welcome, ${asha.name}`)).toBeVisible();
    await page.getByLabel('Family name').fill('Rao Family');
    await page.getByRole('button', { name: 'Create family' }).click();
    await expect(page.getByText('No financial records yet')).toBeVisible();

    await page.getByRole('link', { name: 'Family' }).first().click();
    await page.getByLabel('Email').fill(ravi.email);
    await page.getByRole('button', { name: 'Create invitation' }).click();
    const code = page.locator('code');
    await expect(code).toContainText('invite=');
    inviteLink = (await code.textContent())!;
    expect(errors).toEqual([]);
  });

  test('member joins through the invite link', async ({ page }) => {
    await register(page, ravi);
    await page.goto(new URL(inviteLink).pathname + new URL(inviteLink).search);
    await expect(page.getByLabel('Invite code')).not.toHaveValue('');
    await page.getByRole('button', { name: 'Join family' }).click();
    await expect(page.getByRole('heading', { name: 'Rao Family' })).toBeVisible();
  });

  test('owner enters shared and private records', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/login');
    await page.getByLabel('Email').fill(asha.email);
    await page.getByLabel('Password').fill(asha.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('link', { name: 'Money & records' }).first().click();

    await page.getByRole('button', { name: /Add account/ }).click();
    await addRecord(page, async (d) => {
      await d.getByLabel('Name', { exact: true }).fill('Joint savings');
      await d.getByLabel('Current value (₹)').fill('400000');
      await d.getByRole('checkbox', { name: ravi.name }).check();
      await d.getByLabel(`${asha.name} ownership share`).fill('50');
      await d.getByLabel(`${ravi.name} ownership share`).fill('50');
    });
    await page.getByRole('button', { name: /Add account/ }).click();
    await addRecord(page, async (d) => {
      await d.getByLabel('Name', { exact: true }).fill('Asha private FD');
      await d.getByLabel('Type', { exact: true }).selectOption('fixed_deposit');
      await d.getByLabel('Current value (₹)').fill('200000');
      await d.getByLabel('Visibility').selectOption('private');
    });
    await page.getByRole('button', { name: /Add account/ }).click();
    await addRecord(page, async (d) => {
      await d.getByLabel('Name', { exact: true }).fill('Index fund');
      await d.getByLabel('Type', { exact: true }).selectOption('mutual_fund');
      await d.getByLabel('Current value (₹)').fill('300000');
    });
    await expect(page.getByText('Asha private FD')).toBeVisible();
    await expect(page.getByText('Private').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Income & expenses' }).click();
    await page.getByRole('button', { name: /Add income/ }).click();
    await addRecord(page, async (d) => {
      await d.getByLabel('Direction', { exact: true }).selectOption('income');
      await d.getByLabel('Name', { exact: true }).fill('Salary');
      await d.getByLabel('Category', { exact: true }).fill('salary');
      await d.getByLabel('Amount (₹)').fill('150000');
    });
    await page.getByRole('button', { name: /Add income/ }).click();
    await addRecord(page, async (d) => {
      await d.getByLabel('Name', { exact: true }).fill('Household');
      await d.getByLabel('Category', { exact: true }).fill('household');
      await d.getByLabel('Amount (₹)').fill('80000');
      await d.getByRole('checkbox', { name: ravi.name }).check();
      await d.getByLabel(`${asha.name} ownership share`).fill('50');
      await d.getByLabel(`${ravi.name} ownership share`).fill('50');
    });

    await page.getByRole('link', { name: 'Overview' }).first().click();
    // 4,00,000 + 2,00,000 + 3,00,000 = ₹9.00 L net worth for the owner's view.
    await expect(page.getByText('₹9.00 L').first()).toBeVisible();
    await expect(page.getByText('Resilience score')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/overview-desktop.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

  test("member's view excludes the owner's private FD", async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ravi.email);
    await page.getByLabel('Password').fill(ravi.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('₹7.00 L').first()).toBeVisible();
    await page.getByRole('link', { name: 'Money & records' }).first().click();
    await expect(page.getByText('Joint savings')).toBeVisible();
    await expect(page.getByText('Asha private FD')).toHaveCount(0);
  });

  test('stress test and family decision', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/login');
    await page.getByLabel('Email').fill(ravi.email);
    await page.getByLabel('Password').fill(ravi.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('link', { name: 'Stress test' }).first().click();
    await page.getByRole('button', { name: /Perfect storm/ }).click();
    await page.getByRole('button', { name: 'Run stress test' }).click();
    await expect(page.getByText('Cash over time')).toBeVisible();
    await expect(page.getByText('Portfolio loss').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/stress-desktop.png`, fullPage: true });

    await page.getByRole('tab', { name: 'Breaking point' }).click();
    await page.getByRole('button', { name: 'Find breaking point' }).click();
    await expect(page.getByText(/breaches the condition|Not breached|already breached/)).toBeVisible();

    await page.getByRole('link', { name: 'Decisions' }).first().click();
    await page.getByRole('button', { name: 'Propose a decision' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Title').fill('Buy HDFC Bank');
    await d.getByLabel('Amount (₹)').fill('50000');
    await d.getByLabel('NSE symbol').fill('HDFCBANK');
    await d.getByLabel('Sector').fill('Financials');
    await d.getByRole('button', { name: 'Preview impact' }).click();
    await expect(d.getByText('In a 30% crash')).toBeVisible();
    await d.getByRole('button', { name: 'Submit for family approval' }).click();
    await expect(page.getByRole('heading', { name: 'Buy HDFC Bank' })).toBeVisible();
    await page.getByPlaceholder('Add a comment').fill('Small position, keeps cash above 3 months.');
    await page.getByRole('button', { name: 'Comment' }).click();
    await expect(page.getByText('Small position, keeps cash above 3 months.')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/decision-desktop.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

  test('owner approves the decision', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(asha.email);
    await page.getByLabel('Password').fill(asha.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('link', { name: 'Decisions' }).first().click();
    await page.getByRole('link', { name: 'Buy HDFC Bank' }).click();
    await page.getByRole('button', { name: 'Recalculate for me' }).click();
    await expect(page.getByText('In a 30% crash')).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('approved').first()).toBeVisible();
  });
});
