import { Outlines } from "@react-three/drei";
import { COLORS } from "../../materials/colors";
import {
  planPetPath,
  followPetPath,
  petPushAccess,
  petOpenBarnForMeal,
  tickPetAccessCooldowns,
} from "../../systems/petNav";

/**
 * Pet food + water bowls inside the barn — right aisle, near the front
 * so they're obvious as soon as you walk in the main doors.
 * Companion animals (Callie, Cat) visit every 3–5 minutes.
 * They open barn doors / pen gate / cabin yard gates on the way in,
 * then pathfind back to the player after drinking.
 *
 * Barn: W=18 (±9), D=12 (±6). Floor dirt sits at y≈0.04.
 */
export const PET_FOOD_BOWL = { x: 5.2, z: 3.4 };
export const PET_WATER_BOWL = { x: 5.2, z: 1.9 };

/** Seconds between meal trips (random in range) */
export const FEED_INTERVAL_MIN = 180;
export const FEED_INTERVAL_MAX = 300;
/** Total time spent eating + drinking at bowls */
export const FEED_DURATION = 30;
const HALF_MEAL = FEED_DURATION / 2;
export const BOWL_ARRIVE = 0.65;
export const BOWL_WALK_SPEED = 5.5;
/** How close to the player counts as "found them" after a meal */
export const RETURN_ARRIVE = 2.4;
/** Replan return path this often while the player moves */
const RETURN_REPLAN = 1.25;

/**
 * Barn foundation is a solid box (h=0.25 @ y=0.12 → top ≈ 0.245).
 * Bowls must sit clearly above that top or they render inside the stone.
 */
const BOWL_Y = 0.32;
const MAT_Y = 0.27;

const FOOD_STAND = {
  x: PET_FOOD_BOWL.x - 0.55,
  z: PET_FOOD_BOWL.z,
};
const WATER_STAND = {
  x: PET_WATER_BOWL.x - 0.55,
  z: PET_WATER_BOWL.z,
};

export function nextFeedInterval() {
  return (
    FEED_INTERVAL_MIN +
    Math.random() * (FEED_INTERVAL_MAX - FEED_INTERVAL_MIN)
  );
}

/**
 * Per-companion hunger / meal state.
 * phase: idle | toFood | eat | toWater | drink | toPlayer
 * path / pathIndex: waypoint route around barn, cabin, doors & gates
 */
export function createFeedState(initialDelayScale = 1) {
  return {
    hunger: nextFeedInterval() * initialDelayScale,
    phase: "idle",
    phaseT: 0,
    path: null,
    pathIndex: 0,
    replanT: 0,
  };
}

function beginPath(feed, st, goalX, goalZ) {
  feed.path = planPetPath(st.pos.x, st.pos.z, goalX, goalZ);
  feed.pathIndex = 0;
  feed.replanT = 0;
}

function abortMeal(feed, st, hungerScale = 1) {
  feed.phase = "idle";
  feed.phaseT = 0;
  feed.path = null;
  feed.pathIndex = 0;
  feed.replanT = 0;
  feed.hunger = nextFeedInterval() * hungerScale;
  st.mode = "walk";
  st.stopTimer = 0;
}

/**
 * @typedef {object} MealContext
 * @property {number} [playerX]
 * @property {number} [playerZ]
 * @property {object} [barnDoorState]
 * @property {object} [gateState]
 * @property {object} [cabinState]
 */

/**
 * Drive meal trip. Mutates `st.pos`, `st.yaw`, `st.walkPhase`, `st.mode`.
 * Paths around barn / cabin / fences; opens doors & gates on approach.
 * After drinking, pathfinds back to the player.
 * Returns true while the companion is on a meal trip (skip normal follow).
 *
 * @param {MealContext} [ctx]
 */
