// Seeds clearly-labelled DEMO users, families and financial data for trying the app.
//
//   npm run seed:demo            create demo data (skips users that already exist)
//   npm run seed:demo -- --reset delete existing demo users/families first, then recreate
//
// Every demo user has an @demo.finsight.test email and the same password, and
// every family name starts with "Demo". Refuses to run when NODE_ENV=production
// unless --force is passed, because the demo password is public.
require('dotenv').config();
const db = require('../db/pool');
const { migrate } = require('../db/migrate');
const auth = require('../services/authService');
const families = require('../services/familyService');
const records = require('../services/recordsService');
const proposals = require('../services/proposalService');
const context = require('../services/meko/contextService');
const market = require('../services/marketData');
const zerodha = require('../services/zerodhaService');
const { randomUUID } = require('crypto');

const DOMAIN = 'demo.finsight.test';
// Demo users created before the rename are cleaned up by --reset too.
const LEGACY_DOMAINS = ['demo.liquidityos.test'];
const PASSWORD = 'demo-pass-123';
const IP = '127.0.0.1';
const args = new Set(process.argv.slice(2));

const USERS = {
  rajesh: { name: 'Rajesh Sharma', email: `rajesh@${DOMAIN}` },
  priya: { name: 'Priya Sharma', email: `priya@${DOMAIN}` },
  arjun: { name: 'Arjun Sharma', email: `arjun@${DOMAIN}` },
  kamla: { name: 'Kamla Sharma (Dadi)', email: `kamla@${DOMAIN}` },
  rohan: { name: 'Rohan Mehta', email: `rohan@${DOMAIN}` },
  neha: { name: 'Neha Mehta', email: `neha@${DOMAIN}` },
};

async function resetDemo() {
  const patterns = [DOMAIN, ...LEGACY_DOMAINS].map((d) => `%@${d}`);
  const { rows } = await db.query('SELECT id FROM users WHERE email LIKE ANY($1::text[])', [patterns]);
  const ids = rows.map((r) => r.id);
  if (!ids.length) return 0;
  // Remove their Meko datapacks too, so nothing is left behind in Meko.
  const fams = await db.query("SELECT id FROM families WHERE name LIKE 'Demo %' AND created_by = ANY($1::uuid[])", [ids]);
  for (const f of fams.rows) await context.deleteFamilyContext(f.id);
  for (const id of ids) await context.deleteAllForUser(id);
  await db.query("DELETE FROM families WHERE name LIKE 'Demo %' AND created_by = ANY($1::uuid[])", [ids]);
  for (const t of ['sessions', 'consents', 'concall_analyses', 'research_sources', 'usage_counters', 'subscriptions', 'broker_connections', 'oauth_states', 'score_snapshots', 'agent_evaluations']) {
    const col = t === 'score_snapshots' ? 'viewer_id' : 'user_id';
    await db.query(`DELETE FROM ${t} WHERE ${col} = ANY($1::uuid[])`, [ids]);
  }
  await db.query('DELETE FROM audit_log WHERE actor_id = ANY($1::uuid[])', [ids]);
  await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
  return ids.length;
}

async function ensureUser(key) {
  const u = USERS[key];
  const { rows } = await db.query('SELECT id, name, email FROM users WHERE email = $1 AND deleted_at IS NULL', [u.email]);
  if (rows[0]) { u.id = rows[0].id; u.existed = true; return u; }
  const r = await auth.registerUser({ email: u.email, password: PASSWORD, name: u.name }, { ip: IP });
  u.id = r.user.id;
  return u;
}

async function consent(userId, scope) {
  await db.query('INSERT INTO consents (id, user_id, scope) SELECT $1,$2,$3 WHERE NOT EXISTS (SELECT 1 FROM consents WHERE user_id=$2 AND scope=$3 AND revoked_at IS NULL)', [randomUUID(), userId, scope]);
}

