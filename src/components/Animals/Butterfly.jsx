import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";

/** Always keep this many butterflies active around the map */
export const BUTTERFLY_COUNT = 5;
/** Distance (m) at which the player can net a butterfly */
export const BUTTERFLY_CATCH_RANGE = 2.15;
/** Fly height band above ground / flowers */
const FLY_Y_MIN = 0.35;
const FLY_Y_MAX = 1.15;
/** Seconds before a caught butterfly respawns near a new flower */
const RESPAWN_MIN = 8;
const RESPAWN_MAX = 16;

const PALETTES = [
  { wing: "#e85a6a", wingDark: "#a03040", body: "#2a2018", name: "Monarch blush" },
  { wing: "#3a7ec8", wingDark: "#1a4a8a", body: "#1a1820", name: "Sky blue" },
  { wing: "#f0b429", wingDark: "#c48018", body: "#2a2210", name: "Sulphur" },
  { wing: "#9a7ad4", wingDark: "#5a3a9a", body: "#1a1420", name: "Violet" },
  { wing: "#f5f0e8", wingDark: "#c8c0b0", body: "#3a3028", name: "Cabbage white" },
  { wing: "#40c878", wingDark: "#208048", body: "#1a2418", name: "Lime" },
  { wing: "#e87830", wingDark: "#a04818", body: "#2a1810", name: "Painted lady" },
];

