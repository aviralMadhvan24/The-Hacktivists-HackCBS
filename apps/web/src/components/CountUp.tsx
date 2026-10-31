// Animated number: eases from the previous value to the new one (once, ~0.9s).
// The final text is always the exact formatted value; reduced motion shows it at once.
import { useEffect, useRef, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export default function CountUp({ value, format, duration = 700 }: { value: number; format: (v: number) => string; duration?: number }) {
  const [shown, setShown] = useState(() => (reduced() ? value : 0));
  const from = useRef(reduced() ? value : 0);
  useEffect(() => {
    if (reduced() || !Number.isFinite(value)) { setShown(value); from.current = value; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      setShown(a + (value - a) * e);
      if (t < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="num" aria-label={format(value)}><span aria-hidden>{format(shown)}</span></span>;
}
