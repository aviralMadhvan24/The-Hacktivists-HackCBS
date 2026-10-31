import { useSession } from '../lib/session';

/** Switches the analysis between the whole family and one member's share. */
export function ScopePicker() {
  const { family, scope, setScope, user } = useSession();
  const value = scope.scope === 'family' ? 'family' : scope.userId || user?.id || '';
  return (
    <label className="row" style={{ gap: 6 }}>
      <span className="small muted">View</span>
      <select style={{ width: 'auto' }} value={value} aria-label="View as"
        onChange={(e) => setScope(e.target.value === 'family' ? { scope: 'family' } : { scope: 'individual', userId: e.target.value })}>
        <option value="family">Whole family</option>
        {family?.members.map((m) => <option key={m.id} value={m.id}>{m.id === user?.id ? `Me (${m.name})` : m.name}</option>)}
      </select>
    </label>
  );
}
