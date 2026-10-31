// Dashboard: the financial command center.
// Every figure comes from the dashboard API (the deterministic engines). Where
// FinSight has no history for a figure it shows shares and ratios rather than
// invented trends; the only trend shown is the resilience score's own history.
import { lazy, Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, Brain, Building2, CheckCircle2, ChevronRight, CircleDollarSign, Coins, Flame,
  Hourglass, Landmark, Lightbulb, LineChart as LineIcon, MessageCircle, PieChart as PieIcon, PiggyBank, Receipt, Scale, Search, ShieldHalf,
  Siren, Sparkles, TrendingDown, Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import type { Cashflow, Dashboard, Pillar } from '../lib/types';
import { dateTime, inr, inrCompact, label, months, pct } from '../lib/format';
import { Button, Card, Empty, ErrorState, Loading, Modal, Notice } from '../components/ui';
import { Gauge, ScoreBreakdown, ScoreChangeNote, SegmentBar, pillarTone } from '../components/Score';
import { ScopePicker } from '../components/ScopePicker';
import CountUp from '../components/CountUp';
import { hasWebGL } from '../lib/webgl';
import type { AllocationItem } from '../components/three/AllocationScene';
import { PageHeader } from '../App';

const AllocationScene = lazy(() => import('../components/three/AllocationScene'));

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];
// Hex versions for WebGL (CSS variables can't be read by three.js).
const HEX = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)' };
const PER_MONTH: Record<string, number> = { monthly: 1, quarterly: 1 / 3, half_yearly: 1 / 6, yearly: 1 / 12 };

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
  { to: '/', icon: MessageCircle, cls: 'ic-violet', t: 'Ask FinSight', s: 'Voice & chat advisor' },
  { to: '/stress', icon: Activity, cls: 'ic-blue', t: 'Stress Test', s: 'Crash, job loss, medical' },
  { to: '/invest', icon: Sparkles, cls: 'ic-violet', t: 'Evaluate Investment', s: 'Agent · NSE / BSE' },
  { to: '/stress?tab=reverse', icon: Siren, cls: 'ic-orange', t: 'Breaking Point', s: 'Reverse stress test' },
  { to: '/decisions', icon: Scale, cls: 'ic-teal', t: 'Family Decisions', s: 'Propose & vote' },
  { to: '/forecast', icon: LineIcon, cls: 'ic-green', t: 'Price Ranges', s: 'Chronos forecasts' },
  { to: '/research', icon: Search, cls: 'ic-blue', t: 'Concall Research', s: 'Verified quotes' },
  { to: '/memory', icon: Brain, cls: 'ic-violet', t: 'Memory', s: 'What FinSight remembers' },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/* ------------------------------------------------------------------ hero --- */
