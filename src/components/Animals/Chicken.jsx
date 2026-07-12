import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";
import { resolveAnimalCollisions } from "../../systems/colliders";
import {
  setAnimalBody,
  resolveAnimalOverlaps,
} from "../../systems/animalCollision";
import { PEN } from "../Environment/Fence";

export const CHICKEN_COUNT = 5;
/** ~20 ft from the pen fence (1 unit ≈ 1 m) */
export const CHICKEN_ROAM_FROM_FENCE = 6.1;
const PEN_MARGIN = 0.85;
const WALK_SPEED = 1.9;
const RUN_SPEED = 3.4;
const ARRIVE = 0.45;
const CHICKEN_RADIUS = 0.22;

/** Random chicken plumage palettes */
export const CHICKEN_PALETTES = [
  { body: "#f0e8d8", wing: "#e0d0b8", comb: "#d43030", name: "White" },
  { body: "#c45a28", wing: "#a84820", comb: "#e04030", name: "Rhode" },
  { body: "#3a3a40", wing: "#2a2a30", comb: "#c82828", name: "Black" },
  { body: "#d4a040", wing: "#c49030", comb: "#e03828", name: "Buff" },
  { body: "#8a6a50", wing: "#6a5040", comb: "#d43028", name: "Brown" },
  { body: "#e8e0f0", wing: "#c8c0d8", comb: "#c03050", name: "Lavender" },
  { body: "#5a7a40", wing: "#4a6834", comb: "#d42828", name: "Olive" },
  { body: "#f0c0c8", wing: "#e0a8b0", comb: "#c02030", name: "Salmon" },
];

const _next = new THREE.Vector3();

