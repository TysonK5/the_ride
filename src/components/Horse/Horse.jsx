import { useRef, forwardRef, useImperativeHandle } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";
import { resolveAnimalCollisions } from "../../systems/colliders";
import {
  setAnimalBody,
  resolveAnimalOverlaps,
} from "../../systems/animalCollision";

const SADDLE = "#6b4423";
const SADDLE_DARK = "#4a2e16";
const SADDLE_LIGHT = "#8a5a32";
const BLANKET = "#3a4a5a";
const BLANKET_TRIM = "#c4a060";
const BAG = "#2a2218";
const REIN = "#3a2810";

/** Default white horse coat */
export const HORSE_PALETTE = {
  body: "#f5f5f0",
  bodyShade: "#e8e4dc",
  mane: "#ece8e0",
  maneDark: "#d0ccc4",
  hoof: "#2a2a28",
  nose: "#3a3030",
  eye: "#1a1a1a",
};

/** Light purple unicorn coat */
export const UNICORN_PALETTE = {
  body: "#d8c0f5",
  bodyShade: "#c4a8e8",
  mane: "#f0e0ff",
  maneDark: "#b898e0",
  hoof: "#5a4870",
  nose: "#8a70a8",
  eye: "#4a2060",
};

export const RAINBOW_HORN = [
  "#ff3b3b",
  "#ff9a3b",
  "#ffe03b",
  "#4ade80",
  "#3b9aff",
  "#a855f7",
  "#ec4899",
];

export const MOUNT_RANGE = 3.5;
export const RIDE_SPEED = 14;

/** Idle walk speed (unmounted roam in barn / pen) */
export const IDLE_WALK_SPEED = 2.6;
/** How fast a called horse trots to the player */
export const COME_SPEED = 7.2;
/** Stop distance when answering a whistle */
export const COME_ARRIVE = 2.35;
/** Stop distance for casual wander targets */
export const WANDER_ARRIVE = 1.4;

/**
 * Combined walkable barn floor + horse pen (inside rails).
 * Barn W=18 D=12 at origin; pen extends +X from barn right face.
 */
export const BARN_PEN_ROAM = {
  minX: -7.2,
  maxX: 9 + 18 * 1.2 - 1.4, // PEN.x1 - margin ≈ 29.2
  minZ: -6 + 1.15,
  maxZ: 6 - 1.15,
};

export function isInBarnOrPen(x, z, margin = 0.8) {
  return (
    x >= BARN_PEN_ROAM.minX - margin &&
    x <= BARN_PEN_ROAM.maxX + margin &&
    z >= BARN_PEN_ROAM.minZ - margin &&
    z <= BARN_PEN_ROAM.maxZ + margin
  );
}

function pickWanderTarget(rideState) {
  rideState.aiTargetX =
    BARN_PEN_ROAM.minX +
    Math.random() * (BARN_PEN_ROAM.maxX - BARN_PEN_ROAM.minX);
  rideState.aiTargetZ =
    BARN_PEN_ROAM.minZ +
    Math.random() * (BARN_PEN_ROAM.maxZ - BARN_PEN_ROAM.minZ);
}

/**
 * Whistle: only the closest free mount answers and walks to the player.
 * Returns the called mount, or null.
 */
