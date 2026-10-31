import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity, AlertTriangle, ArrowUpRight, Banknote, Brain, ChevronRight, Flame, Hourglass, Landmark, LineChart as LineIcon,
  PieChart as PieIcon, Scale, Search, ShieldHalf, Siren, Sparkles, TrendingDown, Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import type { Dashboard } from '../lib/types';
import { dateTime, inr, inrCompact, label, months, pct } from '../lib/format';
import { Button, Card, Empty, ErrorState, Loading, Modal, Notice } from '../components/ui';
import { Gauge, ScoreBreakdown, ScoreChangeNote, SegmentBar, pillarTone } from '../components/Score';
import { ScopePicker } from '../components/ScopePicker';
import { PageHeader } from '../App';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)' };

export default function Overview() {
  const { familyId, scopeQuery, family } = useSession();
  const q = useQuery({
    queryKey: ['dashboard', familyId, scopeQuery],
    queryFn: () => api.get<Dashboard>(`/families/${familyId}/dashboard?${scopeQuery}`),
    enabled: Boolean(familyId),
  });
  return (
    <>
      <PageHeader title={family?.name || 'Overview'}><ScopePicker /></PageHeader>
      <div className="content">
        {q.isLoading && <Loading />}
        {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {q.data && <DashboardView d={q.data} />}
      </div>
    </>
  );
}

const TOOLS = [
  { to: '/stress', icon: Activity, cls: 'ic-blue', t: 'Stress Test', s: 'Crash, job loss, medical' },
  { to: '/invest', icon: Sparkles, cls: 'ic-violet', t: 'Evaluate Investment', s: 'AI agent · NSE / BSE' },
  { to: '/stress?tab=reverse', icon: Siren, cls: 'ic-orange', t: 'Breaking Point', s: 'Reverse stress test' },
  { to: '/decisions', icon: Scale, cls: 'ic-teal', t: 'Family Decisions', s: 'Propose & vote' },
  { to: '/forecast', icon: LineIcon, cls: 'ic-green', t: 'Price Ranges', s: 'Chronos forecasts' },
  { to: '/research', icon: Search, cls: 'ic-blue', t: 'Concall Research', s: 'Verified quotes' },
  { to: '/memory', icon: Brain, cls: 'ic-violet', t: 'Family Memory', s: 'Goals & decisions' },
];

function DashboardView({ d }: { d: Dashboard }) {
  const nav = useNavigate();
  const [why, setWhy] = useState(false);
  const p = d.position;
  const s = d.score;
  if (!s.hasData) {
    return (
      <Card>
        <Empty title="No financial records yet"
          action={<Link className="btn btn-primary btn-md" to="/records">Add accounts, loans and income</Link>}>
          Add bank balances, investments, loans, income and expenses. The dashboard, score and stress tests are calculated from these records.
        </Empty>
      </Card>
    );
  }
  const runway = p.runway;
  const alerts = buildAlerts(d);
  const kinds = Object.entries(p.assets.byKind).filter(([, v]) => v > 0).length;
  const declineCurve = [0, 10, 20, 30, 40, 50].map((x) => ({ x: `−${x}%`, value: Math.max(0, p.assets.equityExposure * (1 - x / 100)) }));
  const liquidity = [
    { name: 'Liquid', value: p.assets.liquid },
    { name: 'Semi-liquid', value: p.assets.semiLiquid },
    { name: 'Illiquid', value: p.assets.illiquid },
  ];
  const byKind = Object.entries(p.assets.byKind).filter(([, v]) => v > 0).map(([k, v]) => ({ name: label(k), value: v })).sort((a, b) => b.value - a.value);
  const cash = [
    { name: 'Income', value: p.cashflow.monthlyIncome },
    { name: 'Essential', value: p.cashflow.essentialExpenses },
    { name: 'Discretionary', value: p.cashflow.discretionaryExpenses },
    { name: 'EMIs', value: p.cashflow.monthlyEmi },
  ];
  const burn = p.cashflow.netBurn;

  return (
    <div className="stack">
      {/* Resilience hero */}
      <section className="card hero" aria-labelledby="score-title">
        <div className="stack-sm">
          <div className="eyebrow">Financial resilience</div>
          <h2 id="score-title" className="hero-title">Resilience score</h2>
          <p className="muted" style={{ margin: 0 }}>How well your {d.scope.type === 'family' ? 'family' : 'share of the family'} can absorb a shock, from five pillars.</p>
          <ScoreChangeNote change={d.scoreChange} />
          <div className="row" style={{ marginTop: 10 }}>
            <Button onClick={() => nav('/stress')}><ShieldHalf size={16} /> Simulate shock</Button>
            <Button variant="soft" onClick={() => setWhy(true)}>Why this score? <ChevronRight size={16} /></Button>
          </div>
        </div>
        <div className="stack-sm" style={{ alignItems: 'center' }}>
          <Gauge score={s.score} band={s.band} />
          <div style={{ width: '100%', maxWidth: 360 }}>
            <SegmentBar report={s} />
            <div className="row-between small muted" style={{ marginTop: 8 }}>
              <span>{s.pillars.filter((x) => pillarTone(x) === 'good').length} of 5 pillars strong</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setWhy(true)}>See breakdown <ChevronRight size={14} /></button>
            </div>
          </div>
        </div>
      </section>

      {/* Strategic tools */}
      <div className="section-head"><div><h2>Strategic tools</h2><p>Simulations and intelligence on your real numbers</p></div></div>
      <div className="tool-scroll">
        {TOOLS.map(({ to, icon: Icon, cls, t, s: sub }) => (
          <Link key={t} to={to} className="tool-card">
            <div className="row-between"><span className={`icon-disc lg ${cls}`}><Icon size={22} /></span><ArrowUpRight size={18} color="var(--text-3)" /></div>
            <div><div className="t">{t}</div><div className="s">{sub}</div></div>
          </Link>
        ))}
      </div>

      {/* Needs attention */}
      {alerts.length > 0 && (
        <>
          <div className="section-head"><div><h2>Needs attention</h2><p>{alerts.length} proactive resilience recommendation{alerts.length > 1 ? 's' : ''}</p></div></div>
          <div className="alert-scroll">
            {alerts.map((a) => (
              <div key={a.title} className={`alert-card ${a.level === 'warn' ? 'warn' : ''}`}>
                <div className="t"><a.icon size={18} color={a.level === 'warn' ? 'var(--warn)' : 'var(--bad)'} /> {a.title}</div>
                <div className="b">{a.text}</div>
                <div><Link to={a.to} className={`btn btn-sm ${a.level === 'warn' ? 'btn-soft' : 'btn-danger'}`}>{a.cta}</Link></div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Financial position */}
      <div className="section-head"><div><h2>Financial position</h2><p>Tap any tile to inspect or adjust</p></div></div>
      <div className="grid grid-4">
        <Link to="/records" className="tile">
          <div className="tile-head"><span className="icon-disc ic-blue"><Landmark size={18} /></span>Net worth</div>
          <div className="tile-value num">{inrCompact(p.netWorth)}</div>
          <div className="tile-hint">{inrCompact(p.assets.total)} assets − {inrCompact(p.liabilities.total)} debt</div>
        </Link>
        <Link to="/records" className="tile">
          <div className="tile-head"><span className="icon-disc ic-green"><Banknote size={18} /></span>Liquid money</div>
          <div className="tile-value num">{inrCompact(p.assets.liquid)}</div>
          <div className="tile-hint">+ {inrCompact(p.assets.semiLiquid)} in FDs & investments</div>
        </Link>
        <Link to="/records" className="tile">
          <div className="tile-head"><span className="icon-disc ic-orange"><Flame size={18} /></span>{burn > 0 ? 'Monthly burn' : 'Monthly savings'}</div>
          <div className="tile-value num" style={{ color: burn > 0 ? 'var(--bad)' : 'var(--good)' }}>{burn > 0 ? `${inrCompact(burn)}/mo` : `${inrCompact(p.cashflow.monthlySavings)}/mo`}</div>
          <div className="tile-hint">{p.cashflow.monthlyIncome <= 0 ? 'No income recorded' : burn > 0 ? `Spending is ${pct((burn / p.cashflow.monthlyIncome) * 100, 0)} above income` : `${pct(p.cashflow.savingsRatePct)} of income saved`}</div>
        </Link>
        <Link to="/stress" className="tile">
          <div className="tile-head"><span className="icon-disc ic-teal"><Hourglass size={18} /></span>Runway if income stops</div>
          <div className="tile-value num">{months(runway.ifIncomeStopsMonths)}</div>
          <div className="tile-hint">{months(runway.withSemiLiquidMonths)} including FDs & investments</div>
        </Link>
      </div>

      {/* Charts */}
      <div className="grid grid-3">
        <Card title="Portfolio volatility exposure" subtitle="Equity value as markets fall" className="span-2"
          actions={<Link to="/stress" className="btn btn-ghost btn-sm">Full stress test <ChevronRight size={14} /></Link>}>
          {p.assets.equityExposure <= 0 ? <p className="muted">No market investments recorded.</p> : (
            <div className="chart-box">
              <ResponsiveContainer>
                <AreaChart data={declineCurve} margin={{ left: 4, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="x" tick={{ fill: 'var(--text-3)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={inrCompact} tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip formatter={(v) => inr(Number(v))} labelFormatter={(l) => `Market ${l}`} contentStyle={tooltipStyle} />
                  <Area type="linear" dataKey="value" name="Equity value" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#volFill)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card title="Monthly cash flow">
          <dl className="kv">
            {cash.map((c) => <Fragment key={c.name}><dt>{c.name}</dt><dd>{inr(c.value)}</dd></Fragment>)}
            <dt><strong>Net</strong></dt><dd style={{ color: p.cashflow.monthlySavings >= 0 ? 'var(--good)' : 'var(--bad)' }}>{inr(p.cashflow.monthlySavings)}</dd>
          </dl>
          <div className="divider" style={{ margin: '14px 0' }} />
          <dl className="kv">
            <dt>EMI share of income</dt><dd>{p.cashflow.monthlyIncome > 0 ? pct((p.cashflow.monthlyEmi / p.cashflow.monthlyIncome) * 100) : '—'}</dd>
            <dt>Total debt</dt><dd>{inr(p.liabilities.total)}</dd>
            <dt>Current burn runway</dt><dd>{runway.state === 'self_sustaining' ? 'Income covers outflows' : months(runway.currentBurnMonths)}</dd>
          </dl>
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Where the money is" subtitle="By liquidity">
          <div className="chart-box" style={{ height: 230 }}>
            <ResponsiveContainer>
              <BarChart data={liquidity} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-2)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={inrCompact} tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                <Tooltip formatter={(v) => inr(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
                <Bar dataKey="value" radius={[10, 10, 4, 4]} maxBarSize={72} isAnimationActive={false}>{liquidity.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Assets by type" subtitle={`${kinds} asset type${kinds === 1 ? '' : 's'}`}>
          <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
            <div style={{ width: 180, height: 180, flex: 'none' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byKind} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="var(--surface)" isAnimationActive={false}>
                    {byKind.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => inr(Number(v))} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="list-plain small" style={{ flex: 1, minWidth: 0 }}>
              {byKind.map((k, i) => (
                <li key={k.name} className="row-between" style={{ flexWrap: 'nowrap' }}>
                  <span className="row" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flex: 'none' }} /><span className="break">{k.name}</span></span>
                  <strong className="num">{inrCompact(k.value)}</strong>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <Notice tone="info">
        <span className="row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}><Wallet size={16} style={{ flex: 'none', marginTop: 2 }} />
          <span>{d.privacyNote}
            {d.freshness.holdingsCount > 0 && <> · Prices: {d.freshness.holdingsWithoutMarketPrice > 0 ? `${d.freshness.holdingsWithoutMarketPrice} holding(s) valued at purchase price. ` : ''}oldest market price {dateTime(d.freshness.oldestPriceAsOf)}.</>}
          </span></span>
      </Notice>

      <Modal title="Score Breakdown" open={why} onClose={() => setWhy(false)}>
        <ScoreBreakdown report={s} change={d.scoreChange} />
      </Modal>
    </div>
  );
}

type Alert = { title: string; text: string; cta: string; to: string; icon: typeof AlertTriangle; level: 'bad' | 'warn' };

/** Turns the weakest areas into actionable cards. */
function buildAlerts(d: Dashboard): Alert[] {
  const p = d.position;
  const out: Alert[] = [];
  const get = (k: string) => d.score.pillars.find((x) => x.key === k);
  if (p.cashflow.netBurn > 0) {
    out.push({ title: 'Negative monthly cash flow', text: `Outflows (${inr(p.cashflow.monthlyOutflows)}) exceed income by ${inr(p.cashflow.netBurn)}/month.`, cta: 'Plan recovery', to: '/stress', icon: Flame, level: 'bad' });
  }
  const em = get('emergency');
  const cover = em?.metrics.coverageMonths;
  if (typeof cover === 'number' && cover < 6) {
    out.push({ title: 'Low emergency cover', text: `Liquid cash covers ${cover.toFixed(1)} months of essential costs (target 6).`, cta: 'Simulate shock', to: '/stress', icon: Siren, level: cover < 3 ? 'bad' : 'warn' });
  }
  const emi = get('debt')?.metrics.emiToIncomePct;
  if (typeof emi === 'number' && emi > 30) {
    out.push({ title: 'High EMI burden', text: `EMIs take ${pct(emi)} of monthly income.`, cta: 'Review loans', to: '/records', icon: AlertTriangle, level: emi > 45 ? 'bad' : 'warn' });
  }
  const div = get('diversification');
  if (div && div.points < 10 && div.metrics.topStock) {
    out.push({ title: 'Concentrated portfolio', text: `${div.metrics.topStock.symbol} is ${pct(div.metrics.topStock.weightPct)} of equity; ${div.metrics.topSector?.sector} is ${pct(div.metrics.topSector?.weightPct)}.`, cta: 'Inspect holdings', to: '/records', icon: PieIcon, level: 'warn' });
  }
  const dd = get('shock')?.metrics.netWorthDrawdownPct;
  if (typeof dd === 'number' && dd > 15) {
    out.push({ title: 'Exposed to a market crash', text: `A 30% crash would cut net worth by ${pct(dd)}.`, cta: 'Run crash test', to: '/stress', icon: TrendingDown, level: 'warn' });
  }
  return out;
}
