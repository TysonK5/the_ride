import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import { COLORS } from "../../materials/colors";

/** Barn long side is 18, depth 12; side rails = barn length + 20% */
export const BARN_LENGTH = 18;
export const BARN_DEPTH = 12;
export const FENCE_LENGTH = BARN_LENGTH * 1.2; // 21.6 — how far pen extends from barn
/** Right face of barn (W=18 → ±9); rails attach to the two right corners */
export const BARN_RIGHT_X = 9;
export const BARN_BACK_Z = -BARN_DEPTH / 2; // -6
export const BARN_FRONT_Z = BARN_DEPTH / 2; // +6

/** U-pen: open against barn, N/S rails start at barn's right corners */
export const PEN = {
  x0: BARN_RIGHT_X,
  x1: BARN_RIGHT_X + FENCE_LENGTH,
  z0: BARN_BACK_Z,
  z1: BARN_FRONT_Z,
};

export const GATE_WIDTH = 3.2;
export const GATE_RANGE = 2.8;
/** Gate sits on the south (+Z) rail, centered on that side */
export const GATE_MID_X = (PEN.x0 + PEN.x1) / 2;
export const GATE_Z = PEN.z1;
export const GATE_HINGE_X = GATE_MID_X - GATE_WIDTH / 2;

const POST_H = 1.25;
const RAIL_YS = [0.3, 0.65, 1.0];
const POST_SPACING = 2.4;
const WOOD = COLORS.woodLight;
const WOOD_DARK = COLORS.woodDark;

export function createGateState() {
  return {
    open: false,
    /** Current visual angle in radians (0 = closed along +X, open swings toward +Z outward) */
    angle: 0,
    targetAngle: 0,
  };
}

function Post({ position }) {
  return (
    <mesh position={position} castShadow>
      <boxGeometry args={[0.16, POST_H, 0.16]} />
      <meshToonMaterial color={WOOD_DARK} />
      <Outlines color={COLORS.outline} thickness={1} />
    </mesh>
  );
}

