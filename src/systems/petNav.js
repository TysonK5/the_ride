/**
 * Lightweight waypoint pathfinding so pets walk around the barn & cabin
 * on the way to food bowls (instead of bee-lining through walls).
 *
 * Cabin constants duplicated (avoid import cycle with Buildings → PetBowls).
 */

/** Barn footprint (solid for pathing except door slots) */
const BARN = { hw: 9.2, hd: 6.2 };
/** Front door half-width opening */
const FRONT_DOOR = 4.0;
/** Right-wall pen door half-width */
const PEN_DOOR = 3.1;

/** Cabin building footprint (world), padded — matches Buildings.jsx */
const CABIN_POS = { x: -32.5, z: 0 };
const CABIN_W = 14;
const CABIN_D = 11;
const CABIN_YARD = { halfW: 11, leftW: 23.5, front: 9.5, back: 7.5 };
const CABIN_PAD = 1.2;

/**
 * Static nav graph nodes around ranch structures + barn interior.
 * Edges are free if line-of-sight clears solid barn/cabin mass.
 */
const STATIC_NODES = [
  // Barn exterior ring
  { id: "bf", x: 0, z: 9.5 },
  { id: "bb", x: 0, z: -9.5 },
  { id: "bl", x: -11.5, z: 0 },
  { id: "br", x: 12.5, z: 0 },
  { id: "bnw", x: -11.5, z: 9.5 },
  { id: "bne", x: 12.5, z: 9.5 },
  { id: "bsw", x: -11.5, z: -9.5 },
  { id: "bse", x: 12.5, z: -9.5 },
  // Barn door approaches
  { id: "bfront_out", x: 0, z: 7.2 },
  { id: "bfront_in", x: 0, z: 4.2 },
  { id: "bpen_out", x: 11.2, z: 0 },
  { id: "bpen_in", x: 7.2, z: 0 },
  // Aisle / bowls (inside barn)
  { id: "bail", x: 2.5, z: 2.5 },
  { id: "food", x: 4.65, z: 3.4 },
  { id: "water", x: 4.65, z: 1.9 },
  // Cabin exterior (left of barn)
  { id: "c_e", x: CABIN_POS.x + CABIN_YARD.halfW + 2.5, z: 0 },
  { id: "c_w", x: CABIN_POS.x - (CABIN_YARD.leftW ?? 23.5) - 2.5, z: 0 },
  { id: "c_n", x: CABIN_POS.x, z: CABIN_YARD.front + 2.5 },
  { id: "c_s", x: CABIN_POS.x, z: -CABIN_YARD.back - 2.5 },
  { id: "c_ne", x: CABIN_POS.x + 14, z: CABIN_YARD.front + 2 },
  { id: "c_nw", x: CABIN_POS.x - 20, z: CABIN_YARD.front + 2 },
  { id: "c_se", x: CABIN_POS.x + 14, z: -CABIN_YARD.back - 2 },
  { id: "c_sw", x: CABIN_POS.x - 20, z: -CABIN_YARD.back - 2 },
  // Mid ranch connectors
  { id: "mid", x: -16, z: 12 },
  { id: "mid2", x: -16, z: -10 },
  { id: "yard", x: 8, z: 14 },
  { id: "yard2", x: -8, z: 14 },
];

function inBarnFootprint(x, z, pad = 0) {
  return Math.abs(x) <= BARN.hw + pad && Math.abs(z) <= BARN.hd + pad;
}

/** True if point is in solid barn mass (not freestanding interior / door gaps). */
function inBarnSolid(x, z, r = 0.4) {
  // Outside the barn shell → not solid
  if (!inBarnFootprint(x, z, r)) return false;
  // Interior free space (hollow barn)
  const interior =
    Math.abs(x) < BARN.hw - 0.55 && Math.abs(z) < BARN.hd - 0.55;
  if (interior) {
    // Still block stall mass on left roughly
    if (x < -5.2 && Math.abs(z) < BARN.hd - 0.5) return true;
    return false;
  }
  // Wall band: allow front door gap and pen door gap
  // Front door opening at z ≈ +hd
  if (z > BARN.hd - 1.2 && Math.abs(x) < FRONT_DOOR - 0.2) return false;
  // Back door opening
  if (z < -BARN.hd + 1.2 && Math.abs(x) < 2.5) return false;
  // Pen door on right wall x ≈ +hw
  if (x > BARN.hw - 1.2 && Math.abs(z) < PEN_DOOR - 0.15) return false;
  // Otherwise solid wall shell
  return true;
}

