// Dashboard: asset allocation as floating spheres (one per asset class).
// Sphere VOLUME is proportional to the class's share of total assets, so the
// picture stays honest; exact figures are always shown in the legend, the
// hover tooltip and the conventional charts on the page.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Scene3D, { prefersReducedMotion } from './Scene3D';

export interface AllocationItem { key: string; label: string; value: number; color: string }

function Bubble({ item, position, radius, phase, onHover, active }: {
  item: AllocationItem; position: [number, number, number]; radius: number; phase: number;
  onHover: (i: AllocationItem | null) => void; active: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const color = useMemo(() => new THREE.Color(item.color), [item.color]);
  const reduced = prefersReducedMotion();
  useFrame(({ clock }, dt) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    m.position.y = position[1] + (reduced ? 0 : Math.sin(t * 0.8 + phase) * 0.12);
    const target = active ? 1.12 : 1;
    const s = m.scale.x + (target - m.scale.x) * Math.min(1, dt * 8);
    m.scale.setScalar(s);
  });
  return (
    <mesh
      ref={mesh}
      position={position}
      onPointerOver={(e) => { e.stopPropagation(); onHover(item); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = ''; }}
    >
      <sphereGeometry args={[radius, 48, 48]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.55 : 0.28} roughness={0.25} metalness={0.35} transparent opacity={0.95} />
    </mesh>
  );
}

/** A sparse particle field: one draw call, positions allocated once. */
function Particles({ count = 360 }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 16;
      p[i * 3 + 1] = (Math.random() - 0.5) * 9;
      p[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
    }
    return p;
  }, [count]);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.015; });
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial size={0.035} color="#7DD3FC" transparent opacity={0.55} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function Cluster({ items, onHover, hovered }: { items: AllocationItem[]; onHover: (i: AllocationItem | null) => void; hovered: string | null }) {
  const group = useRef<THREE.Group>(null);
  const reduced = prefersReducedMotion();
  const layout = useMemo(() => {
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const maxR = 0.95;
    // Volume ∝ share  →  radius ∝ cube root of share, scaled so the largest is maxR.
    const r0 = Math.cbrt(sorted[0]?.value / total || 1);
    return sorted.map((item, i) => {
      const radius = Math.max(0.16, (Math.cbrt(item.value / total) / r0) * maxR);
      if (i === 0) return { item, radius, position: [0, 0, 0] as [number, number, number], phase: 0 };
      const angle = i * 2.399963; // golden angle
      const ring = 1.75 + (i % 2) * 0.45;
      return { item, radius, position: [Math.cos(angle) * ring, Math.sin(angle) * ring * 0.62, Math.sin(angle * 1.7) * 0.6] as [number, number, number], phase: i * 1.3 };
    });
  }, [items]);
  useFrame(({ pointer }, dt) => {
    const g = group.current;
    if (!g) return;
    if (!reduced) g.rotation.z += dt * 0.04;
    // Gentle mouse parallax.
    g.rotation.x += ((reduced ? 0 : -pointer.y * 0.18) - g.rotation.x) * Math.min(1, dt * 3);
    g.rotation.y += ((reduced ? 0 : pointer.x * 0.28) - g.rotation.y) * Math.min(1, dt * 3);
  });
  return (
    <group ref={group}>
      {layout.map((l) => <Bubble key={l.item.key} {...l} onHover={onHover} active={hovered === l.item.key} />)}
      <mesh rotation={[Math.PI / 2.3, 0, 0]}>
        <torusGeometry args={[2.05, 0.006, 8, 160]} />
        <meshBasicMaterial color="#38BDF8" transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

export default function AllocationScene({ items, onHover, hovered }: { items: AllocationItem[]; onHover: (i: AllocationItem | null) => void; hovered: string | null }) {
  return (
    <Scene3D camera={[0, 0, 8]} fov={45} label={`Asset allocation: ${items.map((i) => i.label).join(', ')}`}>
      <ambientLight intensity={0.55} />
      <pointLight position={[5, 5, 6]} intensity={60} color="#E0F2FE" />
      <pointLight position={[-6, -3, 2]} intensity={25} color="#22D3EE" />
      <Particles />
      <Cluster items={items} onHover={onHover} hovered={hovered} />
    </Scene3D>
  );
}
