import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { dateTime } from '../lib/format';
import { Badge, Button, Card, Field, Loading, Meter, Notice } from '../components/ui';
import { PageHeader } from '../App';

export default function Settings() {
  const params = new URLSearchParams(window.location.search);
  const zerodhaFlag = params.get('zerodha');
  return (
    <>
      <PageHeader title="Settings" />
      <div className="content stack">
        {zerodhaFlag === 'connected' && <Notice tone="good">Zerodha connected. Sync your holdings below.</Notice>}
        {zerodhaFlag === 'error' && <Notice tone="bad">Zerodha connection failed ({params.get('code')}). Please try again.</Notice>}
        <div className="grid grid-2">
          <Profile />
          <Plan />
        </div>
        <div className="grid grid-2">
          <Zerodha />
          <Consents />
        </div>
        <Integrations />
        <DataRights />
      </div>
    </>
  );
}

function Profile() {
  const { user, refreshUser } = useSession();
  const [name, setName] = useState(user?.name || '');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const qc = useQueryClient();
  const save = useMutation({ mutationFn: () => api.patch('/me', { name }), onSuccess: () => { refreshUser(); qc.invalidateQueries({ queryKey: ['family'] }); } });
  const change = useMutation({ mutationFn: () => api.post('/auth/password', pw), onSuccess: () => qc.setQueryData(['me'], null) });
  return (
    <Card title="Profile">
      <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Email"><input value={user?.email || ''} disabled /></Field>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></Field>
        <div><Button type="submit" variant="secondary" loading={save.isPending}>Save name</Button></div>
        {save.isSuccess && <Notice tone="good">Saved.</Notice>}
      </form>
      <div className="divider" style={{ margin: '16px 0' }} />
      <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); change.mutate(); }}>
        <div className="form-grid">
          <Field label="Current password"><input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></Field>
          <Field label="New password" hint="At least 8 characters."><input type="password" autoComplete="new-password" minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required /></Field>
        </div>
        <div><Button type="submit" variant="secondary" loading={change.isPending}>Change password</Button></div>
        <span className="small muted">Changing your password signs you out on every device.</span>
        {change.error && <Notice tone="bad">{errorMessage(change.error)}</Notice>}
      </form>
    </Card>
  );
}

function Plan() {
  const q = useQuery({ queryKey: ['me-full'], queryFn: () => api.get<{ entitlements: any }>('/me').then((r) => r.entitlements) });
  return (
    <Card title="Plan & usage" subtitle="Tracking, scores and stress tests are always free.">
      {q.isLoading ? <Loading /> : q.data && (
        <div className="stack-sm">
          <div className="row"><Badge tone={q.data.plan === 'premium' ? 'good' : 'neutral'}>{q.data.plan}</Badge><span className="small muted">Usage resets monthly ({q.data.period})</span></div>
          {q.data.features.filter((f: any) => f.limit !== null).map((f: any) => (
            <div key={f.feature} className="stack-sm">
              <div className="row-between small"><span>{f.label}</span><span className="num">{f.used} / {f.limit}</span></div>
              <Meter value={f.used} max={f.limit || 1} tone={f.remaining === 0 ? 'bad' : ''} />
            </div>
          ))}
          <p className="small muted">Paid plans are not available yet.</p>
        </div>
      )}
    </Card>
  );
}