/** Horizontal 3-rail segment from (x0,z0) to (x1,z1) in XZ */
function RailRun({ x0, z0, x1, z1 }) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return null;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const rotY = Math.atan2(dx, dz);

  return (
    <group position={[cx, 0, cz]} rotation={[0, rotY, 0]}>
      {RAIL_YS.map((y, i) => (
        <mesh key={i} position={[0, y, 0]} castShadow>
          <boxGeometry args={[0.1, 0.1, len]} />
          <meshToonMaterial color={WOOD} />
          <Outlines color={COLORS.outline} thickness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function postsAlong(x0, z0, x1, z1, includeEnd = true) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.round(len / POST_SPACING));
  const posts = [];
  const count = includeEnd ? n + 1 : n;
  for (let i = 0; i < count; i++) {
    const t = i / n;
    posts.push([x0 + dx * t, z0 + dz * t]);
  }
  return posts;
}

function GateLeaf({ gateState }) {
  const groupRef = useRef();

  useFrame((_, delta) => {
    if (!groupRef.current || !gateState) return;
    const target = gateState.open ? -Math.PI / 2 : 0; // swing outward (+world Z when hinge on south rail)
    gateState.targetAngle = target;
    // Smooth swing
    const cur = gateState.angle;
    const next = cur + (target - cur) * Math.min(1, delta * 6);
    gateState.angle = Math.abs(next - target) < 0.01 ? target : next;
    groupRef.current.rotation.y = gateState.angle;
  });

  // Gate leaf local: extends along +X from hinge (closed flush with south rail which runs along X)
  // South rail is along X, so closed gate should run along +X. rotation.y=0 means local +Z is world +Z.
  // We build gate along local +Z then rotate hinge so closed aligns with world +X...
  // Simpler: build gate along local +X from hinge at origin; closed rotation.y = 0 keeps it on south line if hinge group faces correctly.
  // Hinge group at (GATE_HINGE_X, GATE_Z), world +X is along the fence. Leaf meshes extend +X.
  return (
    <group ref={groupRef} position={[GATE_HINGE_X, 0, GATE_Z]}>
      {/* Gate posts (leaf frame) */}
      <mesh position={[0.08, POST_H / 2, 0]} castShadow>
        <boxGeometry args={[0.14, POST_H, 0.14]} />
        <meshToonMaterial color={WOOD_DARK} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[GATE_WIDTH - 0.08, POST_H / 2, 0]} castShadow>
        <boxGeometry args={[0.14, POST_H, 0.14]} />
        <meshToonMaterial color={WOOD_DARK} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      {RAIL_YS.map((y, i) => (
        <mesh key={i} position={[GATE_WIDTH / 2, y, 0]} castShadow>
          <boxGeometry args={[GATE_WIDTH - 0.1, 0.1, 0.1]} />
          <meshToonMaterial color={WOOD} />
          <Outlines color={COLORS.outline} thickness={0.8} />
        </mesh>
      ))}
      {/* Diagonal brace */}
      <mesh
        position={[GATE_WIDTH / 2, 0.65, 0]}
        rotation={[0, 0, -0.45]}
        castShadow
      >
        <boxGeometry args={[GATE_WIDTH * 0.85, 0.08, 0.08]} />
        <meshToonMaterial color={WOOD_DARK} />
      </mesh>
    </group>
  );
}

/**
 * 3-sided 3-rail corral on the right of the barn.
 * North/south rails meet the barn's right-back and right-front corners.
 * Gate on the south (+Z) rail.
 */
export function Fence({ gateState }) {
  const { x0, x1, z0, z1 } = PEN;
  const g0 = GATE_MID_X - GATE_WIDTH / 2;
  const g1 = GATE_MID_X + GATE_WIDTH / 2;

  // Static posts (unique)
  const postSet = new Map();
  const addPosts = (list) => {
    for (const [x, z] of list) {
      postSet.set(`${x.toFixed(2)},${z.toFixed(2)}`, [x, z]);
    }
  };
  // North rail (along +X)
  addPosts(postsAlong(x0, z0, x1, z0));
  // East rail (along +Z)
  addPosts(postsAlong(x1, z0, x1, z1));
  // South rail left of gate
  addPosts(postsAlong(x0, z1, g0, z1));
  // South rail right of gate
  addPosts(postsAlong(g1, z1, x1, z1));
  // Gate hinge & latch posts
  addPosts([
    [g0, z1],
    [g1, z1],
  ]);

  return (
    <group>
      {[...postSet.values()].map(([x, z], i) => (
        <Post key={i} position={[x, POST_H / 2, z]} />
      ))}

      {/* North */}
      <RailRun x0={x0} z0={z0} x1={x1} z1={z0} />
      {/* East */}
      <RailRun x0={x1} z0={z0} x1={x1} z1={z1} />
      {/* South — split around gate */}
      <RailRun x0={x0} z0={z1} x1={g0} z1={z1} />
      <RailRun x0={g1} z0={z1} x1={x1} z1={z1} />

      <GateLeaf gateState={gateState} />
    </group>
  );
}

/** Thin box colliders for fence rails + gate when closed */
export function getFenceColliders(gateState) {
  const { x0, x1, z0, z1 } = PEN;
  const g0 = GATE_MID_X - GATE_WIDTH / 2;
  const g1 = GATE_MID_X + GATE_WIDTH / 2;
  const t = 0.2; // half-thickness

  const boxes = [
    // North rail
    { type: "box", minX: x0, maxX: x1, minZ: z0 - t, maxZ: z0 + t },
    // East rail
    { type: "box", minX: x1 - t, maxX: x1 + t, minZ: z0, maxZ: z1 },
    // South left of gate
    { type: "box", minX: x0, maxX: g0, minZ: z1 - t, maxZ: z1 + t },
    // South right of gate
    { type: "box", minX: g1, maxX: x1, minZ: z1 - t, maxZ: z1 + t },
  ];

  if (!gateState?.open) {
    // Closed gate fills the opening
    boxes.push({
      type: "box",
      minX: g0,
      maxX: g1,
      minZ: z1 - t,
      maxZ: z1 + t,
    });
  } else {
    // Open gate leaf swings to roughly -X from hinge… angle -90° from along +X
    // Closed: leaf along +X from hinge. Open -90° Y: leaf along -Z (into pen) or +Z?
    // rotation.y negative: right-hand, +X rotates toward -Z
    // So open leaf occupies roughly hinge_x - t .. hinge_x + t, z from z1 - GATE_WIDTH to z1
    boxes.push({
      type: "box",
      minX: GATE_HINGE_X - t,
      maxX: GATE_HINGE_X + t,
      minZ: GATE_Z - GATE_WIDTH,
      maxZ: GATE_Z + t,
    });
  }

  return boxes;
}

export function distToGate(x, z) {
  // Distance to gate center (opening midpoint)
  const cx = GATE_MID_X;
  const cz = GATE_Z;
  return Math.hypot(x - cx, z - cz);
}
