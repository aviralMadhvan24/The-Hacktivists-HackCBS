// Desktop utility bar: today's date, global search (Ctrl/Cmd+K), notifications and
// the profile menu. Notifications come only from real data: resilience alerts
// calculated from the user's records and open family decisions.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, CornerDownLeft, LogOut, Scale, Search, Settings as SettingsIcon, TriangleAlert, User as UserIcon, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { NAV } from '../lib/nav';
import type { Dashboard } from '../lib/types';
import { inrCompact } from '../lib/format';
import { buildAlerts } from '../pages/Overview';

interface Proposal { id: string; title: string; status: string; createdBy: string; proposerName: string; approvals: number; requiredApprovals: number }

function useOutside(ref: React.RefObject<HTMLElement>, close: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [ref, close, open]);
}

function useFamilyData() {
  const { familyId } = useSession();
  const dash = useQuery({ queryKey: ['dashboard', familyId, 'scope=family'], queryFn: () => api.get<Dashboard>(`/families/${familyId}/dashboard?scope=family`), enabled: Boolean(familyId), staleTime: 60_000 });
  const props = useQuery({ queryKey: ['proposals', familyId, 'open'], queryFn: () => api.get<{ proposals: Proposal[] }>(`/families/${familyId}/proposals?status=open`).then((r) => r.proposals), enabled: Boolean(familyId), staleTime: 60_000 });
  return { dash: dash.data, open: props.data || [] };
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const { families, setFamilyId } = useSession();
  const { dash } = useFamilyData();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 10); } }, [open]);

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const match = (s: string) => !t || s.toLowerCase().includes(t);
    const out: { group: string; label: string; hint?: string; run: () => void }[] = [];
    for (const n of NAV) if (match(`${n.label} ${n.keywords || ''}`)) out.push({ group: 'Pages', label: n.label, run: () => nav(n.to) });
    const p = dash?.position;
    for (const a of p?.accounts || []) if (t && match(`${a.name} ${a.kind}`)) out.push({ group: 'Accounts', label: a.name, hint: inrCompact(a.value), run: () => nav('/records') });
    for (const l of p?.liabilityItems || []) if (t && match(`${l.name} ${l.kind} loan`)) out.push({ group: 'Loans', label: l.name, hint: inrCompact(l.outstanding), run: () => nav('/records') });
    const seen = new Set<string>();
    for (const h of p?.positions || []) {
      const key = h.symbol || h.name;
      if (!t || seen.has(key) || !match(`${h.symbol || ''} ${h.name} ${h.sector}`)) continue;
      seen.add(key);
      out.push({ group: 'Investments', label: h.symbol ? `${h.symbol} · ${h.name}` : h.name, hint: inrCompact(h.value), run: () => nav(h.symbol ? `/invest?symbol=${encodeURIComponent(h.symbol)}` : '/records') });
    }
    if (families.length > 1) for (const f of families) if (match(`${f.name} family switch`)) out.push({ group: 'Switch family', label: f.name, run: () => setFamilyId(f.id) });
    return out.slice(0, 40);
  }, [q, dash, families, nav, setFamilyId]);

  useEffect(() => { setSel(0); }, [q]);
  if (!open) return null;
  const go = (i: number) => { const it = items[i]; if (it) { it.run(); onClose(); } };
  let last = '';
  return (
    <div className="palette-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search FinSight">
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages, accounts, loans, investments…" aria-label="Search"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            if (e.key === 'Enter') { e.preventDefault(); go(sel); }
            if (e.key === 'Escape') onClose();
          }} />
        <ul className="palette-list" role="listbox">
          {items.length === 0 && <li className="popover-empty">No matches.</li>}
          {items.map((it, i) => {
            const head = it.group !== last ? <li key={`g-${it.group}`} className="grp">{it.group}</li> : null;
            last = it.group;
            return [head, (
              <li key={`${it.group}-${it.label}-${i}`}>
                <button role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => go(i)}>
                  {it.label}{it.hint && <span className="hint num">{it.hint}</span>}
                </button>
              </li>
            )];
          })}
        </ul>
        <div className="palette-foot"><span><span className="kbd">↑↓</span> move</span><span><span className="kbd"><CornerDownLeft size={10} /></span> open</span><span><span className="kbd">Esc</span> close</span></div>
      </div>
    </div>
  );
}

export default function AppHeader() {
  const { user, signOut } = useSession();
  const [search, setSearch] = useState(false);
  const [bell, setBell] = useState(false);
  const [menu, setMenu] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useOutside(bellRef, () => setBell(false), bell);
  useOutside(menuRef, () => setMenu(false), menu);
  const { dash, open } = useFamilyData();
  const alerts = dash ? buildAlerts(dash) : [];
  const decisions = open.filter((p) => p.createdBy !== user?.id);
  const count = alerts.length + decisions.length;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName || '');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="app-header">
      <span className="date">{today}</span>
      <button className="search-trigger" onClick={() => setSearch(true)} aria-label="Search (Ctrl+K)"><Search size={15} /> Search FinSight… <span className="kbd">Ctrl K</span></button>
      <div className="popover-anchor" ref={bellRef}>
        <button className="hdr-btn" aria-label={`Notifications${count ? ` (${count})` : ''}`} aria-expanded={bell} onClick={() => setBell((b) => !b)}>
          <Bell size={17} />{count > 0 && <span className="dot">{count}</span>}
        </button>
        {bell && (
          <div className="popover" role="menu">
            <h4>Notifications</h4>
            {count === 0 && <div className="popover-empty">You're all caught up.</div>}
            {decisions.map((p) => (
              <Link key={p.id} to={`/decisions/${p.id}`} className="popover-item" onClick={() => setBell(false)}>
                <span className="icon-disc ic-teal"><Scale size={15} /></span>
                <span>{p.title}<small>Open decision by {p.proposerName} · {p.approvals}/{p.requiredApprovals} approvals</small></span>
              </Link>
            ))}
            {alerts.map((a) => (
              <Link key={a.title} to={a.to} className="popover-item" onClick={() => setBell(false)}>
                <span className={`icon-disc ${a.level === 'bad' ? 'ic-red' : 'ic-orange'}`}><TriangleAlert size={15} /></span>
                <span>{a.title}<small>{a.text}</small></span>
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="popover-anchor" ref={menuRef}>
        <button className="avatar-btn" aria-label="Profile menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{(user?.name || '?').slice(0, 1).toUpperCase()}</button>
        {menu && (
          <div className="popover" role="menu" style={{ width: 260 }}>
            <div className="popover-item" style={{ cursor: 'default' }}><span className="icon-disc ic-blue"><UserIcon size={15} /></span><span><strong>{user?.name}</strong><small>{user?.email}</small></span></div>
            <Link to="/settings" className="popover-item" onClick={() => setMenu(false)}><span className="icon-disc ic-violet"><SettingsIcon size={15} /></span>Settings & privacy</Link>
            <Link to="/records" className="popover-item" onClick={() => setMenu(false)}><span className="icon-disc ic-green"><Wallet size={15} /></span>My money & records</Link>
            <button className="popover-item" onClick={signOut}><span className="icon-disc ic-red"><LogOut size={15} /></span>Sign out</button>
          </div>
        )}
      </div>
      <SearchPalette open={search} onClose={() => setSearch(false)} />
    </div>
  );
}
