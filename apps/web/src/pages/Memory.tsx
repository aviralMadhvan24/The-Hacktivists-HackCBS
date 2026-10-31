import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { dateTime } from '../lib/format';
import { Badge, Button, Card, Empty, Field, Loading, Modal, Notice } from '../components/ui';
import { PageHeader } from '../App';

const KINDS = [['goal', 'Goal'], ['preference', 'Preference'], ['decision', 'Decision'], ['investment_reasoning', 'Investment reasoning'], ['stress_summary', 'Stress-test summary'], ['company_research', 'Company research'], ['note', 'Note']];
const kindLabel = (k: string) => KINDS.find(([v]) => v === k)?.[1] || k;
const SYNC: Record<string, { tone: 'good' | 'warn' | 'neutral' | 'bad'; label: string }> = {
  synced: { tone: 'good', label: 'In Meko' }, disabled: { tone: 'neutral', label: 'Saved locally' }, failed: { tone: 'warn', label: 'Meko sync failed' }, pending: { tone: 'neutral', label: 'Pending' },
};

export default function Memory() {
  const { familyId } = useSession();
  const qc = useQueryClient();
  const consents = useQuery({ queryKey: ['consents'], queryFn: () => api.get<{ active: Record<string, boolean> }>('/me/consents') });
  const list = useQuery({ queryKey: ['context', familyId], queryFn: () => api.get<{ memories: any[] }>(`/families/${familyId}/context`).then((r) => r.memories) });
  const [q, setQ] = useState('');
  const search = useMutation({ mutationFn: () => api.get<any>(`/families/${familyId}/context/search?q=${encodeURIComponent(q)}`) });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['context', familyId] });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/families/${familyId}/context/${id}`), onSuccess: invalidate });
  const resync = useMutation({ mutationFn: () => api.post<{ results: any[] }>(`/families/${familyId}/context/resync`), onSuccess: invalidate });
  const unsynced = (list.data || []).filter((m) => m.syncStatus !== 'synced').length;
  const consented = consents.data?.active.meko_context;

  const rows = search.data ? search.data.results : list.data;
  return (
    <>
      <PageHeader title="Family memory">{consented && <Button onClick={() => setAdding(true)}>Add context</Button>}</PageHeader>
      <div className="content stack">
        <Notice>
          Goals, preferences and the reasoning behind past decisions, so future analysis can take them into account. Stored as approved summaries with account numbers and personal identifiers removed. Balances always come from your records, never from memory.
        </Notice>
        {consents.data && !consented && <Notice tone="warn">Saving context is off. Turn on "Remember decisions and preferences" in <Link to="/settings">Settings</Link>.</Notice>}
        <Card>
          <form className="row" onSubmit={(e: FormEvent) => { e.preventDefault(); if (q.trim()) search.mutate(); else search.reset(); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memory, e.g. emergency fund, HDFC Bank" aria-label="Search memory" style={{ flex: 1, minWidth: 200 }} />
            <Button type="submit" variant="secondary" loading={search.isPending}>Search</Button>
            {search.data && <Button type="button" variant="ghost" onClick={() => { setQ(''); search.reset(); }}>Clear</Button>}
            {unsynced > 0 && <Button type="button" variant="ghost" onClick={() => resync.mutate()} loading={resync.isPending}>Retry Meko sync ({unsynced})</Button>}
          </form>
          {search.data?.degraded && <p className="small muted">{search.data.degraded}</p>}
          {search.error && <Notice tone="bad">{errorMessage(search.error)}</Notice>}
        </Card>
        {list.isLoading ? <Loading /> : !rows?.length ? <Card><Empty title={search.data ? 'Nothing matched' : 'No family memory yet'}>Save reasoning from investment evaluations, concall summaries, or add goals here.</Empty></Card> : (
          <div className="stack-sm">
            {rows.map((m: any) => (
              <Card key={m.id}>
                <div className="row-between">
                  <span className="row"><Badge tone="info">{kindLabel(m.kind)}</Badge>{m.private && <Badge><Lock size={11} /> Private</Badge>}<strong>{m.title}</strong></span>
                  <span className="row">
                    <Badge tone={SYNC[m.syncStatus]?.tone}>{SYNC[m.syncStatus]?.label}</Badge>
                    <button className="icon-btn" aria-label={`Correct ${m.title}`} onClick={() => setEditing(m)}><Pencil size={14} /></button>
                    <button className="icon-btn" aria-label={`Delete ${m.title}`} onClick={() => confirm('Delete this memory everywhere, including Meko?') && del.mutate(m.id, { onError: (e) => alert(errorMessage(e)) })}><Trash2 size={14} /></button>
                  </span>
                </div>
                <p style={{ margin: '8px 0' }}>{m.body}</p>
                <div className="small muted">{dateTime(m.createdAt)}{m.sources?.length > 0 && <> · Sources: {m.sources.map((s: any, i: number) => s.url ? <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">{s.label} </a> : <span key={i}>{s.label} </span>)}</>}</div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Modal title="Add family context" open={adding} onClose={() => setAdding(false)}><MemoryForm onDone={() => { setAdding(false); invalidate(); }} /></Modal>
      <Modal title="Correct this memory" open={Boolean(editing)} onClose={() => setEditing(null)}>{editing && <MemoryForm existing={editing} onDone={() => { setEditing(null); invalidate(); }} />}</Modal>
    </>
  );
}

function MemoryForm({ existing, onDone }: { existing?: any; onDone: () => void }) {
  const { familyId } = useSession();
  const [f, setF] = useState({ kind: existing?.kind || 'goal', title: existing?.title || '', body: existing?.body || '', private: existing?.private || false });
  const save = useMutation({
    mutationFn: () => existing
      ? api.patch<any>(`/families/${familyId}/context/${existing.id}`, { title: f.title, body: f.body })
      : api.post<any>(`/families/${familyId}/context`, f),
    onSuccess: (r) => { if (r.redactions?.length) alert(`Removed before saving: ${r.redactions.join(', ').replace(/_/g, ' ')}.`); onDone(); },
  });
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      {!existing && <Field label="Type"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>}
      <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} minLength={3} maxLength={160} required /></Field>
      <Field label="What should be remembered?" hint="Write a summary. Don't include account numbers — they are removed automatically."><textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} minLength={10} maxLength={4000} required /></Field>
      {!existing && <label className="check"><input type="checkbox" checked={f.private} onChange={(e) => setF({ ...f, private: e.target.checked })} /> Private — only I can see and use this</label>}
      {existing && <p className="small muted">Corrections replace the old memory everywhere, including Meko.</p>}
      {save.error && <Notice tone="bad">{errorMessage(save.error)}</Notice>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><Button type="button" variant="secondary" onClick={onDone}>Cancel</Button><Button type="submit" loading={save.isPending}>Save</Button></div>
    </form>
  );
}