function inCabinSolid(x, z, r = 0.45) {
  const hw = CABIN_W / 2 + CABIN_PAD + r;
  const hd = CABIN_D / 2 + CABIN_PAD + r;
  return (
    Math.abs(x - CABIN_POS.x) <= hw && Math.abs(z - CABIN_POS.z) <= hd
  );
}

export function isNavBlocked(x, z, r = 0.4) {
  return inBarnSolid(x, z, r) || inCabinSolid(x, z, r);
}

/** Sampled segment test */
export function segmentBlocked(ax, az, bx, bz, r = 0.4) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return isNavBlocked(ax, az, r);
  const steps = Math.max(2, Math.ceil(len / 0.55));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (isNavBlocked(ax + dx * t, az + dz * t, r)) return true;
  }
  return false;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Build a path of {x,z} points from start to goal around barn/cabin.
 * Returns array including goal (not including start).
 */
export function planPetPath(sx, sz, gx, gz) {
  const start = { x: sx, z: sz };
  const goal = { x: gx, z: gz };

  // Direct path OK
  if (!segmentBlocked(sx, sz, gx, gz, 0.45)) {
    return [goal];
  }

  // Graph: static nodes + start + goal
  const nodes = [
    { id: "__start", x: sx, z: sz },
    { id: "__goal", x: gx, z: gz },
    ...STATIC_NODES,
  ];

  // Adjacency via LOS (cap long edges)
  const N = nodes.length;
  const adj = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const d = dist(nodes[i], nodes[j]);
      if (d > 28) continue;
      if (segmentBlocked(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z, 0.4))
        continue;
      adj[i].push({ j, d });
      adj[j].push({ j: i, d });
    }
  }

  // Dijkstra
  const INF = 1e12;
  const distArr = new Array(N).fill(INF);
  const prev = new Array(N).fill(-1);
  const used = new Array(N).fill(false);
  distArr[0] = 0;
  for (let iter = 0; iter < N; iter++) {
    let u = -1;
    let best = INF;
    for (let i = 0; i < N; i++) {
      if (!used[i] && distArr[i] < best) {
        best = distArr[i];
        u = i;
      }
    }
    if (u < 0 || best >= INF) break;
    used[u] = true;
    if (u === 1) break; // reached goal
    for (const { j, d } of adj[u]) {
      const nd = distArr[u] + d;
      if (nd < distArr[j]) {
        distArr[j] = nd;
        prev[j] = u;
      }
    }
  }

  if (prev[1] < 0 && distArr[1] >= INF) {
    // Fallback: go to nearest exterior door approach then goal
    const fallbacks = [
      { x: 0, z: 7.2 },
      { x: 11.2, z: 0 },
      { x: 0, z: 4.2 },
      { x: 7.2, z: 0 },
      goal,
    ];
    return fallbacks;
  }

  // Reconstruct
  const chain = [];
  let cur = 1;
  while (cur !== 0 && cur >= 0) {
    chain.push(nodes[cur]);
    cur = prev[cur];
  }
  chain.reverse();
  // Drop start if present; ensure goal last
  const path = chain
    .filter((n) => n.id !== "__start")
    .map((n) => ({ x: n.x, z: n.z }));
  if (
    path.length === 0 ||
    path[path.length - 1].x !== goal.x ||
    path[path.length - 1].z !== goal.z
  ) {
    path.push(goal);
  }
  return path;
}

/**
 * Advance along a planned path. Mutates st.pos / yaw / walkPhase.
 * path is array of {x,z}; feed.pathIndex is current target index.
 * Returns true when final point reached.
 */
export function followPetPath(st, feed, delta, walkSpeed, arrive = 0.7) {
  if (!feed.path || feed.path.length === 0) return true;
  let idx = feed.pathIndex ?? 0;
  if (idx >= feed.path.length) return true;

  const tgt = feed.path[idx];
  const dx = tgt.x - st.pos.x;
  const dz = tgt.z - st.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < arrive) {
    feed.pathIndex = idx + 1;
    if (feed.pathIndex >= feed.path.length) return true;
    return false;
  }
  const step = Math.min(d, walkSpeed * delta);
  st.pos.x += (dx / d) * step;
  st.pos.z += (dz / d) * step;
  st.yaw = Math.atan2(dx, dz);
  st.walkPhase = (st.walkPhase ?? 0) + delta * 12;
  st.mode = "walk";
  return false;
}
