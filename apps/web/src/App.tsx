import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, Gauge, LogOut, Scale, Settings as SettingsIcon, Users, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSession } from './lib/session';
import { Loading } from './components/ui';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Overview from './pages/Overview';
import Records from './pages/Records';
import Stress from './pages/Stress';
import Decisions from './pages/Decisions';
import FamilyPage from './pages/Family';
import Settings from './pages/Settings';

const NAV = [
  { to: '/', label: 'Overview', icon: Gauge, end: true },
  { to: '/records', label: 'Money & records', icon: Wallet },
  { to: '/stress', label: 'Stress test', icon: Activity },
  { to: '/decisions', label: 'Decisions', icon: Scale },
  { to: '/family', label: 'Family', icon: Users },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function Shell({ children }: { children: ReactNode }) {
  const { user, families, familyId, setFamilyId, signOut } = useSession();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/favicon.svg" alt="" />
          LiquidityOS
        </div>
        {families.length > 0 && (
          <label>
            <span className="nav-section" style={{ display: 'block', padding: '0 0 6px 4px' }}>Family</span>
            <select value={familyId ?? ''} onChange={(e) => setFamilyId(e.target.value)} aria-label="Select family">
              {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        )}
        <nav className="nav" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}><Icon size={17} aria-hidden /> {label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-foot stack-sm">
          <div className="break">{user?.name}<br /><span className="muted">{user?.email}</span></div>
          <button className="btn btn-ghost btn-sm" style={{ color: '#C9D6E0', justifyContent: 'flex-start' }} onClick={signOut}><LogOut size={15} /> Sign out</button>
        </div>
      </aside>
      <div className="main">
        <nav className="mobile-nav" aria-label="Main">
          {NAV.map(({ to, label, end }) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
        </nav>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const { user, loadingUser, families } = useSession();
  const loc = useLocation();
  if (loadingUser) return <Loading label="Starting LiquidityOS…" />;
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
        <Route path="/" element={<Overview />} />
        <Route path="/records" element={<Records />} />
        <Route path="/stress" element={<Stress />} />
        <Route path="/decisions" element={<Decisions />} />
        <Route path="/decisions/:id" element={<Decisions />} />
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
