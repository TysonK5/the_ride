import { useMemo } from "react";
import { Outlines } from "@react-three/drei";
import { COLORS } from "../../materials/colors";
import {
  FOREST_INNER,
  FOREST_OUTER,
  CLIFF_INNER,
  CLIFF_OUTER,
} from "../../systems/map";
import { isNearRidingPath, loadPaths } from "../../systems/paths";
import { isInCabinHomestead } from "../Town/Buildings";

function rand(i, salt = 0) {
  const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Pine / fir silhouette for the border forest */
function BorderPine({ position, scale = 1, dark = false }) {
  const s = scale;
  const leaf = dark ? COLORS.foliageDark : COLORS.foliage;
  return (
    <group position={position}>
      <mesh position={[0, 1.4 * s, 0]} castShadow>
        <cylinderGeometry args={[0.22 * s, 0.38 * s, 2.8 * s, 6]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>
      <mesh position={[0, 3.4 * s, 0]} castShadow>
        <coneGeometry args={[2.0 * s, 3.2 * s, 7]} />
        <meshToonMaterial color={leaf} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0, 5.0 * s, 0]} castShadow>
        <coneGeometry args={[1.5 * s, 2.6 * s, 7]} />
        <meshToonMaterial color={COLORS.foliageDark} />
      </mesh>
      <mesh position={[0, 6.3 * s, 0]} castShadow>
        <coneGeometry args={[0.95 * s, 1.8 * s, 6]} />
        <meshToonMaterial color={leaf} />
      </mesh>
    </group>
  );
}

/** Broadleaf clump for variety in the belt */
function BorderOak({ position, scale = 1 }) {
  const s = scale;
  return (
    <group position={position}>
      <mesh position={[0, 1.1 * s, 0]} castShadow>
        <cylinderGeometry args={[0.28 * s, 0.4 * s, 2.2 * s, 6]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
      <mesh position={[0, 3.2 * s, 0]} castShadow>
        <sphereGeometry args={[2.1 * s, 7, 6]} />
        <meshToonMaterial color={COLORS.foliage} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0.9 * s, 3.0 * s, 0.5 * s]} castShadow>
        <sphereGeometry args={[1.2 * s, 6, 5]} />
        <meshToonMaterial color={COLORS.foliageDark} />
      </mesh>
    </group>
  );
}

/** Low-poly rock / cliff slab */
function CliffRock({ position, scale = 1, rotY = 0, tall = false }) {
  const s = scale;
  const h = tall ? 18 * s : 10 * s;
  const w = tall ? 14 * s : 9 * s;
  const d = tall ? 10 * s : 7 * s;
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, h * 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshToonMaterial color={COLORS.mountain} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
      {/* Jagged top */}
      <mesh position={[w * 0.15, h * 0.92, d * 0.1]} castShadow>
        <boxGeometry args={[w * 0.55, h * 0.35, d * 0.55]} />
        <meshToonMaterial color={COLORS.mountainSnow} />
      </mesh>
      <mesh
        position={[-w * 0.2, h * 0.85, -d * 0.15]}
        rotation={[0, 0.4, 0.1]}
        castShadow
      >
        <boxGeometry args={[w * 0.4, h * 0.28, d * 0.4]} />
        <meshToonMaterial color={COLORS.mountain} />
      </mesh>
      {/* Base rubble */}
      <mesh position={[w * 0.35, 0.6 * s, d * 0.3]} castShadow>
        <boxGeometry args={[2.5 * s, 1.4 * s, 2.2 * s]} />
        <meshToonMaterial color={COLORS.stoneDark} />
      </mesh>
      <mesh position={[-w * 0.3, 0.45 * s, -d * 0.25]} castShadow>
        <boxGeometry args={[2.0 * s, 1.1 * s, 1.8 * s]} />
        <meshToonMaterial color={COLORS.stone} />
      </mesh>
    </group>
  );
}

/**
 * Forest belt + cliff ring framing the expanded ranch.
 * Sits mostly outside PLAY_HALF so it reads as a world border.
 */
