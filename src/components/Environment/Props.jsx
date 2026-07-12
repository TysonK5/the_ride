import { Outlines } from "@react-three/drei";
import { COLORS } from "../../materials/colors";

function Barrel({ position, rotation = 0 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.35, 0.4, 0.7, 8]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <torusGeometry args={[0.38, 0.04, 6, 12]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>
      <mesh position={[0, -0.15, 0]}>
        <torusGeometry args={[0.42, 0.04, 6, 12]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>
    </group>
  );
}

function HitchingPost({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 1, 6]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[0.6, 0.12, 0.12]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
    </group>
  );
}

export function Props() {
  return (
    <group>
      {/* Hitching posts by barn entrance */}
      <HitchingPost position={[-3, 0, 8]} />
      <HitchingPost position={[3, 0, 8]} />

      {/* Barrels near barn & cabin */}
      <Barrel position={[10, 0, 7]} />
      <Barrel position={[11, 0, 6.5]} rotation={0.5} />
      <Barrel position={[-20, 0, 17]} rotation={1.1} />
      <Barrel position={[-18.5, 0, 16.5]} rotation={0.3} />
    </group>
  );
}