async function join(familyId, owner, member, role) {
  const inv = await families.inviteMember(familyId, owner.id, { email: member.email, role }, IP);
  await families.acceptInvitation({ id: member.id, email: member.email }, { token: inv.token }, IP);
}

const own = (...pairs) => pairs.map(([u, pct]) => ({ userId: u.id, sharePct: pct }));
const add = (entity, fid, actor, body) => records.create(entity, fid, actor.id, body, IP);

async function addHoldings(fid, actor, accountId, list) {
  let live = 0;
  for (const h of list) {
    let lastPrice = null;
    try {
      const q = await market.getQuote(h.symbol);
      if (q.currentPrice > 0 && q.freshness !== 'DEMO_DATA') { lastPrice = q.currentPrice; live++; }
    } catch { /* offline: value at average price */ }
    await records.upsertHolding(fid, actor.id, accountId, { ...h, lastPrice }, IP);
  }
  return live;
}

/** Connects a SIMULATED Zerodha account for the user and syncs it into the family. */
async function simulatedZerodha(user, fid, holdings, availableCash) {
  await zerodha.connectSimulated(user.id, { portfolio: { holdings, availableCash } }, IP);
  const r = await zerodha.syncToFamily(user.id, { familyId: fid, visibility: 'family' }, IP);
  const { rows } = await db.query("SELECT count(*)::int AS n FROM holdings WHERE account_id = $1 AND price_source LIKE '%market-price'", [r.accountId]);
  return rows[0].n; // holdings priced at live market prices
}

