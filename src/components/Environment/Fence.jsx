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

export const GATE_OPEN_ANGLE = Math.PI / 2;

export function createGateState() {
  return {
    open: false,
    /**
     * Swing direction when open:
     *  -1 → leaf into pen (−Z), +1 → leaf outward (+Z)
     * Set by player movement direction when pushing through.
     */
    openDir: -1,
    /** Current visual angle in radians (0 = closed along +X) */
    angle: 0,
    targetAngle: 0,
    /** Seconds before push-close / reverse is allowed after opening */
    pushCooldown: 0,
  };
}

/** Proximity to the swung-open leaf to shove it closed */
export const GATE_PUSH_CLOSE_RANGE = 1.4;

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
    // Leaf extends along local +X from hinge. Three.js rotY:
    //   +θ → free end toward −Z (into pen)
    //   −θ → free end toward +Z (out of pen)
    // openDir −1 into pen, +1 out — so target angle is −openDir * GATE_OPEN_ANGLE
    const dir = gateState.openDir >= 0 ? 1 : -1;
    const target = gateState.open ? -dir * GATE_OPEN_ANGLE : 0;
    gateState.targetAngle = target;
    // Smooth swing
    const cur = gateState.angle;
    const next = cur + (target - cur) * Math.min(1, delta * 6);
    gateState.angle = Math.abs(next - target) < 0.01 ? target : next;
    groupRef.current.rotation.y = gateState.angle;
    if (gateState.pushCooldown > 0) {
      gateState.pushCooldown = Math.max(0, gateState.pushCooldown - delta);
    }
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

  // Treat as open for walkthrough once swung most of the way either direction
  const ang = gateState?.angle ?? 0;
  const swungOpen = gateState?.open || Math.abs(ang) > 0.4;
  if (!swungOpen) {
    // Closed gate fills the opening
    boxes.push({
      type: "box",
      minX: g0,
      maxX: g1,
      minZ: z1 - t,
      maxZ: z1 + t,
    });
  } else {
    // Open leaf: +angle → into pen (−Z); −angle → outside (+Z)
    const intoPen =
      Math.abs(ang) > 0.12
        ? ang > 0
        : (gateState?.openDir ?? -1) < 0;
    if (intoPen) {
      boxes.push({
        type: "box",
        minX: GATE_HINGE_X - t,
        maxX: GATE_HINGE_X + t,
        minZ: GATE_Z - GATE_WIDTH,
        maxZ: GATE_Z + t,
      });
    } else {
      boxes.push({
        type: "box",
        minX: GATE_HINGE_X - t,
        maxX: GATE_HINGE_X + t,
        minZ: GATE_Z - t,
        maxZ: GATE_Z + GATE_WIDTH,
      });
    }
  }

  return boxes;
}

export function distToGate(x, z) {
  // Distance to gate center (opening midpoint)
  const cx = GATE_MID_X;
  const cz = GATE_Z;
  return Math.hypot(x - cx, z - cz);
}

/**
 * Infer push direction from movement:
 *  −1 = into pen (−Z), +1 = out of pen (+Z)
 * Gate swings the way you walk so the leaf is pushed ahead of you.
 */
function pushDirFromMotion(x, z, velX, velZ) {
  // Prefer clear Z motion through the south-facing gate
  if (Math.abs(velZ) > 0.001 && Math.abs(velZ) >= Math.abs(velX) * 0.25) {
    // Moving +Z (out) → leaf swings out (+1); −Z (in) → leaf into pen (−1)
    return velZ > 0 ? 1 : -1;
  }
  // Fallback: which side of the fence line the player is on
  // Outside (south, +Z) → walking in → push into pen; inside → push out
  return z > GATE_Z ? -1 : 1;
}

/**
 * Walk into the gate to open it in your movement direction;
 * reverse walk through the gap flips swing side; walk into the open leaf
 * toward the closed line to shut it.
 * velX/velZ = frame displacement (or velocity).
 * Returns true if open state or direction changed (for SFX).
 */
export function tryPushBarnGate(x, z, velX, velZ, isMoving, gateState) {
  if (!gateState || !isMoving) return false;

  const inOpening =
    x >= GATE_MID_X - GATE_WIDTH * 0.55 &&
    x <= GATE_MID_X + GATE_WIDTH * 0.55 &&
    z >= GATE_Z - 1.65 &&
    z <= GATE_Z + 1.65;

  const openDir = gateState.openDir >= 0 ? 1 : -1;
  const ang = gateState.angle ?? 0;
  const fullySwung = Math.abs(ang) > 0.55;
  const vz = velZ ?? 0;
  const vx = velX ?? 0;

  // Open leaf hit-test (depends on which way it swung)
  const nearOpenLeaf =
    fullySwung &&
    Math.abs(x - GATE_HINGE_X) < GATE_PUSH_CLOSE_RANGE &&
    (openDir < 0
      ? z <= GATE_Z + 0.5 && z >= GATE_Z - GATE_WIDTH - 0.45
      : z >= GATE_Z - 0.5 && z <= GATE_Z + GATE_WIDTH + 0.45);

  const pushDir = pushDirFromMotion(x, z, vx, vz);

  // --- Closed → open in movement direction ---
  if (!gateState.open && inOpening) {
    gateState.open = true;
    gateState.openDir = pushDir;
    gateState.pushCooldown = 0.55;
    return true;
  }

  if (!gateState.open) return false;
  if ((gateState.pushCooldown ?? 0) > 0) return false;

  // --- Open: reverse push through opening flips swing side (prefer over close) ---
  if (inOpening && pushDir !== openDir) {
    // Need clear through-gate intent (motion or crossing the fence line)
    const reversing =
      Math.abs(vz) > 0.001 ||
      (openDir < 0 && z > GATE_Z + 0.15) ||
      (openDir > 0 && z < GATE_Z - 0.15);
    if (reversing) {
      gateState.openDir = pushDir;
      gateState.open = true;
      gateState.pushCooldown = 0.35;
      return true;
    }
  }

  // --- Open: walk into the leaf toward the fence line to close ---
  // Into pen (openDir −1): push leaf +Z-ward (velZ > 0) while on pen side of leaf
  // Outward (openDir +1): push leaf −Z-ward (velZ < 0) while outside
  if (nearOpenLeaf) {
    const closingPush =
      openDir < 0
        ? vz > 0.0005 || (Math.abs(vz) <= 0.0005 && z < GATE_Z - 0.4)
        : vz < -0.0005 || (Math.abs(vz) <= 0.0005 && z > GATE_Z + 0.4);
    // Don't close while walking through the center gap
    const throughGap =
      x >= GATE_MID_X - GATE_WIDTH * 0.4 &&
      x <= GATE_MID_X + GATE_WIDTH * 0.4 &&
      Math.abs(z - GATE_Z) < 1.1;
    if (closingPush && !throughGap) {
      gateState.open = false;
      gateState.pushCooldown = 0.45;
      return true;
    }
  }

  return false;
}

/** Set openDir from player side when toggling via interact (E). */
export function setGateOpenFromPlayer(gateState, playerZ, open) {
  if (!gateState) return;
  gateState.open = open;
  if (open) {
    // Outside → swing into pen; inside → swing outward
    gateState.openDir = playerZ > GATE_Z ? -1 : 1;
  }
  gateState.pushCooldown = open ? 0.75 : 0.4;
}
