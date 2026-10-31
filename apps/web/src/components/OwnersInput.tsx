import type { Member, Owner } from '../lib/types';

/** Edits ownership shares. Shares may total less than 100% when someone outside the family co-owns. */
export function OwnersInput({ members, value, onChange }: { members: Member[]; value: Owner[]; onChange: (v: Owner[]) => void }) {
  const total = value.reduce((s, o) => s + (Number(o.sharePct) || 0), 0);
  const set = (userId: string, share: number | null) => {
    const others = value.filter((o) => o.userId !== userId);
    onChange(share && share > 0 ? [...others, { userId, sharePct: share }] : others);
  };
  return (
    <div className="stack-sm">
      {members.map((m) => {
        const own = value.find((o) => o.userId === m.id);
        return (
          <div key={m.id} className="row" style={{ justifyContent: 'space-between' }}>
            <label className="check"><input type="checkbox" checked={Boolean(own)} onChange={(e) => set(m.id, e.target.checked ? Math.max(1, 100 - total) : null)} /> {m.name}</label>
            {own && (
              <span className="row" style={{ gap: 4 }}>
                <input type="number" min={0.01} max={100} step={0.01} value={own.sharePct} style={{ width: 90 }}
                  aria-label={`${m.name} ownership share`} onChange={(e) => set(m.id, Number(e.target.value))} />%
              </span>
            )}
          </div>
        );
      })}
      <div className={`small ${total > 100 ? 'field-error' : 'muted'}`}>
        Total {total.toFixed(2)}%{total < 100 && total > 0 ? ` — the remaining ${(100 - total).toFixed(2)}% is treated as owned by someone outside the family.` : ''}
        {total > 100 ? ' — shares cannot exceed 100%.' : ''}
      </div>
    </div>
  );
}