export function MapBorders() {
  const forest = useMemo(() => {
    const paths = loadPaths();
    const trees = [];
    const count = 220;

    const tryAdd = (id, x, z, scale, kind, dark) => {
      // Keep border forest off dirt trails and cabin yard
      if (isNearRidingPath(x, z, paths) || isInCabinHomestead(x, z, 4)) {
        const len = Math.hypot(x, z) || 1;
        const push = 16;
        x = x + (x / len) * push;
        z = z + (z / len) * push;
        if (isNearRidingPath(x, z, paths) || isInCabinHomestead(x, z, 4)) {
          return;
        }
      }
      trees.push({ id, x, z, scale, kind, dark });
    };

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(i, 1) * 0.12;
      const band = rand(i, 2);
      const r =
        FOREST_INNER +
        band * band * (FOREST_OUTER - FOREST_INNER) +
        (rand(i, 3) - 0.5) * 12;
      const x = Math.cos(a) * r + (rand(i, 4) - 0.5) * 8;
      const z = Math.sin(a) * r + (rand(i, 5) - 0.5) * 8;
      const gap = Math.abs(Math.sin(a * 2 + 0.3));
      if (gap < 0.08 && r < FOREST_INNER + 25) continue;

      tryAdd(
        i,
        x,
        z,
        1.1 + rand(i, 6) * 1.4,
        rand(i, 7) > 0.35 ? "pine" : "oak",
        rand(i, 8) > 0.55
      );
    }
    const clumps = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [0.7, 0.7],
      [-0.7, 0.7],
      [0.7, -0.7],
      [-0.7, -0.7],
    ];
    let k = 0;
    for (const [cx, cz] of clumps) {
      for (let j = 0; j < 18; j++) {
        const a = rand(k, 10) * Math.PI * 2;
        const rr = 12 + rand(k, 11) * 28;
        const baseR = (FOREST_INNER + FOREST_OUTER) * 0.55;
        const x = cx * baseR + Math.cos(a) * rr;
        const z = cz * baseR + Math.sin(a) * rr;
        tryAdd(
          `c-${k}`,
          x,
          z,
          1.3 + rand(k, 12) * 1.6,
          rand(k, 13) > 0.4 ? "pine" : "oak",
          true
        );
        k++;
      }
    }
    return trees;
  }, []);

  const cliffs = useMemo(() => {
    const rocks = [];
    const count = 36;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(i, 20) * 0.15;
      const r =
        CLIFF_INNER +
        rand(i, 21) * (CLIFF_OUTER - CLIFF_INNER) * 0.7 +
        (i % 3) * 6;
      rocks.push({
        id: i,
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        scale: 0.85 + rand(i, 22) * 0.9,
        rotY: a + Math.PI / 2 + (rand(i, 23) - 0.5) * 0.5,
        tall: rand(i, 24) > 0.45,
      });
    }
    // Corner mesas for silhouette
    const corners = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    corners.forEach(([cx, cz], i) => {
      const r = CLIFF_OUTER - 20;
      rocks.push({
        id: `mesa-${i}`,
        x: cx * r * 0.72,
        z: cz * r * 0.72,
        scale: 1.4 + i * 0.1,
        rotY: Math.atan2(cx, cz),
        tall: true,
      });
    });
    return rocks;
  }, []);

  // Distant dark ground ring so the grass edge doesn't look clipped
  const rimSize = CLIFF_OUTER * 2 + 40;

  return (
    <group userData={{ ignoreCameraCollision: true }}>
      {/* Outer dirt/rock apron beyond grass plane */}
      <mesh
        position={[0, -0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <ringGeometry args={[FOREST_INNER - 5, rimSize / 2, 64]} />
        <meshToonMaterial color="#5a7a3a" />
      </mesh>
      <mesh
        position={[0, -0.04, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <ringGeometry args={[CLIFF_INNER - 10, rimSize / 2 + 20, 48]} />
        <meshToonMaterial color="#6a6a70" />
      </mesh>

      {/* Border forest */}
      {forest.map((t) =>
        t.kind === "pine" ? (
          <BorderPine
            key={t.id}
            position={[t.x, 0, t.z]}
            scale={t.scale}
            dark={t.dark}
          />
        ) : (
          <BorderOak key={t.id} position={[t.x, 0, t.z]} scale={t.scale} />
        )
      )}

      {/* Cliff / mesa ring */}
      {cliffs.map((c) => (
        <CliffRock
          key={c.id}
          position={[c.x, 0, c.z]}
          scale={c.scale}
          rotY={c.rotY}
          tall={c.tall}
        />
      ))}
    </group>
  );
}
