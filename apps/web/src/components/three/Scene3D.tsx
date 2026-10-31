// Shared wrapper for FinSight's data scenes (dashboard allocation, family network).
// Independent of the voice orb: own <Canvas>, own render loop.
//  - renders only while on screen (IntersectionObserver pauses the loop),
//  - static single frame when the user prefers reduced motion,
//  - lower pixel ratio on small screens,
//  - falls back to a plain gradient if WebGL is missing or the scene crashes.
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { hasWebGL, prefersReducedMotion } from '../../lib/webgl';

export { hasWebGL, prefersReducedMotion } from '../../lib/webgl';

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn('3D scene disabled:', err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const Fallback = () => <div className="scene-fallback" aria-hidden><div className="rings" /></div>;

export default function Scene3D({ children, camera = [0, 0, 7], fov = 45, label }: {
  children: ReactNode; camera?: [number, number, number]; fov?: number; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [ok] = useState(hasWebGL);
  const reduced = prefersReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const small = typeof window !== 'undefined' && window.innerWidth < 720;
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }} role="img" aria-label={label}>
      {ok ? (
        <SceneBoundary fallback={<Fallback />}>
          <Canvas
            camera={{ position: camera, fov }}
            dpr={small ? [1, 1.25] : [1, 1.75]}
            frameloop={reduced ? 'demand' : visible ? 'always' : 'never'}
            gl={{ antialias: !small, alpha: true, powerPreference: 'low-power' }}
          >
            {children}
          </Canvas>
        </SceneBoundary>
      ) : <Fallback />}
    </div>
  );
}
