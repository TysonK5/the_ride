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

function FenceSection({ position, rotation = 0, length = 4 }) {
  const posts = Math.floor(length / 1.2);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {Array.from({ length: posts + 1 }).map((_, i) => (
        <mesh key={i} position={[i * 1.2 - length / 2, 0.5, 0]} castShadow>
          <boxGeometry args={[0.12, 1, 0.12]} />
          <meshToonMaterial color={COLORS.woodLight} />
          <Outlines color={COLORS.outline} thickness={1} />
        </mesh>
      ))}
      {[0.3, 0.7].map((y, j) => (
        <mesh key={j} position={[0, y, 0]} castShadow>
          <boxGeometry args={[length, 0.08, 0.08]} />
          <meshToonMaterial color={COLORS.wood} />
        </mesh>
      ))}
    </group>
  );
}

function WaterTower({ position }) {
  return (
    <group position={position}>
      {[0, 1.2, 2.4].map((y, i) => (
        <group key={i} position={[0, y, 0]}>
          {[
            [-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2],
          ].map(([x, z], j) => (
            <mesh key={j} position={[x, 1.5, z]} castShadow>
              <boxGeometry args={[0.15, 3, 0.15]} />
              <meshToonMaterial color={COLORS.woodDark} />
              <Outlines color={COLORS.outline} thickness={1} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 5.5, 0]} castShadow>
        <cylinderGeometry args={[2.2, 2.2, 2.5, 12]} />
        <meshToonMaterial color={COLORS.rust} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      <mesh position={[0, 6.8, 0]} castShadow>
        <coneGeometry args={[2.5, 1.2, 12]} />
        <meshToonMaterial color={COLORS.roof} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
    </group>
  );
}

function TrainTracks({ position, length = 60 }) {
  const ties = Math.floor(length / 1.5);
  return (
    <group position={position}>
      {Array.from({ length: ties }).map((_, i) => (
        <mesh key={i} position={[0, 0.05, i * 1.5 - length / 2]} receiveShadow>
          <boxGeometry args={[3.5, 0.12, 0.4]} />
          <meshToonMaterial color={COLORS.woodDark} />
        </mesh>
      ))}
      {[-0.6, 0.6].map((x, i) => (
        <mesh key={i} position={[x, 0.15, 0]} receiveShadow>
          <boxGeometry args={[0.08, 0.08, length]} />
          <meshToonMaterial color={COLORS.train} />
        </mesh>
      ))}
    </group>
  );
}

function LampPost({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 3, 6]} />
        <meshToonMaterial color={COLORS.stoneDark} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0, 3.2, 0]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshToonMaterial color={COLORS.gold} emissive={COLORS.gold} emissiveIntensity={0.3} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <pointLight position={[0, 3.2, 0]} intensity={0.4} distance={8} color="#ffd080" />
    </group>
  );
}

export function Props() {
  return (
    <group>
      <WaterTower position={[-8, 0, 5]} />

      <TrainTracks position={[0, 0, 42]} length={70} />

      {/* Cattle pen fences */}
      <FenceSection position={[-30, 0, 2]} rotation={0} length={12} />
      <FenceSection position={[-24, 0, -4]} rotation={Math.PI / 2} length={8} />
      <FenceSection position={[-30, 0, -4]} rotation={Math.PI / 2} length={8} />
      <FenceSection position={[-36, 0, 2]} rotation={0} length={12} />

      {/* Main street props */}
      <HitchingPost position={[-3, 0, -4]} />
      <HitchingPost position={[5, 0, -4]} />
      <HitchingPost position={[12, 0, -4]} />
      <Barrel position={[-2, 0, -3]} />
      <Barrel position={[6.5, 0, -2.5]} rotation={0.5} />
      <Barrel position={[14, 0, -3]} rotation={1.2} />
      <Barrel position={[-16, 0, -8]} />
      <Barrel position={[18, 0, 6]} />

      <LampPost position={[-6, 0, -2]} />
      <LampPost position={[10, 0, -2]} />
      <LampPost position={[0, 0, 12]} />
    </group>
  );
}