export function updateCompanionMeal(
  st,
  feed,
  delta,
  walkSpeed = BOWL_WALK_SPEED,
  ctx = {}
) {
  if (!st || !feed) return false;

  const {
    playerX = st.pos.x,
    playerZ = st.pos.z,
    barnDoorState = null,
    gateState = null,
    cabinState = null,
  } = ctx;

  // Remember last position so meal walks can push doors/gates open & closed
  if (feed._prevX == null) {
    feed._prevX = st.pos.x;
    feed._prevZ = st.pos.z;
  }
  const prevX = feed._prevX;
  const prevZ = feed._prevZ;

  const pushAccess = () => {
    tickPetAccessCooldowns(delta, barnDoorState, cabinState);
    // Push open/close from movement through every known door & gate
    petPushAccess(
      st.pos.x,
      st.pos.z,
      prevX,
      prevZ,
      barnDoorState,
      gateState,
      cabinState
    );
    feed._prevX = st.pos.x;
    feed._prevZ = st.pos.z;
  };

  if (feed.phase === "idle") {
    feed.hunger -= delta;
    feed._prevX = st.pos.x;
    feed._prevZ = st.pos.z;
    if (feed.hunger <= 0) {
      feed.phase = "toFood";
      feed.phaseT = 0;
      st.mode = "walk";
      st.stopTimer = 0;
      // Prefer the front barn doors for the food run
      petOpenBarnForMeal(barnDoorState);
      beginPath(feed, st, FOOD_STAND.x, FOOD_STAND.z);
    }
    return false;
  }

  const faceBowl = (tx, tz) => {
    const dx = tx - st.pos.x;
    const dz = tz - st.pos.z;
    if (dx * dx + dz * dz > 0.0001) {
      st.yaw = Math.atan2(dx, dz);
    }
  };

  if (feed.phase === "toFood") {
    feed.phaseT = (feed.phaseT || 0) + delta;
    if (feed.phaseT > 60) {
      abortMeal(feed, st, 0.35);
      return false;
    }
    if (!feed.path) beginPath(feed, st, FOOD_STAND.x, FOOD_STAND.z);
    const arrived = followPetPath(st, feed, delta, walkSpeed, BOWL_ARRIVE);
    pushAccess();
    if (arrived) {
      feed.phase = "eat";
      feed.phaseT = 0;
      feed.path = null;
      st.mode = "eat";
      st.walkPhase = 0;
    }
    return true;
  }

  if (feed.phase === "eat") {
    feed.phaseT += delta;
    st.mode = "eat";
    st.walkPhase = 0;
    feed._prevX = st.pos.x;
    feed._prevZ = st.pos.z;
    faceBowl(PET_FOOD_BOWL.x, PET_FOOD_BOWL.z);
    if (feed.phaseT >= HALF_MEAL) {
      feed.phase = "toWater";
      feed.phaseT = 0;
      st.mode = "walk";
      beginPath(feed, st, WATER_STAND.x, WATER_STAND.z);
    }
    return true;
  }

  if (feed.phase === "toWater") {
    feed.phaseT = (feed.phaseT || 0) + delta;
    if (feed.phaseT > 30) {
      feed.phase = "toPlayer";
      feed.phaseT = 0;
      st.mode = "walk";
      petOpenBarnForMeal(barnDoorState);
      beginPath(feed, st, playerX, playerZ);
      return true;
    }
    if (!feed.path) beginPath(feed, st, WATER_STAND.x, WATER_STAND.z);
    const arrived = followPetPath(st, feed, delta, walkSpeed, BOWL_ARRIVE);
    pushAccess();
    if (arrived) {
      feed.phase = "drink";
      feed.phaseT = 0;
      feed.path = null;
      st.mode = "drink";
      st.walkPhase = 0;
    }
    return true;
  }

  if (feed.phase === "drink") {
    feed.phaseT += delta;
    st.mode = "drink";
    st.walkPhase = 0;
    feed._prevX = st.pos.x;
    feed._prevZ = st.pos.z;
    faceBowl(PET_WATER_BOWL.x, PET_WATER_BOWL.z);
    if (feed.phaseT >= HALF_MEAL) {
      feed.phase = "toPlayer";
      feed.phaseT = 0;
      st.mode = "walk";
      st.stopTimer = 0;
      petOpenBarnForMeal(barnDoorState);
      beginPath(feed, st, playerX, playerZ);
    }
    return true;
  }

  if (feed.phase === "toPlayer") {
    feed.phaseT = (feed.phaseT || 0) + delta;
    feed.replanT = (feed.replanT || 0) + delta;

    if (feed.phaseT > 70) {
      abortMeal(feed, st, 1);
      return false;
    }

    const dx = playerX - st.pos.x;
    const dz = playerZ - st.pos.z;
    const dPlayer = Math.hypot(dx, dz);
    if (dPlayer < RETURN_ARRIVE) {
      abortMeal(feed, st, 1);
      return false;
    }

    if (!feed.path || feed.replanT >= RETURN_REPLAN) {
      beginPath(feed, st, playerX, playerZ);
    }

    followPetPath(st, feed, delta, walkSpeed, 0.85);
    pushAccess();
    return true;
  }

  return false;
}

