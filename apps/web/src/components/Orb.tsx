// FinSight's voice: a living 3D orb (three.js via react-three-fiber).
// The surface is displaced by 3D simplex noise; amplitude, speed and colour
// follow the conversation state, and `levelRef` (0..1) adds live energy from the
// microphone (listening) or speech (speaking). No allocations per frame.
import { useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

const PALETTE: Record<OrbState, [string, string, number, number]> = {
  // colour A, colour B, base amplitude, speed
  idle: ['#5B6CFF', '#9B5CFF', 0.16, 0.35],
  listening: ['#10B981', '#22D3EE', 0.22, 0.6],
  thinking: ['#F59E0B', '#F43F5E', 0.3, 1.4],
  speaking: ['#3B82F6', '#A855F7', 0.24, 0.9],
};

const noise = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_); vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw); vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const vertex = /* glsl */ `
uniform float uTime; uniform float uAmp;
varying vec3 vNormal; varying vec3 vView; varying float vNoise;
${noise}
void main(){
  float n = snoise(normal * 1.6 + vec3(uTime * 0.6));
  n += 0.5 * snoise(normal * 3.2 - vec3(uTime * 0.9));
  vNoise = n;
  vec3 pos = position + normal * n * uAmp;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const fragment = /* glsl */ `
uniform vec3 uColorA; uniform vec3 uColorB; uniform float uGlow;
varying vec3 vNormal; varying vec3 vView; varying float vNoise;
void main(){
  float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);
  vec3 base = mix(uColorA, uColorB, smoothstep(-0.6, 0.9, vNoise));
  vec3 col = base * clamp(0.9 + 0.35 * vNoise, 0.6, 1.3) + fres * (0.9 + uGlow) * mix(uColorB, vec3(1.0), 0.45);
  gl_FragColor = vec4(col, 1.0);
}`;

const haloFragment = /* glsl */ `
uniform vec3 uColor; uniform float uGlow;
varying vec3 vNormal; varying vec3 vView;
void main(){
  float rim = 1.0 - abs(dot(vNormal, vView));
  float fres = pow(rim, 2.5);
  gl_FragColor = vec4(uColor, fres * (0.45 + 0.55 * uGlow));
}`;
const haloVertex = /* glsl */ `
varying vec3 vNormal; varying vec3 vView;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal); vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

function Blob({ state, levelRef, reduced }: { state: OrbState; levelRef: MutableRefObject<number>; reduced: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uAmp: { value: 0.16 }, uGlow: { value: 0 },
    uColorA: { value: new THREE.Color(PALETTE.idle[0]) }, uColorB: { value: new THREE.Color(PALETTE.idle[1]) },
  }), []);
  const halo = useMemo(() => ({ uColor: { value: new THREE.Color(PALETTE.idle[1]) }, uGlow: { value: 0 } }), []);
  // Pre-allocated targets (no per-frame allocation).
  const targets = useMemo(() => {
    const t = {} as Record<OrbState, { a: THREE.Color; b: THREE.Color; amp: number; speed: number }>;
    (Object.keys(PALETTE) as OrbState[]).forEach((k) => { const [a, b, amp, speed] = PALETTE[k]; t[k] = { a: new THREE.Color(a), b: new THREE.Color(b), amp, speed }; });
    return t;
  }, []);
  const time = useRef(0);
  const smoothLevel = useRef(0);

  useFrame((_, dt) => {
    const t = targets[state];
    const motion = reduced ? 0.25 : 1;
    smoothLevel.current += (Math.min(1, levelRef.current) - smoothLevel.current) * Math.min(1, dt * 10);
    time.current += dt * t.speed * motion * (1 + smoothLevel.current * 1.5);
    uniforms.uTime.value = time.current;
    const breathe = 0.02 * Math.sin(time.current * 2.2);
    const targetAmp = (t.amp + smoothLevel.current * 0.35 + breathe) * motion;
    uniforms.uAmp.value += (targetAmp - uniforms.uAmp.value) * Math.min(1, dt * 4);
    uniforms.uGlow.value = smoothLevel.current;
    halo.uGlow.value = smoothLevel.current;
    uniforms.uColorA.value.lerp(t.a, Math.min(1, dt * 3));
    uniforms.uColorB.value.lerp(t.b, Math.min(1, dt * 3));
    halo.uColor.value.lerp(t.b, Math.min(1, dt * 3));
    if (mesh.current) {
      mesh.current.rotation.y += dt * 0.15 * motion;
      mesh.current.rotation.x += dt * 0.05 * motion;
      const s = 1 + smoothLevel.current * 0.08;
      mesh.current.scale.setScalar(s);
    }
  });

  return (
    <>
      <mesh ref={mesh}>
        <icosahedronGeometry args={[1, 64]} />
        <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} />
      </mesh>
      <mesh scale={1.28}>
        <sphereGeometry args={[1, 48, 48]} />
        <shaderMaterial vertexShader={haloVertex} fragmentShader={haloFragment} uniforms={halo} transparent depthWrite={false} side={THREE.BackSide} blending={THREE.AdditiveBlending} />
      </mesh>
    </>
  );
}

export default function Orb({ state, levelRef, size = 320 }: { state: OrbState; levelRef: MutableRefObject<number>; size?: number }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return (
    <div style={{ width: size, height: size, maxWidth: '100%' }} aria-hidden>
      <Canvas camera={{ position: [0, 0, 4.4], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}>
        <Blob state={state} levelRef={levelRef} reduced={Boolean(reduced)} />
      </Canvas>
    </div>
  );
}

/** True when WebGL is available (otherwise show a CSS fallback). */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
