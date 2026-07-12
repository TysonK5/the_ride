import { Outlines } from "@react-three/drei";
import { COLORS } from "../../materials/colors";

/**
 * Pet food + water bowls inside the barn (right wall, back of aisle).
 * Companion animals (Callie, Cat) visit every 3–5 minutes.
 */
export const PET_FOOD_BOWL = { x: 6.6, z: -3.6 };
export const PET_WATER_BOWL = { x: 6.6, z: -2.15 };

/** Seconds between meal trips (random in range) */
export const FEED_INTERVAL_MIN = 180;
export const FEED_INTERVAL_MAX = 300;
/** Total time spent eating + drinking at bowls */
export const FEED_DURATION = 30;
const HALF_MEAL = FEED_DURATION / 2;
export const BOWL_ARRIVE = 0.58;
export const BOWL_WALK_SPEED = 5.5;

export function nextFeedInterval() {
  return (
    FEED_INTERVAL_MIN +
    Math.random() * (FEED_INTERVAL_MAX - FEED_INTERVAL_MIN)
  );
}

/**
 * Per-companion hunger / meal state.
 * phase: idle | toFood | eat | toWater | drink
 */
export function createFeedState(initialDelayScale = 1) {
  return {
    hunger: nextFeedInterval() * initialDelayScale,
    phase: "idle",
    phaseT: 0,
  };
}

/**
 * Drive meal trip. Mutates `st.pos`, `st.yaw`, `st.walkPhase`, `st.mode`.
 * Returns true while the companion is on a meal trip (skip normal follow).
 *
 * st: { pos: Vector3, yaw, walkPhase, mode }
 * feed: from createFeedState()
 */
export function updateCompanionMeal(st, feed, delta, walkSpeed = BOWL_WALK_SPEED) {
  if (!st || !feed) return false;

  if (feed.phase === "idle") {
    feed.hunger -= delta;
    if (feed.hunger <= 0) {
      feed.phase = "toFood";
      feed.phaseT = 0;
      st.mode = "walk";
      st.stopTimer = 0;
    }
    return false;
  }

  const moveTo = (tx, tz) => {
    const dx = tx - st.pos.x;
    const dz = tz - st.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < BOWL_ARRIVE) return true;
    const step = Math.min(dist, walkSpeed * delta);
    st.pos.x += (dx / dist) * step;
    st.pos.z += (dz / dist) * step;
    st.yaw = Math.atan2(dx, dz);
    st.walkPhase = (st.walkPhase ?? 0) + delta * 12;
    st.mode = "walk";
    return false;
  };

  const faceBowl = (tx, tz) => {
    const dx = tx - st.pos.x;
    const dz = tz - st.pos.z;
    if (dx * dx + dz * dz > 0.0001) {
      st.yaw = Math.atan2(dx, dz);
    }
  };

  if (feed.phase === "toFood") {
    if (moveTo(PET_FOOD_BOWL.x - 0.45, PET_FOOD_BOWL.z)) {
      feed.phase = "eat";
      feed.phaseT = 0;
      st.mode = "eat";
      st.walkPhase = 0;
    }
    return true;
  }

  if (feed.phase === "eat") {
    feed.phaseT += delta;
    st.mode = "eat";
    st.walkPhase = 0;
    faceBowl(PET_FOOD_BOWL.x, PET_FOOD_BOWL.z);
    if (feed.phaseT >= HALF_MEAL) {
      feed.phase = "toWater";
      feed.phaseT = 0;
      st.mode = "walk";
    }
    return true;
  }

  if (feed.phase === "toWater") {
    if (moveTo(PET_WATER_BOWL.x - 0.45, PET_WATER_BOWL.z)) {
      feed.phase = "drink";
      feed.phaseT = 0;
      st.mode = "drink";
      st.walkPhase = 0;
    }
    return true;
  }

  if (feed.phase === "drink") {
    feed.phaseT += delta;
    st.mode = "drink";
    st.walkPhase = 0;
    faceBowl(PET_WATER_BOWL.x, PET_WATER_BOWL.z);
    if (feed.phaseT >= HALF_MEAL) {
      feed.phase = "idle";
      feed.phaseT = 0;
      feed.hunger = nextFeedInterval();
      st.mode = "walk";
      st.stopTimer = 0;
    }
    return true;
  }

  return false;
}

function BowlShell({ position, rim = "#8a8a90", inner = "#5a5a62" }) {
  return (
    <group position={position}>
      {/* Outer dish */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.12, 12]} />
        <meshToonMaterial color={rim} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      {/* Inner well */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.24, 0.06, 12]} />
        <meshToonMaterial color={inner} />
      </mesh>
    </group>
  );
}

/** Food + water bowls rendered inside the barn */
export function PetBowls() {
  return (
    <group userData={{ ignoreCameraCollision: true }}>
      {/* Food bowl — brown ceramic + kibble */}
      <BowlShell
        position={[PET_FOOD_BOWL.x, 0, PET_FOOD_BOWL.z]}
        rim="#8a6040"
        inner="#5a3820"
      />
      {/* Kibble piles */}
      {[
        [0.04, 0.14, 0.02],
        [-0.06, 0.13, -0.04],
        [0.02, 0.135, -0.07],
        [-0.03, 0.14, 0.06],
        [0.08, 0.13, -0.02],
      ].map(([x, y, z], i) => (
        <mesh
          key={`kib-${i}`}
          position={[PET_FOOD_BOWL.x + x, y, PET_FOOD_BOWL.z + z]}
          castShadow
        >
          <sphereGeometry args={[0.035 + (i % 3) * 0.008, 5, 4]} />
          <meshToonMaterial color={i % 2 === 0 ? "#6a4020" : "#8a5530"} />
        </mesh>
      ))}
      {/* Small label block "FOOD" */}
      <mesh
        position={[PET_FOOD_BOWL.x, 0.02, PET_FOOD_BOWL.z + 0.38]}
        castShadow
      >
        <boxGeometry args={[0.35, 0.04, 0.12]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>

      {/* Water bowl — metal + water surface */}
      <BowlShell
        position={[PET_WATER_BOWL.x, 0, PET_WATER_BOWL.z]}
        rim="#7a8490"
        inner="#4a5560"
      />
      <mesh
        position={[PET_WATER_BOWL.x, 0.12, PET_WATER_BOWL.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[0.2, 14]} />
        <meshToonMaterial
          color="#5a9ec8"
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </mesh>
      <mesh
        position={[PET_WATER_BOWL.x, 0.02, PET_WATER_BOWL.z + 0.38]}
        castShadow
      >
        <boxGeometry args={[0.35, 0.04, 0.12]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>
    </group>
  );
}
