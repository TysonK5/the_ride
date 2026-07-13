import { TREE_SPOTS } from "../components/Environment/Trees";
import {
  getBarnColliders,
  getCabinColliders,
  getCabinYardColliders,
  BARN_W,
  BARN_D,
  CABIN_POS,
  CABIN_W,
  CABIN_D,
  PATIO_W,
  PATIO_D,
  GARDEN_LOCAL,
  GARDEN_W,
  GARDEN_D,
} from "../components/Town/Buildings";
import { getFenceColliders } from "../components/Environment/Fence";
import { DOCK, isOnDock } from "../components/Environment/Dock";

/**
 * Walkable raised floors (top surface Y). Default ground is 0.
 * Used so the player/horse stand ON barn, cabin, patio, garden, porch
 * instead of clipping under their mesh floors.
 */
export const FLOOR_HEIGHTS = {
  ground: 0,
  barn: 0.05,
  cabin: 0.08,
  porch: 0.16,
  patio: 0.14,
  garden: 0.06,
  dock: DOCK.deckY,
};

/** Max vertical step the player can take between surfaces (all our floors are low). */
export const MAX_STEP_HEIGHT = 0.55;

function inAabb(x, z, minX, maxX, minZ, maxZ) {
  return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
}

/**
 * World-space ground height under (x, z). Takes the highest surface that
 * contains the point so stacked pads (e.g. porch near cabin) resolve correctly.
 */
export function getGroundHeight(x, z) {
  let h = FLOOR_HEIGHTS.ground;

  // --- Barn interior dirt floor (map center) ---
  const bhw = BARN_W / 2 - 0.2;
  const bhd = BARN_D / 2 - 0.2;
  if (inAabb(x, z, -bhw, bhw, -bhd, bhd)) {
    h = Math.max(h, FLOOR_HEIGHTS.barn);
  }

  // Cabin-local coords (yaw = 0)
  const lx = x - CABIN_POS.x;
  const lz = z - CABIN_POS.z;

  // --- Cabin interior floor ---
  const chw = CABIN_W / 2 - 0.15;
  const chd = CABIN_D / 2 - 0.15;
  if (inAabb(lx, lz, -chw, chw, -chd, chd)) {
    h = Math.max(h, FLOOR_HEIGHTS.cabin);
  }

  // --- Front porch deck (local, in front of cabin) ---
  const porchZ0 = CABIN_D / 2 + 0.15;
  const porchZ1 = CABIN_D / 2 + 2.2;
  const porchHalfW = (CABIN_W * 0.85) / 2;
  if (inAabb(lx, lz, -porchHalfW, porchHalfW, porchZ0, porchZ1)) {
    h = Math.max(h, FLOOR_HEIGHTS.porch);
  }

  // --- Back patio deck (full cabin width × 50% depth) ---
  const patioZ0 = -CABIN_D / 2 - PATIO_D - 0.05;
  const patioZ1 = -CABIN_D / 2 + 0.15;
  const patioHalfW = PATIO_W / 2 + 0.05;
  if (inAabb(lx, lz, -patioHalfW, patioHalfW, patioZ0, patioZ1)) {
    h = Math.max(h, FLOOR_HEIGHTS.patio);
  }

  // --- Garden dirt pad (left of cabin) ---
  const gx = GARDEN_LOCAL.x;
  const gz = GARDEN_LOCAL.z;
  if (
    inAabb(
      lx,
      lz,
      gx - GARDEN_W / 2,
      gx + GARDEN_W / 2,
      gz - GARDEN_D / 2,
      gz + GARDEN_D / 2
    )
  ) {
    h = Math.max(h, FLOOR_HEIGHTS.garden);
  }

  // --- Lake fishing dock ---
  if (isOnDock(x, z)) {
    h = Math.max(h, FLOOR_HEIGHTS.dock);
  }

  return h;
}

/**
 * Snap / step a position onto the walkable ground at its XZ.
 * Mutates and returns `position`. Use when not flying.
 *
 * @param {THREE.Vector3} position
 * @param {number} [prevY] previous frame Y (for step limiting)
 * @param {{ maxStepUp?: number, maxStepDown?: number }} [opts]
 */
export function applyGroundHeight(position, prevY = null, opts = {}) {
  const maxUp = opts.maxStepUp ?? MAX_STEP_HEIGHT;
  const maxDown = opts.maxStepDown ?? 2.5;
  const target = getGroundHeight(position.x, position.z);
  const from = prevY == null ? position.y : prevY;
  const dy = target - from;

  if (dy > maxUp) {
    // Unreachable ledge — keep previous height (XZ collision should keep us out)
    position.y = from;
  } else if (dy < -maxDown) {
    position.y = target; // long drop still lands on ground
  } else {
    position.y = target;
  }
  return position;
}

/** Axis-aligned box on XZ plane: { type:'box', minX, maxX, minZ, maxZ } */
/** Circle on XZ: { type:'circle', x, z, r } */
/** Ellipse on XZ: { type:'ellipse', x, z, rx, rz } */

// Barn colliders are dynamic (doors open/close) — see getBarnColliders in Buildings.jsx
// Cabin walls are hollow boxes — see getCabinColliders in Buildings.jsx

// Hitching posts + barrels
const PROPS = [
  { type: "circle", x: -3, z: 8, r: 0.45 },
  { type: "circle", x: 3, z: 8, r: 0.45 },
  { type: "circle", x: 10, z: 7, r: 0.5 },
  { type: "circle", x: 11, z: 6.5, r: 0.5 },
  { type: "circle", x: -26, z: 6, r: 0.5 },
  { type: "circle", x: -24.5, z: 5, r: 0.5 },
];