function Zerodha() {
  const { familyId, families } = useSession();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['zerodha'], queryFn: () => api.get<any>('/zerodha/status') });
  const [target, setTarget] = useState({ familyId: familyId || '', visibility: 'private' });
  const connect = useMutation({ mutationFn: () => api.get<{ loginUrl: string }>('/zerodha/login-url'), onSuccess: (r) => { window.location.href = r.loginUrl; } });
  const sync = useMutation({
    mutationFn: () => api.post<any>('/zerodha/sync', { familyId: target.familyId || familyId, visibility: target.visibility }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zerodha'] }); qc.invalidateQueries({ queryKey: ['records'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });
  const disconnect = useMutation({ mutationFn: () => api.post('/zerodha/disconnect'), onSuccess: () => qc.invalidateQueries({ queryKey: ['zerodha'] }) });
  const s = status.data;
  return (
    <Card title="Zerodha (Kite Connect)" subtitle="Read-only sync of holdings. FinSight never places trades.">
      {status.isLoading && <Loading />}
      {s && !s.isConfigured && <Notice tone="warn">Zerodha isn't configured on this server. An administrator must add Kite Connect API credentials.</Notice>}
      {s && s.isConfigured && (
        <div className="stack">
          {s.connection ? (
            <dl className="kv">
              <dt>Account</dt><dd>{s.connection.brokerUserName || s.connection.brokerUserId}</dd>
              <dt>Status</dt><dd>{s.isConnected ? <Badge tone="good">Connected</Badge> : <Badge tone="warn">Session expired</Badge>}</dd>
              <dt>Session valid until</dt><dd>{dateTime(s.connection.expiresAt)}</dd>
              <dt>Last synced</dt><dd>{dateTime(s.connection.lastSyncedAt)}</dd>
            </dl>
          ) : <p className="muted">Not connected.</p>}
          <p className="small muted">{s.note}</p>
          <div className="row">
            <Button variant={s.isConnected ? 'secondary' : 'primary'} onClick={() => connect.mutate()} loading={connect.isPending}>{s.connection ? 'Reconnect' : 'Connect Zerodha'}</Button>
            {s.connection && !s.connection.expired && <Button variant="ghost" onClick={() => disconnect.mutate()} loading={disconnect.isPending}>Disconnect</Button>}
          </div>
          {s.isConnected && (
            <div className="stack-sm">
              <div className="form-grid">
                <Field label="Sync into family"><select value={target.familyId || familyId || ''} onChange={(e) => setTarget({ ...target, familyId: e.target.value })}>{families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
                <Field label="Visibility"><select value={target.visibility} onChange={(e) => setTarget({ ...target, visibility: e.target.value })}><option value="private">Private to me</option><option value="family">Shared with family</option></select></Field>
              </div>
              <div><Button onClick={() => sync.mutate()} loading={sync.isPending}>Sync holdings now</Button></div>
              {sync.data && <Notice tone="good">Synced {sync.data.holdingsSynced} holding(s){sync.data.holdingsRemoved ? `, removed ${sync.data.holdingsRemoved}` : ''}. {sync.data.note}</Notice>}
            </div>
          )}
          {(connect.error || sync.error || disconnect.error) && <Notice tone="bad">{errorMessage(connect.error || sync.error || disconnect.error)}</Notice>}
        </div>
      )}
    </Card>
  );
}

const CONSENTS = [
  { scope: 'ai_analysis', title: 'AI analysis of my finances', body: 'Allows sending a summary of your visible financial position (totals, ratios and holdings — no account numbers) to the configured AI provider for investment evaluations.' },
  { scope: 'meko_context', title: 'Remember decisions and preferences', body: 'Allows storing approved, summarised decision context (goals, investment reasoning, stress-test summaries) in Meko so future analysis can refer to it. Never balances or account numbers.' },
];

function Consents() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['consents'], queryFn: () => api.get<{ active: Record<string, boolean> }>('/me/consents') });
  // Local state so the checkbox responds within the click; reverts if saving fails.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const active = { ...(q.data?.active || {}), ...local };
  const set = useMutation({
    mutationFn: (b: { scope: string; granted: boolean }) => api.post('/me/consents', b),
    onError: (_e, b) => setLocal((l) => ({ ...l, [b.scope]: !b.granted })),
    onSettled: () => qc.invalidateQueries({ queryKey: ['consents'] }),
  });
  const toggle = (scope: string, granted: boolean) => { setLocal((l) => ({ ...l, [scope]: granted })); set.mutate({ scope, granted }); };
  return (
    <Card title="Privacy & consent" subtitle="You can withdraw consent at any time.">
      {q.isLoading ? <Loading /> : (
        <ul className="list-plain">
          {CONSENTS.map((c) => (
            <li key={c.scope} className="stack-sm">
              <label className="check"><input type="checkbox" checked={Boolean(active[c.scope])}
                onChange={(e) => toggle(c.scope, e.target.checked)} /> <strong>{c.title}</strong></label>
              <span className="small muted">{c.body}</span>
            </li>
          ))}
        </ul>
      )}
      {set.error && <Notice tone="bad">{errorMessage(set.error)}</Notice>}
    </Card>
  );
}

function Integrations() {
  const q = useQuery({ queryKey: ['health'], queryFn: () => fetch('/api/health').then((r) => r.json()) });
  const i = q.data?.integrations;
  const row = (name: string, ok: boolean, detail: string) => (
    <tr key={name}><td>{name}</td><td>{ok ? <Badge tone="good">Available</Badge> : <Badge tone="warn">Not configured</Badge>}</td><td className="small muted">{detail}</td></tr>
  );
  return (
    <Card title="Connected services" subtitle="Core tracking works even when these are unavailable.">
      {q.isLoading ? <Loading /> : i && (
        <div className="table-wrap"><table><tbody>
          {row('Database', q.data.database?.reachable, q.data.database?.engine || 'Unreachable')}
          {row('AI provider', i.llm.configured, i.llm.configured ? `${i.llm.provider} (${i.llm.model})` : 'Set GEMINI_API_KEY on the server')}
          {row('Market data', true, i.marketData.provider === 'MOCK' ? 'Demo prices only' : 'Yahoo Finance, ~15 min delayed')}
          {row('Zerodha', i.zerodha.configured, i.zerodha.configured ? 'Kite Connect' : 'Kite Connect credentials needed')}
          {row('Meko memory', i.meko.configured && i.meko.enabled, i.meko.enabled ? 'Enabled' : 'Disabled')}
        </tbody></table></div>
      )}
    </Card>
  );
}

function DataRights() {
  const qc = useQueryClient();
  const [pw, setPw] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const del = useMutation({ mutationFn: () => api.post('/me/delete', { password: pw, confirm: confirmText }), onSuccess: () => { qc.clear(); qc.setQueryData(['me'], null); } });
  return (
    <Card title="Your data">
      <div className="grid grid-2">
        <div className="stack-sm">
          <strong>Download a copy</strong>
          <span className="small muted">All records you own, your simulations, proposals and consents, as JSON.</span>
          <div><a className="btn btn-secondary btn-md" href="/api/me/export" download>Download my data</a></div>
        </div>
        <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); if (confirm('Permanently delete your account? This cannot be undone.')) del.mutate(); }}>
          <strong>Delete my account</strong>
          <span className="small muted">Deletes records only you own, removes your share from joint records, and leaves all families. Owners must hand over or delete families with other members first.</span>
          <div className="form-grid">
            <Field label="Password"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="current-password" /></Field>
            <Field label='Type "DELETE"'><input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} required /></Field>
          </div>
          <div><Button variant="danger" type="submit" loading={del.isPending} disabled={confirmText !== 'DELETE'}>Delete account</Button></div>
          {del.error && <Notice tone="bad">{errorMessage(del.error)}</Notice>}
        </form>
      </div>
    </Card>
  );
}
