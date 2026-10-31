import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import type { Shock, StressResult } from '../lib/types';
import { dateTime, inr, inrCompact, months, pct, signed } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorState, Field, Loading, Notice, Stat, Tabs } from '../components/ui';
import { Gauge } from '../components/Score';
import { ScopePicker } from '../components/ScopePicker';
import { PageHeader } from '../App';

interface Preset { id: string; name: string; shocks: Shock[] }

const SHOCK_LABELS: Record<string, string> = {
  market: 'Market-wide fall', stock: 'Single stock fall', sector: 'Sector fall', one_time_expense: 'One-time expense',
  recurring_expense: 'Recurring expense', income_change: 'Income change', expense_change: 'Expense change', inflation: 'Inflation', emi_change: 'EMI change',
};
const DEFAULTS: Record<string, Shock> = {
  market: { type: 'market', declinePct: 20 },
  stock: { type: 'stock', symbol: '', declinePct: 40 },
  sector: { type: 'sector', sector: '', declinePct: 30 },
  one_time_expense: { type: 'one_time_expense', amount: 100000, month: 0, label: 'Medical emergency' },
  recurring_expense: { type: 'recurring_expense', monthlyAmount: 30000, months: 6, startMonth: 0, label: 'Ongoing treatment' },
  income_change: { type: 'income_change', changePct: -100, months: 6, startMonth: 0 },
  expense_change: { type: 'expense_change', changePct: 15, months: 12, startMonth: 0 },
  inflation: { type: 'inflation', annualPct: 7 },
  emi_change: { type: 'emi_change', changePct: 15, floatingOnly: true },
};

export function describeShock(s: Shock, memberName?: (id: string) => string): string {
  switch (s.type) {
    case 'market': return `Market −${s.declinePct}%`;
    case 'stock': return `${s.symbol || 'Stock'} −${s.declinePct}%`;
    case 'sector': return `${s.sector || 'Sector'} −${s.declinePct}%`;
    case 'one_time_expense': return `${s.label || 'Expense'} ${inrCompact(s.amount)}${s.month ? ` in month ${s.month}` : ''}`;
    case 'recurring_expense': return `${s.label || 'Expense'} ${inrCompact(s.monthlyAmount)}/mo × ${s.months}`;
    case 'income_change': return `${s.userId && memberName ? `${memberName(s.userId)}'s income` : 'Income'} ${s.changePct > 0 ? '+' : ''}${s.changePct}%${s.months ? ` for ${s.months} mo` : ''}`;
    case 'expense_change': return `Expenses ${s.changePct > 0 ? '+' : ''}${s.changePct}%${s.months ? ` for ${s.months} mo` : ''}`;
    case 'inflation': return `Inflation ${s.annualPct}%/yr`;
    case 'emi_change': return `${s.floatingOnly === false ? 'All' : 'Floating'} EMIs ${s.changePct > 0 ? '+' : ''}${s.changePct}%`;
    default: return s.type;
  }
}

export default function Stress() {
  const [tab, setTab] = useState<'run' | 'compare' | 'reverse' | 'saved'>('run');
  return (
    <>
      <PageHeader title="Stress test"><ScopePicker /></PageHeader>
      <div className="content stack">
        <Tabs value={tab} onChange={setTab} options={[
          { value: 'run', label: 'Run a scenario' }, { value: 'compare', label: 'Compare scenarios' },
          { value: 'reverse', label: 'Breaking point' }, { value: 'saved', label: 'Saved' },
        ]} />
        {tab === 'run' && <RunScenario />}
        {tab === 'compare' && <Compare />}
        {tab === 'reverse' && <Reverse />}
        {tab === 'saved' && <Saved />}
      </div>
    </>
  );
}

function usePresets() {
  const { familyId } = useSession();
  return useQuery({ queryKey: ['presets', familyId], queryFn: () => api.get<{ presets: Preset[] }>(`/families/${familyId}/stress/presets`).then((r) => r.presets), enabled: Boolean(familyId), staleTime: Infinity });
}