export function callNearestHorse(mounts, px, pz) {
  let best = null;
  let bestD = Infinity;
  for (const m of mounts) {
    if (!m || m.mounted || m.busy || m.drinking) continue;
    const d = Math.hypot(m.position.x - px, m.position.z - pz);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  if (!best) return null;

  for (const m of mounts) {
    if (!m || m === best) continue;
    if (m.aiMode === "come") {
      m.aiMode = "stand";
      m.aiTimer = 1.5 + Math.random() * 3;
      m.moving = false;
      m.sprinting = false;
    }
  }

  best.aiMode = "come";
  best.callTargetX = px;
  best.callTargetZ = pz;
  best.aiTimer = 28;
  best.sprinting = false;
  best.airborne = false;
  best.position.y = 0;
  return best;
}

const _horseCol = new THREE.Vector3();
/** Collision radius while free-roaming / answering a call */
export const IDLE_HORSE_RADIUS = 0.85;

/**
 * Keep free-roaming mounts out of barn walls, cabin, and pen fence.
 */
function applyHorseWorldCollision(
  rideState,
  cabinState,
  barnDoorState,
  gateState
) {
  if (!rideState?.position) return;
  const id = rideState.name || "horse";
  _horseCol.copy(rideState.position);
  resolveAnimalCollisions(
    _horseCol,
    IDLE_HORSE_RADIUS,
    cabinState,
    barnDoorState,
    gateState
  );
  resolveAnimalOverlaps(_horseCol, IDLE_HORSE_RADIUS, id);
  rideState.position.x = _horseCol.x;
  rideState.position.z = _horseCol.z;
  rideState.position.y = 0;
  setAnimalBody(id, rideState.position.x, rideState.position.z, IDLE_HORSE_RADIUS);
}

/**
 * Unmounted idle brain: stand / wander inside barn+pen, or come when called.
 * Player owns position while mounted.
 * Structure colliders keep horses from clipping barn / cabin / fence.
 */
export function updateHorseIdleAI(
  rideState,
  delta,
  cabinState = null,
  barnDoorState = null,
  gateState = null
) {
  if (!rideState) return;
  if (rideState.mounted || rideState.busy || rideState.drinking) {
    if (rideState.mounted && rideState.aiMode === "come") {
      rideState.aiMode = "stand";
    }
    return;
  }

  // --- Called: trot to player (can leave the pen via open gate) ---
  if (rideState.aiMode === "come") {
    rideState.aiTimer -= delta;
    const dx = rideState.callTargetX - rideState.position.x;
    const dz = rideState.callTargetZ - rideState.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < COME_ARRIVE || rideState.aiTimer <= 0) {
      rideState.aiMode = "stand";
      rideState.moving = false;
      rideState.sprinting = false;
      rideState.aiTimer = 2 + Math.random() * 4;
      applyHorseWorldCollision(
        rideState,
        cabinState,
        barnDoorState,
        gateState
      );
      return;
    }
    const step = Math.min(dist, COME_SPEED * delta);
    rideState.position.x += (dx / dist) * step;
    rideState.position.z += (dz / dist) * step;
    rideState.position.y = 0;
    rideState.yaw = Math.atan2(dx, dz);
    rideState.moving = true;
    rideState.sprinting = dist > 14;
    rideState.airborne = false;
    applyHorseWorldCollision(
      rideState,
      cabinState,
      barnDoorState,
      gateState
    );
    return;
  }

  // Outside barn/pen — stand still until called
  if (!isInBarnOrPen(rideState.position.x, rideState.position.z, 1.2)) {
    rideState.moving = false;
    rideState.sprinting = false;
    rideState.aiMode = "stand";
    applyHorseWorldCollision(
      rideState,
      cabinState,
      barnDoorState,
      gateState
    );
    return;
  }

  rideState.aiTimer -= delta;

  if (rideState.aiMode === "wander") {
    const dx = rideState.aiTargetX - rideState.position.x;
    const dz = rideState.aiTargetZ - rideState.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < WANDER_ARRIVE || rideState.aiTimer <= 0) {
      rideState.aiMode = "stand";
      rideState.moving = false;
      rideState.sprinting = false;
      rideState.aiTimer = 1.8 + Math.random() * 5.5;
      applyHorseWorldCollision(
        rideState,
        cabinState,
        barnDoorState,
        gateState
      );
      return;
    }
    const step = Math.min(dist, IDLE_WALK_SPEED * delta);
    rideState.position.x += (dx / dist) * step;
    rideState.position.z += (dz / dist) * step;
    rideState.position.x = THREE.MathUtils.clamp(
      rideState.position.x,
      BARN_PEN_ROAM.minX,
      BARN_PEN_ROAM.maxX
    );
    rideState.position.z = THREE.MathUtils.clamp(
      rideState.position.z,
      BARN_PEN_ROAM.minZ,
      BARN_PEN_ROAM.maxZ
    );
    rideState.position.y = 0;
    rideState.yaw = Math.atan2(dx, dz);
    rideState.moving = true;
    rideState.sprinting = false;
    applyHorseWorldCollision(
      rideState,
      cabinState,
      barnDoorState,
      gateState
    );
    return;
  }

  // stand (default)
  rideState.moving = false;
  rideState.sprinting = false;
  if (rideState.aiTimer <= 0) {
    if (Math.random() < 0.58) {
      rideState.aiMode = "wander";
      pickWanderTarget(rideState);
      rideState.aiTimer = 5 + Math.random() * 9;
    } else {
      // Stay put a bit longer; idle head-turn via yaw
      rideState.aiTimer = 2 + Math.random() * 6;
      rideState.yaw += (Math.random() - 0.5) * 1.1;
    }
  }
  applyHorseWorldCollision(
    rideState,
    cabinState,
    barnDoorState,
    gateState
  );
}

/** Shared mutable ride state (Player writes, Horse/Unicorn reads). */
export function createRideState(initialPos = [10, 0, 12], name = "horse") {
  return {
    name,
    mounted: false,
    /** True while mount/dismount animation plays — blocks control */
    busy: false,
    /** Drinking at shore */
    drinking: false,
    /** Elapsed seconds of drink animation (0 → DRINK_DURATION) */
    drinkTimer: 0,
    /** After a drink, next E dismounts even if still at shore */
    justDrank: false,
    position: new THREE.Vector3(...initialPos),
    yaw: 0,
    moving: false,
    sprinting: false,
    near: false,
    /** Unicorn only: true when above ground and flapping */
    airborne: false,
    /**
     * Idle AI: "stand" | "wander" | "come"
     * wander only inside barn/pen; come answers a whistle.
     */
    aiMode: "stand",
    aiTimer: 1 + Math.random() * 4,
    aiTargetX: initialPos[0],
    aiTargetZ: initialPos[2],
    callTargetX: initialPos[0],
    callTargetZ: initialPos[2],
  };
}

export const DRINK_DURATION = 3;

/**
 * Articulated leg: hip → thigh → knee → shin → hoof.
 * userData.leg = sign for gait; userData.front for drink bend.
 * hipY ~0.82 so hoof sole sits on y=0 when standing straight.
 */
