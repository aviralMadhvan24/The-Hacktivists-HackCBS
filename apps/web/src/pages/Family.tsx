import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { isAdmin, useSession } from '../lib/session';
import { dateTime, label } from '../lib/format';
import { Badge, Button, Card, Field, Loading, Notice } from '../components/ui';
import { PageHeader } from '../App';

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
