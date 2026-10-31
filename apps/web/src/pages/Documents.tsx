// Documents go straight into the user's Meko knowledge base so the chatbot can
// answer from them. FinSight keeps only metadata and suggested records, which are
// added to the family's records only after the user approves them.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileUp, Loader2, Trash2, TriangleAlert } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { dateTime, inr } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorState, Field, Loading, Notice } from '../components/ui';
import { PageHeader } from '../App';

interface Suggestions {
  summary?: string;
  incomes: { name: string; category: string; amount: number; frequency: string }[];
  accounts: { name: string; kind: string; value: number; institution?: string | null }[];
  holdings: { symbol: string; name?: string | null; quantity: number; avgPrice?: number | null }[];
  liabilities: { name: string; kind: string; outstanding: number; emiMonthly?: number }[];
}
interface Doc {
  id: string; kind: string; kindLabel: string; filename: string; sizeBytes: number; status: 'uploading' | 'indexing' | 'indexed' | 'failed';
  statusDetail: string | null; createdAt: string; analysisStatus: string; analysisError: string | null; suggestions: Suggestions | null; appliedAt: string | null;
}

const KINDS: [string, string][] = [
  ['itr', 'Income tax return (ITR)'], ['cas_statement', 'CAS / mutual fund statement'], ['broker_statement', 'Broker holdings statement'],
  ['salary_slip', 'Salary slip'], ['bank_statement', 'Bank statement'], ['loan', 'Loan statement'], ['insurance', 'Insurance policy'],
  ['pan', 'PAN card'], ['aadhaar', 'Aadhaar'], ['other', 'Other'],
];

function StatusBadge({ d }: { d: Doc }) {
  if (d.status === 'indexed') return <Badge tone="good"><CheckCircle2 size={12} /> Ready for chat</Badge>;
  if (d.status === 'failed') return <Badge tone="bad">Indexing failed</Badge>;
  return <Badge tone="info"><Loader2 size={12} className="spin" /> Indexing in Meko…</Badge>;
}