function rand(seed) {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

/** Pick a live flower as an anchor, or a random prairie spot */
function pickFlowerAnchor(flowerState, seed = 0) {
  const active =
    flowerState?.instances?.filter((f) => f && f.active !== false) ?? [];
  if (active.length > 0) {
    const f = active[Math.floor(rand(seed + 9) * active.length) % active.length];
    return { x: f.x, z: f.z };
  }
  // Fallback spread around the ranch
  const a = rand(seed) * Math.PI * 2;
  const r = 15 + rand(seed + 2) * 50;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

function createOneButterfly(i, flowerState) {
  const anchor = pickFlowerAnchor(flowerState, i * 17 + 3);
  const palette = PALETTES[i % PALETTES.length];
  return {
    id: i,
    palette,
    active: true,
    /** True while this butterfly is inside the player's net */
    held: false,
    /** World position */
    pos: new THREE.Vector3(
      anchor.x + (rand(i) - 0.5) * 2.5,
      randRange(FLY_Y_MIN, FLY_Y_MAX),
      anchor.z + (rand(i + 1) - 0.5) * 2.5
    ),
    yaw: rand(i + 2) * Math.PI * 2,
    wingPhase: i * 1.7,
    /** Orbit around current flower */
    anchorX: anchor.x,
    anchorZ: anchor.z,
    orbitR: 0.6 + rand(i + 4) * 1.4,
    orbitSpeed: 0.55 + rand(i + 5) * 0.7,
    orbitAngle: rand(i + 6) * Math.PI * 2,
    bobSpeed: 2.2 + rand(i + 7) * 1.8,
    bobAmp: 0.08 + rand(i + 8) * 0.12,
    baseY: randRange(FLY_Y_MIN + 0.1, FLY_Y_MAX - 0.15),
    /** Timer until re-pick flower / after catch */
    timer: 4 + rand(i + 10) * 8,
    respawnIn: 0,
  };
}

/**
 * Shared mutable butterfly flock (Player + Butterflies component).
 */
export function createButterflyState(flowerState) {
  const butterflies = [];
  for (let i = 0; i < BUTTERFLY_COUNT; i++) {
    butterflies.push(createOneButterfly(i, flowerState));
  }
  return {
    butterflies,
    /** Currently carried in the net: { id, palette, name } or null */
    held: null,
    /** Total net catches this session */
    catchCount: 0,
  };
}

/**
 * Nearest active butterfly the player can net.
 * @returns {{ butterfly, dist } | null}
 */
export function findNearestButterfly(
  butterflyState,
  x,
  y,
  z,
  maxDist = BUTTERFLY_CATCH_RANGE
) {
  if (!butterflyState?.butterflies) return null;
  let best = null;
  let bestD = maxDist;
  for (const b of butterflyState.butterflies) {
    if (!b.active) continue;
    // Prefer horizontal range; small bonus if player is roughly at height
    const dx = b.pos.x - x;
    const dz = b.pos.z - z;
    const dy = b.pos.y - (y ?? 0);
    const d = Math.hypot(dx, dz) + Math.abs(dy) * 0.35;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best ? { butterfly: best, dist: bestD } : null;
}

/**
 * Catch a butterfly into the player's net (removed from world until released).
 * Returns the held payload { id, palette, name } or null.
 */
export function catchButterfly(butterflyState, butterflyId) {
  if (!butterflyState) return null;
  if (butterflyState.held) return null; // already carrying one
  const b = butterflyState.butterflies.find((x) => x.id === butterflyId);
  if (!b || !b.active) return null;
  b.active = false;
  b.held = true; // do not auto-respawn while held in net
  b.respawnIn = 0;
  butterflyState.catchCount = (butterflyState.catchCount ?? 0) + 1;
  butterflyState.held = {
    id: b.id,
    palette: b.palette,
    name: b.palette?.name || "Butterfly",
  };
  return butterflyState.held;
}

/**
 * Release the held butterfly from the net near the player.
 * Butterfly flies free again; net should be put away by the caller.
 */
export function releaseButterfly(butterflyState, playerX, playerZ, playerYaw) {
  if (!butterflyState?.held) return false;
  const id = butterflyState.held.id;
  const b = butterflyState.butterflies.find((x) => x.id === id);
  butterflyState.held = null;
  if (!b) return true;

  // Release in front of the player and resume freeflight
  const fx = playerX + Math.sin(playerYaw ?? 0) * 1.2;
  const fz = playerZ + Math.cos(playerYaw ?? 0) * 1.2;
  b.held = false;
  b.active = true;
  b.respawnIn = 0;
  b.anchorX = fx;
  b.anchorZ = fz;
  b.orbitR = 1.2 + Math.random() * 1.5;
  b.orbitAngle = (playerYaw ?? 0) + Math.PI;
  b.baseY = randRange(FLY_Y_MIN + 0.25, FLY_Y_MAX);
  b.pos.set(fx, b.baseY, fz);
  b.yaw = playerYaw ?? 0;
  b.timer = 3 + Math.random() * 4; // soon picks a flower again
  return true;
}

function respawnButterfly(b, flowerState, seed) {
  if (b.held) return; // still in the player's net
  const anchor = pickFlowerAnchor(flowerState, seed + performance.now() * 0.001);
  b.active = true;
  b.held = false;
  b.anchorX = anchor.x;
  b.anchorZ = anchor.z;
  b.orbitR = 0.6 + Math.random() * 1.4;
  b.orbitAngle = Math.random() * Math.PI * 2;
  b.baseY = randRange(FLY_Y_MIN + 0.1, FLY_Y_MAX - 0.15);
  b.pos.set(
    anchor.x + (Math.random() - 0.5) * 2,
    b.baseY,
    anchor.z + (Math.random() - 0.5) * 2
  );
  b.timer = 5 + Math.random() * 10;
  b.respawnIn = 0;
}

/**
 * Five butterflies orbiting low over map flowers.
 * Reads flowerState for anchors; butterflyState is shared with Player for catch.
 */
export function Butterflies({ flowerState, butterflyState }) {
  const groupRefs = useRefMap(BUTTERFLY_COUNT);

  useFrame((_, delta) => {
    if (!butterflyState?.butterflies) return;
    const dt = Math.min(0.05, delta);

    for (const b of butterflyState.butterflies) {
      if (!b.active || b.held) {
        // Held in net: stay invisible in world. Inactive free ones may respawn.
        if (!b.active && !b.held && b.respawnIn > 0) {
          b.respawnIn -= dt;
          if (b.respawnIn <= 0) {
            respawnButterfly(b, flowerState, b.id * 31);
          }
        }
        const g = groupRefs.current[b.id];
        if (g) g.visible = false;
        continue;
      }

      b.timer -= dt;
      // Occasionally hop to a new flower
      if (b.timer <= 0) {
        const anchor = pickFlowerAnchor(
          flowerState,
          b.id * 13 + Math.floor(performance.now() / 1000)
        );
        b.anchorX = anchor.x;
        b.anchorZ = anchor.z;
        b.orbitR = 0.55 + Math.random() * 1.5;
        b.timer = 6 + Math.random() * 12;
      }

      b.orbitAngle += b.orbitSpeed * dt;
      b.wingPhase += dt * 14;

      // Drift orbit center slightly toward flower
      const tx = b.anchorX + Math.cos(b.orbitAngle) * b.orbitR;
      const tz = b.anchorZ + Math.sin(b.orbitAngle) * b.orbitR;
      const ty =
        b.baseY + Math.sin(b.wingPhase * 0.35 + b.id) * b.bobAmp;

      // Smooth chase orbit point
      b.pos.x += (tx - b.pos.x) * Math.min(1, dt * 2.8);
      b.pos.z += (tz - b.pos.z) * Math.min(1, dt * 2.8);
      b.pos.y += (ty - b.pos.y) * Math.min(1, dt * 3.5);
      b.pos.y = THREE.MathUtils.clamp(b.pos.y, FLY_Y_MIN, FLY_Y_MAX + 0.2);

      // Face travel direction
      const faceX = tx - b.pos.x;
      const faceZ = tz - b.pos.z;
      if (faceX * faceX + faceZ * faceZ > 1e-5) {
        b.yaw = Math.atan2(faceX, faceZ);
      }

      const g = groupRefs.current[b.id];
      if (g) {
        g.visible = true;
        g.position.copy(b.pos);
        g.rotation.y = b.yaw;
      }
    }
  });

  if (!butterflyState?.butterflies) return null;

  return (
    <group>
      {butterflyState.butterflies.map((b) => (
        <group
          key={b.id}
          ref={(el) => {
            if (el) groupRefs.current[b.id] = el;
          }}
          position={b.pos.toArray()}
          rotation={[0, b.yaw, 0]}
          visible={b.active}
          userData={{ ignoreCameraCollision: true }}
        >
          <ButterflyVisual butterfly={b} />
        </group>
      ))}
    </group>
  );
}

function useRefMap(n) {
  return useRef({});
}

function ButterflyVisual({ butterfly }) {
  return <FlappingButterfly palette={butterfly.palette} butterfly={butterfly} />;
}

function FlappingButterfly({ palette, butterfly }) {
  const root = useRef();
  const wingL = useRef();
  const wingR = useRef();

  useFrame(() => {
    const flap = Math.sin(butterfly.wingPhase) * 0.9;
    if (wingL.current) wingL.current.rotation.z = 0.3 + flap;
    if (wingR.current) wingR.current.rotation.z = -0.3 - flap;
  });

  const p = palette;
  return (
    <group ref={root} scale={0.5}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.035, 0.16, 3, 5]} />
        <meshToonMaterial color={p.body} />
        <Outlines color={COLORS.outline} thickness={0.55} />
      </mesh>
      <mesh position={[0, 0.02, 0.1]}>
        <sphereGeometry args={[0.04, 5, 4]} />
        <meshToonMaterial color={p.body} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={`a-${s}`}
          position={[s * 0.025, 0.07, 0.12]}
          rotation={[0.55, 0, s * 0.4]}
        >
          <cylinderGeometry args={[0.006, 0.005, 0.11, 3]} />
          <meshToonMaterial color={p.body} />
        </mesh>
      ))}
      <group ref={wingL} position={[-0.02, 0.02, 0]}>
        <mesh position={[-0.11, 0, 0.02]}>
          <sphereGeometry args={[0.13, 6, 5]} />
          <meshToonMaterial color={p.wing} transparent opacity={0.92} />
          <Outlines color={COLORS.outline} thickness={0.45} />
        </mesh>
        <mesh position={[-0.09, -0.02, -0.07]} scale={[0.8, 0.7, 0.85]}>
          <sphereGeometry args={[0.09, 5, 4]} />
          <meshToonMaterial color={p.wingDark} transparent opacity={0.88} />
        </mesh>
      </group>
      <group ref={wingR} position={[0.02, 0.02, 0]}>
        <mesh position={[0.11, 0, 0.02]}>
          <sphereGeometry args={[0.13, 6, 5]} />
          <meshToonMaterial color={p.wing} transparent opacity={0.92} />
          <Outlines color={COLORS.outline} thickness={0.45} />
        </mesh>
        <mesh position={[0.09, -0.02, -0.07]} scale={[0.8, 0.7, 0.85]}>
          <sphereGeometry args={[0.09, 5, 4]} />
          <meshToonMaterial color={p.wingDark} transparent opacity={0.88} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Butterfly net for the player's hand.
 * When `held` is set ({ palette }), shows a small butterfly inside the bag
 * and the net is oriented for an overhead vertical carry (arm raised).
 */
