import { Fragment, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { canWrite, useSession } from '../lib/session';
import type { Account, Cashflow, Holding, Liability, Owner } from '../lib/types';
import { date, dateTime, inr, inrCompact, label } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorState, Field, Loading, Modal, Notice, Tabs } from '../components/ui';
import { OwnersInput } from '../components/OwnersInput';
import { PageHeader } from '../App';

type Entity = 'accounts' | 'liabilities' | 'cashflows';
const ACCOUNT_KINDS = ['bank', 'savings', 'cash', 'fixed_deposit', 'brokerage', 'mutual_fund', 'retirement', 'gold', 'real_estate', 'other'];
const LIAB_KINDS = ['home_loan', 'car_loan', 'personal_loan', 'education_loan', 'credit_card', 'gold_loan', 'business_loan', 'other'];

function OwnersCell({ owners, visibility }: { owners: Owner[]; visibility: string }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      {visibility === 'private' ? <Badge tone="info"><Lock size={11} /> Private</Badge> : <Badge><Users size={11} /> Shared</Badge>}
      <span className="small muted">{owners.map((o) => `${o.name?.split(' ')[0]} ${o.sharePct}%`).join(', ')}</span>
    </span>
  );
}

export default function Records() {
  const { family } = useSession();
  const [tab, setTab] = useState<Entity>('accounts');
  const [editing, setEditing] = useState<{ entity: Entity; item?: any } | null>(null);
  const writable = canWrite(family?.myRole);
  return (
    <>
      <PageHeader title="Money & records">
        {writable && <Button onClick={() => setEditing({ entity: tab })}><Plus size={16} /> Add {tab === 'accounts' ? 'account' : tab === 'liabilities' ? 'loan' : 'income / expense'}</Button>}
      </PageHeader>
      <div className="content stack">
        <Tabs value={tab} onChange={setTab} options={[
          { value: 'accounts', label: 'Accounts & investments' },
          { value: 'liabilities', label: 'Loans & cards' },
          { value: 'cashflows', label: 'Income & expenses' },
        ]} />
        {!writable && <Notice>You have view-only access to this family's shared records.</Notice>}
        {tab === 'accounts' && <AccountsTable onEdit={(item) => setEditing({ entity: 'accounts', item })} />}
        {tab === 'liabilities' && <LiabilitiesTable onEdit={(item) => setEditing({ entity: 'liabilities', item })} />}
        {tab === 'cashflows' && <CashflowsTable onEdit={(item) => setEditing({ entity: 'cashflows', item })} />}
      </div>
      <Modal title={`${editing?.item ? 'Edit' : 'Add'} ${editing?.entity === 'accounts' ? 'account' : editing?.entity === 'liabilities' ? 'loan' : 'income or expense'}`}
        open={Boolean(editing)} onClose={() => setEditing(null)}>
        {editing && <RecordForm entity={editing.entity} item={editing.item} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function useList<T>(entity: Entity) {
  const { familyId } = useSession();
  return useQuery({
    queryKey: ['records', familyId, entity],
    queryFn: () => api.get<Record<string, T[]>>(`/families/${familyId}/${entity}`).then((r) => r[entity]),
    enabled: Boolean(familyId),
  });
}

function useRemove(entity: Entity) {
  const { familyId } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/families/${familyId}/${entity}/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['records', familyId] }); qc.invalidateQueries({ queryKey: ['dashboard', familyId] }); },
  });
}

function RowActions({ entity, item, onEdit }: { entity: Entity; item: { id: string; name: string }; onEdit: () => void }) {
  const remove = useRemove(entity);
  return (
    <span className="row" style={{ gap: 2, justifyContent: 'flex-end' }}>
      <button className="icon-btn" onClick={onEdit} aria-label={`Edit ${item.name}`}><Pencil size={15} /></button>
      <button className="icon-btn" aria-label={`Delete ${item.name}`} disabled={remove.isPending}
        onClick={() => { if (confirm(`Delete "${item.name}"? This removes it from all calculations.`)) remove.mutate(item.id, { onError: (e) => alert(errorMessage(e)) }); }}>
        <Trash2 size={15} />
      </button>
    </span>
  );
}

