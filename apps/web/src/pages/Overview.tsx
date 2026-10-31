import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import type { Dashboard } from '../lib/types';
import { dateTime, inr, inrCompact, label, months, pct } from '../lib/format';
import { Badge, Card, Empty, ErrorState, Loading, Notice, Stat } from '../components/ui';
import { Gauge, PillarList, ScoreChangeNote } from '../components/Score';
import { ScopePicker } from '../components/ScopePicker';
import { PageHeader } from '../App';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];

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

function DashboardView({ d }: { d: Dashboard }) {
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
  const runwayTone = (m: number | null) => (m === null ? 'good' : m >= 6 ? 'good' : m >= 3 ? 'warn' : 'bad');
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

  return (
    <div className="stack">
      <div className="grid grid-4">
        <Stat label="Net worth" value={inrCompact(p.netWorth)} hint={`${inr(p.assets.total)} assets − ${inr(p.liabilities.total)} debt`} />
        <Stat label="Liquid money" value={inrCompact(p.assets.liquid)} hint={`+ ${inrCompact(p.assets.semiLiquid)} semi-liquid`} />
        <Stat label="Monthly savings" value={inrCompact(p.cashflow.monthlySavings)} tone={p.cashflow.monthlySavings >= 0 ? 'good' : 'bad'}
          hint={p.cashflow.savingsRatePct !== null ? `${pct(p.cashflow.savingsRatePct)} of income` : 'No income recorded'} />
        <Stat label="Runway if income stops" value={months(runway.ifIncomeStopsMonths)} tone={runwayTone(runway.ifIncomeStopsMonths)}
          hint={`${months(runway.withSemiLiquidMonths)} including FDs & investments`} />
      </div>

      <div className="grid grid-3">
        <Card title="Resilience score" subtitle="Five pillars, 100 points" className="span-2">
          <div className="grid grid-2" style={{ alignItems: 'start' }}>
            <div className="stack" style={{ alignItems: 'center' }}>
              <Gauge score={s.score} band={s.band} />
              <ScoreChangeNote change={d.scoreChange} />
            </div>
            <PillarList report={s} />
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>{s.disclaimer}</p>
        </Card>
        <Card title="Top ways to improve">
          {s.topActions.length === 0 ? <p className="muted">No improvements needed on any pillar right now.</p> : (
            <ol className="stack-sm" style={{ paddingLeft: 18, margin: 0 }}>
              {s.topActions.map((a) => <li key={a.text}>{a.text} <Badge tone="good">+{a.pointsGain}</Badge></li>)}
            </ol>
          )}
          <div className="divider" style={{ margin: '16px 0' }} />
          <Link to="/stress" className="btn btn-secondary btn-sm">Stress-test this position</Link>
        </Card>
      </div>

      <div className="grid grid-3">
        <Card title="Where the money is" subtitle="By liquidity">
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={liquidity} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-2)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={inrCompact} tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                <Tooltip formatter={(v) => inr(Number(v))} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>{liquidity.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Assets by type">
          <div className="chart-box" style={{ height: 200 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byKind} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2} stroke="var(--surface)">
                  {byKind.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => inr(Number(v))} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">{byKind.map((k, i) => <span key={k.name}><i style={{ background: COLORS[i % COLORS.length] }} />{k.name} {inrCompact(k.value)}</span>)}</div>
        </Card>
        <Card title="Monthly cash flow">
          <dl className="kv">
            {cash.map((c) => <Fragment key={c.name}><dt>{c.name}</dt><dd>{inr(c.value)}</dd></Fragment>)}
            <dt><strong>Net</strong></dt><dd style={{ color: p.cashflow.monthlySavings >= 0 ? 'var(--good)' : 'var(--bad)' }}>{inr(p.cashflow.monthlySavings)}</dd>
          </dl>
          <div className="divider" style={{ margin: '12px 0' }} />
          <dl className="kv">
            <dt>EMI share of income</dt><dd>{p.cashflow.monthlyIncome > 0 ? pct((p.cashflow.monthlyEmi / p.cashflow.monthlyIncome) * 100) : '—'}</dd>
            <dt>Total debt</dt><dd>{inr(p.liabilities.total)}</dd>
            <dt>Equity market exposure</dt><dd>{inr(p.assets.equityExposure)}</dd>
            <dt>Current burn runway</dt><dd>{runway.state === 'self_sustaining' ? 'Income covers outflows' : months(runway.currentBurnMonths)}</dd>
          </dl>
        </Card>
      </div>

      <Notice tone="info">
        {d.privacyNote}
        {d.freshness.holdingsCount > 0 && <> · Prices: {d.freshness.holdingsWithoutMarketPrice > 0 ? `${d.freshness.holdingsWithoutMarketPrice} holding(s) valued at purchase price. ` : ''}oldest market price {dateTime(d.freshness.oldestPriceAsOf)}.</>}
      </Notice>
    </div>
  );
}
