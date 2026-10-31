import { useEffect, useId, useState } from 'react';
import { api } from '../lib/api';

interface Result { symbol: string; name: string; exchange: string; sector?: string | null }

/** NSE/BSE symbol input with live search suggestions. */
export function SymbolInput({ value, onChange, onPick, id, required }: {
  value: string; onChange: (v: string) => void; onPick?: (r: Result) => void; id?: string; required?: boolean;
}) {
  const listId = useId();
  const [results, setResults] = useState<Result[]>([]);
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api.get<{ results: Result[] }>(`/market/search?q=${encodeURIComponent(q)}`).then((r) => setResults(r.results)).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <>
      <input id={id} value={value} list={listId} required={required} placeholder="e.g. HDFCBANK" autoComplete="off"
        onChange={(e) => {
          const v = e.target.value.toUpperCase();
          onChange(v);
          const hit = results.find((r) => r.symbol === v);
          if (hit && onPick) onPick(hit);
        }} />
      <datalist id={listId}>
        {results.map((r) => <option key={`${r.exchange}:${r.symbol}`} value={r.symbol}>{r.name} · {r.exchange}</option>)}
      </datalist>
    </>
  );
}
