import { Fragment, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, ChevronDown, ChevronRight, Flag, Lightbulb, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { Pillar, ScoreChange, ScoreReport } from '../lib/types';
import { label, signed } from '../lib/format';
import { Badge, Meter } from './ui';

export const bandTone = (b: string): 'good' | 'info' | 'warn' | 'bad' => (b === 'strong' ? 'good' : b === 'healthy' ? 'info' : b === 'fragile' ? 'warn' : 'bad');
const BAND_COLOR: Record<string, string> = { good: 'var(--good)', info: 'var(--primary)', warn: 'var(--warn)', bad: 'var(--bad)' };
const BAND_LABEL: Record<string, string> = { strong: 'Strong', healthy: 'Healthy', fragile: 'Moderate', critical: 'Critical' };
const ratio = (p: Pillar) => p.points / p.max;
export const pillarTone = (p: Pillar) => (ratio(p) >= 0.85 ? 'good' : ratio(p) >= 0.6 ? 'ok' : ratio(p) >= 0.3 ? 'warn' : 'bad');

/** 270° ring gauge, coloured by band. */
export function Gauge({ score, band, size = 220 }: { score: number; band: string; size?: number }) {
  const color = BAND_COLOR[bandTone(band)];
  const pct = Math.max(0, Math.min(100, score));
  const BandIcon = bandTone(band) === 'good' || bandTone(band) === 'info' ? ShieldCheck : ShieldAlert;
  return (
    <div className="gauge" style={{ width: size, height: size * 0.92 }} role="img" aria-label={`Resilience score ${Math.round(score)} out of 100, ${label(band)}`}>
      <svg viewBox="0 0 200 184" width={size} height={size * 0.92} aria-hidden>
        <circle cx="100" cy="100" r="78" fill="none" stroke="var(--surface-3)" strokeWidth="16" strokeLinecap="round"
          pathLength={100} strokeDasharray="75 100" transform="rotate(135 100 100)" />
        <circle cx="100" cy="100" r="78" fill="none" stroke={color} strokeWidth="16" strokeLinecap="round"
          pathLength={100} strokeDasharray={`${(75 * pct) / 100} 100`} transform="rotate(135 100 100)"
          style={{ filter: `drop-shadow(0 4px 10px color-mix(in srgb, ${color} 35%, transparent))` }} />
      </svg>
      <div className="gauge-center">
        <div className="gauge-score num">{Math.round(score)}<small> / 100</small></div>
        <Badge tone={bandTone(band)}><BandIcon size={12} /> {BAND_LABEL[band] || label(band)}</Badge>
      </div>
    </div>
  );
}

/** Five coloured segments, one per pillar. */
export function SegmentBar({ report }: { report: ScoreReport }) {
  return (
    <div className="segbar" aria-hidden>
      {report.pillars.map((p) => <span key={p.key} className={`seg-${pillarTone(p)}`} title={`${p.name}: ${p.points}/${p.max}`} />)}
    </div>
  );
}

/** Full breakdown: score, key drivers and one card per pillar. */
export function ScoreBreakdown({ report, change }: { report: ScoreReport; change?: ScoreChange }) {
  const tone = bandTone(report.band);
  const drivers = report.pillars
    .filter((p) => ratio(p) < 0.85)
    .sort((a, b) => (a.max - a.points) - (b.max - b.points)).reverse()
    .slice(0, 3);
  return (
    <div className="stack">
      <div className="card" style={{ padding: 24, textAlign: 'center', borderColor: `color-mix(in srgb, ${BAND_COLOR[tone]} 35%, transparent)` }}>
        <div className="eyebrow">Financial resilience score</div>
        <div className="big-number num" style={{ fontSize: 64, color: BAND_COLOR[tone], marginTop: 8 }}>{Math.round(report.score)}<span style={{ fontSize: 26, color: 'var(--text-3)' }}> /100</span></div>
        <div style={{ marginTop: 8 }}><Badge tone={tone}>{BAND_LABEL[report.band] || report.band}</Badge></div>
      </div>
      {drivers.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <div className="row" style={{ marginBottom: 10 }}><Flag size={16} color="var(--primary)" /><span className="eyebrow">Key score drivers</span></div>
          <ul className="list-plain">
            {drivers.map((p) => (
              <li key={p.key} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <ArrowDownCircle size={18} color="var(--bad)" style={{ flex: 'none', marginTop: 2 }} />
                <span><strong>−{(p.max - p.points).toFixed(1)} pts</strong> · {p.name}: {p.explanation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {change && change.delta !== null && change.delta !== 0 && (
        <div className="notice notice-info row" style={{ flexWrap: 'nowrap' }}>
          {change.delta > 0 ? <ArrowUpCircle size={18} color="var(--good)" /> : <ArrowDownCircle size={18} color="var(--bad)" />}
          <span>{change.summary}</span>
        </div>
      )}
      <div className="eyebrow">5 resilience pillars</div>
      {report.pillars.map((p) => (
        <div key={p.key} className="pillar-card">
          <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
              <div className="small muted">{p.formula}</div>
            </div>
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <div className="num"><strong style={{ fontSize: 20, color: BAND_COLOR[pillarTone(p) === 'ok' ? 'info' : pillarTone(p)] }}>{p.points.toFixed(1)}</strong> <span className="muted small">/ {p.max} pts</span></div>
              <Badge tone={(pillarTone(p) === 'ok' ? 'info' : pillarTone(p)) as 'info' | 'good' | 'warn' | 'bad'}>{p.rating}</Badge>
            </div>
          </div>
          <Meter value={p.points} max={p.max} tone={pillarTone(p)} />
          <div className="small"><span className="muted">Current: </span><span className="metric">{p.explanation}</span></div>
          {p.notes.map((n) => <div key={n} className="small muted">{n}</div>)}
          {p.actions.map((a) => (
            <div key={a.text} className="tip"><Lightbulb size={16} color="var(--warn)" style={{ flex: 'none', marginTop: 1 }} /><span>{a.text} <strong>(+{a.pointsGain} pts)</strong></span></div>
          ))}
        </div>
      ))}
      <p className="small muted">{report.disclaimer}</p>
    </div>
  );
}

/** Compact expandable pillar list (used in narrow places). */
export function PillarList({ report }: { report: ScoreReport }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      {report.pillars.map((p) => (
        <div className="pillar" key={p.key}>
          <button className="row" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', textAlign: 'left' }}
            onClick={() => setOpen(open === p.key ? null : p.key)} aria-expanded={open === p.key}>
            {open === p.key ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <span className="pillar-name">{p.name}</span>
          </button>
          <span className="pillar-points num">{p.points.toFixed(1)} <span className="muted">/ {p.max}</span></span>
          <Meter value={p.points} max={p.max} tone={pillarTone(p)} />
          <div className="pillar-detail">{p.explanation}</div>
          {open === p.key && (
            <div className="pillar-detail stack-sm" style={{ marginTop: 6 }}>
              <div><strong>How it's calculated:</strong> {p.formula}</div>
              <dl className="kv">
                {Object.entries(p.metrics).filter(([, v]) => v === null || ['number', 'string'].includes(typeof v)).map(([k, v]) => (
                  <Fragment key={k}><dt>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt><dd>{v === null ? '—' : typeof v === 'number' ? v.toLocaleString('en-IN') : v}</dd></Fragment>
                ))}
              </dl>
              {p.actions.map((a) => <div key={a.text}>→ {a.text} <span className="muted">(up to +{a.pointsGain} pts)</span></div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ScoreChangeNote({ change }: { change: ScoreChange }) {
  if (change.delta === null) return <p className="muted small" style={{ margin: 0 }}>{change.summary}</p>;
  return (
    <div className="row small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
      <Badge tone={change.delta >= 0 ? 'good' : 'bad'}>{signed(change.delta)} pts</Badge>
      <span className="muted">{change.summary}</span>
    </div>
  );
}