async function seedSharma() {
  const { rajesh, priya, arjun, kamla } = USERS;
  const fam = await families.createFamily(rajesh.id, 'Demo Sharma Family', IP);
  const fid = fam.id;
  await join(fid, rajesh, priya, 'admin');
  await join(fid, rajesh, arjun, 'member');
  await join(fid, rajesh, kamla, 'viewer');
  await families.updateFamily(fid, rajesh.id, { approvalThreshold: 2 }, IP);

  // Accounts
  await add('accounts', fid, rajesh, { name: 'HDFC joint savings', kind: 'savings', value: 420000, institution: 'HDFC Bank', owners: own([rajesh, 50], [priya, 50]) });
  await add('accounts', fid, rajesh, { name: 'Household cash', kind: 'cash', value: 25000, owners: own([rajesh, 50], [priya, 50]) });
  await add('accounts', fid, priya, { name: 'Priya SBI FD', kind: 'fixed_deposit', value: 300000, institution: 'SBI', maturityDate: '2027-08-15', visibility: 'private', owners: own([priya, 100]) });
  await add('accounts', fid, arjun, { name: 'Arjun salary account', kind: 'bank', value: 85000, institution: 'ICICI Bank', owners: own([arjun, 100]) });
  await add('accounts', fid, arjun, { name: 'Arjun Nifty index fund SIP', kind: 'mutual_fund', value: 140000, equityPct: 100, institution: 'UTI MF', owners: own([arjun, 100]) });
  await add('accounts', fid, rajesh, { name: 'Rajesh EPF + PPF', kind: 'retirement', value: 1150000, equityPct: 10, owners: own([rajesh, 100]) });
  await add('accounts', fid, priya, { name: 'Gold jewellery', kind: 'gold', value: 450000, owners: own([priya, 70], [kamla, 30]) });
  await add('accounts', fid, rajesh, { name: 'Pune flat (50% with brother)', kind: 'real_estate', value: 9000000, owners: own([rajesh, 50]) });
  // Rajesh's demat comes through a SIMULATED Zerodha connection (labelled as such in the app).
  const live = await simulatedZerodha(rajesh, fid, [
    { symbol: 'RELIANCE', sector: 'Energy', quantity: 150, avgPrice: 1180 },
    { symbol: 'TCS', sector: 'Technology', quantity: 60, avgPrice: 3350 },
    { symbol: 'INFY', sector: 'Technology', quantity: 120, avgPrice: 1520 },
    { symbol: 'HDFCBANK', sector: 'Financial Services', quantity: 200, avgPrice: 760 },
    { symbol: 'ITC', sector: 'Consumer Staples', quantity: 300, avgPrice: 410 },
    { symbol: 'NIFTYBEES', sector: 'Diversified (index ETF)', instrument: 'etf', quantity: 400, avgPrice: 255 },
  ], 42000);

  // Loans
  await add('liabilities', fid, rajesh, { name: 'SBI home loan', kind: 'home_loan', outstanding: 2800000, emiMonthly: 32500, interestRatePct: 8.6, rateType: 'floating', remainingMonths: 138, lender: 'SBI', owners: own([rajesh, 50], [priya, 50]) });
  await add('liabilities', fid, rajesh, { name: 'Car loan (Creta)', kind: 'car_loan', outstanding: 420000, emiMonthly: 14200, interestRatePct: 9.4, rateType: 'fixed', remainingMonths: 34, lender: 'HDFC Bank', owners: own([rajesh, 100]) });
  await add('liabilities', fid, arjun, { name: 'Arjun credit card', kind: 'credit_card', outstanding: 38000, emiMonthly: 0, interestRatePct: 42, owners: own([arjun, 100]) });

  // Income and expenses
  await add('cashflows', fid, rajesh, { direction: 'income', category: 'salary', name: 'Rajesh salary', amount: 145000, owners: own([rajesh, 100]) });
  await add('cashflows', fid, priya, { direction: 'income', category: 'salary', name: 'Priya salary (school teacher)', amount: 62000, owners: own([priya, 100]) });
  await add('cashflows', fid, arjun, { direction: 'income', category: 'salary', name: 'Arjun salary', amount: 78000, owners: own([arjun, 100]) });
  // Dadi is a viewer, so the owner records her pension.
  await add('cashflows', fid, rajesh, { direction: 'income', category: 'pension', name: 'Dadi family pension', amount: 18000, owners: own([kamla, 100]) });
  await add('cashflows', fid, rajesh, { direction: 'expense', category: 'household', name: 'Groceries & household', amount: 38000, owners: own([rajesh, 50], [priya, 50]) });
  await add('cashflows', fid, rajesh, { direction: 'expense', category: 'utilities', name: 'Electricity, gas, internet, phones', amount: 9500, owners: own([rajesh, 50], [priya, 50]) });
  await add('cashflows', fid, rajesh, { direction: 'expense', category: 'education', name: "Younger daughter's school fees", amount: 96000, frequency: 'quarterly', owners: own([rajesh, 50], [priya, 50]) });
  await add('cashflows', fid, rajesh, { direction: 'expense', category: 'insurance', name: 'Family health + term insurance', amount: 64000, frequency: 'yearly', owners: own([rajesh, 100]) });
  await add('cashflows', fid, rajesh, { direction: 'expense', category: 'health', name: "Dadi's medicines", amount: 6500, owners: own([rajesh, 50], [priya, 50]) });
  await add('cashflows', fid, rajesh, { direction: 'expense', category: 'domestic help', name: 'Cook & cleaning', amount: 12000, owners: own([rajesh, 50], [priya, 50]) });
  await add('cashflows', fid, rajesh, { direction: 'expense', category: 'lifestyle', name: 'Eating out, OTT, outings', amount: 22000, essential: false, owners: own([rajesh, 50], [priya, 50]) });
  await add('cashflows', fid, arjun, { direction: 'expense', category: 'lifestyle', name: 'Arjun personal spending', amount: 25000, essential: false, owners: own([arjun, 100]) });
  await add('cashflows', fid, arjun, { direction: 'expense', category: 'investing', name: 'Arjun SIP contribution', amount: 15000, essential: false, owners: own([arjun, 100]) });
  await add('cashflows', fid, rajesh, { direction: 'expense', category: 'travel', name: 'Annual family trip', amount: 120000, frequency: 'yearly', essential: false, owners: own([rajesh, 50], [priya, 50]) });

  // Consents
  for (const u of [rajesh, priya, arjun]) { await consent(u.id, 'ai_analysis'); await consent(u.id, 'meko_context'); }

  // Decisions
  const car = await proposals.create(fid, arjun.id, { kind: 'purchase', title: 'Arjun: buy a ₹9 lakh car with savings', amount: 900000, description: 'Would like my own car for office commute.', decision: { fundFrom: 'liquid', assetValue: 600000 } }, IP);
  await proposals.comment(fid, priya.id, car.id, { body: 'That would empty most of our liquid savings. Can we look at a smaller car or a loan?' }, IP);
  await proposals.comment(fid, kamla.id, car.id, { body: 'Pehle emergency fund pura karo, beta.' }, IP);
  await proposals.vote(fid, rajesh.id, car.id, { vote: 'reject', note: 'Emergency cover would fall below 3 months.' }, IP);
  // One rejection is enough here: with 2 approvals required and only Rajesh and Priya eligible, it can no longer pass.

  const stock = await proposals.create(fid, rajesh.id, { kind: 'buy_stock', title: 'Add ₹1 lakh of ICICI Bank', amount: 100000, description: 'Banking looks under-weighted versus IT in my demat.', decision: { symbol: 'ICICIBANK', sector: 'Financial Services', fundFrom: 'liquid' } }, IP);
  await proposals.vote(fid, priya.id, stock.id, { vote: 'approve', note: 'OK if we keep 6 months of expenses in savings.' }, IP);
  await proposals.comment(fid, arjun.id, stock.id, { body: 'Maybe the Nifty ETF instead? Less single-stock risk.' }, IP);


  // Family context (Meko if enabled, otherwise local index)
  const ctx = [
    [rajesh, { kind: 'goal', title: 'Emergency fund target', body: 'Family goal: always keep at least 6 months of essential expenses in savings and FDs before any big purchase or investment.' }],
    [priya, { kind: 'goal', title: "Daughter's college fund", body: 'Save for younger daughter’s engineering college in 2031; target roughly 25 lakh in today’s money.' }],
    [rajesh, { kind: 'preference', title: 'Investment style', body: 'Prefer large-cap stocks and index funds. Avoid small caps, F&O and crypto. Keep any single stock under 15% of the portfolio.' }],
    [arjun, { kind: 'decision', title: 'Car purchase postponed', body: 'Family rejected buying a 9 lakh car from savings in October 2026 because emergency cover would drop below 3 months. Revisit after a year.' }],
    [priya, { kind: 'preference', title: 'Priya private note', body: 'Private: I want to keep my FD untouched as my personal safety net.', private: true }],
  ];
  let synced = 0;
  for (const [u, body] of ctx) {
    const r = await context.add(fid, u.id, body, IP);
    if (r.sync.status === 'synced') synced++;
  }
  return { fid, live, ctx: ctx.length, synced };
}

