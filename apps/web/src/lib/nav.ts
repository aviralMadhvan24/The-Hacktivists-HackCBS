// Navigation used by the sidebar, the mobile "More" sheet and the search palette.
// Only routes that exist.
import { Activity, Brain, FileText, FolderUp, Gauge, LineChart, MessageCircle, Scale, Search, Settings as SettingsIcon, Users, Wallet, type LucideIcon } from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; keywords?: string }
export interface NavGroup { title: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  { title: 'Advisor', items: [{ to: '/', label: 'Ask FinSight', icon: MessageCircle, end: true, keywords: 'chat voice ai assistant home' }] },
  { title: 'Overview', items: [{ to: '/overview', label: 'Overview', icon: Gauge, keywords: 'dashboard net worth health score cash flow' }] },
  { title: 'Money', items: [
    { to: '/records', label: 'Money & records', icon: Wallet, keywords: 'accounts assets liabilities loans income expenses holdings' },
    { to: '/documents', label: 'Documents', icon: FolderUp, keywords: 'itr pan cas upload knowledge base' },
  ] },
  { title: 'Planning', items: [
    { to: '/stress', label: 'Stress test', icon: Activity, keywords: 'scenario crash job loss breaking point risk' },
    { to: '/decisions', label: 'Decisions', icon: Scale, keywords: 'proposals vote what if purchase loan' },
  ] },
  { title: 'Investments', items: [
    { to: '/invest', label: 'Evaluate investment', icon: Search, keywords: 'stock agent portfolio impact' },
    { to: '/research', label: 'Company research', icon: FileText, keywords: 'concall transcript earnings call' },
    { to: '/forecast', label: 'Price forecast', icon: LineChart, keywords: 'chronos range prediction' },
  ] },
  { title: 'Family', items: [
    { to: '/family', label: 'Family', icon: Users, keywords: 'members invite roles network' },
    { to: '/memory', label: 'Memory', icon: Brain, keywords: 'meko remembers sharing' },
  ] },
  { title: 'Settings', items: [{ to: '/settings', label: 'Settings', icon: SettingsIcon, keywords: 'profile consent zerodha security privacy' }] },
];

export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
