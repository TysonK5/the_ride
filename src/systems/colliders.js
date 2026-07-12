import { TREE_SPOTS } from "../components/Environment/Trees";
import {
  getCabinColliders,
  getCabinYardColliders,
} from "../components/Town/Buildings";

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