function Review({ d }: { d: Doc }) {
  const { familyId, families } = useSession();
  const qc = useQueryClient();
  const s = d.suggestions!;
  const [target, setTarget] = useState(familyId || '');
  const all = (k: keyof Suggestions) => (Array.isArray(s[k]) ? (s[k] as unknown[]).map((_, i) => i) : []);
  const [sel, setSel] = useState({ incomes: all('incomes'), accounts: all('accounts'), holdings: all('holdings'), liabilities: all('liabilities') });
  const apply = useMutation({
    mutationFn: () => api.post<{ added: Record<string, number> }>(`/me/documents/${d.id}/apply`, { familyId: target, ...sel }),
    onSuccess: () => { ['documents', 'records', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
  });
  const toggle = (k: keyof typeof sel, i: number) => setSel((x) => ({ ...x, [k]: x[k].includes(i) ? x[k].filter((y) => y !== i) : [...x[k], i] }));
  const rows: { k: keyof typeof sel; title: string; items: { i: number; text: string }[] }[] = [
    { k: 'incomes' as const, title: 'Income', items: s.incomes.map((x, i) => ({ i, text: `${x.name}: ${inr(x.amount)} ${x.frequency.replace('_', '-')}` })) },
    { k: 'accounts' as const, title: 'Accounts & funds', items: s.accounts.map((x, i) => ({ i, text: `${x.name}${x.institution ? ` (${x.institution})` : ''}: ${inr(x.value)}` })) },
    { k: 'holdings' as const, title: 'Holdings', items: s.holdings.map((x, i) => ({ i, text: `${x.symbol}${x.name ? ` · ${x.name}` : ''}: ${x.quantity} units${x.avgPrice ? ` @ ${inr(x.avgPrice, { decimals: 2 })}` : ''}` })) },
    { k: 'liabilities' as const, title: 'Loans', items: s.liabilities.map((x, i) => ({ i, text: `${x.name}: ${inr(x.outstanding)} outstanding${x.emiMonthly ? `, EMI ${inr(x.emiMonthly)}` : ''}` })) },
  ].filter((r) => r.items.length);
  if (!rows.length) return <p className="small muted">No income, accounts, holdings or loans were found in this document.</p>;
  return (
    <div className="stack-sm review">
      {s.summary && <p className="small" style={{ margin: 0 }}>{s.summary}</p>}
      <p className="small muted" style={{ margin: 0 }}>Suggested by AI from the document. Check the figures before adding them.</p>
      {rows.map((r) => (
        <fieldset key={r.k} className="review-group">
          <legend>{r.title}</legend>
          {r.items.map(({ i, text }) => (
            <label key={i} className="check small"><input type="checkbox" checked={sel[r.k].includes(i)} onChange={() => toggle(r.k, i)} /> {text}</label>
          ))}
        </fieldset>
      ))}
      {d.appliedAt ? <Notice tone="good">Added to your records on {dateTime(d.appliedAt)}.</Notice> : (
        <div className="row">
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Add to family">{families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          <Button onClick={() => apply.mutate()} loading={apply.isPending} disabled={!target}>Add selected to my records</Button>
        </div>
      )}
      {apply.data && <Notice tone="good">Added {Object.entries(apply.data.added).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing'}. <Link to="/records">See records</Link></Notice>}
      {apply.error && <Notice tone="bad">{errorMessage(apply.error)}</Notice>}
    </div>
  );
}

export default function Documents() {
  const qc = useQueryClient();
  const [kind, setKind] = useState('itr');
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const docs = useQuery({
    queryKey: ['documents'], queryFn: () => api.get<{ documents: Doc[] }>('/me/documents'),
    refetchInterval: (q) => (q.state.data?.documents.some((d) => d.status === 'indexing') ? 10000 : false),
  });
  const upload = useMutation({
    mutationFn: () => {
      const f = new FormData();
      f.append('kind', kind); f.append('consent', String(consent)); f.append('file', file!);
      return api.upload<{ document: Doc; duplicate?: boolean }>('/me/documents', f);
    },
    onSuccess: () => { setFile(null); setConsent(false); qc.invalidateQueries({ queryKey: ['documents'] }); },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/me/documents/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }) });
  const submit = (e: FormEvent) => { e.preventDefault(); if (file && consent) upload.mutate(); };

  return (
    <>
      <PageHeader title="Documents" />
      <div className="content stack">
        <Card title="Add a document" subtitle="ITR, salary slips, CAS or broker statements, bank and loan statements, insurance, PAN. FinSight's chatbot can then answer from them.">
          <form className="stack-sm" onSubmit={submit}>
            <div className="form-grid">
              <Field label="Document type"><select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <Field label="File" hint="PDF with selectable text, up to 5 MB (download it from the income-tax, CAMS/NSDL or bank portal). Photos aren't supported.">
                <input type="file" accept=".pdf,.txt,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </Field>
            </div>
            <label className="check small consent-box">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span><TriangleAlert size={14} /> I understand the <strong>original file</strong>, including any PAN, Aadhaar, account or policy numbers in it, will be stored in my Meko knowledge base (a third-party service) so the chatbot can read it. I can delete it here at any time.</span>
            </label>
            <div><Button type="submit" disabled={!file || !consent} loading={upload.isPending}><FileUp size={16} /> Upload to Meko</Button></div>
            {upload.data?.duplicate && <Notice tone="info">You already uploaded this file.</Notice>}
            {upload.error && <Notice tone="bad">{errorMessage(upload.error)}</Notice>}
          </form>
        </Card>

        <Card title="Your documents" subtitle="Only you can see these. In family planning, they're used only if you share your memory with the family.">
          {docs.isLoading ? <Loading /> : docs.error ? <ErrorState error={docs.error} onRetry={() => docs.refetch()} /> : !docs.data?.documents.length ? (
            <Empty title="No documents yet">Upload your latest ITR or a CAS statement to build your portfolio faster.</Empty>
          ) : (
            <ul className="doc-list">
              {docs.data.documents.map((d) => (
                <li key={d.id} className="stack-sm">
                  <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <div className="break"><strong>{d.kindLabel}</strong> <span className="small muted">{d.filename} · {(d.sizeBytes / 1024).toFixed(0)} KB · {dateTime(d.createdAt)}</span></div>
                    <div className="row"><StatusBadge d={d} />
                      <Button variant="ghost" size="sm" aria-label={`Delete ${d.filename}`} loading={remove.isPending && remove.variables === d.id} onClick={() => remove.mutate(d.id)}><Trash2 size={15} /></Button>
                    </div>
                  </div>
                  {d.analysisStatus === 'pending' && <p className="small muted" style={{ margin: 0 }}><Loader2 size={12} className="spin" /> Reading figures from the document…</p>}
                  {d.analysisStatus === 'failed' && <p className="small muted" style={{ margin: 0 }}>Couldn't extract figures: {d.analysisError}</p>}
                  {d.analysisStatus === 'unavailable' && <p className="small muted" style={{ margin: 0 }}>Figure extraction needs an AI provider on the server.</p>}
                  {d.analysisStatus === 'done' && d.suggestions && <Review d={d} />}
                </li>
              ))}
            </ul>
          )}
          {remove.error && <Notice tone="bad">{errorMessage(remove.error)}</Notice>}
        </Card>
      </div>
    </>
  );
}