function rand(seed) {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

/**
 * Stay inside the horse pen, and no farther than ~20 ft from the fence
 * (band along the rails — not deep into the open middle if the pen is wide).
 */
function clampInPenNearFence(x, z) {
  const { x0, x1, z0, z1 } = PEN;
  let nx = THREE.MathUtils.clamp(x, x0 + PEN_MARGIN, x1 - PEN_MARGIN);
  let nz = THREE.MathUtils.clamp(z, z0 + PEN_MARGIN, z1 - PEN_MARGIN);

  const dL = nx - x0;
  const dR = x1 - nx;
  const dB = nz - z0;
  const dF = z1 - nz;
  const minD = Math.min(dL, dR, dB, dF);
  const maxIn = CHICKEN_ROAM_FROM_FENCE;

  if (minD > maxIn) {
    // Push toward nearest rail
    if (minD === dL) nx = x0 + maxIn;
    else if (minD === dR) nx = x1 - maxIn;
    else if (minD === dB) nz = z0 + maxIn;
    else nz = z1 - maxIn;
  }
  return { x: nx, z: nz };
}

function pickRoamTarget() {
  const { x0, x1, z0, z1 } = PEN;
  // Sample a random point inside the pen, then pull it into the fence band
  const x = randRange(x0 + PEN_MARGIN, x1 - PEN_MARGIN);
  const z = randRange(z0 + PEN_MARGIN, z1 - PEN_MARGIN);
  return clampInPenNearFence(x, z);
}

/** Spawn near a random pen rail (inside) */
function pickSpawnNearFence(seed) {
  const { x0, x1, z0, z1 } = PEN;
  const side = Math.floor(rand(seed) * 4);
  const t = rand(seed + 3);
  const inset = 1.2 + rand(seed + 5) * Math.min(2.5, CHICKEN_ROAM_FROM_FENCE - 1);
  if (side === 0) return { x: x0 + inset, z: z0 + t * (z1 - z0) };
  if (side === 1) return { x: x1 - inset, z: z0 + t * (z1 - z0) };
  if (side === 2) return { x: x0 + t * (x1 - x0), z: z0 + inset };
  return { x: x0 + t * (x1 - x0), z: z1 - inset };
}

function ChickenMesh({ palette, scale = 1 }) {
  const p = palette;
  const leg = "#e8c070";
  const beak = "#f0a020";
  return (
    <group scale={scale}>
      {/* Body */}
      <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0.15]} castShadow>
        <sphereGeometry args={[0.12, 7, 6]} />
        <meshToonMaterial color={p.body} />
        <Outlines color={COLORS.outline} thickness={0.9} />
      </mesh>
      {/* Breast */}
      <mesh position={[0, 0.14, 0.08]} scale={[0.9, 0.85, 0.9]} castShadow>
        <sphereGeometry args={[0.09, 6, 5]} />
        <meshToonMaterial color={p.body} />
      </mesh>
      {/* Wing left / right */}
      {[-1, 1].map((s) => (
        <mesh
          key={`w-${s}`}
          position={[s * 0.1, 0.18, 0]}
          rotation={[0.2, 0, s * 0.4]}
          castShadow
        >
          <sphereGeometry args={[0.07, 5, 4]} />
          <meshToonMaterial color={p.wing} />
        </mesh>
      ))}
      {/* Tail feathers */}
      {[-0.04, 0, 0.04].map((sx, i) => (
        <mesh
          key={`t-${i}`}
          position={[sx, 0.22, -0.12]}
          rotation={[-0.6 + i * 0.1, 0, sx * 2]}
          castShadow
        >
          <boxGeometry args={[0.04, 0.1, 0.02]} />
          <meshToonMaterial color={i === 1 ? p.wing : p.body} />
        </mesh>
      ))}
      {/* Head */}
      <mesh position={[0, 0.3, 0.12]} castShadow>
        <sphereGeometry args={[0.07, 6, 5]} />
        <meshToonMaterial color={p.body} />
        <Outlines color={COLORS.outline} thickness={0.7} />
      </mesh>
      {/* Comb */}
      <mesh position={[0, 0.38, 0.12]} castShadow>
        <boxGeometry args={[0.03, 0.07, 0.08]} />
        <meshToonMaterial color={p.comb} />
      </mesh>
      <mesh position={[0, 0.36, 0.16]} castShadow>
        <sphereGeometry args={[0.025, 4, 3]} />
        <meshToonMaterial color={p.comb} />
      </mesh>
      {/* Wattle */}
      <mesh position={[0, 0.26, 0.17]} castShadow>
        <sphereGeometry args={[0.02, 4, 3]} />
        <meshToonMaterial color={p.comb} />
      </mesh>
      {/* Beak */}
      <mesh position={[0, 0.28, 0.19]} rotation={[0.3, 0, 0]} castShadow>
        <coneGeometry args={[0.025, 0.06, 4]} />
        <meshToonMaterial color={beak} />
      </mesh>
      {/* Eyes */}
      {[-1, 1].map((s) => (
        <mesh key={`e-${s}`} position={[s * 0.035, 0.32, 0.16]}>
          <sphereGeometry args={[0.012, 4, 3]} />
          <meshToonMaterial color="#1a1a1a" />
        </mesh>
      ))}
      {/* Legs */}
      {[-1, 1].map((s) => (
        <group key={`leg-${s}`} position={[s * 0.04, 0.08, 0.02]}>
          <mesh position={[0, -0.06, 0]} castShadow>
            <capsuleGeometry args={[0.012, 0.08, 2, 4]} />
            <meshToonMaterial color={leg} />
          </mesh>
          <mesh position={[0, -0.12, 0.02]} castShadow>
            <boxGeometry args={[0.05, 0.015, 0.04]} />
            <meshToonMaterial color={leg} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function SingleChicken({
  id,
  palette,
  cabinState,
  barnDoorState,
  gateState,
  spawn,
}) {
  const groupRef = useRef();
  const stateRef = useRef({
    pos: new THREE.Vector3(spawn.x, 0, spawn.z),
    yaw: Math.random() * Math.PI * 2,
    mode: "stand", // stand | walk | peck | run
    timer: randRange(0.5, 2.5),
    targetX: spawn.x,
    targetZ: spawn.z,
    walkPhase: 0,
  });

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const st = stateRef.current;
    const d = Math.min(delta, 0.05);

    st.timer -= d;

    if (st.mode === "walk" || st.mode === "run") {
      const dx = st.targetX - st.pos.x;
      const dz = st.targetZ - st.pos.z;
      const dist = Math.hypot(dx, dz);
      const speed = st.mode === "run" ? RUN_SPEED : WALK_SPEED;
      if (dist < ARRIVE || st.timer <= 0) {
        st.mode = Math.random() < 0.45 ? "peck" : "stand";
        st.timer = randRange(0.8, 3.2);
        st.walkPhase = 0;
      } else {
        const step = Math.min(dist, speed * d);
        st.pos.x += (dx / dist) * step;
        st.pos.z += (dz / dist) * step;
        st.yaw = Math.atan2(dx, dz);
        st.walkPhase += d * (st.mode === "run" ? 16 : 11);
      }
    } else if (st.timer <= 0) {
      const roll = Math.random();
      if (roll < 0.55) {
        const t = pickRoamTarget();
        st.targetX = t.x;
        st.targetZ = t.z;
        st.mode = Math.random() < 0.2 ? "run" : "walk";
        st.timer = randRange(2, 7);
      } else if (roll < 0.8) {
        st.mode = "peck";
        st.timer = randRange(0.6, 2);
      } else {
        st.mode = "stand";
        st.timer = randRange(1, 3);
        st.yaw += (Math.random() - 0.5) * 1.2;
      }
    }

    // Inside pen, within ~20 ft of the fence
    let c = clampInPenNearFence(st.pos.x, st.pos.z);
    st.pos.x = c.x;
    st.pos.z = c.z;
    st.pos.y = 0;

    _next.copy(st.pos);
    resolveAnimalCollisions(
      _next,
      CHICKEN_RADIUS,
      cabinState,
      barnDoorState,
      gateState
    );
    resolveAnimalOverlaps(_next, CHICKEN_RADIUS, id);
    c = clampInPenNearFence(_next.x, _next.z);
    st.pos.x = c.x;
    st.pos.z = c.z;
    setAnimalBody(id, st.pos.x, st.pos.z, CHICKEN_RADIUS);

    g.position.set(st.pos.x, 0, st.pos.z);
    g.rotation.y = st.yaw;

    const body = g.children[0];
    if (body) {
      const swing = Math.sin(st.walkPhase);
      if (st.mode === "walk" || st.mode === "run") {
        body.position.y = Math.abs(swing) * 0.03;
        body.rotation.x = 0.05;
      } else if (st.mode === "peck") {
        const peck = Math.sin(performance.now() * 0.012) * 0.5;
        body.position.y = 0;
        body.rotation.x = 0.55 + peck * 0.25;
      } else {
        body.position.y = 0;
        body.rotation.x = 0;
      }
    }
  });

  return (
    <group
      ref={groupRef}
      position={[spawn.x, 0, spawn.z]}
      userData={{ ignoreCameraCollision: true }}
    >
      <group>
        <ChickenMesh palette={palette} scale={1.05} />
      </group>
    </group>
  );
}

/**
 * Flock of 5 randomly colored chickens — roam inside the pen,
 * staying within ~20 ft of the fence rails.
 */
export function Chickens({ cabinState, barnDoorState, gateState }) {
  const flock = useMemo(() => {
    const list = [];
    for (let i = 0; i < CHICKEN_COUNT; i++) {
      const pi = Math.floor(rand(i + 3.1) * CHICKEN_PALETTES.length);
      const s = pickSpawnNearFence(i + 19);
      list.push({
        id: `chicken-${i}`,
        palette: CHICKEN_PALETTES[pi],
        spawn: clampInPenNearFence(s.x, s.z),
      });
    }
    return list;
  }, []);

  return (
    <group>
      {flock.map((c) => (
        <SingleChicken
          key={c.id}
          id={c.id}
          palette={c.palette}
          spawn={c.spawn}
          cabinState={cabinState}
          barnDoorState={barnDoorState}
          gateState={gateState}
        />
      ))}
    </group>
  );
}
