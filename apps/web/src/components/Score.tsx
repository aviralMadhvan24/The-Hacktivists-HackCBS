import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ScoreChange, ScoreReport } from '../lib/types';
import { label, signed } from '../lib/format';
import { Badge, Meter } from './ui';

const bandTone = (b: string) => (b === 'strong' || b === 'healthy' ? 'good' : b === 'fragile' ? 'warn' : 'bad');
const ratingTone = (r: string) => (r === 'strong' ? '' : r === 'adequate' ? '' : r === 'weak' ? 'warn' : 'bad');

/** Semicircle gauge drawn in SVG; colour follows the band. */
export function Gauge({ score, band }: { score: number; band: string }) {
  const r = 70;
  const c = Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * c;
  const color = `var(--${bandTone(band)})`;
  return (
    <div className="gauge">
      <svg viewBox="0 0 180 100" width="200" height="112" role="img" aria-label={`Resilience score ${score} out of 100, ${band}`}>
        <path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke="var(--border)" strokeWidth="14" strokeLinecap="round" />
        <path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${filled} ${c}`} />
      </svg>
      <div className="gauge-score num" style={{ marginTop: -54 }}>{Math.round(score)}</div>
      <Badge tone={bandTone(band)}>{label(band)}</Badge>
    </div>
  );
}

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
          <Meter value={p.points} max={p.max} tone={ratingTone(p.rating)} />
          <div className="pillar-detail">{p.explanation}</div>
          {open === p.key && (
            <div className="pillar-detail stack-sm" style={{ marginTop: 6 }}>
              <div><strong>How it's calculated:</strong> {p.formula}</div>
              <dl className="kv">
                {Object.entries(p.metrics).filter(([, v]) => v === null || ['number', 'string'].includes(typeof v)).map(([k, v]) => (
                  <Fragment key={k}><dt>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt><dd>{v === null ? '—' : typeof v === 'number' ? v.toLocaleString('en-IN') : v}</dd></Fragment>
                ))}
              </dl>
              {p.notes.map((n) => <div key={n} className="muted">{n}</div>)}
              {p.actions.map((a) => <div key={a.text}>→ {a.text} <span className="muted">(up to +{a.pointsGain} pts)</span></div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ScoreChangeNote({ change }: { change: ScoreChange }) {
  if (change.delta === null) return <p className="muted small">{change.summary}</p>;
  return (
    <div className="stack-sm">
      <div className="row"><Badge tone={change.delta >= 0 ? 'good' : 'bad'}>{signed(change.delta)} pts</Badge> <span>{change.summary}</span></div>
      {change.changes.slice(0, 3).map((c) => (
        <div key={c.pillar} className="small muted">{c.name}: {signed(c.delta)} — {c.explanation}</div>
      ))}
    </div>
  );
}
