/**
 * Movable cabin furniture — positions persist in localStorage.
 * Coordinates are cabin-local (LogCabin group space: center of cabin).
 * Cabin size constants duplicated to avoid import cycles with Buildings.
 */

const STORAGE_KEY = "the-ride-furniture-v1";

/** Match Buildings.jsx cabin footprint */
const CABIN_W = 14;
const CABIN_D = 11;
const CABIN_WALL_T = 0.45;
const CABIN_POS = { x: -32.5, z: 0 };

/** Interact range (world units) to start moving a piece */
export const FURNITURE_MOVE_RANGE = 2.4;
/** Place in front of player by this distance */
export const FURNITURE_CARRY_DIST = 1.35;

/**
 * Default cabin-local placements (match original built-in layout).
 * yaw is radians around Y.
 */
export const DEFAULT_FURNITURE = [
  {
    id: "bed",
    name: "Bed",
    x: 5.46,
    z: 0.15,
    yaw: 0,
    radius: 1.35,
  },
  {
    id: "nightstand",
    name: "Nightstand",
    x: 4.85,
    z: -1.15,
    yaw: 0,
    radius: 0.65,
  },
  {
    id: "fridge",
    name: "Refrigerator",
    x: -CABIN_W / 2 + 0.55,
    z: CABIN_D / 2 - 0.85,
    yaw: 0,
    radius: 0.85,
  },
  {
    id: "sink",
    name: "Farm sink",
    x: -CABIN_W / 2 + 0.42,
    z: 2.0,
    yaw: 0,
    radius: 0.85,
  },
  {
    id: "table",
    name: "Kitchen table",
    x: -2.2,
    z: 2.0,
    yaw: 0,
    radius: 1.5,
  },
  {
    id: "chair1",
    name: "Leather chair",
    x: -CABIN_W / 2 + 1.55 + 2.15,
    z: -CABIN_D / 2 + 1.7 + 1.55,
    yaw: -0.85,
    radius: 0.75,
  },
  {
    id: "chair2",
    name: "Leather chair",
    x: -CABIN_W / 2 + 1.55 + 1.55,
    z: -CABIN_D / 2 + 1.7 + 2.35,
    yaw: -2.15,
    radius: 0.75,
  },
];

export function cloneDefaults() {
  return DEFAULT_FURNITURE.map((f) => ({ ...f }));
}

export function loadFurniture() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return cloneDefaults();
    const byId = Object.fromEntries(
      parsed
        .filter((p) => p && p.id)
        .map((p) => [p.id, p])
    );
    return DEFAULT_FURNITURE.map((def) => {
      const saved = byId[def.id];
      if (!saved) return { ...def };
      return {
        ...def,
        x: typeof saved.x === "number" ? saved.x : def.x,
        z: typeof saved.z === "number" ? saved.z : def.z,
        yaw: typeof saved.yaw === "number" ? saved.yaw : def.yaw,
      };
    });
  } catch {
    return cloneDefaults();
  }
}

export function saveFurniture(items) {
  try {
    const payload = items.map((f) => ({
      id: f.id,
      x: Math.round(f.x * 100) / 100,
      z: Math.round(f.z * 100) / 100,
      yaw: Math.round(f.yaw * 1000) / 1000,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function resetFurniture() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return cloneDefaults();
}

/** Mutable furniture runtime state */
export function createFurnitureState() {
  return {
    items: loadFurniture(),
    /** id of piece being carried, or null */
    movingId: null,
  };
}

/** World XZ → cabin-local XZ (yaw 0 cabin) */
export function worldToCabinLocal(wx, wz) {
  return {
    x: wx - CABIN_POS.x,
    z: wz - CABIN_POS.z,
  };
}

export function cabinLocalToWorld(lx, lz) {
  return {
    x: CABIN_POS.x + lx,
    z: CABIN_POS.z + lz,
  };
}

/** Clamp placement to stay inside the cabin footprint */
export function clampFurnitureInCabin(x, z, radius = 0.8) {
  const pad = CABIN_WALL_T + radius * 0.55;
  const hw = CABIN_W / 2 - pad;
  const hd = CABIN_D / 2 - pad;
  return {
    x: Math.max(-hw, Math.min(hw, x)),
    z: Math.max(-hd, Math.min(hd, z)),
  };
}

/**
 * Nearest movable piece to world position (player feet).
 * Returns { item, dist, worldX, worldZ } or null.
 */
export function findNearestFurniture(furnitureState, wx, wz) {
  if (!furnitureState?.items?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const item of furnitureState.items) {
    if (furnitureState.movingId && furnitureState.movingId !== item.id) {
      // still allow finding while moving only the carried piece
    }
    const w = cabinLocalToWorld(item.x, item.z);
    const d = Math.hypot(w.x - wx, w.z - wz);
    const range = (item.radius ?? 1) + 0.9;
    if (d < range && d < bestD) {
      bestD = d;
      best = { item, dist: d, worldX: w.x, worldZ: w.z };
    }
  }
  return best;
}

/** Start carrying a piece */
export function beginMoveFurniture(furnitureState, id) {
  if (!furnitureState) return false;
  const item = furnitureState.items.find((f) => f.id === id);
  if (!item) return false;
  furnitureState.movingId = id;
  return true;
}

/** Update carried piece to sit in front of the player */
export function updateMovingFurniture(
  furnitureState,
  playerX,
  playerZ,
  playerYaw
) {
  if (!furnitureState?.movingId) return;
  const item = furnitureState.items.find(
    (f) => f.id === furnitureState.movingId
  );
  if (!item) return;
  const fx = playerX + Math.sin(playerYaw) * FURNITURE_CARRY_DIST;
  const fz = playerZ + Math.cos(playerYaw) * FURNITURE_CARRY_DIST;
  const local = worldToCabinLocal(fx, fz);
  const clamped = clampFurnitureInCabin(local.x, local.z, item.radius ?? 0.8);
  item.x = clamped.x;
  item.z = clamped.z;
  // Face same way as player when placing
  item.yaw = playerYaw;
}

/** Put down the carried piece and persist */
export function placeFurniture(furnitureState) {
  if (!furnitureState?.movingId) return false;
  furnitureState.movingId = null;
  saveFurniture(furnitureState.items);
  return true;
}

/** Cancel move and reload last saved positions */
export function cancelMoveFurniture(furnitureState) {
  if (!furnitureState) return;
  furnitureState.movingId = null;
  furnitureState.items = loadFurniture();
}
