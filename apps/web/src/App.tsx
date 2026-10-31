import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, Gauge, LayoutGrid, LogOut, MessageCircle, Search, Wallet } from 'lucide-react';
import { NAV, NAV_GROUPS } from './lib/nav';
import AppHeader, { SearchPalette } from './components/AppHeader';
import { useEffect, useState, type ReactNode } from 'react';
import { useSession } from './lib/session';
import { Loading, Modal } from './components/ui';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Overview from './pages/Overview';
import Records from './pages/Records';
import Stress from './pages/Stress';
import Decisions from './pages/Decisions';
import FamilyPage from './pages/Family';
import Settings from './pages/Settings';
import Invest from './pages/Invest';
import Research from './pages/Research';
import Forecast from './pages/Forecast';
import Memory from './pages/Memory';
import Assistant from './pages/Assistant';
import Documents from './pages/Documents';

// Navigation lives in lib/nav.ts (shared with the search palette).

// Bottom bar on phones: the four most used destinations plus "More".
const TAB_BAR = [
  { to: '/', label: 'Ask', icon: MessageCircle, end: true },
  { to: '/overview', label: 'Overview', icon: Gauge },
  { to: '/records', label: 'Money', icon: Wallet },
  { to: '/stress', label: 'Stress', icon: Activity },
];
const DISC = ['ic-blue', 'ic-green', 'ic-orange', 'ic-teal', 'ic-violet', 'ic-blue', 'ic-green', 'ic-violet', 'ic-teal', 'ic-orange', 'ic-blue'];

function Brand() {
  return (
    <div className="brand">
      <img className="brand-mark" src="/favicon.svg" alt="" />
      <span><span className="brand-word">Fin</span><span className="brand-name">Sight</span></span>
    </div>
  );
}

function FamilySwitcher() {
  const { families, familyId, setFamilyId } = useSession();
  if (families.length === 0) return null;
  return (
    <select value={familyId ?? ''} onChange={(e) => setFamilyId(e.target.value)} aria-label="Select family" style={{ width: 'auto', maxWidth: '100%' }}>
      {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useSession();
  const [more, setMore] = useState(false);
  const [search, setSearch] = useState(false);
  const loc = useLocation();
  useEffect(() => { setMore(false); }, [loc.pathname]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <div style={{ padding: '0 4px' }}>
          <div className="nav-section" style={{ padding: '0 0 6px 4px' }}>Workspace</div>
          <FamilySwitcher />
        </div>
        <nav className="nav" aria-label="Main">
          {NAV_GROUPS.map((g) => (
            <div key={g.title} role="group" aria-label={g.title}>
              <div className="nav-section">{g.title}</div>
              {g.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end}><Icon size={17} aria-hidden /> {label}</NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot stack-sm">
          <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
            <span className="icon-disc ic-blue" style={{ fontWeight: 700 }}>{(user?.name || '?').slice(0, 1).toUpperCase()}</span>
            <div className="break" style={{ minWidth: 0 }}><strong>{user?.name}</strong><br /><span className="muted small">{user?.email}</span></div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={signOut}><LogOut size={15} /> Sign out</button>
        </div>
      </aside>
      <div className="main">
        <AppHeader />
        <div className="mobile-head">
          <Brand />
          <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <button className="hdr-btn" aria-label="Search" onClick={() => setSearch(true)}><Search size={17} /></button>
            <FamilySwitcher />
          </div>
        </div>
        <SearchPalette open={search} onClose={() => setSearch(false)} />
        {children}
        <nav className="mobile-nav" aria-label="Main">
          {TAB_BAR.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end}><Icon size={22} aria-hidden />{label}</NavLink>)}
          <button onClick={() => setMore(true)} aria-haspopup="dialog"><LayoutGrid size={22} aria-hidden />More</button>
        </nav>
        <Modal title="More" open={more} onClose={() => setMore(false)}>
          <nav className="sheet-list" aria-label="More">
            {NAV.filter((n) => !TAB_BAR.some((t) => t.to === n.to)).map(({ to, label, icon: Icon }, i) => (
              <Link key={to} to={to}><span className={`icon-disc lg ${DISC[i]}`}><Icon size={22} /></span>{label}</Link>
            ))}
            <a href="#signout" onClick={(e) => { e.preventDefault(); signOut(); }}><span className="icon-disc lg ic-red"><LogOut size={22} /></span>Sign out</a>
          </nav>
        </Modal>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loadingUser, families } = useSession();
  const loc = useLocation();
  if (loadingUser) return <Loading label="Starting FinSight…" skeleton={false} />;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to={`/login${loc.search}`} replace state={{ from: loc.pathname }} />} />
      </Routes>
    );
  }
  // An invite link (/?invite=…) opened by someone who already has a family.
  if (families.length > 0 && new URLSearchParams(loc.search).get('invite')) return <Onboarding />;
  if (families.length === 0) {
    return (
      <Routes>
        <Route path="/settings" element={<Shell><Settings /></Shell>} />
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );
  }
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Assistant />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/records" element={<Records />} />
        <Route path="/stress" element={<Stress />} />
        <Route path="/decisions" element={<Decisions />} />
        <Route path="/decisions/:id" element={<Decisions />} />
        <Route path="/ask" element={<Navigate to="/" replace />} />
        <Route path="/invest" element={<Invest />} />
        <Route path="/research" element={<Research />} />
        <Route path="/forecast" element={<Forecast />} />
        <Route path="/memory" element={<Memory />} />
        <Route path="/family" element={<FamilyPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="topbar">
      <h1>{title}</h1>
      <div className="row">{children}</div>
    </header>
  );
}