function CommandCenter({ d, onWhy }: { d: Dashboard; onWhy: () => void }) {
  const { user, family } = useSession();
  const nav = useNavigate();
  const p = d.position;
  const s = d.score;
  const [hover, setHover] = useState<AllocationItem | null>(null);
  const webgl = useMemo(hasWebGL, []);
  const alloc: AllocationItem[] = Object.entries(p.assets.byKind).filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ key: k, label: label(k), value: v, color: HEX[i % HEX.length] }));
  const total = p.assets.total || 1;
  const delta = d.scoreChange?.delta;
  const scoreTone = s.score >= 70 ? 'good' : s.score >= 45 ? 'warn' : 'bad';
  const sr = p.cashflow.savingsRatePct;
  return (
    <section className="cc-hero reveal" aria-label="Financial command center">
      <div className="copy">
        <div className="hello">{greeting()}, <strong>{user?.name.split(' ')[0]}</strong> · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div className="nw-label">{d.scope.type === 'family' ? `${family?.name || 'Family'} net worth` : 'Your net worth'}</div>
        <div className="nw"><CountUp value={p.netWorth} format={inrCompact} /></div>
        <div className="nw-sub">{inrCompact(p.assets.total)} in assets · {inrCompact(p.liabilities.total)} in liabilities</div>
        <div className="pills">
          <span className={`pill ${scoreTone}`}><ShieldHalf size={13} /> Resilience {Math.round(s.score)}/100 · {label(s.band)}
            {typeof delta === 'number' && delta !== 0 && <> · {delta > 0 ? '+' : ''}{delta.toFixed(1)}</>}</span>
          <span className={`pill ${sr == null ? '' : sr >= 20 ? 'good' : sr >= 0 ? 'warn' : 'bad'}`}><PiggyBank size={13} /> Saving {sr == null ? '—' : pct(sr, 0)} of income</span>
          <span className="pill"><Hourglass size={13} /> {months(p.runway.ifIncomeStopsMonths)} runway</span>
        </div>
        <div className="actions">
          <Button className="btn-glass" onClick={() => nav('/')}><MessageCircle size={16} /> Ask FinSight</Button>
          <Button className="btn-glass" onClick={() => nav('/stress')}><ShieldHalf size={16} /> Simulate a shock</Button>
          <Button className="btn-glass" onClick={onWhy}>Why this score? <ChevronRight size={16} /></Button>
        </div>
      </div>
      <div className="cc-scene">
        {alloc.length > 0 && webgl && (
          <Suspense fallback={null}><AllocationScene items={alloc} onHover={setHover} hovered={hover?.key || null} /></Suspense>
        )}
        {hover ? (
          <div className="cc-tip" role="status"><span className="small">{hover.label}</span><strong>{inr(hover.value)}</strong><span className="small">{pct((hover.value / total) * 100)} of assets</span></div>
        ) : alloc.length > 0 && webgl && <div className="cc-hint">Hover a sphere · size = share of assets</div>}
        <div className="cc-legend" aria-label="Asset allocation">
          {alloc.map((a) => <span key={a.key}><i style={{ background: a.color }} />{a.label} {pct((a.value / total) * 100, 0)}</span>)}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ KPIs --- */
function Kpi({ to, icon: Icon, tone, title, value, format = inrCompact, sub, share, shareColor, trend }: {
  to: string; icon: typeof Wallet; tone: string; title: string; value: number | null; format?: (v: number) => string; sub?: string;
  share?: number | null; shareColor?: string; trend?: { dir: 'up' | 'down' | 'flat'; text: string } | null;
}) {
  return (
    <Link to={to} className="kpi">
      <div className="kpi-top">
        <span className="kpi-label"><span className={`icon-disc ${tone}`}><Icon size={16} /></span>{title}</span>
        {trend && <span className={`trend ${trend.dir}`}>{trend.dir === 'up' ? <ArrowUpRight size={12} /> : trend.dir === 'down' ? <ArrowDownRight size={12} /> : null}{trend.text}</span>}
      </div>
      <div className="kpi-value">{value == null ? '—' : <CountUp value={value} format={format} />}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {share != null && <div className="kpi-bar" aria-hidden><span style={{ width: `${Math.max(0, Math.min(100, share))}%`, background: shareColor || 'var(--chart-1)' }} /></div>}
    </Link>
  );
}

function KpiGrid({ d }: { d: Dashboard }) {
  const p = d.position;
  const a = p.assets.total || 0;
  const share = (v: number) => (a > 0 ? (v / a) * 100 : null);
  const inc = p.cashflow.monthlyIncome;
  const out = p.cashflow.monthlyOutflows;
  const sr = p.cashflow.savingsRatePct;
  return (
    <div className="kpi-grid">
      <Kpi to="/records" icon={Landmark} tone="ic-blue" title="Net worth" value={p.netWorth} sub="Assets minus liabilities" />
      <Kpi to="/records" icon={Building2} tone="ic-teal" title="Total assets" value={a} sub={`${Object.values(p.assets.byKind).filter((v) => v > 0).length} asset types`} />
      <Kpi to="/records" icon={Receipt} tone="ic-red" title="Total liabilities" value={p.liabilities.total} sub={a > 0 ? `${pct((p.liabilities.total / a) * 100)} of assets` : undefined} share={a > 0 ? (p.liabilities.total / a) * 100 : null} shareColor="var(--bad)" />
      <Kpi to="/records" icon={Banknote} tone="ic-green" title="Liquid assets" value={p.assets.liquid} sub={a > 0 ? `${pct(share(p.assets.liquid))} of assets · cash & savings` : 'Cash & savings'} share={share(p.assets.liquid)} shareColor="var(--chart-2)" />
      <Kpi to="/records" icon={Coins} tone="ic-orange" title="Semi-liquid" value={p.assets.semiLiquid} sub={a > 0 ? `${pct(share(p.assets.semiLiquid))} · FDs, funds, stocks` : 'FDs, funds, stocks'} share={share(p.assets.semiLiquid)} shareColor="var(--chart-3)" />
      <Kpi to="/records" icon={Building2} tone="ic-violet" title="Illiquid" value={p.assets.illiquid} sub={a > 0 ? `${pct(share(p.assets.illiquid))} · property, gold, retirement` : 'Property, gold, retirement'} share={share(p.assets.illiquid)} shareColor="var(--chart-4)" />
      <Kpi to="/records" icon={CircleDollarSign} tone="ic-green" title="Monthly income" value={inc} format={(v) => `${inrCompact(v)}/mo`} sub={inc > 0 ? 'Salary, pension, other' : 'No income recorded'} />
      <Kpi to="/records" icon={Flame} tone="ic-orange" title="Monthly outflows" value={out} format={(v) => `${inrCompact(v)}/mo`}
        sub={`${inrCompact(p.cashflow.monthlyExpenses)} expenses + ${inrCompact(p.cashflow.monthlyEmi)} EMIs`} share={inc > 0 ? (out / inc) * 100 : null} shareColor={out > inc ? 'var(--bad)' : 'var(--chart-3)'} />
      <Kpi to="/records" icon={PiggyBank} tone="ic-teal" title="Savings rate" value={sr} format={(v) => pct(v, 1)}
        sub={sr == null ? 'Add income to see this' : `${inrCompact(p.cashflow.monthlySavings)}/mo ${p.cashflow.monthlySavings >= 0 ? 'saved' : 'short'}`}
        trend={sr == null ? null : sr >= 20 ? { dir: 'up', text: 'Healthy' } : sr >= 0 ? { dir: 'flat', text: 'Below 20%' } : { dir: 'down', text: 'Negative' }}
        share={sr == null ? null : Math.max(0, sr)} shareColor="var(--chart-6)" />
    </div>
  );
}

/* --------------------------------------------------------------- health --- */
function HealthSection({ d, onWhy }: { d: Dashboard; onWhy: () => void }) {
  const { familyId, scopeQuery } = useSession();
  const hist = useQuery({ queryKey: ['score-history', familyId, scopeQuery], queryFn: () => api.get<{ history: { score: number; at: string }[] }>(`/families/${familyId}/score/history?${scopeQuery}`).then((r) => r.history) });
  const p = d.position;
  const s = d.score;
  const get = (k: string) => s.pillars.find((x) => x.key === k);
  const cover = get('emergency')?.metrics.coverageMonths as number | undefined;
  const debtAsset = p.assets.total > 0 ? (p.liabilities.total / p.assets.total) * 100 : null;
  const liquidity = p.assets.total > 0 ? (p.assets.liquid / p.assets.total) * 100 : null;
  const div = get('diversification');
  const ratios: { name: string; value: string; tone: string; target: string; text: string }[] = [
    { name: 'Emergency fund coverage', value: typeof cover === 'number' ? `${cover.toFixed(1)} mo` : '—', tone: typeof cover === 'number' ? (cover >= 6 ? 'good' : cover >= 3 ? 'warn' : 'bad') : '',
      target: 'Target: 6 months', text: 'Liquid money ÷ essential monthly costs (essential expenses + EMIs). How long you can cover the basics with cash alone.' },
    { name: 'Debt-to-asset ratio', value: debtAsset == null ? '—' : pct(debtAsset), tone: debtAsset == null ? '' : debtAsset <= 30 ? 'good' : debtAsset <= 50 ? 'warn' : 'bad',
      target: 'Comfortable: under 30%', text: 'Total loans ÷ total assets. Lower means more of what you own is truly yours.' },
    { name: 'Savings rate', value: p.cashflow.savingsRatePct == null ? '—' : pct(p.cashflow.savingsRatePct), tone: p.cashflow.savingsRatePct == null ? '' : p.cashflow.savingsRatePct >= 20 ? 'good' : p.cashflow.savingsRatePct >= 0 ? 'warn' : 'bad',
      target: 'Healthy: 20% or more', text: '(Income − expenses − EMIs) ÷ income, per month.' },
    { name: 'Liquidity ratio', value: liquidity == null ? '—' : pct(liquidity), tone: liquidity == null ? '' : liquidity >= 10 ? 'good' : 'warn',
      target: 'At least 10% of assets', text: 'Cash and savings ÷ total assets. Money you can use the same day without selling anything.' },
    { name: 'Investment diversification', value: div ? `${div.points.toFixed(0)}/${div.max}` : '—', tone: div ? toneOf(div) : '',
      target: div?.metrics.topStock ? `Largest stock: ${div.metrics.topStock.symbol} at ${pct(div.metrics.topStock.weightPct)}` : 'Spread across stocks & sectors',
      text: 'How spread your market investments are across single stocks and sectors (a pillar of the score).' },
    { name: 'Financial resilience', value: `${Math.round(s.score)}/100`, tone: s.score >= 70 ? 'good' : s.score >= 45 ? 'warn' : 'bad',
      target: label(s.band), text: 'The overall score from five pillars: emergency cash, cash flow, debt, diversification and market-shock absorption.' },
  ];
  const h = hist.data || [];
  return (
    <>
      <div className="section-head"><div><h2>Financial health</h2><p>What each number means, and what good looks like</p></div></div>
      <div className="grid grid-3">
        <section className="card hero-score reveal" aria-labelledby="score-title" style={{ padding: 22 }}>
          <div className="eyebrow">Financial resilience</div>
          <h2 id="score-title" className="hero-title" style={{ marginBottom: 6 }}>Resilience score</h2>
          <div style={{ display: 'grid', placeItems: 'center' }}><Gauge score={s.score} band={s.band} size={190} /></div>
          <SegmentBar report={s} />
          <div className="row-between small muted" style={{ marginTop: 8 }}>
            <span>{s.pillars.filter((x) => pillarTone(x) === 'good').length} of 5 pillars strong</span>
            <button className="btn btn-ghost btn-sm" onClick={onWhy}>See breakdown <ChevronRight size={14} /></button>
          </div>
          <ScoreChangeNote change={d.scoreChange} />
          {h.length >= 2 && (
            <div style={{ height: 56, marginTop: 8 }} aria-label="Score history">
              <ResponsiveContainer>
                <LineChart data={h.map((x) => ({ at: x.at, score: x.score }))}>
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}`, 'Score']} labelFormatter={(l) => dateTime(String(l))} contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="score" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        <div className="health-grid span-2">
          {ratios.map((r) => (
            <div key={r.name} className="health">
              <div className="h-top"><span className="h-name">{r.name}</span><span className="h-val" style={{ color: r.tone ? `var(--${r.tone})` : undefined }}>{r.value}</span></div>
              <div className="h-target">{r.target}</div>
              <p>{r.text}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
const toneOf = (p: Pillar) => { const t = pillarTone(p); return t === 'good' ? 'good' : t === 'ok' ? 'warn' : 'bad'; };

/* ------------------------------------------------------------- insights --- */
type Insight = { kind: 'good' | 'warn' | 'bad' | 'tip'; title: string; text: string; data?: string; to?: string; cta?: string };

function buildInsights(d: Dashboard): Insight[] {
  const out: Insight[] = buildAlerts(d).map((a) => ({ kind: a.level === 'bad' ? 'bad' : 'warn', title: a.title, text: a.text, to: a.to, cta: a.cta }));
  const p = d.position;
  const get = (k: string) => d.score.pillars.find((x) => x.key === k);
  const cover = get('emergency')?.metrics.coverageMonths;
  if (typeof cover === 'number' && cover >= 6) out.push({ kind: 'good', title: 'Emergency fund is on target', text: `Liquid money covers ${cover.toFixed(1)} months of essential costs, above the 6-month target.`, data: `Liquid: ${inr(p.assets.liquid)}` });
  if (p.cashflow.savingsRatePct != null && p.cashflow.savingsRatePct >= 20) out.push({ kind: 'good', title: 'Strong savings rate', text: `You keep ${pct(p.cashflow.savingsRatePct)} of income each month.`, data: `${inr(p.cashflow.monthlySavings)}/month` });
  const emi = get('debt')?.metrics.emiToIncomePct;
  if (typeof emi === 'number' && emi <= 30 && p.liabilities.total > 0) out.push({ kind: 'good', title: 'Loans are affordable', text: `EMIs take ${pct(emi)} of income, within the 30% comfort zone.`, data: `EMIs: ${inr(p.cashflow.monthlyEmi)}/month` });
  for (const a of d.score.topActions.slice(0, 2)) out.push({ kind: 'tip', title: 'Recommendation', text: a.text, data: `Could add about ${a.pointsGain.toFixed(1)} points to the score`, to: '/stress', cta: 'Test it' });
  return out;
}

/* ------------------------------------------------------------ portfolio --- */
function PortfolioSection({ d }: { d: Dashboard }) {
  const p = d.position;
  const positions = p.positions || [];
  const bySector = Object.entries(positions.reduce<Record<string, number>>((m, x) => { m[x.sector] = (m[x.sector] || 0) + x.equityValue; return m; }, {}))
    .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const sectorTotal = bySector.reduce((s, [, v]) => s + v, 0) || 1;
  const top = [...positions].sort((a, b) => b.value - a.value).slice(0, 8);
  const topTotal = positions.reduce((s, x) => s + x.value, 0) || 1;
  const byKind = Object.entries(p.assets.byKind).filter(([, v]) => v > 0).map(([k, v]) => ({ name: label(k), value: v })).sort((a, b) => b.value - a.value);
  const declineCurve = [0, 10, 20, 30, 40, 50].map((x) => ({ x: `−${x}%`, value: Math.max(0, p.assets.equityExposure * (1 - x / 100)) }));
  return (
    <>
      <div className="section-head"><div><h2>Portfolio</h2><p>Allocation, sectors, holdings and market risk</p></div>
        <Link to="/invest" className="btn btn-ghost btn-sm">Evaluate an investment <ChevronRight size={14} /></Link></div>
      <div className="grid grid-3">
        <Card title="Asset allocation" subtitle={`${byKind.length} asset type${byKind.length === 1 ? '' : 's'}`}>
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byKind} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="var(--surface)" isAnimationActive={false}>
                  {byKind.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => inr(Number(v))} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="list-plain small">
            {byKind.map((k, i) => (
              <li key={k.name} className="row-between" style={{ flexWrap: 'nowrap' }}>
                <span className="row" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flex: 'none' }} /><span className="break">{k.name}</span></span>
                <strong className="num">{inrCompact(k.value)}</strong>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Sector exposure" subtitle={positions.length ? `Equity: ${inrCompact(p.assets.equityExposure)}` : 'No market investments'}>
          {bySector.length === 0 ? <p className="muted">Add holdings or equity funds to see sector exposure.</p> : (
            <ul className="rank-list">
              {bySector.slice(0, 7).map(([sec, v], i) => (
                <li key={sec}><span className="break">{sec}</span><strong className="num">{pct((v / sectorTotal) * 100, 0)}</strong>
                  <div className="bar"><span style={{ width: `${(v / sectorTotal) * 100}%`, background: COLORS[i % COLORS.length] }} /></div></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Largest investments" subtitle="By current value">
          {top.length === 0 ? <p className="muted">No investments recorded.</p> : (
            <ul className="rank-list">
              {top.map((x, i) => (
                <li key={`${x.accountId}-${x.symbol || x.name}-${i}`}>
                  <span className="break"><strong>{x.symbol || x.name}</strong> <span className="small muted">{x.symbol ? x.sector : label(x.instrument)}</span></span>
                  <strong className="num">{inrCompact(x.value)}</strong>
                  <div className="bar"><span style={{ width: `${(x.value / topTotal) * 100}%`, background: 'var(--chart-1)' }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="Risk exposure" subtitle="Value of your market investments if markets fall"
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
        <p className="small muted" style={{ margin: '8px 0 0' }}>FinSight doesn't keep a price history of your portfolio yet, so past performance isn't shown. Values use the latest market prices.</p>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------ cash flow --- */
function CashFlowSection({ d }: { d: Dashboard }) {
  const { familyId, scope, user } = useSession();
  const cf = useQuery({ queryKey: ['records', familyId, 'cashflows'], queryFn: () => api.get<{ cashflows: Cashflow[] }>(`/families/${familyId}/cashflows`).then((r) => r.cashflows) });
  const p = d.position;
  // Weight each item by the viewer's scope: whole family, or one member's share.
  const who = scope.scope === 'individual' ? (scope.userId || user?.id) : null;
  const weight = (c: Cashflow) => (who ? (c.owners.find((o) => o.userId === who)?.sharePct || 0) / 100 : 1);
  const expenses = (cf.data || []).filter((c) => c.direction === 'expense' && weight(c) > 0);
  const byCat = Object.entries(expenses.reduce<Record<string, number>>((m, c) => { m[c.category] = (m[c.category] || 0) + c.amount * (PER_MONTH[c.frequency] ?? 1) * weight(c); return m; }, {}))
    .sort((a, b) => b[1] - a[1]);
  const catTotal = byCat.reduce((s, [, v]) => s + v, 0) || 1;
  const recurring = [...expenses].sort((a, b) => b.amount * (PER_MONTH[b.frequency] ?? 1) - a.amount * (PER_MONTH[a.frequency] ?? 1)).slice(0, 6);
  const emis = (p.liabilityItems || []).filter((l) => l.emi > 0).sort((a, b) => b.emi - a.emi);
  const bars = [
    { name: 'Income', value: p.cashflow.monthlyIncome, fill: 'var(--chart-2)' },
    { name: 'Essential', value: p.cashflow.essentialExpenses, fill: 'var(--chart-1)' },
    { name: 'Lifestyle', value: p.cashflow.discretionaryExpenses, fill: 'var(--chart-4)' },
    { name: 'EMIs', value: p.cashflow.monthlyEmi, fill: 'var(--chart-3)' },
  ];
  return (
    <>
      <div className="section-head"><div><h2>Cash flow</h2><p>Monthly equivalents of your recorded income, expenses and EMIs</p></div>
        <Link to="/records" className="btn btn-ghost btn-sm">Edit income & expenses <ChevronRight size={14} /></Link></div>
      <div className="grid grid-3">
        <Card title="Income vs outflows" subtitle={`Net ${p.cashflow.monthlySavings >= 0 ? 'saving' : 'shortfall'}: ${inr(Math.abs(p.cashflow.monthlySavings))}/month`}>
          <div className="chart-box" style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={bars} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-2)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={inrCompact} tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={(v) => `${inr(Number(v))}/mo`} contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
                <Bar dataKey="value" radius={[10, 10, 4, 4]} maxBarSize={56} isAnimationActive={false}>{bars.map((b, i) => <Cell key={i} fill={b.fill} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Expense categories" subtitle="Share of monthly expenses">
          {cf.isLoading ? <Loading /> : byCat.length === 0 ? <p className="muted">No expenses recorded.</p> : (
            <ul className="rank-list">
              {byCat.slice(0, 7).map(([cat, v], i) => (
                <li key={cat}><span className="break" style={{ textTransform: 'capitalize' }}>{label(cat)}</span><strong className="num">{inrCompact(v)}/mo</strong>
                  <div className="bar"><span style={{ width: `${(v / catTotal) * 100}%`, background: COLORS[i % COLORS.length] }} /></div></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Regular payments" subtitle="EMIs and recurring bills">
          {emis.length === 0 && recurring.length === 0 ? <p className="muted">Nothing recorded yet.</p> : (
            <ul className="pay-list">
              {emis.map((l) => <li key={l.id}><span className="break"><strong>{l.name}</strong><br /><span className="small muted">EMI · monthly</span></span><strong className="num">{inr(l.emi)}</strong></li>)}
              {recurring.map((c) => <li key={c.id}><span className="break"><strong>{c.name}</strong><br /><span className="small muted">{label(c.category)} · {label(c.frequency)}{c.essential ? '' : ' · optional'}</span></span><strong className="num">{inr(c.amount * weight(c))}</strong></li>)}
            </ul>
          )}
          <p className="small muted" style={{ margin: '8px 0 0' }}>Due dates aren't tracked, so these are shown by size, not by date.</p>
        </Card>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- page --- */
function DashboardView({ d }: { d: Dashboard }) {
  const [why, setWhy] = useState(false);
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
  const insights = buildInsights(d);
  const alerts = insights.filter((i) => i.kind === 'bad' || i.kind === 'warn');
  return (
    <div className="stack">
      <CommandCenter d={d} onWhy={() => setWhy(true)} />
      <div className="reveal reveal-2"><KpiGrid d={d} /></div>

      {insights.length > 0 && (
        <div className="reveal reveal-3 stack-sm">
          <div className="section-head"><div><h2>{alerts.length > 0 ? 'Needs attention' : 'Insights'}</h2>
            <p>Calculated from your records by FinSight's engines{alerts.length ? ` · ${alerts.length} to act on` : ''}</p></div>
            <Link to="/" className="btn btn-ghost btn-sm"><MessageCircle size={14} /> Discuss with FinSight</Link></div>
          <div className="insight-grid">
            {insights.map((i) => (
              <article key={`${i.kind}-${i.title}-${i.text}`} className={`insight ${i.kind}`}>
                <span className="i-kind">
                  {i.kind === 'good' ? <CheckCircle2 size={13} /> : i.kind === 'tip' ? <Lightbulb size={13} /> : i.kind === 'bad' ? <Siren size={13} /> : <AlertTriangle size={13} />}
                  {i.kind === 'good' ? 'Positive' : i.kind === 'tip' ? 'Recommendation' : i.kind === 'bad' ? 'Critical' : 'Warning'}
                </span>
                <h3>{i.title}</h3>
                <p>{i.text}</p>
                {i.data && <span className="i-data">{i.data}</span>}
                {i.to && <div className="i-foot"><Link to={i.to} className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>{i.cta} <ChevronRight size={14} /></Link></div>}
              </article>
            ))}
          </div>
        </div>
      )}

      <div className="reveal reveal-4 stack"><HealthSection d={d} onWhy={() => setWhy(true)} /></div>
      <div className="stack"><PortfolioSection d={d} /></div>
      <div className="stack"><CashFlowSection d={d} /></div>

      <div className="section-head"><div><h2>Strategic tools</h2><p>Simulations and intelligence on your real numbers</p></div></div>
      <div className="tool-scroll">
        {TOOLS.map(({ to, icon: Icon, cls, t, s: sub }) => (
          <Link key={t} to={to} className="tool-card">
            <div className="row-between"><span className={`icon-disc lg ${cls}`}><Icon size={22} /></span><ArrowUpRight size={18} color="var(--text-3)" /></div>
            <div><div className="t">{t}</div><div className="s">{sub}</div></div>
          </Link>
        ))}
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

/** Turns the weakest areas into actionable cards (also used by the header and home page). */
export function buildAlerts(d: Dashboard): Alert[] {
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