async function seedMehta() {
  const { rohan, neha } = USERS;
  const fam = await families.createFamily(rohan.id, 'Demo Mehta Family', IP);
  const fid = fam.id;
  await join(fid, rohan, neha, 'admin');
  await add('accounts', fid, rohan, { name: 'Kotak joint savings', kind: 'savings', value: 65000, owners: own([rohan, 50], [neha, 50]) });
  const demat = await add('accounts', fid, neha, { name: 'Neha Groww demat (manual)', kind: 'brokerage', institution: 'Groww', owners: own([neha, 100]) });
  const live = await addHoldings(fid, neha, demat.id, [
    { symbol: 'TMPV', sector: 'Automotive', quantity: 600, avgPrice: 310 },
    { symbol: 'ADANIENT', sector: 'Conglomerate', quantity: 40, avgPrice: 2600 },
  ]);
  // Rohan's small Zerodha account, also SIMULATED.
  const liveZ = await simulatedZerodha(rohan, fid, [
    { symbol: 'NIFTYBEES', sector: 'Diversified (index ETF)', instrument: 'etf', quantity: 60, avgPrice: 268 },
    { symbol: 'IRFC', sector: 'Financial Services', quantity: 150, avgPrice: 165 },
  ], 3500);
  await add('liabilities', fid, rohan, { name: 'Personal loan (wedding)', kind: 'personal_loan', outstanding: 520000, emiMonthly: 18500, interestRatePct: 14.5, remainingMonths: 32, owners: own([rohan, 100]) });
  await add('liabilities', fid, neha, { name: 'Credit card balance', kind: 'credit_card', outstanding: 64000, interestRatePct: 40, owners: own([neha, 100]) });
  await add('cashflows', fid, rohan, { direction: 'income', category: 'salary', name: 'Rohan salary (startup)', amount: 72000, owners: own([rohan, 100]) });
  await add('cashflows', fid, neha, { direction: 'income', category: 'freelance', name: 'Neha freelance design', amount: 30000, owners: own([neha, 100]) });
  await add('cashflows', fid, rohan, { direction: 'expense', category: 'housing', name: 'Rent (Bengaluru 2BHK)', amount: 38000, owners: own([rohan, 50], [neha, 50]) });
  await add('cashflows', fid, rohan, { direction: 'expense', category: 'household', name: 'Groceries, utilities, transport', amount: 31000, owners: own([rohan, 50], [neha, 50]) });
  await add('cashflows', fid, rohan, { direction: 'expense', category: 'lifestyle', name: 'Dining, shopping, subscriptions', amount: 21000, essential: false, owners: own([rohan, 50], [neha, 50]) });
  for (const u of [rohan, neha]) { await consent(u.id, 'ai_analysis'); await consent(u.id, 'meko_context'); }
  return { fid, live, liveZ };
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !args.has('--force')) {
    console.error('Refusing to seed demo users in production (the demo password is public). Use --force to override.');
    process.exit(1);
  }
  await migrate({ log: () => {} });
  if (args.has('--reset')) console.log(`Removed ${await resetDemo()} existing demo user(s).`);

  for (const k of Object.keys(USERS)) await ensureUser(k);
  if (Object.values(USERS).some((u) => u.existed)) {
    console.log('Demo users already exist. Run with --reset to recreate them and their families.');
  } else {
    const s = await seedSharma();
    console.log(`Demo Sharma Family: 4 members, ${s.live}/6 simulated-Zerodha holdings priced live, ${s.ctx} memories (${s.synced} synced to Meko).`);
    const m = await seedMehta();
    console.log(`Demo Mehta Family: 2 members, ${m.live}/2 Groww + ${m.liveZ}/2 simulated-Zerodha holdings priced live.`);
  }
  console.log(`\nSign in at the web app with any of these (password: ${PASSWORD}):`);
  console.table(Object.values(USERS).map((u) => ({ name: u.name, email: u.email })));
  console.log('Roles — Sharma: Rajesh owner, Priya admin, Arjun member, Kamla viewer. Mehta: Rohan owner, Neha admin.');
}

// Flaky networks (rotating public IPs) can drop the first connection; retry a few times.
(async () => {
  for (let attempt = 1; ; attempt++) {
    try {
      await main();
      await db.close();
      process.exit(0);
    } catch (err) {
      const transient = /Connection terminated|timeout|ECONNRESET|ETIMEDOUT/i.test(err.message);
      if (transient && attempt < 4) {
        console.log(`Connection problem (${err.message}); retrying (${attempt}/3)...`);
        await db.close().catch(() => {});
        if (!args.has('--reset')) args.add('--reset'); // partial data from the failed attempt is cleaned up
        continue;
      }
      console.error('Seeding failed:', err.message);
      await db.close().catch(() => {});
      process.exit(1);
    }
  }
})();
