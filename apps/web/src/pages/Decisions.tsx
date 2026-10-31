import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { canWrite, useSession } from '../lib/session';
import { dateTime, inr, inrCompact, months, signed } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorState, Field, Loading, Modal, Notice } from '../components/ui';
import { PageHeader } from '../App';

const STATUS_TONE: Record<string, 'good' | 'bad' | 'warn' | 'neutral' | 'info'> = { open: 'info', approved: 'good', rejected: 'bad', withdrawn: 'neutral' };
const KIND_LABEL: Record<string, string> = { buy_stock: 'Buy stock', sell_stock: 'Sell stock', purchase: 'Major purchase', loan: 'Take a loan', other: 'Other' };

export default function Decisions() {
  const { id } = useParams();
  return id ? <ProposalDetail id={id} /> : <ProposalList />;
}

function ProposalList() {
  const { familyId, family } = useSession();
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['proposals', familyId], queryFn: () => api.get<{ proposals: any[] }>(`/families/${familyId}/proposals`).then((r) => r.proposals), enabled: Boolean(familyId) });
  return (
    <>
      <PageHeader title="Family decisions">{canWrite(family?.myRole) && <Button onClick={() => setCreating(true)}><Plus size={16} /> Propose a decision</Button>}</PageHeader>
      <div className="content stack">
        <Notice>Proposals need approval from {family?.approvalThreshold ?? 1} other member(s). Each one shows its effect on the family's resilience score and on a 30% market crash.</Notice>
        {q.isLoading && <Loading />}
        {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {q.data && q.data.length === 0 && <Card><Empty title="No decisions yet">Propose a stock purchase, a big expense or a new loan, and see how it changes the family's resilience before anyone commits.</Empty></Card>}
        {q.data && q.data.length > 0 && (
          <Card pad={false}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Decision</th><th>Proposed by</th><th className="r">Amount</th><th className="r">Score impact</th><th>Votes</th><th>Status</th></tr></thead>
                <tbody>
                  {q.data.map((p) => (
                    <tr key={p.id}>
                      <td><Link to={`/decisions/${p.id}`}><strong>{p.title}</strong></Link><div className="small muted">{KIND_LABEL[p.kind]} · {dateTime(p.createdAt)}</div></td>
                      <td>{p.proposerName}</td>
                      <td className="r num">{p.amount ? inr(p.amount) : '—'}</td>
                      <td className="r num">{typeof p.scoreDelta === 'number' ? <Badge tone={p.scoreDelta >= 0 ? 'good' : 'bad'}>{signed(p.scoreDelta)}</Badge> : '—'}</td>
                      <td className="num">{p.approvals}/{p.requiredApprovals} approve{p.rejections ? `, ${p.rejections} reject` : ''} · {p.comments} comments</td>
                      <td><Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
      <Modal title="Propose a decision" open={creating} onClose={() => setCreating(false)} wide><ProposalForm onDone={() => setCreating(false)} /></Modal>
    </>
  );
}

function decisionFrom(f: Record<string, any>) {
  const amount = Number(f.amount);
  switch (f.kind) {
    case 'buy_stock': return { kind: 'buy_stock', amount, symbol: f.symbol, sector: f.sector || undefined, fundFrom: f.fundFrom };
    case 'sell_stock': return { kind: 'sell_stock', amount, symbol: f.symbol };
    case 'purchase': return { kind: 'purchase', amount, assetValue: f.assetValue ? Number(f.assetValue) : undefined, fundFrom: f.fundFrom };
    case 'loan': return { kind: 'loan', principal: amount, emiMonthly: Number(f.emiMonthly || 0), cashReceived: false };
    default: return null;
  }
}

function ProposalForm({ onDone }: { onDone: () => void }) {
  const { familyId } = useSession();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [f, setF] = useState<Record<string, any>>({ kind: 'buy_stock', title: '', description: '', amount: '', symbol: '', sector: '', fundFrom: 'liquid', emiMonthly: '', assetValue: '' });
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const preview = useMutation({ mutationFn: () => api.post<{ result: any }>(`/families/${familyId}/whatif`, { decision: decisionFrom(f) }).then((r) => r.result) });
  const create = useMutation({
    mutationFn: () => {
      const d = decisionFrom(f);
      const decision = d ? Object.fromEntries(Object.entries(d).filter(([k]) => !['kind', 'amount', 'principal'].includes(k))) : undefined;
      return api.post<{ proposal: { id: string } }>(`/families/${familyId}/proposals`, {
        kind: f.kind, title: f.title, description: f.description || undefined, amount: f.kind === 'other' && !f.amount ? undefined : Number(f.amount), decision,
      });
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['proposals', familyId] }); onDone(); nav(`/decisions/${r.proposal.id}`); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); create.mutate(); };
  return (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Type of decision"><select value={f.kind} onChange={(e) => { set('kind', e.target.value); preview.reset(); }}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Title"><input value={f.title} onChange={(e) => set('title', e.target.value)} required minLength={3} maxLength={160} placeholder="e.g. Buy ₹50,000 of HDFC Bank" /></Field>
        <Field label={f.kind === 'loan' ? 'Loan amount (₹)' : 'Amount (₹)'}><input type="number" min={1} value={f.amount} onChange={(e) => set('amount', e.target.value)} required={f.kind !== 'other'} /></Field>
        {['buy_stock', 'sell_stock'].includes(f.kind) && <Field label="NSE symbol"><input value={f.symbol} onChange={(e) => set('symbol', e.target.value.toUpperCase())} required placeholder="HDFCBANK" /></Field>}
        {f.kind === 'buy_stock' && <Field label="Sector" hint="Used for diversification analysis."><input value={f.sector} onChange={(e) => set('sector', e.target.value)} placeholder="Financials" /></Field>}
        {['buy_stock', 'purchase'].includes(f.kind) && <Field label="Paid from"><select value={f.fundFrom} onChange={(e) => set('fundFrom', e.target.value)}><option value="liquid">Liquid savings</option><option value="semi_liquid">FDs / investments</option></select></Field>}
        {f.kind === 'purchase' && <Field label="Resale value kept (₹, optional)" hint="e.g. a car keeps some value; a holiday keeps none."><input type="number" min={0} value={f.assetValue} onChange={(e) => set('assetValue', e.target.value)} /></Field>}
        {f.kind === 'loan' && <Field label="EMI per month (₹)"><input type="number" min={0} value={f.emiMonthly} onChange={(e) => set('emiMonthly', e.target.value)} required /></Field>}
      </div>
      <Field label="Why? (optional)"><textarea value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={5000} /></Field>
      {f.kind !== 'other' && (
        <div className="row">
          <Button type="button" variant="secondary" onClick={() => preview.mutate()} loading={preview.isPending} disabled={!f.amount || (['buy_stock', 'sell_stock'].includes(f.kind) && !f.symbol)}>Preview impact</Button>
          {preview.error && <span className="field-error">{errorMessage(preview.error)}</span>}
        </div>
      )}
      {preview.data && <ImpactView impact={preview.data} />}
      {create.error && <Notice tone="bad">{errorMessage(create.error)}</Notice>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={create.isPending}>Submit for family approval</Button>
      </div>
    </form>
  );
}

export function ImpactView({ impact }: { impact: any }) {
  if (impact.redacted) return <Notice>{impact.note}</Notice>;
  const div = impact.diversification;
  return (
    <div className="stack">
      {impact.warnings?.map((w: string) => <Notice key={w} tone="warn">{w}</Notice>)}
      <div className="grid grid-3">
        <Card title="Resilience score"><div className="stat-value num">{impact.before.score} → {impact.after.score} <Badge tone={impact.scoreDelta >= 0 ? 'good' : 'bad'}>{signed(impact.scoreDelta)}</Badge></div>
          <ul className="list-plain small" style={{ marginTop: 8 }}>{impact.pillarDeltas.filter((p: any) => Math.abs(p.delta) >= 0.05).map((p: any) => <li key={p.pillar}>{p.name}: {signed(p.delta)}</li>)}</ul>
        </Card>
        <Card title="Liquidity">
          <dl className="kv">
            <dt>Liquid cash</dt><dd>{inrCompact(impact.before.liquid)} → {inrCompact(impact.after.liquid)}</dd>
            <dt>Runway if income stops</dt><dd>{months(impact.before.runway.ifIncomeStopsMonths)} → {months(impact.after.runway.ifIncomeStopsMonths)}</dd>
            <dt>Monthly outflows</dt><dd>{inrCompact(impact.before.monthlyOutflows)} → {inrCompact(impact.after.monthlyOutflows)}</dd>
            <dt>Net worth</dt><dd>{inrCompact(impact.before.netWorth)} → {inrCompact(impact.after.netWorth)}</dd>
          </dl>
        </Card>
        <Card title="In a 30% crash">
          <dl className="kv">
            <dt>Portfolio loss</dt><dd>{inrCompact(impact.stressTest.before.portfolioLoss)} → {inrCompact(impact.stressTest.after.portfolioLoss)}</dd>
            <dt>Score after crash</dt><dd>{impact.stressTest.before.scoreAfterShock} → {impact.stressTest.after.scoreAfterShock}</dd>
          </dl>
          {div && <p className="small muted" style={{ marginTop: 8 }}>Largest stock: {div.before.topStock ? `${div.before.topStock.symbol} ${div.before.topStock.weightPct}%` : '—'} → {div.after.topStock ? `${div.after.topStock.symbol} ${div.after.topStock.weightPct}%` : '—'}. Largest sector: {div.before.topSector ? `${div.before.topSector.sector} ${div.before.topSector.weightPct}%` : '—'} → {div.after.topSector ? `${div.after.topSector.sector} ${div.after.topSector.weightPct}%` : '—'}.</p>}
        </Card>
      </div>
    </div>
  );
}

function ProposalDetail({ id }: { id: string }) {
  const { familyId, user, family } = useSession();
  const qc = useQueryClient();
  const key = ['proposal', familyId, id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ proposal: any }>(`/families/${familyId}/proposals/${id}`).then((r) => r.proposal) });
  const mine = useQuery({ queryKey: ['proposal-impact', familyId, id], queryFn: () => api.get<{ impact: any }>(`/families/${familyId}/proposals/${id}/impact`).then((r) => r.impact), enabled: false });
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');
  const refresh = (r: { proposal: any }) => { qc.setQueryData(key, r.proposal); qc.invalidateQueries({ queryKey: ['proposals', familyId] }); };
  const addComment = useMutation({ mutationFn: () => api.post<{ proposal: any }>(`/families/${familyId}/proposals/${id}/comments`, { body: comment }), onSuccess: (r) => { setComment(''); refresh(r); } });
  const vote = useMutation({ mutationFn: (v: 'approve' | 'reject') => api.post<{ proposal: any }>(`/families/${familyId}/proposals/${id}/vote`, { vote: v, note: note || undefined }), onSuccess: refresh });
  const withdraw = useMutation({ mutationFn: () => api.post<{ proposal: any }>(`/families/${familyId}/proposals/${id}/withdraw`), onSuccess: refresh });

  if (q.isLoading) return <div className="content"><Loading /></div>;
  if (q.error) return <div className="content"><ErrorState error={q.error} /></div>;
  const p = q.data;
  const isProposer = p.createdBy === user?.id;
  const canVote = p.status === 'open' && !isProposer && canWrite(family?.myRole);
  const myVote = p.votes.find((v: any) => v.userId === user?.id);
  return (
    <>
      <PageHeader title={p.title}><Link to="/decisions" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> All decisions</Link></PageHeader>
      <div className="content stack">
        <div className="row"><Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge><span className="muted">{KIND_LABEL[p.kind]}{p.amount ? ` · ${inr(p.amount)}` : ''}{p.decision?.symbol ? ` · ${p.decision.symbol}` : ''} · proposed by {p.proposerName} on {dateTime(p.createdAt)}</span></div>
        {p.description && <Card><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.description}</p></Card>}
        {p.impact && (
          <Card title="Impact on the family" subtitle={p.impact.redacted ? undefined : `Calculated ${dateTime(p.impact.computedAt)} from the proposer's view`}
            actions={p.impact.redacted && <Button size="sm" variant="secondary" loading={mine.isFetching} onClick={() => mine.refetch()}>Recalculate for me</Button>}>
            <ImpactView impact={mine.data || p.impact} />
            {mine.error && <Notice tone="bad">{errorMessage(mine.error)}</Notice>}
          </Card>
        )}
        <div className="grid grid-2">
          <Card title={`Votes (${p.votes.filter((v: any) => v.vote === 'approve').length}/${p.requiredApprovals} approvals needed)`}>
            <ul className="list-plain">
              {p.votes.length === 0 && <li className="muted">No votes yet.</li>}
              {p.votes.map((v: any) => <li key={v.userId}><Badge tone={v.vote === 'approve' ? 'good' : 'bad'}>{v.vote}</Badge> {v.name}{v.note && <span className="muted"> — {v.note}</span>}</li>)}
            </ul>
            {canVote && (
              <div className="stack-sm" style={{ marginTop: 12 }}>
                <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
                <div className="row">
                  <Button onClick={() => vote.mutate('approve')} loading={vote.isPending}>{myVote ? 'Change to approve' : 'Approve'}</Button>
                  <Button variant="danger" onClick={() => vote.mutate('reject')} loading={vote.isPending}>{myVote ? 'Change to reject' : 'Reject'}</Button>
                </div>
              </div>
            )}
            {isProposer && p.status === 'open' && <div style={{ marginTop: 12 }}><Button variant="secondary" onClick={() => withdraw.mutate()} loading={withdraw.isPending}>Withdraw proposal</Button></div>}
            {(vote.error || withdraw.error) && <Notice tone="bad">{errorMessage(vote.error || withdraw.error)}</Notice>}
          </Card>
          <Card title="Discussion">
            <ul className="list-plain">
              {p.comments.length === 0 && <li className="muted">No comments yet.</li>}
              {p.comments.map((c: any) => <li key={c.id}><strong>{c.name}</strong> <span className="small muted">{dateTime(c.at)}</span><div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div></li>)}
            </ul>
            <form className="stack-sm" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); addComment.mutate(); }}>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" maxLength={4000} required />
              <Button type="submit" variant="secondary" loading={addComment.isPending}>Comment</Button>
              {addComment.error && <Notice tone="bad">{errorMessage(addComment.error)}</Notice>}
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
