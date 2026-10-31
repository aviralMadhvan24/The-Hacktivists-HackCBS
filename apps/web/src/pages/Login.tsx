import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, ShieldCheck, Users } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { Button, Card, Field, Notice, Tabs } from '../components/ui';

export default function Login() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ user: unknown }>(mode === 'login' ? '/auth/login' : '/auth/register', form);
      qc.setQueryData(['me'], r.user);
      await qc.invalidateQueries({ queryKey: ['families'] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <h1>Can your family withstand the next financial shock?</h1>
        <p>FinSight brings your family's accounts, loans and cash flow together, then stress-tests them against market crashes, job loss and emergencies.</p>
        <div className="auth-points">
          <div><Users size={20} /> <span>Shared and private finances, with ownership split correctly — nothing counted twice.</span></div>
          <div><Activity size={20} /> <span>Transparent five-pillar resilience score and scenario stress tests built on your real numbers.</span></div>
          <div><ShieldCheck size={20} /> <span>Private records stay private. Decisions are explained, never automated.</span></div>
        </div>
      </div>
      <div className="auth-form">
        <Card>
          <div className="stack">
            <Tabs value={mode} onChange={(m) => { setMode(m); setError(null); }} options={[{ value: 'login', label: 'Sign in' }, { value: 'register', label: 'Create account' }]} />
            <form className="stack" onSubmit={submit}>
              {mode === 'register' && (
                <Field label="Your name">
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required maxLength={120} />
                </Field>
              )}
              <Field label="Email">
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required />
              </Field>
              <Field label="Password" hint={mode === 'register' ? 'At least 8 characters.' : undefined}>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} />
              </Field>
              {error && <Notice tone="bad">{error}</Notice>}
              <Button type="submit" loading={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
