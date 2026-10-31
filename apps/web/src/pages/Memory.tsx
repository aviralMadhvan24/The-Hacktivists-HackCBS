// What Meko remembers about me. Memory is built by Meko from my chats with
// FinSight and my activity in the app; here I can read it and ask it to forget,
// but never write or edit it. Family sharing is also controlled here.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Brain, Trash2, Users } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { dateTime } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorState, Loading, Notice } from '../components/ui';
import { PageHeader } from '../App';

interface MemoryList { enabled: boolean; storage?: string; memories: { id: string; text: string; createdAt: string | null }[] }
interface Sharing { sharing: boolean; sharedBy: { userId: string; name: string }[] }

export default function Memory() {
  const { familyId, family, user } = useSession();
  const qc = useQueryClient();
  const mem = useQuery({ queryKey: ['memory'], queryFn: () => api.get<MemoryList>('/me/memory') });
  const share = useQuery({ queryKey: ['sharing', familyId], queryFn: () => api.get<Sharing>(`/families/${familyId}/memory-sharing`), enabled: Boolean(familyId) });
  const consents = useQuery({ queryKey: ['consents'], queryFn: () => api.get<{ active: Record<string, boolean> }>('/me/consents') });
  const forget = useMutation({ mutationFn: (id: string) => api.del(`/me/memory/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['memory'] }) });
  const setShare = useMutation({
    mutationFn: (v: boolean) => api.put<Sharing>(`/families/${familyId}/memory-sharing`, { share: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sharing', familyId] }),
  });
  const s = share.data;

  return (
    <>
      <PageHeader title="Memory" />
      <div className="content stack">
        <Card>
          <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 14 }}>
            <span className="icon-disc lg ic-violet"><Brain size={22} /></span>
            <div>
              <h2 style={{ margin: '0 0 4px' }}>What FinSight remembers about you</h2>
              <p className="muted" style={{ margin: 0 }}>
                Meko builds this memory by itself from your conversations with FinSight and what you do in the app (stress tests, decisions, syncs, documents).
                Nobody can type or edit memories here, so the chatbot only knows what really happened. You can ask it to forget anything.
              </p>
              {mem.data?.storage && <p className="small muted" style={{ margin: '6px 0 0' }}>Stored in Meko: {mem.data.storage}.</p>}
            </div>
          </div>
        </Card>

        {consents.data && !consents.data.active.meko_context && (
          <Notice tone="warn">Memory is off. Turn on <strong>Remember decisions and preferences</strong> in <Link to="/settings">Settings</Link> so FinSight can learn from your chats.</Notice>
        )}

        <Card title={<span className="row" style={{ gap: 8 }}><Users size={18} /> Family planning</span>}
          subtitle={`Share your memory and documents with ${family?.name || 'this family'}'s chat. Personal chats stay personal either way.`}>
          {share.isLoading ? <Loading /> : share.error ? <ErrorState error={share.error} /> : s && (
            <div className="stack-sm">
              <label className="check">
                <input type="checkbox" checked={s.sharing} disabled={setShare.isPending} onChange={(e) => setShare.mutate(e.target.checked)} />
                <span><strong>Share my memory with {family?.name || 'this family'}</strong><br /><span className="small muted">Family planning chats can then use what FinSight remembers about you and your uploaded documents.</span></span>
              </label>
              <p className="small muted" style={{ margin: 0 }}>
                Sharing now: {s.sharedBy.length ? s.sharedBy.map((m) => (m.userId === user?.id ? 'you' : m.name)).join(', ') : 'nobody yet'}.
              </p>
              {setShare.error && <Notice tone="bad">{errorMessage(setShare.error)}</Notice>}
            </div>
          )}
        </Card>

        <Card title="Memories" subtitle="Newest first. Meko may take a few seconds to add memories after a chat.">
          {mem.isLoading ? <Loading /> : mem.error ? <ErrorState error={mem.error} onRetry={() => mem.refetch()} /> : !mem.data?.enabled ? (
            <Notice tone="warn">Meko is not configured on this server, so nothing is remembered.</Notice>
          ) : mem.data.memories.length === 0 ? (
            <Empty title="Nothing remembered yet">Chat with FinSight on the <Link to="/">home page</Link>. Tell it your goals and rules (for example "I never invest in crypto") and Meko will remember them.</Empty>
          ) : (
            <ul className="memory-list">
              {mem.data.memories.map((m) => (
                <li key={m.id}>
                  <div>
                    <div>{m.text}</div>
                    {m.createdAt && <span className="small muted">{dateTime(m.createdAt)}</span>}
                  </div>
                  <Button variant="ghost" size="sm" aria-label="Forget this memory" loading={forget.isPending && forget.variables === m.id} onClick={() => forget.mutate(m.id)}><Trash2 size={15} /> Forget</Button>
                </li>
              ))}
            </ul>
          )}
          {forget.error && <Notice tone="bad">{errorMessage(forget.error)}</Notice>}
        </Card>
        <p className="small muted"><Badge>Read-only</Badge> FinSight never edits memories itself. Balances and numbers always come from your records, not from memory.</p>
      </div>
    </>
  );
}
