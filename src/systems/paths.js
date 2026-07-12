/**
 * Dirt path definitions for the ranch map.
 * Waypoints are [x, z] control points; ribbons are Catmull-Rom sampled at runtime.
 * Edits from the Map Editor persist in localStorage.
 */

const STORAGE_KEY = "the-ride-paths-v1";

function windingWaypoints(baseRadius, pointCount) {
  const pts = [];
  for (let i = 0; i < pointCount; i++) {
    const a = (i / pointCount) * Math.PI * 2;
    const wind =
      22 * Math.sin(a * 2.3) +
      14 * Math.cos(a * 4.1) +
      8 * Math.sin(a * 6.7 + 0.8) +
      5 * Math.cos(a * 9.2);
    const r = baseRadius + wind;
    pts.push([
      Math.round(Math.cos(a) * r * 10) / 10,
      Math.round(Math.sin(a) * r * 10) / 10,
    ]);
  }
  return pts;
}

/** Default ranch trail layout (editable) */
export const DEFAULT_PATHS = [
  {
    id: "outer",
    name: "Outer loop",
    closed: true,
    width: 7.5,
    waypoints: windingWaypoints(155, 28),
  },
  {
    id: "inner",
    name: "Inner loop",
    closed: true,
    width: 6,
    waypoints: windingWaypoints(95, 22),
  },
  {
    id: "spur",
    name: "Ranch spur",
    closed: false,
    width: 6,
    waypoints: [
      [2, 12],
      [22, 28],
      [48, 42],
      [72, 58],
      [100, 70],
      [120, 85],
    ],
  },
  {
    id: "cabin",
    name: "Cabin path",
    closed: false,
    width: 4.5,
    waypoints: [
      [-10, 4],
      [-18, 2],
      [-26, 0],
      [-32, 0],
      [-32.5, 6],
    ],
  },
  {
    id: "ranchToOuter",
    name: "Ranch to outer",
    closed: false,
    width: 5.5,
    waypoints: [
      [-4, -2],
      [-28, -24],
      [-55, -52],
      [-85, -80],
      [-110, -100],
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
