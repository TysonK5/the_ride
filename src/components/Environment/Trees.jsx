import { useMemo } from "react";
import { Outlines } from "@react-three/drei";
import { COLORS } from "../../materials/colors";

/** Keep in sync with LAKE in systems/colliders.js (avoid circular import) */
const LAKE = { x: 0, z: -38, rx: 28, rz: 18 };

/** Original tree placements */
const BASE_TREE_SPOTS = [
  [-45, -25], [-38, -18], [-42, 15], [-35, 22], [42, -20], [38, 18],
  [48, 5], [-48, -8], [30, 28], [-28, -28], [55, -12], [-55, 12],
  [20, -35], [-15, 35], [50, 25], [-50, -30], [12, 30], [-22, -35],
];

/** +30 more trees around the flats */
const EXTRA_TREE_SPOTS = [
  [-52, 22], [-40, -32], [-33, 8], [-25, -12], [-18, 28],
  [-12, -22], [8, -28], [15, 22], [22, -12], [28, 32],
  [35, -30], [40, 8], [45, -5], [52, 18], [-58, -20],
  [-30, 32], [5, 38], [-8, -40], [18, -42], [-42, 0],
  [32, -38], [-20, 40], [48, -22], [-55, 30], [0, 42],
  [60, 8], [-60, 5], [25, 40], [-48, 40], [38, 35],
];

/** Outer belt for the 2× map (keeps the horizon from feeling empty) */
const OUTER_TREE_SPOTS = [
  [90, 40], [100, -30], [85, -70], [70, 95], [110, 20],
  [-90, 50], [-100, -40], [-85, 80], [-70, -95], [-110, 10],
  [40, 110], [-40, 105], [20, -110], [-30, -100], [55, 100],
  [95, 70], [-95, -70], [0, 115], [0, -115], [120, 0],
  [-120, 0], [80, -90], [-80, 90], [100, 100], [-100, -100],
];

/** Margin so trunks sit off the shore, not in water */
const LAKE_CLEAR_MARGIN = 4;

function isInOrNearLake(x, z, margin = LAKE_CLEAR_MARGIN) {
  const nx = (x - LAKE.x) / (LAKE.rx + margin);
  const nz = (z - LAKE.z) / (LAKE.rz + margin);
  return nx * nx + nz * nz < 1;
}

/** Deterministic pseudo-random in [0, 1) from index */
function rand(i, salt = 0) {
  const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Place a tree further behind the pond (more negative Z than the far shore).
 * Spreads them left/right with a bit of depth variation.
 */
function spotBehindPond(i) {
  const farShore = LAKE.z - LAKE.rz; // ~ -56
  const x = (rand(i, 1) - 0.5) * 90; // -45 .. 45
  const z = farShore - 6 - rand(i, 2) * 22; // ~ -62 .. -84
  return [x, z];
}

/** All spots, with any pond/shore trees relocated behind the lake */
function buildTreeSpots() {
  const raw = [...BASE_TREE_SPOTS, ...EXTRA_TREE_SPOTS, ...OUTER_TREE_SPOTS];
  const kept = [];
  let relocateIndex = 0;

  for (const [x, z] of raw) {
    if (isInOrNearLake(x, z)) {
      kept.push(spotBehindPond(relocateIndex++));
    } else {
      kept.push([x, z]);
    }
  }

  // Ensure relocated spots don't still collide (shouldn't) and aren't duplicated too tightly
  return kept;
}

export const TREE_SPOTS = buildTreeSpots();

export function getTreeScale(i) {
  return 0.8 + (i % 5) * 0.15;
}

/** Approx height of foliage top for bird landing */
export function getTreeTopY(scale) {
  return 4.5 * scale + 0.9 * scale;
}

/**
 * World-space perches birds can land on (trees, barn roof, fence posts).
 * Rebuilt once; birds pick randomly from this list.
 */
export function buildLandingSpots() {
  const spots = [];

  // Tree tops
  TREE_SPOTS.forEach(([x, z], i) => {
    const s = getTreeScale(i);
    spots.push({
      x,
      y: getTreeTopY(s),
      z,
      kind: "tree",
    });
  });

  // Barn roof ridge + a few eaves (BARN ~ W18 D12 H7 at origin)
  const barnRoofY = 10.2;
  spots.push(
    { x: 0, y: barnRoofY, z: 0, kind: "barn" },
    { x: -4, y: barnRoofY - 0.4, z: 1.5, kind: "barn" },
    { x: 4, y: barnRoofY - 0.4, z: -1.2, kind: "barn" },
    { x: -2, y: barnRoofY - 0.2, z: -2, kind: "barn" },
    { x: 3, y: barnRoofY - 0.3, z: 2.5, kind: "barn" },
    { x: 0, y: barnRoofY - 0.5, z: 3, kind: "barn" },
    { x: 0, y: barnRoofY - 0.5, z: -3, kind: "barn" }
  );

  // Fence posts / rails — pen to the right of barn
  const x0 = 9;
  const x1 = 9 + 21.6;
  const z0 = -6;
  const z1 = 6;
  const fenceY = 1.3;
  const posts = [];
  for (let x = x0; x <= x1 + 0.01; x += 2.4) {
    posts.push([x, z0], [x, z1]);
  }
  for (let z = z0; z <= z1 + 0.01; z += 2.4) {
    posts.push([x1, z]);
  }
  for (const [x, z] of posts) {
    spots.push({ x, y: fenceY, z, kind: "fence" });
  }

  return spots;
}

function Tree({ position, scale = 1 }) {
  const s = scale;
  return (
    <group position={position}>
      <mesh position={[0, 1.2 * s, 0]} castShadow>
        <cylinderGeometry args={[0.25 * s, 0.35 * s, 2.4 * s, 6]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
      <mesh position={[0, 3.2 * s, 0]} castShadow>
        <coneGeometry args={[1.8 * s, 3.5 * s, 7]} />
        <meshToonMaterial color={COLORS.foliage} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
      <mesh position={[0, 4.5 * s, 0]} castShadow>
        <coneGeometry args={[1.3 * s, 2.5 * s, 7]} />
        <meshToonMaterial color={COLORS.foliageDark} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
    </group>
  );
}

export function Trees() {
  const trees = useMemo(
    () =>
      TREE_SPOTS.map(([x, z], i) => ({
        key: i,
        position: [x, 0, z],
        scale: getTreeScale(i),
      })),
    []
  );

  return (
    <group>
      {trees.map(({ key, position, scale }) => (
        <Tree key={key} position={position} scale={scale} />
      ))}
    </group>
  );
}
