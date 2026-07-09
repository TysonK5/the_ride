import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";

const MOVE_SPEED = 8;
const MOUSE_SENSITIVITY = 0.002;
const CAMERA_DISTANCE = 6;
const CAMERA_HEIGHT = 2.5;

export const Player = forwardRef(function Player({ enabled }, ref) {
  const groupRef = useRef();
  const yawRef = useRef(0);
  const pitchRef = useRef(-0.15);
  const keysRef = useRef({});
  const { camera } = useThree();

  useImperativeHandle(ref, () => ({
    getPosition: () => groupRef.current?.position ?? new THREE.Vector3(0, 0, 8),
  }));

  useEffect(() => {
    const onKeyDown = (e) => {
      keysRef.current[e.code] = true;
    };
    const onKeyUp = (e) => {
      keysRef.current[e.code] = false;
    };
    const onMouseMove = (e) => {
      if (!enabled) return;
      yawRef.current -= e.movementX * MOUSE_SENSITIVITY;
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current - e.movementY * MOUSE_SENSITIVITY,
        -0.6,
        0.4
      );
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [enabled]);

  useFrame((_, delta) => {
    if (!groupRef.current || !enabled) return;

    const keys = keysRef.current;
    const forward = new THREE.Vector3(
      -Math.sin(yawRef.current),
      0,
      -Math.cos(yawRef.current)
    );
    const right = new THREE.Vector3(
      Math.cos(yawRef.current),
      0,
      -Math.sin(yawRef.current)
    );

    const move = new THREE.Vector3();
    if (keys.KeyW || keys.ArrowUp) move.add(forward);
    if (keys.KeyS || keys.ArrowDown) move.sub(forward);
    if (keys.KeyD || keys.ArrowRight) move.add(right);
    if (keys.KeyA || keys.ArrowLeft) move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED * delta);
      groupRef.current.position.add(move);
      groupRef.current.rotation.y = Math.atan2(move.x, move.z);
    }

    // Keep player in bounds
    groupRef.current.position.x = THREE.MathUtils.clamp(
      groupRef.current.position.x,
      -55,
      55
    );
    groupRef.current.position.z = THREE.MathUtils.clamp(
      groupRef.current.position.z,
      -45,
      50
    );
    groupRef.current.position.y = 0;

    // Third-person camera
    const camOffset = new THREE.Vector3(
      Math.sin(yawRef.current) * CAMERA_DISTANCE,
      CAMERA_HEIGHT + Math.sin(pitchRef.current) * 2,
      Math.cos(yawRef.current) * CAMERA_DISTANCE
    );
    const target = groupRef.current.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    camera.position.copy(target).add(camOffset);
    camera.lookAt(target);
  });

  return (
    <group ref={groupRef} position={[0, 0, 8]}>
      {/* Cowboy character — stylized low-poly */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.35, 0.8, 4, 8]} />
        <meshToonMaterial color="#3a5a8a" />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      <mesh position={[0, 1.85, 0]} castShadow>
        <sphereGeometry args={[0.32, 8, 8]} />
        <meshToonMaterial color="#d4a574" />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      <mesh position={[0, 2.15, 0]} castShadow>
        <cylinderGeometry args={[0.38, 0.38, 0.15, 8]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
    </group>
  );
});
