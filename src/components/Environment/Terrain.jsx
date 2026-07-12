import { useMemo } from "react";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";

/** Map half-extent roughly matches playable bounds (2× original) */
export const MAP_SIZE = 400;

/**
 * Sample a closed winding loop of centerline points (XZ).
 */
function sampleWindingLoop(baseRadius, pointCount) {
  const pts = [];
  for (let i = 0; i < pointCount; i++) {
    const a = (i / pointCount) * Math.PI * 2;
    const wind =
      22 * Math.sin(a * 2.3) +
      14 * Math.cos(a * 4.1) +
      8 * Math.sin(a * 6.7 + 0.8) +
      5 * Math.cos(a * 9.2);
    const r = baseRadius + wind;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0.08, Math.sin(a) * r));
  }
  return pts;
}

/**
 * Open path through waypoints (smooth Catmull-Rom samples).
 */
function sampleOpenPath(waypoints, samplesPerSeg = 12) {
  const curve = new THREE.CatmullRomCurve3(
    waypoints.map(([x, z]) => new THREE.Vector3(x, 0.08, z)),
    false,
    "catmullrom",
    0.35
  );
  const n = Math.max(8, (waypoints.length - 1) * samplesPerSeg);
  return curve.getPoints(n);
}

/**
 * Build a continuous flat dirt ribbon mesh from a polyline of center points.
 * Uses averaged side normals so corners join cleanly (no tile gaps).
 */
function buildRibbonGeometry(centerPts, halfWidth, closed) {
  const n = centerPts.length;
  if (n < 2) return null;

  const count = closed ? n : n;
  const positions = [];
  const normals = [];
  const indices = [];

  // Tangents / side vectors at each point
  const sides = [];
  for (let i = 0; i < count; i++) {
    let prev;
    let next;
    if (closed) {
      prev = centerPts[(i - 1 + n) % n];
      next = centerPts[(i + 1) % n];
    } else {
      prev = centerPts[Math.max(0, i - 1)];
      next = centerPts[Math.min(n - 1, i + 1)];
    }
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    // Perpendicular in XZ (left of travel direction)
    const sx = -tz / len;
    const sz = tx / len;
    sides.push({ x: sx, z: sz });
  }

  for (let i = 0; i < count; i++) {
    const p = centerPts[i];
    const s = sides[i];
    // Left edge
    positions.push(
      p.x + s.x * halfWidth,
      p.y,
      p.z + s.z * halfWidth
    );
    // Right edge
    positions.push(
      p.x - s.x * halfWidth,
      p.y,
      p.z - s.z * halfWidth
    );
    normals.push(0, 1, 0, 0, 1, 0);
  }

  const edgeCount = closed ? n : n - 1;
  for (let i = 0; i < edgeCount; i++) {
    const i0 = i * 2;
    const i1 = i0 + 1;
    const i2 = ((i + 1) % count) * 2;
    const i3 = i2 + 1;
    // Two triangles per quad
    indices.push(i0, i2, i1);
    indices.push(i1, i2, i3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

function DirtRibbon({ points, width = 7, closed = false }) {
  const geometry = useMemo(
    () => buildRibbonGeometry(points, width / 2, closed),
    [points, width, closed]
  );
  const material = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: COLORS.dirt,
        side: THREE.DoubleSide,
      }),
    []
  );

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

/** Slightly darker edge ribbon for a packed-earth border */
function DirtRibbonBorder({ points, width = 8.5, closed = false }) {
  const geometry = useMemo(
    () => buildRibbonGeometry(points, width / 2, closed),
    [points, width, closed]
  );
  const material = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: COLORS.dirtDark,
        side: THREE.DoubleSide,
      }),
    []
  );
  if (!geometry) return null;
  // Slightly lower so main path sits on top
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, -0.01, 0]}
      receiveShadow
    />
  );
}

function PathWithBorder({ points, width, closed }) {
  return (
    <group>
      <DirtRibbonBorder points={points} width={width + 1.8} closed={closed} />
      <DirtRibbon points={points} width={width} closed={closed} />
    </group>
  );
}

export function Terrain() {
  const { geometry, material } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1);
    geo.rotateX(-Math.PI / 2);

    const grad = document.createElement("canvas");
    grad.width = 2;
    grad.height = 1;
    const ctx = grad.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 2, 0);
    g.addColorStop(0, "#444");
    g.addColorStop(0.5, "#aaa");
    g.addColorStop(1, "#fff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 1);
    const gradientMap = new THREE.CanvasTexture(grad);
    gradientMap.minFilter = THREE.NearestFilter;

    const mat = new THREE.MeshToonMaterial({
      color: COLORS.grass,
      gradientMap,
    });

    return { geometry: geo, material: mat };
  }, []);

  const paths = useMemo(() => {
    const outer = sampleWindingLoop(115, 120);
    const inner = sampleWindingLoop(72, 96);
    const spur = sampleOpenPath(
      [
        [2, 12],
        [18, 22],
        [36, 34],
        [52, 48],
        [70, 55],
        // blend into outer loop vicinity
        [82, 62],
      ],
      14
    );
    const cabin = sampleOpenPath(
      [
        [0, 6],
        [-8, 8],
        [-16, 12],
        [-22, 14],
      ],
      10
    );
    // Connector from ranch yard onto outer trail (north-west arc)
    const ranchToOuter = sampleOpenPath(
      [
        [-4, -2],
        [-20, -18],
        [-40, -40],
        [-55, -55],
        [-70, -70],
      ],
      12
    );

    return [
      { points: outer, width: 7.5, closed: true },
      { points: inner, width: 6, closed: true },
      { points: spur, width: 6, closed: false },
      { points: cabin, width: 4.5, closed: false },
      { points: ranchToOuter, width: 5.5, closed: false },
    ];
  }, []);

  return (
    <group>
      <mesh geometry={geometry} material={material} receiveShadow />
      {paths.map((p, i) => (
        <PathWithBorder
          key={i}
          points={p.points}
          width={p.width}
          closed={p.closed}
        />
      ))}
    </group>
  );
}

export function Mountains() {
  return null;
}
