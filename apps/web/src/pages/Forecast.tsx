import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorMessage } from '../lib/api';
import { inr, pct } from '../lib/format';
import { Badge, Button, Card, Field, Notice, Stat } from '../components/ui';
import { SymbolInput } from '../components/SymbolInput';
import { PageHeader } from '../App';

export default function Forecast() {
  const [symbol, setSymbol] = useState('');
  const [horizon, setHorizon] = useState(20);
  const run = useMutation({ mutationFn: () => api.get<{ forecast: any }>(`/market/forecast/${encodeURIComponent(symbol)}?horizon=${horizon}`).then((r) => r.forecast) });
  return (
    <>
      <PageHeader title="Price forecast" />
      <div className="content stack">
        <Notice tone="warn">This shows a <strong>range of plausible prices</strong>, not a prediction. In our tests on large NSE stocks, the model's middle line was no more accurate than assuming the price stays the same, but its ranges were reasonably reliable. It knows nothing about news or results. Not investment advice.</Notice>
        <Card>
          <form className="row" onSubmit={(e: FormEvent) => { e.preventDefault(); run.mutate(); }}>
            <Field label="NSE symbol"><SymbolInput value={symbol} onChange={setSymbol} required /></Field>
            <Field label="Horizon">
              <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
                <option value={5}>1 week (5 trading days)</option><option value={20}>1 month (20)</option><option value={40}>2 months (40)</option><option value={60}>3 months (60)</option>
              </select>
            </Field>
            <div style={{ alignSelf: 'end' }}><Button type="submit" loading={run.isPending}>Forecast</Button></div>
          </form>
          {run.error && <Notice tone="bad">{errorMessage(run.error)}</Notice>}
        </Card>
        {run.data && <ForecastView f={run.data} />}
      </div>
    </>
  );
}

function ForecastView({ f }: { f: any }) {
  const hist = f.history.slice(-120).map((h: any) => ({ date: h.date, actual: h.close }));
  const last = hist[hist.length - 1];
  const fc = f.forecast.map((p: any) => ({ date: p.date, p50: p.p50, band: [p.p10, p.p90], band50: [p.p25, p.p75] }));
  const data = [...hist, { ...last, p50: last.actual, band: [last.actual, last.actual], band50: [last.actual, last.actual] }, ...fc];
  const bt = f.backtest;
  return (
    <div className="stack">
      <div className="grid grid-4">
        <Stat label="Last close" value={inr(f.lastClose.value, { decimals: 2 })} hint={f.lastClose.date} />
        <Stat label={`Likely range in ${f.summary.horizonTradingDays} trading days`} value={`${pct(f.summary.range80Pct[0])} to ${pct(f.summary.range80Pct[1])}`} hint="80% of outcomes, per the model" />
        <Stat label="Backtest: inside the range" value={bt && !bt.error ? pct(bt.coverage80Pct, 0) : '—'} hint="How often real prices landed inside the 80% range (ideal ≈ 80%)" tone={bt && !bt.error ? (Math.abs(bt.coverage80Pct - 80) <= 10 ? 'good' : 'warn') : undefined} />
        <Stat label="Backtest: beat naive guess?" value={bt && !bt.error ? (bt.skillVsNaivePct > 0 ? `Yes, ${bt.skillVsNaivePct}%` : `No (${bt.skillVsNaivePct}%)`) : '—'}
          tone={bt && !bt.error ? (bt.skillVsNaivePct > 0 ? 'good' : 'warn') : undefined} hint={bt && !bt.error ? `${bt.origins} past test points` : bt?.error} />
      </div>
      <Card title={`${f.name || f.symbol} — actual prices and forecast`} subtitle="Solid line: actual adjusted closes. Shaded: the model's 50% and 80% ranges. Dashed: middle of the range (not a target).">
        <div className="chart-box" style={{ height: 340 }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-3)', fontSize: 11 }} minTickGap={40} />
              <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-3)', fontSize: 11 }} width={64} tickFormatter={(v) => `₹${Math.round(v)}`} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                formatter={(v: any, n) => [Array.isArray(v) ? `${inr(v[0], { decimals: 2 })} – ${inr(v[1], { decimals: 2 })}` : inr(Number(v), { decimals: 2 }), n]} />
              <Legend />
              <Area dataKey="band" name="80% range" stroke="none" fill="var(--chart-2)" fillOpacity={0.15} isAnimationActive={false} />
              <Area dataKey="band50" name="50% range" stroke="none" fill="var(--chart-2)" fillOpacity={0.25} isAnimationActive={false} />
              <Line dataKey="actual" name="Actual" stroke="var(--chart-1)" dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line dataKey="p50" name="Middle of range" stroke="var(--chart-2)" strokeDasharray="5 4" dot={false} strokeWidth={2} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid grid-2">
        <Card title="How accurate has it been?" subtitle={`Rolling backtest on this stock, ${f.summary.horizonTradingDays}-day horizon`}>
          {!bt || bt.error ? <p className="muted">Backtest unavailable{bt?.error ? `: ${bt.error}` : ''}.</p> : (
            <>
              <dl className="kv">
                <dt>Model average error</dt><dd>{pct(bt.modelMAPE, 2)}</dd>
                <dt>Naive "no change" guess error</dt><dd>{pct(bt.naiveMAPE, 2)}</dd>
                <dt>Actual price inside 80% band</dt><dd>{pct(bt.coverage80Pct, 0)} <span className="muted">(ideal ≈ 80%)</span></dd>
                <dt>Direction right</dt><dd>{pct(bt.directionHitRatePct, 0)}</dd>
              </dl>
              <p className="small muted">{bt.skillVsNaivePct > 0 ? 'The model was more accurate than assuming no change.' : 'The model was not more accurate than simply assuming the price stays the same. Treat it as a range of plausible outcomes, not a prediction.'}</p>
            </>
          )}
        </Card>
        <Card title="Model and data">
          <dl className="kv">
            <dt>Model</dt><dd>{f.model.id} <Badge>{f.model.license}</Badge></dd>
            <dt>History used</dt><dd>{f.model.contextDays} trading days</dd>
            <dt>Prices</dt><dd>{f.dataSource.prices}</dd>
          </dl>
          <ul className="small muted" style={{ paddingLeft: 18 }}>{f.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