function AccountsTable({ onEdit }: { onEdit: (a: Account) => void }) {
  const q = useList<Account>('accounts');
  const [open, setOpen] = useState<string | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <Card><Empty title="No accounts yet">Add bank balances, FDs, demat accounts, mutual funds and property. Each can be private or shared, and split between owners.</Empty></Card>;
  return (
    <Card pad={false}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Account</th><th>Type</th><th>Liquidity</th><th>Ownership</th><th className="r">Value</th><th /></tr></thead>
          <tbody>
            {q.data.map((a) => {
              const fromHoldings = a.valueSource !== 'manual';
              return (
                <Fragment key={a.id}>
                  <tr>
                    <td><strong>{a.name}</strong>{a.institution && <div className="small muted">{a.institution}</div>}</td>
                    <td>{label(a.kind)}{a.equityPct > 0 && <div className="small muted">{a.equityPct}% equity</div>}</td>
                    <td><Badge tone={a.liquidity === 'liquid' ? 'good' : a.liquidity === 'semi_liquid' ? 'info' : 'neutral'}>{label(a.liquidity)}</Badge></td>
                    <td><OwnersCell owners={a.owners} visibility={a.visibility} /></td>
                    <td className="r num">{fromHoldings ? <button className="btn btn-ghost btn-sm" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Hide' : 'Show'} holdings</button> : inr(a.value)}</td>
                    <td className="r"><RowActions entity="accounts" item={a} onEdit={() => onEdit(a)} /></td>
                  </tr>
                  {open === a.id && <tr><td colSpan={6} style={{ background: 'var(--surface-2)' }}><HoldingsPanel account={a} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function HoldingsPanel({ account }: { account: Account }) {
  const { familyId } = useSession();
  const qc = useQueryClient();
  const key = ['holdings', familyId, account.id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ holdings: Holding[] }>(`/families/${familyId}/accounts/${account.id}/holdings`).then((r) => r.holdings) });
  const [form, setForm] = useState({ symbol: '', exchange: 'NSE', sector: '', instrument: 'equity', quantity: '', avgPrice: '' });
  const invalidate = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['dashboard', familyId] }); };
  const add = useMutation({
    mutationFn: () => api.post(`/families/${familyId}/accounts/${account.id}/holdings`, {
      symbol: form.symbol, exchange: form.exchange, sector: form.sector || null, instrument: form.instrument,
      quantity: Number(form.quantity), avgPrice: Number(form.avgPrice || 0),
    }),
    onSuccess: () => { setForm({ ...form, symbol: '', quantity: '', avgPrice: '', sector: '' }); invalidate(); },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/families/${familyId}/accounts/${account.id}/holdings/${id}`), onSuccess: invalidate });
  const refresh = useMutation({ mutationFn: () => api.post<{ updated: number; failed: { symbol: string; error: string }[] }>('/market/refresh-holdings', { familyId }), onSuccess: invalidate });
  const total = (q.data || []).reduce((s, h) => s + h.value, 0);
  return (
    <div className="stack-sm" style={{ padding: 8 }}>
      <div className="row-between">
        <strong>Holdings · {inr(total)}</strong>
        <Button size="sm" variant="secondary" loading={refresh.isPending} onClick={() => refresh.mutate()}><RefreshCw size={14} /> Refresh prices</Button>
      </div>
      {refresh.data && <Notice tone={refresh.data.failed.length ? 'warn' : 'good'}>Updated {refresh.data.updated} price(s).{refresh.data.failed.length > 0 && ` Could not price: ${refresh.data.failed.map((f) => f.symbol).join(', ')}.`} Prices are ~15 min delayed.</Notice>}
      {refresh.error && <Notice tone="bad">{errorMessage(refresh.error)}</Notice>}
      {q.isLoading ? <Loading /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Symbol</th><th>Sector</th><th className="r">Qty</th><th className="r">Avg price</th><th className="r">Last price</th><th className="r">Value</th><th /></tr></thead>
            <tbody>
              {(q.data || []).map((h) => (
                <tr key={h.id}>
                  <td><strong>{h.symbol}</strong> <span className="small muted">{h.exchange}</span>{h.source === 'zerodha' && <Badge tone="info">Zerodha</Badge>}</td>
                  <td>{h.sector || <span className="muted">Unclassified</span>}</td>
                  <td className="r num">{h.quantity}</td>
                  <td className="r num">{inr(h.avgPrice, { decimals: 2 })}</td>
                  <td className="r num" title={h.priceAsOf ? `As of ${dateTime(h.priceAsOf)} (${h.priceSource})` : 'No market price yet; valued at average price'}>
                    {h.lastPrice != null ? inr(h.lastPrice, { decimals: 2 }) : <span className="muted">—</span>}
                  </td>
                  <td className="r num">{inr(h.value)}</td>
                  <td className="r">{account.canEdit !== false && <button className="icon-btn" aria-label={`Remove ${h.symbol}`} onClick={() => remove.mutate(h.id)}><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="row" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <input placeholder="Symbol e.g. TCS" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} required style={{ width: 130 }} aria-label="Symbol" />
        <select value={form.exchange} onChange={(e) => setForm({ ...form, exchange: e.target.value })} style={{ width: 80 }} aria-label="Exchange"><option>NSE</option><option>BSE</option></select>
        <select value={form.instrument} onChange={(e) => setForm({ ...form, instrument: e.target.value })} style={{ width: 120 }} aria-label="Instrument">
          <option value="equity">Stock</option><option value="etf">ETF</option><option value="mutual_fund">Mutual fund</option><option value="bond">Bond</option>
        </select>
        <input placeholder="Sector" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} style={{ width: 140 }} aria-label="Sector" />
        <input placeholder="Quantity" type="number" min={0} step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required style={{ width: 100 }} aria-label="Quantity" />
        <input placeholder="Avg price ₹" type="number" min={0} step="any" value={form.avgPrice} onChange={(e) => setForm({ ...form, avgPrice: e.target.value })} style={{ width: 120 }} aria-label="Average price" />
        <Button size="sm" type="submit" loading={add.isPending}><Plus size={14} /> Add / update</Button>
      </form>
      {add.error && <Notice tone="bad">{errorMessage(add.error)}</Notice>}
    </div>
  );
}

function LiabilitiesTable({ onEdit }: { onEdit: (l: Liability) => void }) {
  const q = useList<Liability>('liabilities');
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <Card><Empty title="No loans or cards recorded">Add home loans, car loans, credit card balances and their EMIs.</Empty></Card>;
  return (
    <Card pad={false}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Loan</th><th>Type</th><th>Ownership</th><th className="r">Rate</th><th className="r">EMI / month</th><th className="r">Outstanding</th><th /></tr></thead>
          <tbody>
            {q.data.map((l) => (
              <tr key={l.id}>
                <td><strong>{l.name}</strong>{l.lender && <div className="small muted">{l.lender}</div>}</td>
                <td>{label(l.kind)}</td>
                <td><OwnersCell owners={l.owners} visibility={l.visibility} /></td>
                <td className="r num">{l.interestRatePct != null ? `${l.interestRatePct}% ${l.rateType}` : l.rateType}</td>
                <td className="r num">{inr(l.emiMonthly)}</td>
                <td className="r num">{inr(l.outstanding)}</td>
                <td className="r"><RowActions entity="liabilities" item={l} onEdit={() => onEdit(l)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CashflowsTable({ onEdit }: { onEdit: (c: Cashflow) => void }) {
  const q = useList<Cashflow>('cashflows');
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <Card><Empty title="No income or expenses yet">Add salaries, rent, household costs, school fees, insurance premiums and subscriptions. Mark which expenses are essential.</Empty></Card>;
  const groups = [{ title: 'Income', items: q.data.filter((c) => c.direction === 'income') }, { title: 'Expenses', items: q.data.filter((c) => c.direction === 'expense') }];
  return (
    <div className="stack">
      {groups.map((g) => (
        <Card key={g.title} title={g.title} pad={false}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Category</th><th>Ownership</th><th>Frequency</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>
                {g.items.length === 0 && <tr><td colSpan={6} className="muted">None recorded.</td></tr>}
                {g.items.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong>{c.direction === 'expense' && <div><Badge tone={c.essential ? 'neutral' : 'warn'}>{c.essential ? 'Essential' : 'Discretionary'}</Badge></div>}
                      {(c.startsOn || c.endsOn) && <div className="small muted">{c.startsOn ? `from ${date(c.startsOn)} ` : ''}{c.endsOn ? `until ${date(c.endsOn)}` : ''}</div>}</td>
                    <td>{c.category}</td>
                    <td><OwnersCell owners={c.owners} visibility={c.visibility} /></td>
                    <td>{label(c.frequency)}</td>
                    <td className="r num">{inr(c.amount)}</td>
                    <td className="r"><RowActions entity="cashflows" item={c} onEdit={() => onEdit(c)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---- Create / edit form ------------------------------------------------------------
function RecordForm({ entity, item, onDone }: { entity: Entity; item?: any; onDone: () => void }) {
  const { familyId, family, user } = useSession();
  const qc = useQueryClient();
  const members = family?.members || [];
  const [owners, setOwners] = useState<Owner[]>(item?.owners?.map((o: Owner) => ({ userId: o.userId, sharePct: o.sharePct })) || [{ userId: user!.id, sharePct: 100 }]);
  const [f, setF] = useState<Record<string, any>>(() => item ? { ...item } : entity === 'accounts'
    ? { name: '', kind: 'savings', value: '', visibility: 'family', equityPct: '' }
    : entity === 'liabilities' ? { name: '', kind: 'home_loan', outstanding: '', emiMonthly: '', interestRatePct: '', rateType: 'floating', remainingMonths: '', visibility: 'family' }
      : { direction: 'expense', category: '', name: '', amount: '', frequency: 'monthly', essential: true, visibility: 'family' });
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const num = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v));

  const save = useMutation({
    mutationFn: () => {
      let body: Record<string, unknown>;
      if (entity === 'accounts') {
        const holdings = f.kind === 'brokerage' && (f.valueSource ?? 'holdings') !== 'manual';
        body = { name: f.name, kind: f.kind, visibility: f.visibility, institution: f.institution || null, notes: f.notes || null,
          maturityDate: f.maturityDate || null, equityPct: num(f.equityPct), liquidity: f.liquidity || undefined };
        if (!item) body.valueSource = holdings ? 'holdings' : 'manual';
        if (!holdings) body.value = num(f.value) ?? 0;
      } else if (entity === 'liabilities') {
        body = { name: f.name, kind: f.kind, outstanding: num(f.outstanding) ?? 0, emiMonthly: num(f.emiMonthly) ?? 0, interestRatePct: num(f.interestRatePct) ?? null,
          rateType: f.rateType, remainingMonths: num(f.remainingMonths) ?? null, lender: f.lender || null, visibility: f.visibility };
      } else {
        body = { direction: f.direction, category: f.category, name: f.name, amount: num(f.amount) ?? 0, frequency: f.frequency,
          essential: f.direction === 'income' ? true : Boolean(f.essential), visibility: f.visibility, startsOn: f.startsOn || null, endsOn: f.endsOn || null };
      }
      body.owners = owners;
      for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
      return item ? api.patch(`/families/${familyId}/${entity}/${item.id}`, body) : api.post(`/families/${familyId}/${entity}`, body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['records', familyId] }); qc.invalidateQueries({ queryKey: ['dashboard', familyId] }); onDone(); },
  });

  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <form className="stack" onSubmit={submit}>
      {entity === 'accounts' && (
        <div className="form-grid">
          <Field label="Name"><input value={f.name} onChange={(e) => set('name', e.target.value)} required maxLength={120} placeholder="e.g. HDFC savings" /></Field>
          <Field label="Type">
            <select value={f.kind} onChange={(e) => set('kind', e.target.value)} disabled={Boolean(item)}>{ACCOUNT_KINDS.map((k) => <option key={k} value={k}>{label(k)}</option>)}</select>
          </Field>
          {(f.kind !== 'brokerage' || f.valueSource === 'manual') && (
            <Field label="Current value (₹)"><input type="number" min={0} step="any" value={f.value} onChange={(e) => set('value', e.target.value)} required /></Field>
          )}
          {f.kind === 'brokerage' && !item && <Field label="Value" hint="Holdings: add stocks after saving; value updates with market prices."><input value="From holdings" disabled /></Field>}
          <Field label="Liquidity" hint="Liquid = usable within days without loss.">
            <select value={f.liquidity || ''} onChange={(e) => set('liquidity', e.target.value)}>
              <option value="">Default for type</option><option value="liquid">Liquid</option><option value="semi_liquid">Semi-liquid</option><option value="illiquid">Illiquid</option>
            </select>
          </Field>
          {['mutual_fund', 'retirement', 'other'].includes(f.kind) && (
            <Field label="Equity exposure (%)" hint="Share that moves with the stock market."><input type="number" min={0} max={100} value={f.equityPct} onChange={(e) => set('equityPct', e.target.value)} placeholder={f.kind === 'mutual_fund' ? '100' : '0'} /></Field>
          )}
          <Field label="Institution (optional)"><input value={f.institution || ''} onChange={(e) => set('institution', e.target.value)} maxLength={120} /></Field>
          {f.kind === 'fixed_deposit' && <Field label="Maturity date"><input type="date" value={f.maturityDate || ''} onChange={(e) => set('maturityDate', e.target.value)} /></Field>}
        </div>
      )}
      {entity === 'liabilities' && (
        <div className="form-grid">
          <Field label="Name"><input value={f.name} onChange={(e) => set('name', e.target.value)} required maxLength={120} placeholder="e.g. SBI home loan" /></Field>
          <Field label="Type"><select value={f.kind} onChange={(e) => set('kind', e.target.value)}>{LIAB_KINDS.map((k) => <option key={k} value={k}>{label(k)}</option>)}</select></Field>
          <Field label="Outstanding (₹)"><input type="number" min={0} step="any" value={f.outstanding} onChange={(e) => set('outstanding', e.target.value)} required /></Field>
          <Field label="EMI per month (₹)"><input type="number" min={0} step="any" value={f.emiMonthly} onChange={(e) => set('emiMonthly', e.target.value)} /></Field>
          <Field label="Interest rate (% p.a.)"><input type="number" min={0} max={100} step="any" value={f.interestRatePct ?? ''} onChange={(e) => set('interestRatePct', e.target.value)} /></Field>
          <Field label="Rate type"><select value={f.rateType} onChange={(e) => set('rateType', e.target.value)}><option value="floating">Floating</option><option value="fixed">Fixed</option></select></Field>
          <Field label="Months remaining"><input type="number" min={0} value={f.remainingMonths ?? ''} onChange={(e) => set('remainingMonths', e.target.value)} /></Field>
          <Field label="Lender (optional)"><input value={f.lender || ''} onChange={(e) => set('lender', e.target.value)} maxLength={120} /></Field>
        </div>
      )}
      {entity === 'cashflows' && (
        <div className="form-grid">
          <Field label="Direction"><select value={f.direction} onChange={(e) => set('direction', e.target.value)} disabled={Boolean(item)}><option value="income">Income</option><option value="expense">Expense</option></select></Field>
          <Field label="Name"><input value={f.name} onChange={(e) => set('name', e.target.value)} required maxLength={120} placeholder={f.direction === 'income' ? 'e.g. Salary' : 'e.g. Rent'} /></Field>
          <Field label="Category"><input value={f.category} onChange={(e) => set('category', e.target.value)} required maxLength={60} placeholder={f.direction === 'income' ? 'salary' : 'housing'} /></Field>
          <Field label="Amount (₹)"><input type="number" min={0} step="any" value={f.amount} onChange={(e) => set('amount', e.target.value)} required /></Field>
          <Field label="Frequency"><select value={f.frequency} onChange={(e) => set('frequency', e.target.value)}>{['monthly', 'quarterly', 'half_yearly', 'yearly'].map((k) => <option key={k} value={k}>{label(k)}</option>)}</select></Field>
          {f.direction === 'expense' && <Field group label="Essential?" hint="Essential costs can't be cut in an emergency."><label className="check"><input type="checkbox" checked={Boolean(f.essential)} onChange={(e) => set('essential', e.target.checked)} /> Essential</label></Field>}
          <Field label="Starts (optional)"><input type="date" value={f.startsOn || ''} onChange={(e) => set('startsOn', e.target.value)} /></Field>
          <Field label="Ends (optional)"><input type="date" value={f.endsOn || ''} onChange={(e) => set('endsOn', e.target.value)} /></Field>
        </div>
      )}
      <Field group label="Who owns this?" hint="Each owner's share is used for individual views; the family view counts the record once.">
        <OwnersInput members={members} value={owners} onChange={setOwners} />
      </Field>
      <Field label="Visibility">
        <select value={f.visibility} onChange={(e) => set('visibility', e.target.value)}>
          <option value="family">Shared with the family</option>
          <option value="private">Private — only the owners can see it</option>
        </select>
      </Field>
      {save.error && <Notice tone="bad">{errorMessage(save.error)}</Notice>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>{item ? 'Save changes' : 'Add'}</Button>
      </div>
      {item && <p className="small muted">Values as of {dateTime(item.updatedAt)}. {inrCompact(item.value ?? item.outstanding ?? item.amount)}</p>}
    </form>
  );
}
