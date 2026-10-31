import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { isAdmin, useSession } from '../lib/session';
import { dateTime, inr, inrCompact, label } from '../lib/format';
import type { Account, Dashboard, Liability } from '../lib/types';
import { hasWebGL } from '../lib/webgl';
import type { NetHover, NetItem, NetMember } from '../components/three/FamilyNetworkScene';
import { Badge, Button, Card, Field, Loading, Notice } from '../components/ui';
import { PageHeader } from '../App';

const FamilyNetworkScene = lazy(() => import('../components/three/FamilyNetworkScene'));
const MEMBER_HEX = ['#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#10B981', '#06B6D4', '#EF4444', '#84CC16'];

/** 3D network + member cards, from records the viewer is allowed to see. */
function FamilyMap() {
  const { family, familyId, user } = useSession();
  const accounts = useQuery({ queryKey: ['records', familyId, 'accounts'], queryFn: () => api.get<{ accounts: Account[] }>(`/families/${familyId}/accounts`).then((r) => r.accounts) });
  const loans = useQuery({ queryKey: ['records', familyId, 'liabilities'], queryFn: () => api.get<{ liabilities: Liability[] }>(`/families/${familyId}/liabilities`).then((r) => r.liabilities) });
  const dash = useQuery({ queryKey: ['dashboard', familyId, 'scope=family'], queryFn: () => api.get<Dashboard>(`/families/${familyId}/dashboard?scope=family`) });
  const [hover, setHover] = useState<NetHover>(null);
  const webgl = useMemo(hasWebGL, []);
  if (!family) return null;
  const members: NetMember[] = family.members.map((m, i) => ({ id: m.id, name: m.name, color: MEMBER_HEX[i % MEMBER_HEX.length] }));
  const items: NetItem[] = [
    ...(accounts.data || []).map((a) => ({ id: a.id, label: a.name, kind: 'asset' as const, value: a.value || 0, owners: a.owners.map((o) => o.userId) })),
    ...(loans.data || []).map((l) => ({ id: l.id, label: l.name, kind: 'debt' as const, value: l.outstanding || 0, owners: l.owners.map((o) => o.userId) })),
  ];
  const shareOf = (owners: { userId: string; sharePct: number }[], uid: string) => (owners.find((o) => o.userId === uid)?.sharePct || 0) / 100;
  const stats = family.members.map((m) => ({
    m,
    assets: (accounts.data || []).reduce((s, a) => s + (a.value || 0) * shareOf(a.owners, m.id), 0),
    debt: (loans.data || []).reduce((s, l) => s + (l.outstanding || 0) * shareOf(l.owners, m.id), 0),
    shared: (accounts.data || []).filter((a) => a.owners.length > 1 && a.owners.some((o) => o.userId === m.id)).length,
    income: dash.data?.position.cashflow.incomeByUser?.[m.id] ?? null,
  }));
  const sharedCount = items.filter((i) => i.owners.length > 1).length;
  const nameOf = (uid: string) => family.members.find((m) => m.id === uid)?.name || 'Someone outside the family';
  return (
    <>
      <section className="fam-hero reveal" aria-label="Family financial network">
        <div className="fam-head">
          <h2>{family.name}</h2>
          <p>{family.members.length} member{family.members.length === 1 ? '' : 's'} · {items.length} accounts & loans you can see · {sharedCount} shared</p>
        </div>
        <div className="fam-scene" style={{ position: 'relative' }}>
          {webgl && items.length + members.length > 0 && (
            <Suspense fallback={null}>
              <FamilyNetworkScene members={members} items={items} onHover={setHover}
                hovered={hover ? (hover.type === 'member' ? hover.member.id : hover.item.id) : null} />
            </Suspense>
          )}
          {hover && (
            <div className="cc-tip" role="status">
              {hover.type === 'member' ? (
                <><span className="small">Member</span><strong>{hover.member.name}</strong>
                  <span className="small">{inrCompact(stats.find((s) => s.m.id === hover.member.id)?.assets || 0)} assets · {inrCompact(stats.find((s) => s.m.id === hover.member.id)?.debt || 0)} loans</span></>
              ) : (
                <><span className="small">{hover.item.kind === 'debt' ? 'Loan' : 'Account'}{hover.item.owners.length > 1 ? ' · shared' : ''}</span><strong>{hover.item.label}</strong>
                  <span className="small">{inr(hover.item.value)} · {hover.item.owners.map(nameOf).join(', ')}</span></>
              )}
            </div>
          )}
          <div className="fam-legend">
            <span><i style={{ background: '#3B82F6' }} />Members</span>
            <span><i style={{ background: '#34D399' }} />Own account</span>
            <span><i style={{ background: '#22D3EE' }} />Shared account</span>
            <span><i style={{ background: '#F87171', borderRadius: 2 }} />Loan</span>
            <span>Lines = ownership · moving dots = money flow</span>
          </div>
        </div>
      </section>
      <div className="member-grid reveal reveal-2">
        {stats.map(({ m, assets, debt, shared, income }, i) => (
          <div key={m.id} className="member-card">
            <div className="who">
              <span className="av" style={{ background: MEMBER_HEX[i % MEMBER_HEX.length] }}>{m.name.slice(0, 1).toUpperCase()}</span>
              <div className="break" style={{ minWidth: 0 }}><strong>{m.name}{m.id === user?.id ? ' (you)' : ''}</strong><div className="small muted">{label(m.role)}</div></div>
            </div>
            <dl>
              <dt>Share of assets</dt><dd>{inrCompact(assets)}</dd>
              <dt>Share of loans</dt><dd>{inrCompact(debt)}</dd>
              <dt>Monthly income</dt><dd>{income == null ? '—' : inrCompact(income)}</dd>
              <dt>Shared accounts</dt><dd>{shared}</dd>
            </dl>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Only records you're allowed to see are shown. Private records of other members are never included.</p>
    </>
  );
}

export default function FamilyPage() {
  const { family, familyId, user } = useSession();
  const qc = useQueryClient();
  const admin = isAdmin(family?.myRole);
  const owner = family?.myRole === 'owner';
  const invalidateFamily = () => { qc.invalidateQueries({ queryKey: ['family', familyId] }); qc.invalidateQueries({ queryKey: ['families'] }); };

  const invites = useQuery({ queryKey: ['invites', familyId], queryFn: () => api.get<{ invitations: any[] }>(`/families/${familyId}/invitations`).then((r) => r.invitations), enabled: admin });
  const [invite, setInvite] = useState({ email: '', role: 'member' });
  const [lastToken, setLastToken] = useState<string | null>(null);
  const sendInvite = useMutation({
    mutationFn: () => api.post<{ invitation: { token: string } }>(`/families/${familyId}/invitations`, invite),
    onSuccess: (r) => { setLastToken(r.invitation.token); setInvite({ email: '', role: 'member' }); qc.invalidateQueries({ queryKey: ['invites', familyId] }); },
  });
  const revoke = useMutation({ mutationFn: (id: string) => api.del(`/families/${familyId}/invitations/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['invites', familyId] }) });
  const changeRole = useMutation({ mutationFn: ({ uid, role }: { uid: string; role: string }) => api.patch(`/families/${familyId}/members/${uid}`, { role }), onSuccess: invalidateFamily });
  const remove = useMutation({ mutationFn: (uid: string) => api.del(`/families/${familyId}/members/${uid}`), onSuccess: invalidateFamily });
  const [settings, setSettings] = useState<{ name?: string; approvalThreshold?: number }>({});
  const saveSettings = useMutation({ mutationFn: () => api.patch(`/families/${familyId}`, settings), onSuccess: () => { setSettings({}); invalidateFamily(); } });
  const audit = useQuery({ queryKey: ['audit', familyId], queryFn: () => api.get<{ entries: any[] }>(`/families/${familyId}/audit`).then((r) => r.entries), enabled: admin });
  const link = lastToken ? `${window.location.origin}/?invite=${encodeURIComponent(lastToken)}` : '';

  if (!family) return <div className="content"><Loading /></div>;
  return (
    <>
      <PageHeader title="Family" />
      <div className="content stack">
        <FamilyMap />
        <div className="grid grid-2">
          <Card title="Members" subtitle={`You are ${label(family.myRole).toLowerCase()} of ${family.name}`}>
            <div className="table-wrap">
              <table>
                <tbody>
                  {family.members.map((m) => (
                    <tr key={m.id}>
                      <td><strong>{m.name}</strong>{m.id === user?.id && ' (you)'}<div className="small muted break">{m.email}</div></td>
                      <td>
                        {admin && m.role !== 'owner' && m.id !== user?.id ? (
                          <select value={m.role} style={{ width: 'auto' }} aria-label={`Role for ${m.name}`} onChange={(e) => changeRole.mutate({ uid: m.id, role: e.target.value })}>
                            {owner && <option value="admin">Admin</option>}
                            {!owner && m.role === 'admin' && <option value="admin">Admin</option>}
                            <option value="member">Member</option><option value="viewer">Viewer</option>
                          </select>
                        ) : <Badge>{label(m.role)}</Badge>}
                      </td>
                      <td className="r">
                        {m.role !== 'owner' && (m.id === user?.id || admin) && (
                          <button className="icon-btn" aria-label={m.id === user?.id ? 'Leave family' : `Remove ${m.name}`}
                            onClick={() => { if (confirm(m.id === user?.id ? 'Leave this family?' : `Remove ${m.name} from the family?`)) remove.mutate(m.id); }}><Trash2 size={15} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(changeRole.error || remove.error) && <Notice tone="bad">{errorMessage(changeRole.error || remove.error)}</Notice>}
            <div className="small muted" style={{ marginTop: 12 }}>
              <strong>Owner/Admin</strong> manage members and shared records · <strong>Member</strong> adds own records, proposes and votes · <strong>Viewer</strong> sees shared records and comments.
            </div>
          </Card>

          {admin ? (
            <Card title="Invite someone" subtitle="They'll need a FinSight account with this email.">
              <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); sendInvite.mutate(); }}>
                <div className="form-grid">
                  <Field label="Email"><input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required /></Field>
                  <Field label="Role"><select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>{owner && <option value="admin">Admin</option>}<option value="member">Member</option><option value="viewer">Viewer</option></select></Field>
                </div>
                <Button type="submit" loading={sendInvite.isPending}>Create invitation</Button>
                {sendInvite.error && <Notice tone="bad">{errorMessage(sendInvite.error)}</Notice>}
              </form>
              {lastToken && (
                <Notice tone="good">
                  <div className="stack-sm">
                    <span>Share this link with them. It works once, for 7 days, and only for that email. It won't be shown again.</span>
                    <code className="mono break">{link}</code>
                    <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(link)}><Copy size={14} /> Copy link</Button>
                  </div>
                </Notice>
              )}
              {invites.data && invites.data.length > 0 && (
                <ul className="list-plain" style={{ marginTop: 16 }}>
                  {invites.data.map((i) => (
                    <li key={i.id} className="row-between">
                      <span className="break">{i.email} <span className="small muted">{label(i.role)} · {i.status}</span></span>
                      {i.status === 'pending' && <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)}>Revoke</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : (
            <Card title="Invitations"><p className="muted">Only owners and admins can invite people.</p></Card>
          )}
        </div>

        {admin && (
          <Card title="Family settings">
            <form className="form-grid" onSubmit={(e) => { e.preventDefault(); saveSettings.mutate(); }}>
              <Field label="Family name"><input defaultValue={family.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} maxLength={100} /></Field>
              <Field label="Approvals needed for decisions" hint="Capped at the number of eligible voters.">
                <input type="number" min={1} max={20} defaultValue={family.approvalThreshold} onChange={(e) => setSettings({ ...settings, approvalThreshold: Number(e.target.value) })} />
              </Field>
              <div><Button type="submit" loading={saveSettings.isPending} disabled={!Object.keys(settings).length}>Save</Button></div>
            </form>
            {saveSettings.error && <Notice tone="bad">{errorMessage(saveSettings.error)}</Notice>}
          </Card>
        )}

        {admin && (
          <Card title="Activity log" subtitle="Last 200 actions in this family">
            {audit.isLoading ? <Loading /> : (
              <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table>
                  <tbody>{audit.data?.map((a) => <tr key={a.id}><td className="small">{dateTime(a.at)}</td><td>{a.actor || 'System'}</td><td className="mono">{a.action}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