function ShockEditor({ shock, onChange, onRemove }: { shock: Shock; onChange: (s: Shock) => void; onRemove: () => void }) {
  const { family } = useSession();
  const n = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...shock, [k]: e.target.value === '' ? '' : Number(e.target.value) });
  const t = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...shock, [k]: e.target.value });
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <strong>{SHOCK_LABELS[shock.type]}</strong>
        <button className="icon-btn" onClick={onRemove} aria-label="Remove shock"><Trash2 size={15} /></button>
      </div>
      <div className="form-grid">
        {['market', 'stock', 'sector'].includes(shock.type) && <Field label="Decline (%)"><input type="number" min={0} max={100} value={shock.declinePct} onChange={n('declinePct')} /></Field>}
        {shock.type === 'stock' && <Field label="Symbol"><input value={shock.symbol} onChange={(e) => onChange({ ...shock, symbol: e.target.value.toUpperCase() })} placeholder="e.g. TCS" /></Field>}
        {shock.type === 'sector' && <Field label="Sector" hint="As entered on holdings."><input value={shock.sector} onChange={t('sector')} placeholder="e.g. IT" /></Field>}
        {shock.type === 'one_time_expense' && <>
          <Field label="Amount (₹)"><input type="number" min={0} value={shock.amount} onChange={n('amount')} /></Field>
          <Field label="In month" hint="0 = today"><input type="number" min={0} max={120} value={shock.month} onChange={n('month')} /></Field>
          <Field label="Label"><input value={shock.label || ''} onChange={t('label')} /></Field>
        </>}
        {shock.type === 'recurring_expense' && <>
          <Field label="Per month (₹)"><input type="number" min={0} value={shock.monthlyAmount} onChange={n('monthlyAmount')} /></Field>
          <Field label="For months"><input type="number" min={1} max={120} value={shock.months} onChange={n('months')} /></Field>
          <Field label="Starting after month"><input type="number" min={0} max={120} value={shock.startMonth} onChange={n('startMonth')} /></Field>
          <Field label="Label"><input value={shock.label || ''} onChange={t('label')} /></Field>
        </>}
        {shock.type === 'income_change' && <>
          <Field label="Change (%)" hint="−100 = income stops"><input type="number" min={-100} max={100} value={shock.changePct} onChange={n('changePct')} /></Field>
          <Field label="For months" hint="Blank = whole horizon"><input type="number" min={1} max={120} value={shock.months ?? ''} onChange={(e) => onChange({ ...shock, months: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="Whose income">
            <select value={shock.userId || ''} onChange={(e) => onChange({ ...shock, userId: e.target.value || undefined })}>
              <option value="">Whole household</option>
              {family?.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        </>}
        {shock.type === 'expense_change' && <>
          <Field label="Change (%)"><input type="number" min={-100} max={500} value={shock.changePct} onChange={n('changePct')} /></Field>
          <Field label="For months"><input type="number" min={1} max={120} value={shock.months ?? ''} onChange={n('months')} /></Field>
        </>}
        {shock.type === 'inflation' && <Field label="Annual inflation (%)"><input type="number" min={-20} max={100} value={shock.annualPct} onChange={n('annualPct')} /></Field>}
        {shock.type === 'emi_change' && <>
          <Field label="EMI change (%)"><input type="number" min={-100} max={500} value={shock.changePct} onChange={n('changePct')} /></Field>
          <Field label="Applies to"><select value={shock.floatingOnly === false ? 'all' : 'floating'} onChange={(e) => onChange({ ...shock, floatingOnly: e.target.value !== 'all' })}><option value="floating">Floating-rate loans</option><option value="all">All loans</option></select></Field>
        </>}
      </div>
    </div>
  );
}

function RunScenario() {
  const { familyId, scope, family } = useSession();
  const qc = useQueryClient();
  const presets = usePresets();
  const [shocks, setShocks] = useState<Shock[]>([{ ...DEFAULTS.market }]);
  const [assumptions, setAssumptions] = useState({ horizonMonths: 24, allowForcedSelling: true, assumedAnnualEquityReturnPct: 10 });
  const [saveAs, setSaveAs] = useState('');
  const run = useMutation({
    mutationFn: (save: boolean) => api.post<{ result: StressResult }>(`/families/${familyId}/stress/run`, {
      ...scope, shocks: shocks.map(clean), assumptions, ...(save && saveAs.trim() ? { saveAs: saveAs.trim() } : {}),
    }).then((r) => r.result),
    onSuccess: (r) => { if (r.savedId) qc.invalidateQueries({ queryKey: ['simulations', familyId] }); },
  });
  const memberName = (id: string) => family?.members.find((m) => m.id === id)?.name.split(' ')[0] || 'Member';

  return (
    <div className="stack">
      <Card title="Build the scenario" subtitle="Combine any shocks. Everything runs on your actual records.">
        <div className="stack">
          <div>
            <div className="field-label" style={{ marginBottom: 6 }}>Start from a preset</div>
            <div className="chip-row">{presets.data?.map((p) => <button key={p.id} className="chip" onClick={() => setShocks(p.shocks.map((s) => ({ ...s })))}>{p.name}</button>)}</div>
          </div>
          <div className="grid grid-2">
            {shocks.map((s, i) => <ShockEditor key={i} shock={s} onChange={(n) => setShocks(shocks.map((x, j) => (j === i ? n : x)))} onRemove={() => setShocks(shocks.filter((_, j) => j !== i))} />)}
          </div>
          <div className="row">
            <span className="small muted">Add shock:</span>
            {Object.keys(DEFAULTS).map((k) => <button key={k} className="chip" onClick={() => setShocks([...shocks, { ...DEFAULTS[k] }])}><Plus size={12} /> {SHOCK_LABELS[k]}</button>)}
          </div>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Field label="Horizon (months)"><input type="number" min={1} max={120} value={assumptions.horizonMonths} onChange={(e) => setAssumptions({ ...assumptions, horizonMonths: Number(e.target.value) })} /></Field>
            <Field label="Assumed equity return after the shock (%/yr)" hint="Only used for the recovery estimate."><input type="number" min={-20} max={40} value={assumptions.assumedAnnualEquityReturnPct} onChange={(e) => setAssumptions({ ...assumptions, assumedAnnualEquityReturnPct: Number(e.target.value) })} /></Field>
            <Field label="If cash runs out"><select value={assumptions.allowForcedSelling ? 'sell' : 'no'} onChange={(e) => setAssumptions({ ...assumptions, allowForcedSelling: e.target.value === 'sell' })}><option value="sell">Sell FDs & investments</option><option value="no">Don't sell (show shortfall)</option></select></Field>
            <Field label="Save as (optional)"><input value={saveAs} onChange={(e) => setSaveAs(e.target.value)} placeholder="e.g. Job loss + medical" maxLength={120} /></Field>
          </div>
          <div className="row">
            <Button onClick={() => run.mutate(false)} loading={run.isPending && !saveAs} disabled={!shocks.length}>Run stress test</Button>
            <Button variant="secondary" onClick={() => run.mutate(true)} disabled={!saveAs.trim() || !shocks.length} loading={run.isPending && Boolean(saveAs)}>Run & save</Button>
          </div>
          {run.error && <Notice tone="bad">{errorMessage(run.error)}</Notice>}
        </div>
      </Card>
      {run.data && <StressResultView r={run.data} memberName={memberName} />}
    </div>
  );
}

function clean(s: Shock): Shock {
  const out: Shock = { type: s.type };
  for (const [k, v] of Object.entries(s)) if (v !== '' && v !== null && v !== undefined) out[k] = v;
  return out;
}

const verdictTone = { ok: 'good', warning: 'warn', severe: 'warn', critical: 'bad' } as const;

export function StressResultView({ r, memberName }: { r: StressResult; memberName?: (id: string) => string }) {
  const i = r.impact;
  return (
    <div className="stack">
      <Notice tone={verdictTone[r.verdict.level]}><strong>{r.verdict.text}</strong> <span className="muted">· {r.shocks.map((s) => describeShock(s, memberName)).join(' + ')}</span></Notice>
      <div className="grid grid-4">
        <Stat label="Portfolio loss" value={inrCompact(i.portfolioLoss)} hint={`${pct(i.portfolioLossPct)} of equity holdings`} tone={i.portfolioLoss > 0 ? 'bad' : undefined} />
        <Stat label="Net worth now → after" value={`${inrCompact(r.before.netWorth)} → ${inrCompact(r.after.netWorth)}`} hint={`${inrCompact(i.netWorthChangeEndOfHorizon)} by month ${r.assumptions.horizonMonths}`} />
        <Stat label="Cash runway" value={months(i.cashRunwayMonths)} hint={i.totalRunwayMonths !== null ? `${months(i.totalRunwayMonths)} incl. investments` : 'Investments cover the gap'} tone={i.cashRunwayMonths === null ? 'good' : i.cashRunwayMonths < 3 ? 'bad' : 'warn'} />
        <Stat label="Forced selling" value={inrCompact(i.forcedSales)} hint={i.firstForcedSaleMonth !== null ? `starting month ${i.firstForcedSaleMonth}` : 'None needed'} tone={i.forcedSales > 0 ? 'warn' : 'good'} />
      </div>
      <div className="grid grid-3">
        <Card title="Cash over time" subtitle="Liquid cash and remaining semi-liquid assets, month by month" className="span-2">
          <div className="chart-box" style={{ height: 300 }}>
            <ResponsiveContainer>
              <AreaChart data={r.projection} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: 'var(--text-3)', fontSize: 11 }} label={{ value: 'Month', position: 'insideBottomRight', offset: -4, fill: 'var(--text-3)', fontSize: 11 }} />
                <YAxis tickFormatter={inrCompact} tick={{ fill: 'var(--text-3)', fontSize: 11 }} width={70} />
                <Tooltip formatter={(v, n) => [inr(Number(v)), n]} labelFormatter={(m) => `Month ${m}`} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
                <Legend />
                <ReferenceLine y={0} stroke="var(--bad)" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="semiLiquid" name="Semi-liquid (FDs, investments)" stackId="1" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.15} />
                <Area type="monotone" dataKey="cash" name="Liquid cash" stackId="1" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Resilience score">
          <div className="row" style={{ justifyContent: 'space-around' }}>
            <div className="stack-sm" style={{ alignItems: 'center' }}><span className="small muted">Before</span><Gauge score={r.beforeScore.score} band={r.beforeScore.band} /></div>
          </div>
          <div className="row" style={{ justifyContent: 'space-around' }}>
            <div className="stack-sm" style={{ alignItems: 'center' }}><span className="small muted">After</span><Gauge score={r.afterScore.score} band={r.afterScore.band} /></div>
          </div>
          <p className="small muted center">Change {signed(i.scoreChange)} points</p>
        </Card>
      </div>
      <div className="grid grid-3">
        <Card title="Before vs after">
          <table>
            <thead><tr><th /><th className="r">Before</th><th className="r">After</th></tr></thead>
            <tbody>
              <tr><td>Liquid cash</td><td className="r num">{inr(r.before.liquidAssets)}</td><td className="r num">{inr(r.after.liquidAssets)}</td></tr>
              <tr><td>Monthly income</td><td className="r num">{inr(r.before.monthlyIncome)}</td><td className="r num">{inr(r.after.monthlyIncome)}</td></tr>
              <tr><td>Monthly outflows</td><td className="r num">{inr(r.before.monthlyOutflows)}</td><td className="r num">{inr(r.after.monthlyOutflows)}</td></tr>
              <tr><td>Monthly burn</td><td className="r num">{inr(r.before.monthlyBurn)}</td><td className="r num">{inr(r.after.monthlyBurn)}</td></tr>
              <tr><td>EMI / income</td><td className="r num">{pct(r.before.emiToIncomePct)}</td><td className="r num">{pct(r.after.emiToIncomePct)}</td></tr>
              <tr><td>Emergency cover</td><td className="r num">{months(r.before.emergencyCoverageMonths)}</td><td className="r num">{months(r.after.emergencyCoverageMonths)}</td></tr>
            </tbody>
          </table>
        </Card>
        <Card title="Recovery">
          <dl className="kv">
            <dt>Rebuild cash</dt><dd>{r.recovery.cashRebuildMonths === null ? 'Not without changes' : `${r.recovery.cashRebuildMonths} mo`}</dd>
            <dt>Portfolio recovery</dt><dd>{r.recovery.portfolioRecoveryMonths === null ? '—' : `~${r.recovery.portfolioRecoveryMonths} mo`}</dd>
          </dl>
          <p className="small muted">{r.recovery.cashRebuildNote}</p>
          <p className="small muted">{r.recovery.portfolioRecoveryNote}</p>
        </Card>
        <Card title="Hardest-hit holdings">
          {i.hardestHitPositions.length === 0 ? <p className="muted">No market losses in this scenario.</p> : (
            <ul className="list-plain">
              {i.hardestHitPositions.map((h, k) => <li key={k} className="row-between"><span>{h.symbol || h.name} <span className="small muted">−{h.declinePct}%</span></span><span className="num">−{inr(h.loss)}</span></li>)}
            </ul>
          )}
        </Card>
      </div>
      <p className="small muted">Assumptions: {r.assumptions.horizonMonths}-month horizon; investments earn nothing during the projection; {r.assumptions.allowForcedSelling ? 'FDs and investments are sold when cash runs out' : 'no forced selling'}. This is a simulation of your recorded data, not a forecast.</p>
    </div>
  );
}

