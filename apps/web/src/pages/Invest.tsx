import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { dateTime, inr, inrCompact, pct, signed } from '../lib/format';
import { Badge, Button, Card, Empty, Field, Loading, Notice } from '../components/ui';
import { SymbolInput } from '../components/SymbolInput';
import { ImpactView } from './Decisions';
import { PageHeader } from '../App';

const OVERALL: Record<string, { tone: 'good' | 'warn' | 'bad' | 'info'; label: string }> = {
  fits: { tone: 'good', label: 'Fits the family position' },
  minor_concerns: { tone: 'info', label: 'Fits, with minor concerns' },
  caution: { tone: 'warn', label: 'Proceed with caution' },
  high_concern: { tone: 'bad', label: 'Significant concerns' },
};
const LEVEL_TONE: Record<string, 'good' | 'warn' | 'bad' | 'info' | 'neutral'> = { ok: 'good', info: 'info', medium: 'warn', high: 'bad' };

export default function Invest() {
  const { familyId } = useSession();
  const [form, setForm] = useState(() => ({ symbol: (new URLSearchParams(window.location.search).get('symbol') || '').toUpperCase().slice(0, 30), amount: '', fundFrom: 'liquid', notes: '' }));
  const [openId, setOpenId] = useState<string | null>(null);
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: () => api.post<{ evaluation: any }>(`/families/${familyId}/agent/evaluate`, { symbol: form.symbol, amount: Number(form.amount), fundFrom: form.fundFrom, notes: form.notes || undefined }).then((r) => r.evaluation),
    onSuccess: (e) => { setOpenId(null); qc.invalidateQueries({ queryKey: ['evaluations', familyId] }); qc.setQueryData(['evaluation', e.id], e); },
  });
  const list = useQuery({ queryKey: ['evaluations', familyId], queryFn: () => api.get<{ evaluations: any[] }>(`/families/${familyId}/agent/evaluations`).then((r) => r.evaluations) });
  const past = useQuery({ queryKey: ['evaluation', openId], queryFn: () => api.get<{ evaluation: any }>(`/families/${familyId}/agent/evaluations/${openId}`).then((r) => r.evaluation), enabled: Boolean(openId) });
  const shown = openId ? past.data : run.data;

  return (
    <>
      <PageHeader title="Evaluate an investment" />
      <div className="content stack">
        <Card title="What are you thinking of buying?" subtitle="The agent checks the stock against your family's whole position: liquidity, concentration, debt and how it behaves in a crash.">
          <form className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }} onSubmit={(e: FormEvent) => { e.preventDefault(); run.mutate(); }}>
            <Field label="NSE symbol"><SymbolInput value={form.symbol} onChange={(v) => setForm({ ...form, symbol: v })} required /></Field>
            <Field label="Amount (₹)"><input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
            <Field label="Paid from"><select value={form.fundFrom} onChange={(e) => setForm({ ...form, fundFrom: e.target.value })}><option value="liquid">Liquid savings</option><option value="semi_liquid">FDs / investments</option></select></Field>
            <Field label="Why are you considering it? (optional)"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} /></Field>
            <div style={{ alignSelf: 'end' }}><Button type="submit" loading={run.isPending}>Evaluate</Button></div>
          </form>
          {run.isPending && <p className="small muted" style={{ marginTop: 8 }}>Fetching prices, five years of history and fundamentals, then running the analysis…</p>}
          {run.error && <Notice tone="bad">{errorMessage(run.error)}</Notice>}
        </Card>

        {openId && past.isLoading && <Loading />}
        {shown && <EvaluationView e={shown} />}

        <Card title="Past evaluations" subtitle="Visible only to you">
          {list.isLoading ? <Loading /> : !list.data?.length ? <Empty title="No evaluations yet" /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Stock</th><th className="r">Amount</th><th>Assessment</th><th className="r">Score impact</th><th>When</th></tr></thead>
                <tbody>
                  {list.data.map((e) => (
                    <tr key={e.id}>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => setOpenId(e.id)}>{e.symbol}</button></td>
                      <td className="r num">{inr(e.amount)}</td>
                      <td><Badge tone={OVERALL[e.overall]?.tone}>{OVERALL[e.overall]?.label || e.overall}</Badge></td>
                      <td className="r num">{e.scoreDelta === null ? '—' : signed(e.scoreDelta)}</td>
                      <td className="small">{dateTime(e.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function EvaluationView({ e }: { e: any }) {
  const { familyId } = useSession();
  const nav = useNavigate();
  const f = e.facts;
  const h = f.history;
  const n = e.narrative;
  const propose = useMutation({
    mutationFn: () => api.post<{ proposal: { id: string } }>(`/families/${familyId}/proposals`, {
      kind: 'buy_stock', title: `Buy ${inrCompact(f.request.amount)} of ${f.request.symbol}`, amount: f.request.amount,
      description: n.status === 'ok' ? n.summary : `Agent assessment: ${OVERALL[e.overall]?.label}.`,
      decision: { symbol: f.request.symbol, sector: f.company?.sector || undefined, fundFrom: f.request.fundFrom },
    }),
    onSuccess: (r) => nav(`/decisions/${r.proposal.id}`),
  });
  return (
    <div className="stack">
      <Notice tone={OVERALL[e.overall]?.tone === 'bad' ? 'bad' : OVERALL[e.overall]?.tone === 'warn' ? 'warn' : 'good'}>
        <div className="row-between">
          <span><strong>{f.request.symbol}</strong> · {inr(f.request.amount)} · <strong>{OVERALL[e.overall]?.label}</strong></span>
          <span className="row">
            <Button size="sm" variant="secondary" onClick={() => propose.mutate()} loading={propose.isPending}>Propose to family</Button>
          </span>
        </div>
      </Notice>
      {propose.error && <Notice tone="bad">{errorMessage(propose.error)}</Notice>}

      <div className="grid grid-2">
        <Card title="What the agent checked" subtitle="Rule-based and transparent">
          <ul className="list-plain">{f.checks.map((c: any) => <li key={c.id + c.text}><Badge tone={LEVEL_TONE[c.level]}>{c.level === 'ok' ? 'ok' : c.level}</Badge> {c.text}</li>)}</ul>
        </Card>
        <Card title="Explanation" subtitle={n.status === 'ok' ? `Written by ${n.provider} from the facts below` : undefined}>
          {n.status === 'ok' ? (
            <div className="stack-sm">
              <p style={{ margin: 0 }}>{n.summary}</p>
              {n.rationale?.length > 0 && <><strong className="small">In favour</strong><ul style={{ margin: 0, paddingLeft: 18 }}>{n.rationale.map((x: string) => <li key={x}>{x}</li>)}</ul></>}
              {n.keyRisks?.length > 0 && <><strong className="small">Key risks</strong><ul style={{ margin: 0, paddingLeft: 18 }}>{n.keyRisks.map((x: string) => <li key={x}>{x}</li>)}</ul></>}
              {n.portfolioFit && <p className="small" style={{ margin: 0 }}><strong>Portfolio fit:</strong> {n.portfolioFit}</p>}
              {n.alternatives && <p className="small" style={{ margin: 0 }}><strong>Alternatives:</strong> {n.alternatives}</p>}
              {n.uncertainty && <p className="small" style={{ margin: 0 }}><strong>Uncertainty:</strong> {n.uncertainty}</p>}
              {n.questionsForFamily?.length > 0 && <><strong className="small">Discuss as a family</strong><ul style={{ margin: 0, paddingLeft: 18 }}>{n.questionsForFamily.map((x: string) => <li key={x}>{x}</li>)}</ul></>}
            </div>
          ) : <p className="muted">{n.reason}</p>}
        </Card>
      </div>

      <Card title="Effect on your family"><ImpactView impact={{ ...f.impact, stressTest: f.impact.crash30, warnings: [] }} /></Card>

      <div className="grid grid-3">
        <Card title="Possible gains and losses" subtitle={`On ${inr(f.request.amount)}, one year`}>
          <table><tbody>
            {f.scenarios.map((s: any) => (
              <tr key={s.scenario} title={s.basis}><td className="small">{s.scenario}</td><td className="r num">{pct(s.returnPct)}</td><td className="r num" style={{ color: s.gainLoss < 0 ? 'var(--bad)' : 'var(--good)' }}>{inr(s.gainLoss)}</td></tr>
            ))}
          </tbody></table>
          <p className="small muted">Historical ranges describe the past, not the future.</p>
        </Card>
        <Card title="Price behaviour" subtitle={h && !h.insufficientData ? `${h.from} to ${h.to}` : undefined}>
          {!h || h.insufficientData ? <p className="muted">Not enough price history.</p> : (
            <dl className="kv">
              <dt>Last price</dt><dd>{inr(f.quote.price, { decimals: 2 })}</dd>
              <dt>Volatility (annual)</dt><dd>{pct(h.annualizedVolatilityPct)}</dd>
              <dt>Beta vs NIFTY 50</dt><dd>{h.betaVsIndex ?? '—'}</dd>
              <dt>Return, 1 year</dt><dd>{pct(h.return1yPct)}</dd>
              <dt>CAGR</dt><dd>{pct(h.cagrPct)}</dd>
              <dt>Worst fall from peak</dt><dd>{pct(h.maxDrawdownPct)}</dd>
              <dt>Years with a loss</dt><dd>{h.oneYearReturnRange ? pct(h.oneYearReturnRange.shareNegativePct, 0) : '—'}</dd>
            </dl>
          )}
          {f.correlations.length > 0 && <p className="small muted" style={{ marginTop: 8 }}>Moves with: {f.correlations.slice(0, 4).map((c: any) => `${c.symbol} ${c.correlation ?? '—'}`).join(', ')} (1 = in lockstep)</p>}
        </Card>
        <Card title="The company" subtitle={f.company ? `${f.company.sector || ''} · ${f.company.industry || ''}` : undefined}>
          {!f.company ? <p className="muted">Fundamentals unavailable.</p> : (
            <dl className="kv">
              <dt>P/E (trailing)</dt><dd>{f.company.valuation?.trailingPE?.toFixed?.(1) ?? '—'}</dd>
              <dt>Price / book</dt><dd>{f.company.valuation?.priceToBook?.toFixed?.(1) ?? '—'}</dd>
              <dt>Return on equity</dt><dd>{pct(f.company.profitability?.returnOnEquityPct)}</dd>
              <dt>Revenue growth</dt><dd>{pct(f.company.growth?.revenueGrowthPct)}</dd>
              <dt>Profit margin</dt><dd>{pct(f.company.profitability?.profitMarginPct)}</dd>
              <dt>Debt / equity</dt><dd>{f.company.balanceSheet?.debtToEquity ?? '—'}</dd>
            </dl>
          )}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Alternatives">
          <ul className="list-plain">{f.alternatives.map((a: any) => (
            <li key={a.id}><strong>{a.title}</strong>{a.scoreDelta !== null && <> <Badge tone={a.scoreDelta >= 0 ? 'good' : 'warn'}>{signed(a.scoreDelta)} pts</Badge></>}<div className="small muted">{a.note}</div></li>
          ))}</ul>
        </Card>
        <Card title="Research and family context">
          {f.research.length === 0 && f.familyContext.length === 0 && <p className="muted">No saved concall analyses or family notes relate to this stock yet.</p>}
          <ul className="list-plain">
            {f.research.map((r: any) => <li key={r.quarter}><Badge tone="info">Concall {r.quarter}</Badge> <span className="small">{r.summary}</span></li>)}
            {f.familyContext.map((m: any, i: number) => <li key={`${i}-${m.date || ''}`}><Badge>{m.person ? `Meko · ${m.person}` : 'Meko'}</Badge>{m.title && <> <strong className="small">{m.title}</strong></>} <span className="small muted">{m.text}</span></li>)}
          </ul>
        </Card>
      </div>

      <Card title="Sources and assumptions">
        <ul className="list-plain small">{e.sources.map((s: any) => <li key={s.label}><strong>{s.label}:</strong> {s.detail} <span className="muted">({dateTime(s.at)})</span></li>)}</ul>
        {f.dataGaps.length > 0 && <Notice tone="warn">Missing data: {f.dataGaps.join('; ')}</Notice>}
        <p className="small muted">{e.disclaimer}</p>
      </Card>
    </div>
  );
}