const TREES = TREE_SPOTS.map(([x, z], i) => ({
  type: "circle",
  x,
  z,
  r: 0.7 + (i % 5) * 0.08,
}));

/** Large lake behind the barn (negative Z) */
export const LAKE = {
  type: "ellipse",
  x: 0,
  z: -38,
  rx: 28,
  rz: 18,
};

const STATIC = [...PROPS, ...TREES, LAKE];

function pushOutOfBox(px, pz, r, box) {
  // Expand box by radius, then push to nearest edge if inside
  const minX = box.minX - r;
  const maxX = box.maxX + r;
  const minZ = box.minZ - r;
  const maxZ = box.maxZ + r;

  if (px < minX || px > maxX || pz < minZ || pz > maxZ) {
    return { x: px, z: pz, hit: false };
  }

  const dl = px - minX;
  const dr = maxX - px;
  const db = pz - minZ;
  const dt = maxZ - pz;
  const m = Math.min(dl, dr, db, dt);

  if (m === dl) return { x: minX, z: pz, hit: true };
  if (m === dr) return { x: maxX, z: pz, hit: true };
  if (m === db) return { x: px, z: minZ, hit: true };
  return { x: px, z: maxZ, hit: true };
}

function pushOutOfCircle(px, pz, r, c) {
  const dx = px - c.x;
  const dz = pz - c.z;
  const minDist = c.r + r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minDist * minDist || d2 < 1e-8) {
    if (d2 < 1e-8) {
      // Exact center — nudge out
      return { x: c.x + minDist, z: c.z, hit: true };
    }
    return { x: px, z: pz, hit: false };
  }
  const d = Math.sqrt(d2);
  const s = minDist / d;
  return { x: c.x + dx * s, z: c.z + dz * s, hit: true };
}

function pushOutOfEllipse(px, pz, r, e) {
  // Approximate by scaling into unit circle, push, scale back
  const rx = e.rx + r;
  const rz = e.rz + r;
  const nx = (px - e.x) / rx;
  const nz = (pz - e.z) / rz;
  const d2 = nx * nx + nz * nz;
  if (d2 >= 1 || d2 < 1e-8) {
    if (d2 < 1e-8) {
      return { x: e.x + rx, z: e.z, hit: true };
    }
    return { x: px, z: pz, hit: false };
  }
  const d = Math.sqrt(d2);
  return {
    x: e.x + (nx / d) * rx,
    z: e.z + (nz / d) * rz,
    hit: true,
  };
}

/**
 * Dynamic structure colliders for animals / player extras:
 * barn walls (door gaps when open) + pen fence / gate.
 */
export function getStructureColliders(barnDoorState = null, gateState = null) {
  return [
    ...getBarnColliders(barnDoorState),
    ...getFenceColliders(gateState),
  ];
}

/**
 * Resolve an animal (or player) against trees, lake, props, cabin, barn, fence.
 * Mutates and returns the same Vector3.
 */
export function resolveAnimalCollisions(
  position,
  radius,
  cabinState = null,
  barnDoorState = null,
  gateState = null,
  extra = []
) {
  return resolveCollisions(
    position,
    radius,
    [...getStructureColliders(barnDoorState, gateState), ...extra],
    cabinState
  );
}

/**
 * Resolve position against static colliders + optional extras.
 * `extra` may include boxes or circles (e.g. fence rails, horse).
 * Mutates and returns the same Vector3.
 */
export function resolveCollisions(
  position,
  radius = 0.45,
  extra = [],
  cabinState = null
) {
  let x = position.x;
  let z = position.z;
  // Cabin walls + picket fence (door/gate open state)
  let cabin = [];
  try {
    cabin = [
      ...getCabinColliders(cabinState),
      ...getCabinYardColliders(cabinState),
    ];
  } catch {
    cabin = [];
  }

  // Iterate twice so stacked overlaps settle
  for (let pass = 0; pass < 2; pass++) {
    for (const c of STATIC) {
      // Walkable dock sits over the lake — skip water push-out there
      if (c.type === "ellipse" && c === LAKE && isOnDock(x, z, radius + 0.2)) {
        continue;
      }
      let out;
      if (c.type === "box") out = pushOutOfBox(x, z, radius, c);
      else if (c.type === "circle") out = pushOutOfCircle(x, z, radius, c);
      else if (c.type === "ellipse") out = pushOutOfEllipse(x, z, radius, c);
      else continue;
      x = out.x;
      z = out.z;
    }
    for (const c of cabin) {
      const out = pushOutOfBox(x, z, radius, c);
      x = out.x;
      z = out.z;
    }
    for (const c of extra) {
      let out;
      if (c.type === "box") out = pushOutOfBox(x, z, radius, c);
      else if (c.type === "circle") out = pushOutOfCircle(x, z, radius, c);
      else if (c.type === "ellipse") out = pushOutOfEllipse(x, z, radius, c);
      else continue;
      x = out.x;
      z = out.z;
    }
  }

  position.x = x;
  position.z = z;
  return position;
}

/** True if a point (with radius) is inside the lake. */
export function isInLake(x, z, radius = 0) {
  const nx = (x - LAKE.x) / (LAKE.rx + radius);
  const nz = (z - LAKE.z) / (LAKE.rz + radius);
  return nx * nx + nz * nz < 1;
}

/**
 * True when standing/riding along the pond shore (outside solid water,
 * within a shore band) — used for horse drinking interaction.
 */
export function isNearShore(x, z, shoreBand = 6) {
  // Inside expanded shore ellipse…
  const near = isInLake(x, z, shoreBand);
  // …but not deep inside the solid water (collision already keeps you out)
  const deep = isInLake(x, z, -2);
  // Also allow just-outside band via expanded check only
  return near && !deep;
}
