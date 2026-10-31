import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { Button, Card, Field, Notice } from '../components/ui';
import { label } from '../lib/format';

interface Invite { id: string; familyName: string; role: string; invitedBy: string }

export default function Onboarding() {
  const qc = useQueryClient();
  const { user, signOut } = useSession();
  const [name, setName] = useState(user ? `${user.name.split(' ').slice(-1)[0]} Family` : '');
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get('invite') || '');
  const invites = useQuery({ queryKey: ['my-invites'], queryFn: () => api.get<{ invitations: Invite[] }>('/families/invitations/mine').then((r) => r.invitations) });

  const nav = useNavigate();
  // Leave the ?invite= URL so the app shows the family, not this screen again.
  const done = async () => { await qc.invalidateQueries({ queryKey: ['families'] }); nav('/', { replace: true }); };
  const create = useMutation({ mutationFn: () => api.post('/families', { name }), onSuccess: done });
  const accept = useMutation({ mutationFn: (body: { token?: string; invitationId?: string }) => api.post('/families/invitations/accept', body), onSuccess: done });

  return (
    <div className="auth-form" style={{ minHeight: '100%' }}>
      <div className="stack" style={{ width: 'min(520px, 100%)' }}>
        <div>
          <h1 style={{ fontSize: 24 }}>Welcome, {user?.name}</h1>
          <p className="muted">Start a family workspace, or join one you've been invited to.</p>
        </div>
        {(invites.data?.length ?? 0) > 0 && (
          <Card title="Invitations for you">
            <ul className="list-plain">
              {invites.data!.map((i) => (
                <li key={i.id} className="row-between">
                  <span><strong>{i.familyName}</strong> <span className="muted">as {label(i.role)}, from {i.invitedBy}</span></span>
                  <Button size="sm" loading={accept.isPending} onClick={() => accept.mutate({ invitationId: i.id })}>Join</Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="Create a family">
          <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
            <Field label="Family name"><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></Field>
            {create.error && <Notice tone="bad">{errorMessage(create.error)}</Notice>}
            <Button type="submit" loading={create.isPending}>Create family</Button>
          </form>
        </Card>
        <Card title="Have an invite code?">
          <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); accept.mutate({ token: token.trim() }); }}>
            <Field label="Invite code" hint="Paste the code or link a family admin shared with you."><input value={token} onChange={(e) => setToken(e.target.value.replace(/^.*invite=/, ''))} required /></Field>
            {accept.error && <Notice tone="bad">{errorMessage(accept.error)}</Notice>}
            <Button type="submit" variant="secondary" loading={accept.isPending}>Join family</Button>
          </form>
        </Card>
        <Button variant="ghost" onClick={signOut}>Sign out</Button>
      </div>
    </div>
  );
}
