// Family page: members, accounts and loans as a 3D network.
// Built only from records the viewer is allowed to see (the API filters them).
// Lines connect each member to the accounts and loans they own; an item with
// several owners is shared. Exact figures appear in the hover card and in the
// conventional tables on the page.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Scene3D, { prefersReducedMotion } from './Scene3D';

export interface NetMember { id: string; name: string; color: string }
export interface NetItem { id: string; label: string; kind: 'asset' | 'debt'; value: number; owners: string[] }
export type NetHover = { type: 'member'; member: NetMember } | { type: 'item'; item: NetItem } | null;

const ASSET = new THREE.Color('#34D399');
const SHARED = new THREE.Color('#22D3EE');
const DEBT = new THREE.Color('#F87171');

function useLayout(members: NetMember[], items: NetItem[]) {
  return useMemo(() => {
    const pos = new Map<string, THREE.Vector3>();
    const n = members.length;
    members.forEach((m, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.PI / 2;
      pos.set(m.id, n === 1 ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(Math.cos(a) * 1.5, Math.sin(a) * 1.1, 0));
    });
    const maxV = Math.max(1, ...items.map((i) => i.value));
    const placed = items.map((it, k) => {
      // Sit each item beyond the average position of its owners, spread by index.
      const owners = it.owners.map((o) => pos.get(o)).filter(Boolean) as THREE.Vector3[];
      const c = owners.length ? owners.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / owners.length) : new THREE.Vector3();
      let ang = Math.atan2(c.y, c.x);
      if (c.lengthSq() < 0.01) ang = (k / Math.max(1, items.length)) * Math.PI * 2;
      ang += ((k % 5) - 2) * 0.32;
      const r = 3.1 + (k % 3) * 0.35;
      const p = new THREE.Vector3(Math.cos(ang) * r, Math.sin(ang) * r * 0.62, ((k % 4) - 1.5) * 0.35);
      pos.set(it.id, p);
      return { it, p, radius: 0.1 + 0.22 * Math.sqrt(it.value / maxV) };
    });
    const edges: [THREE.Vector3, THREE.Vector3, boolean][] = [];
    for (const { it, p } of placed) for (const o of it.owners) { const mp = pos.get(o); if (mp) edges.push([mp, p, it.owners.length > 1]); }
    return { pos, placed, edges };
  }, [members, items]);
}

function Network({ members, items, onHover, hovered }: { members: NetMember[]; items: NetItem[]; onHover: (h: NetHover) => void; hovered: string | null }) {
  const group = useRef<THREE.Group>(null);
  const flow = useRef<THREE.Points>(null);
  const reduced = prefersReducedMotion();
  const { pos, placed, edges } = useLayout(members, items);

  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(edges.length * 6);
    edges.forEach(([a, b], i) => { arr.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); });
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, [edges]);
  // One moving dot per edge ("money flow"); buffer mutated in place each frame.
  const flowGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, edges.length) * 3), 3));
    return g;
  }, [edges]);

  useFrame(({ clock, pointer }, dt) => {
    const g = group.current;
    if (g) {
      if (!reduced) g.rotation.z += dt * 0.02;
      g.rotation.x += ((reduced ? 0 : -pointer.y * 0.2) - g.rotation.x) * Math.min(1, dt * 3);
      g.rotation.y += ((reduced ? 0 : pointer.x * 0.3) - g.rotation.y) * Math.min(1, dt * 3);
    }
    const f = flow.current;
    if (f && edges.length) {
      const attr = f.geometry.getAttribute('position') as THREE.BufferAttribute;
      const t = reduced ? 0.5 : clock.elapsedTime * 0.25;
      for (let i = 0; i < edges.length; i++) {
        const [a, b] = edges[i];
        const u = (t + i * 0.137) % 1;
        attr.setXYZ(i, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
      }
      attr.needsUpdate = true;
    }
  });

  const hoverProps = (h: NetHover) => ({
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onHover(h); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { onHover(null); document.body.style.cursor = ''; },
  });

  return (
    <group ref={group}>
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial color="#94A3B8" transparent opacity={0.35} />
      </lineSegments>
      <points ref={flow} geometry={flowGeo}>
        <pointsMaterial size={0.09} color="#A5F3FC" transparent opacity={0.9} depthWrite={false} />
      </points>
      {members.map((m) => {
        const p = pos.get(m.id)!;
        const on = hovered === m.id;
        return (
          <mesh key={m.id} position={p} scale={on ? 1.12 : 1} {...hoverProps({ type: 'member', member: m })}>
            <sphereGeometry args={[0.42, 40, 40]} />
            <meshStandardMaterial color={m.color} emissive={m.color} emissiveIntensity={on ? 0.6 : 0.3} roughness={0.3} metalness={0.3} />
          </mesh>
        );
      })}
      {placed.map(({ it, p, radius }) => {
        const c = it.kind === 'debt' ? DEBT : it.owners.length > 1 ? SHARED : ASSET;
        const on = hovered === it.id;
        return (
          <mesh key={it.id} position={p} scale={on ? 1.25 : 1} {...hoverProps({ type: 'item', item: it })}>
            {it.kind === 'debt' ? <octahedronGeometry args={[radius * 1.15, 0]} /> : <sphereGeometry args={[radius, 24, 24]} />}
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={on ? 0.7 : 0.35} roughness={0.35} metalness={0.25} />
          </mesh>
        );
      })}
    </group>
  );
}

export default function FamilyNetworkScene(props: { members: NetMember[]; items: NetItem[]; onHover: (h: NetHover) => void; hovered: string | null }) {
  return (
    <Scene3D camera={[0, 0, 8.5]} fov={48} label={`Family network: ${props.members.length} members, ${props.items.length} accounts and loans`}>
      <ambientLight intensity={0.6} />
      <pointLight position={[4, 5, 6]} intensity={55} color="#E0F2FE" />
      <pointLight position={[-5, -4, 3]} intensity={20} color="#22D3EE" />
      <Network {...props} />
    </Scene3D>
  );
}