function Leg({
  position,
  sign,
  thick = 0.12,
  colors = HORSE_PALETTE,
  front = false,
  legRef,
}) {
  const hipY = position[1];
  const hoofR = thick * 1.05;
  // Knee below hip; hoof sole on ground when standing
  const kneeY = -0.34;
  const hoofY = -(hipY + kneeY - hoofR);

  return (
    <group
      ref={legRef}
      position={position}
      userData={{ leg: sign, front }}
    >
      {/* Thigh */}
      <mesh position={[0, -0.16, 0]} castShadow>
        <capsuleGeometry args={[thick, 0.26, 4, 6]} />
        <meshToonMaterial color={colors.body} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      {/* Knee + shin + hoof (knee rotates for drink bend) */}
      <group userData={{ knee: true }} position={[0, kneeY, 0.02]}>
        <mesh castShadow>
          <sphereGeometry args={[thick * 0.85, 6, 5]} />
          <meshToonMaterial color={colors.bodyShade} />
        </mesh>
        <mesh position={[0, -0.18, 0.02]} castShadow>
          <capsuleGeometry args={[thick * 0.72, 0.22, 4, 6]} />
          <meshToonMaterial color={colors.bodyShade} />
          <Outlines color={COLORS.outline} thickness={0.8} />
        </mesh>
        <mesh position={[0, hoofY, 0.04]} castShadow>
          <sphereGeometry args={[hoofR, 6, 5]} />
          <meshToonMaterial color={colors.hoof} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Mane in neck-pivot local space so it follows head when drinking.
 * Neck pivot is at (0, 1.35, 0.5) horse-local.
 */
function FlowingMane({ rideState, gaitRef, colors = HORSE_PALETTE }) {
  const strandsRef = useRef([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const move = rideState?.moving || rideState?.drinking ? 1 : 0.35;
    const sprint = rideState?.sprinting ? 1.4 : 1;
    const gait = gaitRef?.current ?? 0;

    strandsRef.current.forEach((strand, i) => {
      if (!strand) return;
      const phase = t * (2.2 + i * 0.15) * sprint + i * 0.7 + gait * 0.3;
      const sway = Math.sin(phase) * 0.18 * move;
      const bob = Math.cos(phase * 1.3) * 0.08 * move;
      strand.rotation.z = sway * (1 + i * 0.12);
      strand.rotation.x = 0.15 + bob * (1 + i * 0.08);
    });
  });

  // Local to neck pivot (was absolute horse positions minus pivot)
  const bases = [
    [0, 0.12, 0.08],
    [0, 0.25, 0.22],
    [0, 0.38, 0.36],
    [0, 0.5, 0.48],
    [0, 0.6, 0.58],
  ];

  return (
    <group>
      {bases.map((pos, i) => (
        <group
          key={i}
          ref={(el) => {
            strandsRef.current[i] = el;
          }}
          position={pos}
        >
          <mesh position={[0, 0.12, -0.02]} castShadow>
            <capsuleGeometry args={[0.05 - i * 0.004, 0.22, 3, 5]} />
            <meshToonMaterial
              color={i % 2 === 0 ? colors.mane : colors.maneDark}
            />
            <Outlines color={COLORS.outline} thickness={0.6} />
          </mesh>
          <mesh
            position={[-0.06, 0.08, 0]}
            rotation={[0, 0, 0.35]}
            castShadow
          >
            <capsuleGeometry args={[0.03, 0.14, 3, 4]} />
            <meshToonMaterial color={colors.maneDark} />
          </mesh>
          <mesh
            position={[0.06, 0.08, 0]}
            rotation={[0, 0, -0.35]}
            castShadow
          >
            <capsuleGeometry args={[0.03, 0.14, 3, 4]} />
            <meshToonMaterial color={colors.mane} />
          </mesh>
        </group>
      ))}
      {/* Forelock near ears (head-relative within pivot) */}
      <mesh position={[0, 0.82, 0.68]} castShadow>
        <capsuleGeometry args={[0.04, 0.16, 3, 5]} />
        <meshToonMaterial color={colors.mane} />
        <Outlines color={COLORS.outline} thickness={0.6} />
      </mesh>
    </group>
  );
}

/** Multi-segment flowing tail */
function FlowingTail({ rideState, gaitRef, colors = HORSE_PALETTE }) {
  const segRefs = useRef([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const move = rideState?.moving ? 1 : 0.4;
    const sprint = rideState?.sprinting ? 1.5 : 1;
    const gait = gaitRef?.current ?? 0;

    segRefs.current.forEach((seg, i) => {
      if (!seg) return;
      const phase = t * (2.5 * sprint) + i * 0.55 + gait * 0.25;
      const side = Math.sin(phase) * (0.22 + i * 0.06) * move;
      const lift = Math.cos(phase * 0.9) * (0.1 + i * 0.04) * move;
      seg.rotation.y = side;
      seg.rotation.x = 0.35 + i * 0.12 + lift;
    });
  });

  return (
    <group position={[0, 1.12, -0.85]}>
      {/* Dock */}
      <mesh castShadow>
        <sphereGeometry args={[0.1, 6, 5]} />
        <meshToonMaterial color={colors.maneDark} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>

      {/* Cascading tail segments */}
      {[0, 1, 2, 3, 4].map((i) => (
        <group
          key={i}
          ref={(el) => {
            segRefs.current[i] = el;
          }}
          position={[0, -0.08 - i * 0.18, -0.12 - i * 0.1]}
        >
          <mesh castShadow>
            <capsuleGeometry
              args={[0.09 - i * 0.01, 0.16 - i * 0.015, 4, 6]}
            />
            <meshToonMaterial
              color={i % 2 === 0 ? colors.mane : colors.maneDark}
            />
            <Outlines color={COLORS.outline} thickness={0.7} />
          </mesh>
          {/* Soft outer fluff */}
          {i < 4 && (
            <>
              <mesh position={[-0.07, -0.04, 0]} castShadow>
                <sphereGeometry args={[0.06 - i * 0.008, 5, 4]} />
                <meshToonMaterial color={colors.mane} />
              </mesh>
              <mesh position={[0.07, -0.04, 0]} castShadow>
                <sphereGeometry args={[0.06 - i * 0.008, 5, 4]} />
                <meshToonMaterial color={colors.maneDark} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
}

/**
 * Spiral rainbow horn — parented under head group (skull at origin, r≈0.19).
 * Root sits on the forehead between the ears / above the eyes.
 */
function RainbowHorn() {
  return (
    <group position={[0, 0.165, 0.07]} rotation={[-0.42, 0, 0]}>
      {/* Root sunk slightly into the skull so it reads as attached */}
      <mesh position={[0, -0.01, 0]} castShadow>
        <sphereGeometry args={[0.05, 7, 6]} />
        <meshToonMaterial color="#e8d4ff" />
        <Outlines color={COLORS.outline} thickness={0.5} />
      </mesh>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.048, 0.06, 7]} />
        <meshToonMaterial color="#f0e0ff" />
      </mesh>
      {/* Rainbow spiral segments growing from the root */}
      {RAINBOW_HORN.map((c, i) => (
        <mesh
          key={i}
          position={[0, 0.055 + i * 0.078, 0]}
          rotation={[0, i * 0.55, 0]}
          castShadow
        >
          <coneGeometry args={[0.046 - i * 0.005, 0.09, 7]} />
          <meshToonMaterial color={c} />
          <Outlines color={COLORS.outline} thickness={0.4} />
        </mesh>
      ))}
      {/* Pearly tip */}
      <mesh
        position={[0, 0.055 + RAINBOW_HORN.length * 0.078 + 0.02, 0]}
        castShadow
      >
        <sphereGeometry args={[0.026, 6, 5]} />
        <meshToonMaterial color="#fff8ff" />
      </mesh>
    </group>
  );
}

function HorseBody({ gaitRef, rideState, colors = HORSE_PALETTE, unicorn = false }) {
  const rootRef = useRef();
  const torsoRef = useRef();
  const neckPivotRef = useRef();
  const headRef = useRef();
  const drinkBlendRef = useRef(0); // 0 standing → 1 full drink pose
  const frontLegL = useRef();
  const frontLegR = useRef();
  const backLegL = useRef();
  const backLegR = useRef();

  useFrame(({ clock }, delta) => {
    if (!rootRef.current) return;

    // 0–1 drink envelope: lower / hold+sip / raise
    let targetBlend = 0;
    if (rideState?.drinking) {
      const t = rideState.drinkTimer ?? 0;
      if (t < 0.55) {
        targetBlend = t / 0.55;
      } else if (t < 2.35) {
        targetBlend = 1 + Math.sin(t * 7) * 0.025; // sip bob
      } else if (t < DRINK_DURATION) {
        targetBlend = 1 - (t - 2.35) / Math.max(0.01, DRINK_DURATION - 2.35);
      }
    }
    drinkBlendRef.current = THREE.MathUtils.lerp(
      drinkBlendRef.current,
      Math.min(1, Math.max(0, targetBlend)),
      1 - Math.exp(-9 * delta)
    );
    const d = drinkBlendRef.current;
    const airborne = !!rideState?.airborne && d < 0.1;

    // --- Airborne: legs flap like bird wings ---
    if (airborne) {
      const t = clock.elapsedTime;
      const flapSpeed = rideState?.sprinting ? 16 : 11;
      const flap = Math.sin(t * flapSpeed);
      const flap2 = Math.sin(t * flapSpeed + 0.8);
      // Front legs as wings — big Z spread, fold at knee
      for (const leg of [frontLegL.current, frontLegR.current]) {
        if (!leg) continue;
        const side = leg.userData.leg ?? 1;
        leg.rotation.x = -0.35 + flap * 0.12;
        leg.rotation.z = side * (1.05 + flap * 0.55);
        leg.position.z = 0.45;
        leg.position.y = 0.82 + Math.max(0, flap) * 0.06;
        for (const child of leg.children) {
          if (child.userData?.knee) child.rotation.x = 0.35 + flap * 0.25;
        }
      }
      // Hind legs also flap, slightly out of phase
      for (const leg of [backLegL.current, backLegR.current]) {
        if (!leg) continue;
        const side = leg.userData.leg ?? 1;
        leg.rotation.x = -0.2 + flap2 * 0.1;
        leg.rotation.z = side * (0.85 + flap2 * 0.5);
        leg.position.z = -0.45;
        leg.position.y = 0.82 + Math.max(0, -flap2) * 0.05;
        for (const child of leg.children) {
          if (child.userData?.knee) child.rotation.x = 0.25 + flap2 * 0.2;
        }
      }
      if (torsoRef.current) {
        torsoRef.current.position.y = Math.sin(t * flapSpeed) * 0.04;
        torsoRef.current.rotation.x = -0.08 + flap * 0.03;
      }
      if (neckPivotRef.current) {
        neckPivotRef.current.rotation.x = -0.15;
        neckPivotRef.current.position.y = 1.22;
        neckPivotRef.current.position.z = 0.5;
      }
      if (headRef.current) headRef.current.rotation.x = -0.05;
      return;
    }

    // Gait swing (disabled while drinking)
    const amp = rideState?.sprinting ? 0.7 : 0.45;
    const gaitSwing =
      d > 0.15 ? 0 : Math.sin(gaitRef.current) * amp;

    // --- Front legs: mild stretch + knee bend (drink) or walk ---
    // Keep shallow so the chest stays high enough that only the muzzle reaches water
    const frontHip = 0.42 * d;
    const frontKnee = 0.55 * d;
    const frontSpread = 0.1 * d;
    for (const leg of [frontLegL.current, frontLegR.current]) {
      if (!leg) continue;
      const side = leg.userData.leg ?? 1;
      leg.rotation.x = frontHip + gaitSwing * side;
      leg.rotation.z = side * frontSpread;
      leg.position.z = 0.5 + 0.1 * d;
      leg.position.y = 0.82;
      for (const child of leg.children) {
        if (child.userData?.knee) child.rotation.x = frontKnee;
      }
    }

    // Hind legs: walk or light brace while drinking
    for (const leg of [backLegL.current, backLegR.current]) {
      if (!leg) continue;
      const side = leg.userData.leg ?? 1;
      leg.rotation.x = gaitSwing * side * (1 - d) - 0.05 * d;
      leg.rotation.z = 0;
      leg.position.z = -0.5 - 0.04 * d;
      leg.position.y = 0.82;
      for (const child of leg.children) {
        if (child.userData?.knee) child.rotation.x = 0.08 * d;
      }
    }

    // Slight body tip only — not a full dunk
    if (torsoRef.current) {
      torsoRef.current.position.y = -0.04 * d;
      torsoRef.current.rotation.x = 0.07 * d;
    }

    // Neck lowers so the mouth sits at the water surface (~y 0.12–0.2),
    // not so far that the whole head goes under.
    if (neckPivotRef.current) {
      neckPivotRef.current.rotation.x = 0.95 * d;
      neckPivotRef.current.position.y = 1.22 - 0.06 * d;
      neckPivotRef.current.position.z = 0.5 + 0.1 * d;
    }
    // Gentle muzzle nod only (skull stays above water)
    if (headRef.current) {
      headRef.current.rotation.x = 0.22 * d;
    }
  });

  return (
    <group ref={rootRef}>
      <group ref={torsoRef}>
        {/* === Rounded torso === */}
        <mesh position={[0, 1.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <capsuleGeometry args={[0.22, 0.95, 6, 10]} />
          <meshToonMaterial color={colors.body} />
          <Outlines color={COLORS.outline} thickness={2} />
        </mesh>
        <mesh position={[0, 0.95, 0.55]} castShadow>
          <sphereGeometry args={[0.22, 8, 7]} />
          <meshToonMaterial color={colors.body} />
          <Outlines color={COLORS.outline} thickness={1.5} />
        </mesh>
        <mesh position={[0, 1.05, -0.55]} castShadow>
          <sphereGeometry args={[0.21, 8, 7]} />
          <meshToonMaterial color={colors.bodyShade} />
          <Outlines color={COLORS.outline} thickness={1.5} />
        </mesh>

        {/* Neck+head pivot — deep dip when drinking */}
        <group ref={neckPivotRef} position={[0, 1.22, 0.5]}>
          <mesh position={[0, 0.22, 0.38]} rotation={[0.55, 0, 0]} castShadow>
            <capsuleGeometry args={[0.14, 0.38, 4, 8]} />
            <meshToonMaterial color={colors.body} />
            <Outlines color={COLORS.outline} thickness={1.5} />
          </mesh>

          <group ref={headRef} position={[0, 0.55, 0.65]}>
            <mesh castShadow>
              <sphereGeometry args={[0.19, 8, 7]} />
              <meshToonMaterial color={colors.body} />
              <Outlines color={COLORS.outline} thickness={1.5} />
            </mesh>
            <mesh position={[0, -0.04, 0.18]} rotation={[0.35, 0, 0]} castShadow>
              <capsuleGeometry args={[0.125, 0.16, 4, 8]} />
              <meshToonMaterial color={colors.body} />
              <Outlines color={COLORS.outline} thickness={1.2} />
            </mesh>
            <mesh position={[0, -0.06, 0.28]} castShadow>
              <sphereGeometry args={[0.13, 7, 6]} />
              <meshToonMaterial color={colors.body} />
            </mesh>
            <mesh position={[0, -0.1, 0.42]} castShadow>
              <sphereGeometry args={[0.125, 7, 6]} />
              <meshToonMaterial color={colors.bodyShade} />
              <Outlines color={COLORS.outline} thickness={1} />
            </mesh>
            {/* Muzzle tip — the part that should touch the ground */}
            <mesh position={[0, -0.16, 0.38]} castShadow>
              <sphereGeometry args={[0.095, 6, 5]} />
              <meshToonMaterial color={colors.bodyShade} />
            </mesh>
            {[-0.045, 0.045].map((x, i) => (
              <mesh key={`nos-${i}`} position={[x, -0.08, 0.54]}>
                <sphereGeometry args={[0.025, 4, 4]} />
                <meshToonMaterial color={colors.nose} />
              </mesh>
            ))}
            {[-0.1, 0.1].map((x, i) => (
              <mesh
                key={`ear-${i}`}
                position={[x, 0.28, -0.06]}
                rotation={[0.2, 0, x > 0 ? -0.2 : 0.2]}
                castShadow
              >
                <capsuleGeometry args={[0.04, 0.1, 3, 5]} />
                <meshToonMaterial color={colors.body} />
                <Outlines color={COLORS.outline} thickness={0.8} />
              </mesh>
            ))}
            {[-0.13, 0.13].map((x, i) => (
              <mesh key={`eye-${i}`} position={[x, 0.06, 0.16]}>
                <sphereGeometry args={[0.045, 5, 5]} />
                <meshToonMaterial color={colors.eye} />
              </mesh>
            ))}
            {unicorn && <RainbowHorn />}
            <Bridle />
            <group position={[-0.14, -0.12, 0.48]} userData={{ bitAnchor: "L" }} />
            <group position={[0.14, -0.12, 0.48]} userData={{ bitAnchor: "R" }} />
          </group>
          <FlowingMane rideState={rideState} gaitRef={gaitRef} colors={colors} />
        </group>

        <FlowingTail rideState={rideState} gaitRef={gaitRef} colors={colors} />
        <Reins rideState={rideState} neckPivotRef={neckPivotRef} />
        <WesternSaddle />
      </group>

      {/* Legs — front bend when drinking; hind brace */}
      <Leg
        legRef={frontLegL}
        position={[-0.13, 0.82, 0.5]}
        sign={1}
        thick={0.095}
        colors={colors}
        front
      />
      <Leg
        legRef={frontLegR}
        position={[0.13, 0.82, 0.5]}
        sign={-1}
        thick={0.095}
        colors={colors}
        front
      />
      <Leg
        legRef={backLegL}
        position={[-0.14, 0.82, -0.5]}
        sign={-1}
        thick={0.1}
        colors={colors}
      />
      <Leg
        legRef={backLegR}
        position={[0.14, 0.82, -0.5]}
        sign={1}
        thick={0.1}
        colors={colors}
      />
    </group>
  );
}

/** Western saddle — thin, rounded forms (less blocky) */
function WesternSaddle() {
  return (
    <group position={[0, 1.37, -0.05]}>
      {/* === Soft blanket pad === */}
      <mesh position={[0, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.28, 5, 10]} />
        <meshToonMaterial color={BLANKET} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>
      {/* Trim rings front/back */}
      <mesh position={[0, -0.01, 0.26]} castShadow>
        <torusGeometry args={[0.2, 0.015, 5, 12]} />
        <meshToonMaterial color={BLANKET_TRIM} />
      </mesh>
      <mesh position={[0, -0.01, -0.26]} castShadow>
        <torusGeometry args={[0.2, 0.015, 5, 12]} />
        <meshToonMaterial color={BLANKET_TRIM} />
      </mesh>

      {/* === Rounded seat tree === */}
      <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.22, 5, 10]} />
        <meshToonMaterial color={SADDLE} />
        <Outlines color={COLORS.outline} thickness={1.2} />
      </mesh>
      {/* Soft seat cushion */}
      <mesh position={[0, 0.14, 0.02]} castShadow>
        <sphereGeometry args={[0.14, 8, 6]} />
        <meshToonMaterial color={SADDLE_DARK} />
      </mesh>

      {/* Side skirts — thin curved leather */}
      {[-1, 1].map((side) => (
        <mesh
          key={`skirt-${side}`}
          position={[side * 0.2, 0.0, 0]}
          rotation={[0.2, 0, side * 0.55]}
          castShadow
        >
          <capsuleGeometry args={[0.08, 0.18, 4, 8]} />
          <meshToonMaterial color={SADDLE_DARK} />
          <Outlines color={COLORS.outline} thickness={0.8} />
        </mesh>
      ))}

      {/* === Pommel + slim horn === */}
      <mesh position={[0, 0.14, 0.18]} castShadow>
        <sphereGeometry args={[0.09, 7, 6]} />
        <meshToonMaterial color={SADDLE_LIGHT} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0, 0.26, 0.18]} castShadow>
        <capsuleGeometry args={[0.025, 0.08, 4, 6]} />
        <meshToonMaterial color={SADDLE_DARK} />
      </mesh>
      <mesh position={[0, 0.33, 0.18]} castShadow>
        <sphereGeometry args={[0.055, 7, 6]} />
        <meshToonMaterial color={SADDLE_LIGHT} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>

      {/* === Rounded cantle === */}
      <mesh position={[0, 0.16, -0.18]} castShadow>
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshToonMaterial color={SADDLE_LIGHT} />
        <Outlines color={COLORS.outline} thickness={1.2} />
      </mesh>
      <mesh position={[0, 0.2, -0.2]} scale={[1.15, 0.55, 0.7]} castShadow>
        <sphereGeometry args={[0.1, 7, 5]} />
        <meshToonMaterial color={SADDLE} />
      </mesh>

      {/* === Thin cinch straps === */}
      <mesh position={[0, -0.28, 0.04]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.018, 0.42, 3, 6]} />
        <meshToonMaterial color={REIN} />
      </mesh>
      <mesh position={[0, -0.48, 0.04]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.015, 0.36, 3, 6]} />
        <meshToonMaterial color={REIN} />
      </mesh>
      <mesh position={[0.2, -0.18, 0.06]} castShadow>
        <sphereGeometry args={[0.035, 5, 5]} />
        <meshToonMaterial color={COLORS.gold} />
      </mesh>

      {/* === Soft saddlebags === */}
      {[-1, 1].map((side) => (
        <group key={`bag-${side}`} position={[side * 0.22, 0.0, -0.38]}>
          <mesh castShadow>
            <sphereGeometry args={[0.11, 7, 6]} />
            <meshToonMaterial color={BAG} />
            <Outlines color={COLORS.outline} thickness={1} />
          </mesh>
          <mesh position={[0, 0.06, 0]} scale={[1.05, 0.45, 1.05]} castShadow>
            <sphereGeometry args={[0.1, 6, 5]} />
            <meshToonMaterial color={SADDLE_DARK} />
          </mesh>
          <mesh position={[0, 0.0, 0.08]} castShadow>
            <capsuleGeometry args={[0.012, 0.08, 3, 5]} />
            <meshToonMaterial color={REIN} />
          </mesh>
        </group>
      ))}
      {/* Slim bedroll */}
      <mesh position={[0, 0.18, -0.34]} rotation={[0.35, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.055, 0.22, 4, 8]} />
        <meshToonMaterial color="#4a5a3a" />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>

      {/* === Stirrups far out so boots hang visible off the sides === */}
      {[-1, 1].map((side) => (
        <group key={`stirrup-${side}`} position={[side * 0.52, -0.08, 0.08]}>
          <mesh position={[0, -0.12, 0]} castShadow>
            <capsuleGeometry args={[0.035, 0.14, 4, 6]} />
            <meshToonMaterial color={SADDLE} />
          </mesh>
          <mesh position={[0, -0.32, 0]} castShadow>
            <capsuleGeometry args={[0.014, 0.28, 3, 5]} />
            <meshToonMaterial color={REIN} />
          </mesh>
          <mesh
            position={[0, -0.55, 0.01]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <torusGeometry args={[0.075, 0.014, 5, 12]} />
            <meshToonMaterial color="#8a8070" />
          </mesh>
          <mesh position={[0, -0.59, 0.01]} castShadow>
            <capsuleGeometry args={[0.02, 0.07, 3, 5]} />
            <meshToonMaterial color="#8a8070" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Leather bridle / harness on the head */
function Bridle() {
  const leather = REIN;
  const metal = COLORS.gold;

  return (
    <group>
      {/* Noseband */}
      <mesh position={[0, -0.1, 0.4]} rotation={[0.2, 0, 0]}>
        <torusGeometry args={[0.15, 0.018, 6, 14]} />
        <meshToonMaterial color={leather} />
      </mesh>
      {/* Browband */}
      <mesh position={[0, 0.12, 0.05]} rotation={[1.2, 0, 0]}>
        <torusGeometry args={[0.18, 0.016, 6, 12, Math.PI]} />
        <meshToonMaterial color={leather} />
      </mesh>
      {/* Cheek pieces (left / right) */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.15, 0.0, 0.2]}
          rotation={[0.4, 0, side * 0.15]}
          castShadow
        >
          <capsuleGeometry args={[0.015, 0.28, 3, 5]} />
          <meshToonMaterial color={leather} />
        </mesh>
      ))}
      {/* Throatlatch under jaw */}
      <mesh position={[0, -0.18, 0.08]} rotation={[1.1, 0, 0]}>
        <torusGeometry args={[0.14, 0.012, 5, 12, Math.PI]} />
        <meshToonMaterial color={leather} />
      </mesh>
      {/* Crown piece over poll */}
      <mesh position={[0, 0.2, -0.02]} rotation={[0.3, 0, 0]} castShadow>
        <capsuleGeometry args={[0.018, 0.22, 3, 5]} />
        <meshToonMaterial color={leather} />
      </mesh>
      {/* Bit rings */}
      {[-1, 1].map((side) => (
        <mesh key={`bit-${side}`} position={[side * 0.14, -0.12, 0.48]}>
          <torusGeometry args={[0.04, 0.01, 5, 10]} />
          <meshToonMaterial color={metal} />
        </mesh>
      ))}
      {/* Bit bar */}
      <mesh position={[0, -0.12, 0.48]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.012, 0.22, 3, 5]} />
        <meshToonMaterial color={metal} />
      </mesh>
    </group>
  );
}

/** Reins: bit anchors under head → rider hands (or draped on neck) */
function Reins({ rideState, neckPivotRef }) {
  const groupRef = useRef();
  const leftRef = useRef();
  const rightRef = useRef();
  const leftMidRef = useRef();
  const rightMidRef = useRef();

  useFrame(() => {
    const mounted = !!rideState?.mounted;
    const root = groupRef.current?.parent;
    if (!root || !neckPivotRef?.current) return;

    // Bit anchors are children of head group under neck pivot — get horse-local pos
    neckPivotRef.current.updateWorldMatrix(true, true);
    root.updateWorldMatrix(true, true);

    // Head local bit offsets (same as Bridle bit rings)
    _tmp.set(-0.14, -0.12, 0.48);
    // Head is at (0, 0.55, 0.65) under neck pivot
    _bitL.set(-0.14, 0.55 - 0.12, 0.65 + 0.48);
    _bitR.set(0.14, 0.55 - 0.12, 0.65 + 0.48);
    // Transform by neck pivot (includes drink dip) into horse body space
    neckPivotRef.current.localToWorld(_bitL);
    neckPivotRef.current.localToWorld(_bitR);
    root.worldToLocal(_bitL);
    root.worldToLocal(_bitR);

    const handL = mounted
      ? _handL.set(-0.22, 1.58, 0.35)
      : _handL.set(-0.12, 1.42, 0.7);
    const handR = mounted
      ? _handR.set(0.22, 1.58, 0.35)
      : _handR.set(0.12, 1.42, 0.7);

    const midL = _midL
      .copy(_bitL)
      .lerp(handL, 0.5)
      .add(_tmp.set(mounted ? -0.04 : -0.06, mounted ? 0.05 : -0.04, 0));
    const midR = _midR
      .copy(_bitR)
      .lerp(handR, 0.5)
      .add(_tmp.set(mounted ? 0.04 : 0.06, mounted ? 0.05 : -0.04, 0));

    placeReinSegment(leftRef.current, _bitL, midL);
    placeReinSegment(leftMidRef.current, midL, handL);
    placeReinSegment(rightRef.current, _bitR, midR);
    placeReinSegment(rightMidRef.current, midR, handR);
  });

  return (
    <group ref={groupRef}>
      <mesh ref={leftRef} castShadow>
        <capsuleGeometry args={[0.015, 1, 3, 5]} />
        <meshToonMaterial color={REIN} />
      </mesh>
      <mesh ref={leftMidRef} castShadow>
        <capsuleGeometry args={[0.015, 1, 3, 5]} />
        <meshToonMaterial color={REIN} />
      </mesh>
      <mesh ref={rightRef} castShadow>
        <capsuleGeometry args={[0.015, 1, 3, 5]} />
        <meshToonMaterial color={REIN} />
      </mesh>
      <mesh ref={rightMidRef} castShadow>
        <capsuleGeometry args={[0.015, 1, 3, 5]} />
        <meshToonMaterial color={REIN} />
      </mesh>
      {rideState?.mounted && (
        <>
          <mesh position={[-0.22, 1.58, 0.35]} castShadow>
            <sphereGeometry args={[0.04, 5, 5]} />
            <meshToonMaterial color={REIN} />
          </mesh>
          <mesh position={[0.22, 1.58, 0.35]} castShadow>
            <sphereGeometry args={[0.04, 5, 5]} />
            <meshToonMaterial color={REIN} />
          </mesh>
        </>
      )}
    </group>
  );
}

const _bitL = new THREE.Vector3();
const _bitR = new THREE.Vector3();
const _handL = new THREE.Vector3();
const _handR = new THREE.Vector3();
const _midL = new THREE.Vector3();
const _midR = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

function placeReinSegment(mesh, from, to) {
  if (!mesh) return;
  _dir.copy(to).sub(from);
  const len = Math.max(_dir.length(), 0.05);
  _mid.copy(from).add(to).multiplyScalar(0.5);
  mesh.position.copy(_mid);
  // Capsule default axis is Y — aim Y along the rein
  _dir.normalize();
  _quat.setFromUnitVectors(_up, _dir);
  mesh.quaternion.copy(_quat);
  mesh.scale.set(1, len, 1);
}

export const Horse = forwardRef(function Horse(
  {
    rideState,
    colors = HORSE_PALETTE,
    unicorn = false,
    cabinState = null,
    barnDoorState = null,
    gateState = null,
  },
  ref
) {
  const groupRef = useRef();
  const gaitRef = useRef(0);

  useImperativeHandle(ref, () => ({
    getPosition: () => rideState.position.clone(),
  }));

  useFrame((_, delta) => {
    if (!groupRef.current || !rideState) return;

    // Free-roam / answer whistle when not under player control
    updateHorseIdleAI(
      rideState,
      delta,
      cabinState,
      barnDoorState,
      gateState
    );

    // Mounted horses still register a body so pets don't walk through them
    if (rideState.mounted || rideState.busy) {
      setAnimalBody(
        rideState.name || "horse",
        rideState.position.x,
        rideState.position.z,
        IDLE_HORSE_RADIUS
      );
    }

    groupRef.current.position.copy(rideState.position);
    groupRef.current.rotation.y = rideState.yaw;

    if (rideState.moving) {
      gaitRef.current += delta * (rideState.sprinting ? 22 : 12);
    } else {
      gaitRef.current *= 0.9;
      if (Math.abs(gaitRef.current) < 0.01) gaitRef.current = 0;
    }
  });

  return (
    <group
      ref={groupRef}
      position={rideState?.position?.toArray?.() ?? [10, 0, 12]}
      userData={{ ignoreCameraCollision: true }}
    >
      <HorseBody
        gaitRef={gaitRef}
        rideState={rideState}
        colors={colors}
        unicorn={unicorn}
      />
    </group>
  );
});

/** Light purple unicorn — same ride logic, rainbow horn */
export const Unicorn = forwardRef(function Unicorn(
  { rideState, cabinState, barnDoorState, gateState },
  ref
) {
  return (
    <Horse
      ref={ref}
      rideState={rideState}
      colors={UNICORN_PALETTE}
      unicorn
      cabinState={cabinState}
      barnDoorState={barnDoorState}
      gateState={gateState}
    />
  );
});
