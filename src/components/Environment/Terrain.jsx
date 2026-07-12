import { useMemo } from "react";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";
import { loadPaths } from "../../systems/paths";
import { MAP_SIZE } from "../../systems/map";
import { MapBorders } from "./MapBorders";

export { MAP_SIZE };

/**
 * Smooth Catmull-Rom samples from editable [x,z] waypoints.
 */
function samplePathPoints(waypoints, closed, samplesPerSeg = 12) {
  if (!waypoints || waypoints.length < 2) return [];
  const curve = new THREE.CatmullRomCurve3(
    waypoints.map(([x, z]) => new THREE.Vector3(x, 0.08, z)),
    !!closed,
    "catmullrom",
    0.35
  );
  const segs = closed
    ? Math.max(waypoints.length, 3)
    : Math.max(waypoints.length - 1, 1);
  const n = Math.max(8, segs * samplesPerSeg);
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
    const sx = -tz / len;
    const sz = tx / len;
    sides.push({ x: sx, z: sz });
  }

  for (let i = 0; i < count; i++) {
    const p = centerPts[i];
    const s = sides[i];
    positions.push(p.x + s.x * halfWidth, p.y, p.z + s.z * halfWidth);
    positions.push(p.x - s.x * halfWidth, p.y, p.z - s.z * halfWidth);
    normals.push(0, 1, 0, 0, 1, 0);
  }

  const edgeCount = closed ? n : n - 1;
  for (let i = 0; i < edgeCount; i++) {
    const i0 = i * 2;
    const i1 = i0 + 1;
    const i2 = ((i + 1) % count) * 2;
    const i3 = i2 + 1;
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

/**
 * @param {{ pathDefs?: import('../../systems/paths').DEFAULT_PATHS }} props
 * pathDefs: editable path list from Map Editor (falls back to localStorage defaults)
 */
export function Terrain({ pathDefs }) {
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

  const defs = pathDefs ?? loadPaths();

  const paths = useMemo(() => {
    return defs.map((p) => ({
      id: p.id,
      width: p.width,
      closed: !!p.closed,
      points: samplePathPoints(p.waypoints, p.closed, p.closed ? 10 : 12),
    }));
  }, [defs]);

  return (
    <group>
      <mesh geometry={geometry} material={material} receiveShadow />
      {paths.map((p) => (
        <PathWithBorder
          key={p.id}
          points={p.points}
          width={p.width}
          closed={p.closed}
        />
      ))}
    </group>
  );
}

/** World border: forest belt + cliffs (was empty placeholder) */
export function Mountains() {
  return <MapBorders />;
}
