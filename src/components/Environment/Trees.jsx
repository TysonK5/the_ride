import { useMemo } from "react";
import { Outlines } from "@react-three/drei";
import { COLORS } from "../../materials/colors";

const TREE_SPOTS = [
  [-45, -25], [-38, -18], [-42, 15], [-35, 22], [42, -20], [38, 18],
  [48, 5], [-48, -8], [30, 28], [-28, -28], [55, -12], [-55, 12],
  [20, -35], [-15, 35], [50, 25], [-50, -30], [12, 30], [-22, -35],
];

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
        scale: 0.8 + (i % 5) * 0.15,
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
