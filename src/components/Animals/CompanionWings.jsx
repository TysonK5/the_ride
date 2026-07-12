import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import { COLORS } from "../../materials/colors";

/**
 * Magical sproutable wings for cat / dog companions.
 * visible + flapping while following airborne unicorn; retract after land hold.
 */
export function CompanionWings({
  /** Mutable ref bool — true while wings should be out / flapping */
  activeRef = null,
  color = "#e8e0f0",
  colorTip = "#c0b0e8",
  scale = 1,
  /** Body-local attach point */
  position = [0, 0.12, -0.02],
}) {
  const leftRef = useRef();
  const rightRef = useRef();
  const rootRef = useRef();
  const growRef = useRef(0); // 0 hidden → 1 fully out

  useFrame((_, delta) => {
    const active = !!(activeRef?.current);
    const target = active ? 1 : 0;
    growRef.current += (target - growRef.current) * Math.min(1, delta * 6);
    const g = growRef.current;
    if (rootRef.current) {
      rootRef.current.scale.setScalar(Math.max(0.001, g * scale));
      rootRef.current.visible = g > 0.02;
    }
    if (g < 0.02) return;

    const t = performance.now() * 0.001;
    const flapSpeed = active ? 14 : 4;
    const amp = active ? 0.75 : 0.12;
    const flap = Math.sin(t * flapSpeed) * amp;
    const flap2 = Math.sin(t * flapSpeed + 0.4) * amp * 0.85;

    if (leftRef.current) {
      leftRef.current.rotation.z = 0.35 + flap;
      leftRef.current.rotation.y = -0.25 + flap * 0.15;
      leftRef.current.rotation.x = -0.1 + flap2 * 0.08;
    }
    if (rightRef.current) {
      rightRef.current.rotation.z = -0.35 - flap;
      rightRef.current.rotation.y = 0.25 - flap * 0.15;
      rightRef.current.rotation.x = -0.1 + flap2 * 0.08;
    }
  });

  const feather = (side) => (
    <group>
      {/* Upper wing sail */}
      <mesh position={[side * 0.14, 0.04, -0.02]} rotation={[0.15, side * 0.4, side * 0.2]} castShadow>
        <sphereGeometry args={[0.12, 6, 5]} />
        <meshToonMaterial color={color} />
        <Outlines color={COLORS.outline} thickness={0.5} />
      </mesh>
      <mesh
        position={[side * 0.26, 0.02, -0.04]}
        rotation={[0.1, side * 0.55, side * 0.15]}
        scale={[1.15, 0.45, 0.7]}
        castShadow
      >
        <sphereGeometry args={[0.11, 6, 5]} />
        <meshToonMaterial color={colorTip} />
      </mesh>
      {/* Outer tip */}
      <mesh
        position={[side * 0.38, -0.02, -0.06]}
        rotation={[0.05, side * 0.7, side * 0.1]}
        scale={[0.9, 0.35, 0.55]}
        castShadow
      >
        <sphereGeometry args={[0.09, 5, 4]} />
        <meshToonMaterial color={color} />
      </mesh>
      {/* Lower feathers */}
      <mesh
        position={[side * 0.18, -0.06, -0.01]}
        rotation={[0.35, side * 0.3, side * 0.25]}
        scale={[0.85, 0.4, 0.6]}
        castShadow
      >
        <sphereGeometry args={[0.08, 5, 4]} />
        <meshToonMaterial color={colorTip} />
      </mesh>
    </group>
  );

  return (
    <group ref={rootRef} position={position} visible={false}>
      <group ref={leftRef}>{feather(-1)}</group>
      <group ref={rightRef}>{feather(1)}</group>
    </group>
  );
}

/** Seconds wings stay after unicorn lands before retracting */
export const WING_RETRACT_DELAY = 5;
/** Fly follow speeds */
export const FLY_FOLLOW_SPEED = 14;
export const FLY_CATCH_UP = 22;