function Compare() {
  const { familyId, scope } = useSession();
  const presets = usePresets();
  const [picked, setPicked] = useState<string[]>(['market_stress', 'severe_crash', 'job_loss_6m', 'perfect_storm']);
  const cmp = useMutation({
    mutationFn: () => api.post<{ baseline: { score: number; netWorth: number; liquid: number }; scenarios: any[] }>(`/families/${familyId}/stress/compare`, {
      ...scope, scenarios: presets.data!.filter((p) => picked.includes(p.id)).map(({ name, shocks }) => ({ name, shocks })),
    }),
  });
  return (
    <div className="stack">
      <Card title="Pick scenarios to compare">
        <div className="chip-row">
          {presets.data?.map((p) => <button key={p.id} className={`chip ${picked.includes(p.id) ? 'active' : ''}`} aria-pressed={picked.includes(p.id)}
            onClick={() => setPicked(picked.includes(p.id) ? picked.filter((x) => x !== p.id) : [...picked, p.id])}>{p.name}</button>)}
        </div>
        <div style={{ marginTop: 12 }}><Button onClick={() => cmp.mutate()} loading={cmp.isPending} disabled={!picked.length}>Compare</Button></div>
        {cmp.error && <Notice tone="bad">{errorMessage(cmp.error)}</Notice>}
      </Card>
      {cmp.data && (
        <Card pad={false} title="Side by side" subtitle={`Today: score ${cmp.data.baseline.score}, net worth ${inrCompact(cmp.data.baseline.netWorth)}, liquid ${inrCompact(cmp.data.baseline.liquid)}`}>
          <div className="table-wrap" style={{ padding: '8px 0' }}>
            <table>
              <thead><tr><th>Scenario</th><th className="r">Portfolio loss</th><th className="r">Net worth after</th><th className="r">Cash runway</th><th className="r">Forced selling</th><th className="r">Score after</th><th>Verdict</th></tr></thead>
              <tbody>
                {cmp.data.scenarios.map((s) => (
                  <tr key={s.name}>
                    <td><strong>{s.name}</strong></td>
                    <td className="r num">{inrCompact(s.impact.portfolioLoss)}</td>
                    <td className="r num">{inrCompact(s.after.netWorth)}</td>
                    <td className="r num">{months(s.impact.cashRunwayMonths)}</td>
                    <td className="r num">{inrCompact(s.impact.forcedSales)}</td>
                    <td className="r num">{s.scoreAfter}</td>
                    <td><Badge tone={verdictTone[s.verdict.level as keyof typeof verdictTone]}>{s.verdict.level}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

const VARIABLES = [
  { value: 'market_decline', label: 'How big a market crash?' },
  { value: 'one_time_expense', label: 'How large an emergency bill?' },
  { value: 'income_loss_months', label: 'How many months without income?' },
  { value: 'monthly_expense_increase', label: 'How much extra monthly spending (12 months)?' },
];

function Reverse() {
  const { familyId, scope } = useSession();
  const [variable, setVariable] = useState('market_decline');
  const [cond, setCond] = useState<{ type: string; floor?: number; months?: number; score?: number; pct?: number }>({ type: 'forced_selling' });
  const rev = useMutation({ mutationFn: () => api.post<{ result: any }>(`/families/${familyId}/stress/reverse`, { ...scope, variable, condition: cond }).then((r) => r.result) });
  const fmt = (v: number, unit: string) => (unit === '%' ? `${v}%` : unit === 'months' ? `${v} months` : inr(v));
  return (
    <div className="stack">
      <Card title="Find the breaking point" subtitle="Searches for the smallest shock that breaks a condition you choose.">
        <div className="form-grid">
          <Field label="Question"><select value={variable} onChange={(e) => setVariable(e.target.value)}>{VARIABLES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}</select></Field>
          <Field label="…before">
            <select value={cond.type} onChange={(e) => setCond({ type: e.target.value, floor: 100000, months: 3, score: 40, pct: 20 })}>
              <option value="forced_selling">we must sell investments to pay bills</option>
              <option value="cash_below">liquid cash drops below a floor</option>
              <option value="runway_below">runway falls under N months</option>
              <option value="score_below">resilience score falls below</option>
              <option value="networth_drop_above">net worth falls by more than</option>
            </select>
          </Field>
          {cond.type === 'cash_below' && <Field label="Cash floor (₹)"><input type="number" min={0} value={cond.floor} onChange={(e) => setCond({ ...cond, floor: Number(e.target.value) })} /></Field>}
          {cond.type === 'runway_below' && <Field label="Months"><input type="number" min={1} max={120} value={cond.months} onChange={(e) => setCond({ ...cond, months: Number(e.target.value) })} /></Field>}
          {cond.type === 'score_below' && <Field label="Score"><input type="number" min={1} max={100} value={cond.score} onChange={(e) => setCond({ ...cond, score: Number(e.target.value) })} /></Field>}
          {cond.type === 'networth_drop_above' && <Field label="Drop (%)"><input type="number" min={1} max={100} value={cond.pct} onChange={(e) => setCond({ ...cond, pct: Number(e.target.value) })} /></Field>}
        </div>
        <div style={{ marginTop: 12 }}><Button onClick={() => rev.mutate()} loading={rev.isPending}>Find breaking point</Button></div>
        {rev.error && <Notice tone="bad">{errorMessage(rev.error)}</Notice>}
      </Card>
      {rev.data && (
        <Card>
          <div className="stack-sm">
            <div className="stat-label">Breaking point</div>
            <div className="stat-value num">{rev.data.threshold === null ? 'Not reached' : fmt(rev.data.threshold, rev.data.unit)}</div>
            <p>{rev.data.explanation}</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function Saved() {
  const { familyId } = useSession();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['simulations', familyId], queryFn: () => api.get<{ simulations: any[] }>(`/families/${familyId}/simulations`).then((r) => r.simulations) });
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useQuery({ queryKey: ['simulation', openId], queryFn: () => api.get<{ simulation: any }>(`/families/${familyId}/simulations/${openId}`).then((r) => r.simulation), enabled: Boolean(openId) });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/families/${familyId}/simulations/${id}`), onSuccess: () => { setOpenId(null); qc.invalidateQueries({ queryKey: ['simulations', familyId] }); } });
  if (list.isLoading) return <Loading />;
  if (list.error) return <ErrorState error={list.error} />;
  if (!list.data?.length) return <Card><Empty title="No saved scenarios">Give a scenario a name and choose "Run & save". Saved runs are visible only to you.</Empty></Card>;
  return (
    <div className="stack">
      <Card pad={false}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Saved</th><th>Verdict</th><th className="r">Score change</th><th /></tr></thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id}>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setOpenId(s.id)}>{s.name}</button></td>
                  <td>{dateTime(s.createdAt)}</td>
                  <td>{s.verdict && <Badge tone={verdictTone[s.verdict.level as keyof typeof verdictTone]}>{s.verdict.level}</Badge>}</td>
                  <td className="r num">{typeof s.scoreChange === 'number' ? signed(s.scoreChange) : '—'}</td>
                  <td className="r"><button className="icon-btn" aria-label={`Delete ${s.name}`} onClick={() => del.mutate(s.id)}><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {openId && detail.isLoading && <Loading />}
      {detail.data && <><Notice>Saved result from {dateTime(detail.data.createdAt)} (engine {detail.data.engineVersion}). Re-run to use current balances.</Notice><StressResultView r={detail.data.output} /></>}
    </div>
  );
}