function BowlShell({
  position,
  rim = "#8a8a90",
  inner = "#5a5a62",
  radius = 0.38,
}) {
  return (
    <group position={position}>
      {/* Outer dish — larger + lifted so it clears the floor */}
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius + 0.06, 0.16, 14]} />
        <meshToonMaterial color={rim} />
        <Outlines color={COLORS.outline} thickness={1.4} />
      </mesh>
      {/* Inner well */}
      <mesh position={[0, 0.14, 0]} castShadow>
        <cylinderGeometry args={[radius - 0.08, radius - 0.05, 0.08, 14]} />
        <meshToonMaterial color={inner} />
      </mesh>
    </group>
  );
}

/** Food + water bowls rendered inside the barn (right aisle, front half) */
export function PetBowls() {
  const matW = 1.4;
  const matD = 2.85;
  const matCx = PET_FOOD_BOWL.x;
  const matCz = (PET_FOOD_BOWL.z + PET_WATER_BOWL.z) / 2;

  return (
    <group userData={{ ignoreCameraCollision: true }}>
      {/* Wood platform above foundation so bowls aren't buried in the stone slab */}
      <mesh position={[matCx, MAT_Y, matCz]} castShadow receiveShadow>
        <boxGeometry args={[matW, 0.08, matD]} />
        <meshToonMaterial color="#8a5a32" />
        <Outlines color={COLORS.outline} thickness={1.2} />
      </mesh>
      <mesh
        position={[matCx, MAT_Y + 0.045, matCz]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[matW - 0.08, matD - 0.08]} />
        <meshToonMaterial color="#a07040" />
      </mesh>
      {/* Border rails */}
      {[
        [matCx, MAT_Y + 0.08, matCz + matD / 2 - 0.04, matW, 0.1, 0.09],
        [matCx, MAT_Y + 0.08, matCz - matD / 2 + 0.04, matW, 0.1, 0.09],
        [matCx + matW / 2 - 0.04, MAT_Y + 0.08, matCz, 0.09, 0.1, matD],
        [matCx - matW / 2 + 0.04, MAT_Y + 0.08, matCz, 0.09, 0.1, matD],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={`rail-${i}`} position={[x, y, z]} castShadow>
          <boxGeometry args={[w, h, d]} />
          <meshToonMaterial color={COLORS.woodDark} />
        </mesh>
      ))}

      {/* Food bowl — bright ceramic + kibble */}
      <BowlShell
        position={[PET_FOOD_BOWL.x, BOWL_Y, PET_FOOD_BOWL.z]}
        rim="#c4884a"
        inner="#6b3a18"
        radius={0.4}
      />
      {[
        [0.06, 0.22, 0.03],
        [-0.08, 0.21, -0.05],
        [0.03, 0.225, -0.09],
        [-0.04, 0.22, 0.08],
        [0.1, 0.21, -0.02],
        [-0.02, 0.23, 0.0],
        [0.05, 0.215, 0.1],
      ].map(([x, y, z], i) => (
        <mesh
          key={`kib-${i}`}
          position={[
            PET_FOOD_BOWL.x + x,
            BOWL_Y + y,
            PET_FOOD_BOWL.z + z,
          ]}
          castShadow
        >
          <sphereGeometry args={[0.04 + (i % 3) * 0.01, 5, 4]} />
          <meshToonMaterial color={i % 2 === 0 ? "#8a5030" : "#a86838"} />
        </mesh>
      ))}
      {/* FOOD placard */}
      <mesh
        position={[PET_FOOD_BOWL.x, BOWL_Y + 0.05, PET_FOOD_BOWL.z + 0.55]}
        castShadow
      >
        <boxGeometry args={[0.5, 0.08, 0.14]} />
        <meshToonMaterial color="#d4a060" />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>

      {/* Water bowl — silver metal + blue water */}
      <BowlShell
        position={[PET_WATER_BOWL.x, BOWL_Y, PET_WATER_BOWL.z]}
        rim="#b0b8c4"
        inner="#5a6570"
        radius={0.4}
      />
      <mesh
        position={[PET_WATER_BOWL.x, BOWL_Y + 0.16, PET_WATER_BOWL.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[0.3, 16]} />
        <meshToonMaterial
          color="#4aabd4"
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      </mesh>
      {/* WATER placard */}
      <mesh
        position={[PET_WATER_BOWL.x, BOWL_Y + 0.05, PET_WATER_BOWL.z - 0.55]}
        castShadow
      >
        <boxGeometry args={[0.5, 0.08, 0.14]} />
        <meshToonMaterial color="#80b0d0" />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>
    </group>
  );
}