export function ButterflyNet({ scale = 1, held = null }) {
  const flapRef = useRef(0);
  const wingL = useRef();
  const wingR = useRef();

  useFrame((_, delta) => {
    if (!held) return;
    flapRef.current += delta * 10;
    const flap = Math.sin(flapRef.current) * 0.55;
    if (wingL.current) wingL.current.rotation.z = 0.25 + flap;
    if (wingR.current) wingR.current.rotation.z = -0.25 - flap;
  });

  const p = held?.palette;
  // Overhead carry: net continues straight past the hand (vertical).
  // Swing pose: slight tip for the catch motion.
  const raised = !!held;

  return (
    <group
      scale={scale}
      rotation={raised ? [0.05, 0, 0] : [0.4, 0, 0.15]}
      position={raised ? [0.02, -0.08, 0.02] : [0.05, -0.15, 0.05]}
    >
      {/* Handle */}
      <mesh position={[0, -0.35, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.03, 0.7, 5]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={0.7} />
      </mesh>
      {/* Hoop */}
      <mesh position={[0, -0.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.18, 0.018, 5, 12]} />
        <meshToonMaterial color="#6a7078" />
        <Outlines color={COLORS.outline} thickness={0.5} />
      </mesh>
      {/* Net bag (soft cone) */}
      <mesh position={[0, -0.88, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.17, 0.32, 8, 1, true]} />
        <meshToonMaterial
          color="#d8e0e8"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Captured butterfly inside the bag */}
      {p && (
        <group position={[0, -0.86, 0]} scale={0.38} rotation={[0.4, 0.6, 0.2]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.035, 0.14, 3, 4]} />
            <meshToonMaterial color={p.body} />
          </mesh>
          <group ref={wingL} position={[-0.02, 0.02, 0]}>
            <mesh position={[-0.1, 0, 0]}>
              <sphereGeometry args={[0.11, 5, 4]} />
              <meshToonMaterial color={p.wing} transparent opacity={0.9} />
            </mesh>
          </group>
          <group ref={wingR} position={[0.02, 0.02, 0]}>
            <mesh position={[0.1, 0, 0]}>
              <sphereGeometry args={[0.11, 5, 4]} />
              <meshToonMaterial color={p.wing} transparent opacity={0.9} />
            </mesh>
          </group>
        </group>
      )}
    </group>
  );
}
