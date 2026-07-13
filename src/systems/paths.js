/**
 * Dirt path definitions for the ranch map.
 * Waypoints are [x, z] control points; ribbons are Catmull-Rom sampled at runtime.
 * Edits from the Map Editor persist in localStorage.
 */

const STORAGE_KEY = "the-ride-paths-v1";

/**
 * Default ranch trail layout (editable in Map Editor).
 * Captured from local Map Editor save (localhost) so hosted builds
 * use the same riding trails without relying on browser localStorage.
 */
export const DEFAULT_PATHS = [
  {
    id: "outer",
    name: "Outer loop",
    closed: true,
    width: 7.5,
    waypoints: [
      [139.7, 0],
      [130.3, 34.9],
      [104.9, 60.5],
      [87.4, 87.4],
      [63.6, 110.1],
      [33.5, 125.1],
      [0, 109.7],
      [-26.5, 98.7],
      [-47.2, 81.8],
      [-52.1, 52.1],
      [-90.3, 52.1],
      [-136.3, 36.5],
      [-143.2, 0],
      [-131.9, -35.3],
      [-104.8, -60.5],
      [-83.3, -83.3],
      [-53.9, -93.4],
      [-25.9, -96.5],
      [0, -116.3],
      [25.3, -94.5],
      [59.1, -99.6],
      [77.1, -77.1],
      [115.1, -66.5],
      [143.3, -38.4],
    ],
  },
  {
    id: "inner",
    name: "Inner loop",
    closed: true,
    width: 6,
    waypoints: [
      [96.7, 0],
      [83.2, 27],
      [63.7, 46.3],
      [48.2, 66.3],
      [27.1, 83.4],
      [0, 66.7],
      [-18.4, 56.8],
      [-24, 33],
      [-34.7, 25.2],
      [-89.5, 29.1],
      [-100.2, 0],
      [-86.3, -28],
      [-60.6, -44],
      [-42, -57.8],
      [-21.4, -66],
      [0, -73.3],
      [25.6, -56.6],
      [43.2, -52.4],
      [66.3, -48.2],
      [98.3, -31.9],
    ],
  },
  {
    id: "spur",
    name: "Ranch spur",
    closed: false,
    width: 6,
    waypoints: [
      [0.5, 18.3],
      [18, 22],
      [36, 34],
      [63.2, 46.1],
    ],
  },
  {
    id: "cabin",
    name: "Cabin path",
    closed: false,
    width: 4.5,
    waypoints: [
      [1.5, 18.1],
      [-33.9, 24.9],
    ],
  },
  {
    id: "ranchToOuter",
    name: "Ranch to outer",
    closed: false,
    width: 5.5,
    waypoints: [
      [66.4, -46.9],
      [33.4, -22.8],
      [0.4, -11.7],
      [-20, -18],
      [-40, -40],
      [-52, -48.5],
    ],
  },
];

/** Landmarks drawn on the map editor (not editable) */
export const MAP_LANDMARKS = [
  { id: "barn", name: "Barn", x: 0, z: 0, r: 9 },
  { id: "cabin", name: "Cabin", x: -32.5, z: 0, r: 12 },
  { id: "pen", name: "Horse pen", x: 20, z: 0, r: 8 },
  { id: "lake", name: "Lake", x: 0, z: -38, r: 16 },
];

export function clonePaths(paths = DEFAULT_PATHS) {
  return paths.map((p) => ({
    ...p,
    waypoints: p.waypoints.map((w) => [w[0], w[1]]),
  }));
}

export function loadPaths() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clonePaths(DEFAULT_PATHS);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return clonePaths(DEFAULT_PATHS);
    }
    // Merge with defaults so new paths added in updates still appear
    const byId = Object.fromEntries(
      parsed
        .filter((p) => p && p.id && Array.isArray(p.waypoints))
        .map((p) => [p.id, p])
    );
    return DEFAULT_PATHS.map((def) => {
      const saved = byId[def.id];
      if (!saved) return { ...def, waypoints: def.waypoints.map((w) => [...w]) };
      return {
        ...def,
        ...saved,
        id: def.id,
        name: saved.name || def.name,
        closed: !!saved.closed,
        width: typeof saved.width === "number" ? saved.width : def.width,
        waypoints: saved.waypoints.map((w) => [
          Number(w[0]) || 0,
          Number(w[1]) || 0,
        ]),
      };
    });
  } catch {
    return clonePaths(DEFAULT_PATHS);
  }
}

export function savePaths(paths) {
  try {
    const payload = paths.map((p) => ({
      id: p.id,
      name: p.name,
      closed: !!p.closed,
      width: p.width,
      waypoints: p.waypoints.map((w) => [
        Math.round(w[0] * 10) / 10,
        Math.round(w[1] * 10) / 10,
      ]),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function resetPaths() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return clonePaths(DEFAULT_PATHS);
}

/** Extra clearance past half path width so trunks clear the dirt ribbon */
export const PATH_TREE_MARGIN = 4.5;

/** Distance from point (x,z) to segment A→B on XZ */
function distPointToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  if (ab2 < 1e-8) return Math.hypot(apx, apz);
  let t = (apx * abx + apz * abz) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz);
}

/**
 * True if (x,z) sits on/near any riding path (dirt trail).
 * Uses path width/2 + margin. Defaults to saved/default path layout.
 */
export function isNearRidingPath(
  x,
  z,
  paths = null,
  extraMargin = PATH_TREE_MARGIN
) {
  const list = paths || loadPaths();
  for (const p of list) {
    const wps = p.waypoints;
    if (!wps || wps.length < 2) continue;
    const clearR = (p.width || 6) * 0.5 + extraMargin;
    const n = wps.length;
    const segs = p.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = wps[i];
      const b = wps[(i + 1) % n];
      if (distPointToSegment(x, z, a[0], a[1], b[0], b[1]) < clearR) {
        return true;
      }
    }
  }
  return false;
}
