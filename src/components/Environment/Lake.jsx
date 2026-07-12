import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import { COLORS } from "../../materials/colors";
import { LAKE } from "../../systems/colliders";

const FISH_COLORS = ["#e8a030", "#d4553a", "#f0c040", "#5a9fd4"];

function Fish({ color, seed }) {
  const ref = useRef();
  const phase = useMemo(
    () => ({
      a: 0.35 + (seed % 7) * 0.08,
      b: 0.28 + (seed % 5) * 0.06,
      speed: 0.35 + (seed % 4) * 0.12,
      offset: seed * 1.7,
      depth: 0.15 + (seed % 3) * 0.08,
      wiggle: 4 + (seed % 3),
    }),
    [seed]
  );

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * phase.speed + phase.offset;
    const lx = Math.cos(t) * LAKE.rx * phase.a;
    const lz = Math.sin(t * 0.85 + 0.4) * LAKE.rz * phase.b;
    const x = LAKE.x + lx;
    const z = LAKE.z + lz;
    const y = 0.18 + Math.sin(t * 2.2) * 0.05;

    const dx = -Math.sin(t) * LAKE.rx * phase.a;
    const dz = Math.cos(t * 0.85 + 0.4) * LAKE.rz * phase.b * 0.85;
    const yaw = Math.atan2(dx, dz);

    ref.current.position.set(x, y, z);
    ref.current.rotation.y = yaw;
    ref.current.rotation.z = Math.sin(t * phase.wiggle) * 0.15;
  });

  return (
    <group ref={ref}>
      <mesh castShadow>
        <sphereGeometry args={[0.18, 6, 5]} />
        <meshToonMaterial color={color} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0, 0, -0.22]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.12, 0.2, 4]} />
        <meshToonMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <coneGeometry args={[0.06, 0.14, 3]} />
        <meshToonMaterial color={color} />
      </mesh>
      <mesh position={[0.08, 0.04, 0.12]}>
        <sphereGeometry args={[0.03, 4, 4]} />
        <meshToonMaterial color="#1a1a1a" />
      </mesh>
    </group>
  );
}

export function Lake() {
  return (
    <group>
      {/* Dirt shore */}
      <mesh
        position={[LAKE.x, 0.03, LAKE.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[LAKE.rx + 2.2, LAKE.rz + 2.2, 1]}
        receiveShadow
      >
        <circleGeometry args={[1, 48]} />
        <meshToonMaterial color={COLORS.dirt} />
      </mesh>

      {/* Darker bank ring */}
      <mesh
        position={[LAKE.x, 0.05, LAKE.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[LAKE.rx + 0.8, LAKE.rz + 0.8, 1]}
        receiveShadow
      >
        <circleGeometry args={[1, 48]} />
        <meshToonMaterial color={COLORS.dirtDark} />
      </mesh>

      {/* Water surface */}
      <mesh
        position={[LAKE.x, 0.12, LAKE.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[LAKE.rx, LAKE.rz, 1]}
        receiveShadow
      >
        <circleGeometry args={[1, 48]} />
        <meshToonMaterial
          color={COLORS.water}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Soft highlight */}
      <mesh
        position={[LAKE.x, 0.14, LAKE.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[LAKE.rx * 0.5, LAKE.rz * 0.5, 1]}
      >
        <circleGeometry args={[1, 32]} />
        <meshToonMaterial color="#7ec8e8" transparent opacity={0.28} />
      </mesh>

      {[0, 1, 2, 3].map((i) => (
        <Fish key={i} color={FISH_COLORS[i]} seed={i * 13 + 7} />
      ))}
    </group>
  );
}
