// Indian number formatting: ₹12,34,567 and compact ₹12.3 L / ₹1.2 Cr.

export function inr(v: number | null | undefined, opts: { decimals?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const sign = v < 0 ? '−' : '';
  return `${sign}₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: opts.decimals ?? 0, minimumFractionDigits: opts.decimals ?? 0 })}`;
}

export function inrCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e9 ? 0 : 2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a >= 1e6 ? 1 : 2)} L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}k`;
  return `${sign}₹${Math.round(a)}`;
}

export function pct(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${v.toFixed(decimals)}%`;
}

export function months(v: number | null | undefined): string {
  if (v === null || v === undefined) return '∞';
  if (!Number.isFinite(v)) return '—';
  if (v >= 120) return '10+ yrs';
  return `${v.toFixed(1)} mo`;
}

export function signed(v: number, digits = 1): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function date(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

export const LABELS: Record<string, string> = {
  bank: 'Bank account', cash: 'Cash', savings: 'Savings', fixed_deposit: 'Fixed deposit', brokerage: 'Demat / brokerage',
  mutual_fund: 'Mutual fund', retirement: 'Retirement (EPF/PPF/NPS)', gold: 'Gold', real_estate: 'Real estate', other: 'Other',
  home_loan: 'Home loan', car_loan: 'Car loan', personal_loan: 'Personal loan', education_loan: 'Education loan',
  credit_card: 'Credit card', gold_loan: 'Gold loan', business_loan: 'Business loan',
  liquid: 'Liquid', semi_liquid: 'Semi-liquid', illiquid: 'Illiquid',
  monthly: 'Monthly', quarterly: 'Quarterly', half_yearly: 'Half-yearly', yearly: 'Yearly',
  owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer',
  strong: 'Strong', healthy: 'Healthy', fragile: 'Fragile', critical: 'Critical',
};

export const label = (k: string | null | undefined) => (k ? LABELS[k] || k.replace(/_/g, ' ') : '—');
