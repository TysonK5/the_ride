import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";
import { LAKE, isNearShore } from "../../systems/colliders";

export const FISHING_RANGE = 5.5;
export const TARGET_SPEED = 14;
export const CAST_DURATION = 0.55;
export const REEL_DURATION = 1.1;
export const CATCH_SHOW = 2.2;

export const FISH_TYPES = [
  { name: "Bluegill", color: "#5a9fd4", size: 0.75 },
  { name: "Largemouth Bass", color: "#6a8a40", size: 1.05 },
  { name: "Rainbow Trout", color: "#e8a0a8", size: 0.95 },
  { name: "Catfish", color: "#6a5a48", size: 1.15 },
  { name: "Perch", color: "#d4a020", size: 0.7 },
  { name: "Sunfish", color: "#e8a030", size: 0.65 },
];

export function createFishingState() {
  return {
    active: false,
    /** 'aim' | 'cast' | 'wait' | 'bite' | 'reel' | 'catch' */
    phase: null,
    targetX: 0,
    targetZ: 0,
    bobberX: 0,
    bobberZ: 0,
    bobberY: 0.2,
    castFromX: 0,
    castFromZ: 0,
    castFromY: 1.4,
    phaseT: 0,
    waitDuration: 2,
    fish: null,
    /** Message shown briefly after catch */
    resultText: "",
  };
}

export function canFishHere(x, z, mounted, holdingFlower, busy) {
  return !mounted && !holdingFlower && !busy && isNearShore(x, z, FISHING_RANGE);
}

/** Keep aim target on the water surface (inside lake ellipse). */
export function clampTargetToLake(x, z, margin = 0.82) {
  const rx = LAKE.rx * margin;
  const rz = LAKE.rz * margin;
  const nx = (x - LAKE.x) / rx;
  const nz = (z - LAKE.z) / rz;
  const d = Math.hypot(nx, nz);
  if (d <= 1 || d < 1e-6) return { x, z };
  return {
    x: LAKE.x + (nx / d) * rx,
    z: LAKE.z + (nz / d) * rz,
  };
}

/** Place initial target from shore toward lake center. */
export function defaultTargetFromShore(px, pz) {
  const dx = LAKE.x - px;
  const dz = LAKE.z - pz;
  const len = Math.hypot(dx, dz) || 1;
  const dist = 10 + Math.min(8, len * 0.15);
  return clampTargetToLake(px + (dx / len) * dist, pz + (dz / len) * dist);
}

export function pickRandomFish() {
  return FISH_TYPES[Math.floor(Math.random() * FISH_TYPES.length)];
}

/**
 * Fishing rod held in the right hand (parent under rightArmRef hand).
 * Tip points outward for the cast line.
 */
export function FishingPole() {
  return (
    <group
      position={[0.02, -0.02, 0.04]}
      rotation={[-0.35, 0.15, -0.55]}
    >
      {/* Grip */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.022, 0.14, 6]} />
        <meshToonMaterial color="#3a2818" />
      </mesh>
      {/* Shaft */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.018, 0.95, 6]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={0.6} />
      </mesh>
      {/* Tip */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.006, 0.012, 0.18, 5]} />
        <meshToonMaterial color="#c8b090" />
      </mesh>
      {/* Eyelet */}
      <mesh position={[0, 1.12, 0.02]}>
        <torusGeometry args={[0.02, 0.005, 4, 8]} />
        <meshToonMaterial color={COLORS.gold} />
      </mesh>
    </group>
  );
}

/**
 * World-space aim ring, bobber, and fishing line.
 * Reads mutable fishing state each frame.
 */
export function FishingWorldFX({ fishingRef, playerGroupRef }) {
  const targetRef = useRef();
  const bobberRef = useRef();
  const lineRef = useRef();
  const fishRef = useRef();
  const _a = useRef(new THREE.Vector3()).current;
  const _b = useRef(new THREE.Vector3()).current;
  const _mid = useRef(new THREE.Vector3()).current;

  useFrame(() => {
    const f = fishingRef?.current;
    if (!f?.active) {
      if (targetRef.current) targetRef.current.visible = false;
      if (bobberRef.current) bobberRef.current.visible = false;
      if (lineRef.current) lineRef.current.visible = false;
      if (fishRef.current) fishRef.current.visible = false;
      return;
    }

    // Aim target (only while aiming / waiting / bite — shows cast spot)
    if (targetRef.current) {
      const showTarget = f.phase === "aim";
      targetRef.current.visible = showTarget;
      if (showTarget) {
        targetRef.current.position.set(f.targetX, 0.14, f.targetZ);
        const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.08;
        targetRef.current.scale.setScalar(pulse);
      }
    }

    // Bobber
    if (bobberRef.current) {
      const showBob =
        f.phase === "cast" ||
        f.phase === "wait" ||
        f.phase === "bite" ||
        f.phase === "reel";
      bobberRef.current.visible = showBob;
      if (showBob) {
        bobberRef.current.position.set(f.bobberX, f.bobberY, f.bobberZ);
        if (f.phase === "bite") {
          bobberRef.current.position.y =
            f.bobberY - 0.08 + Math.sin(performance.now() * 0.02) * 0.12;
        }
      }
    }

    // Line from pole tip (approx right hand world) to bobber
    if (lineRef.current && playerGroupRef?.current) {
      const showLine =
        f.phase === "cast" ||
        f.phase === "wait" ||
        f.phase === "bite" ||
        f.phase === "reel";
      lineRef.current.visible = showLine;
      if (showLine) {
        // Approximate pole tip in front of player
        const g = playerGroupRef.current;
        const yaw = g.rotation.y;
        const tipX = g.position.x + Math.sin(yaw) * 0.35 + Math.cos(yaw) * 0.55;
        const tipY = g.position.y + 1.85;
        const tipZ = g.position.z + Math.cos(yaw) * 0.35 - Math.sin(yaw) * 0.55;
        _a.set(tipX, tipY, tipZ);
        _b.set(f.bobberX, f.bobberY, f.bobberZ);
        _mid.addVectors(_a, _b).multiplyScalar(0.5);
        // Sag the line slightly
        _mid.y -= Math.min(1.2, _a.distanceTo(_b) * 0.12);
        const dist = _a.distanceTo(_b);
        lineRef.current.position.copy(_mid);
        lineRef.current.scale.set(1, 1, dist);
        lineRef.current.lookAt(_b);
      }
    }

    // Caught fish flash near player
    if (fishRef.current && playerGroupRef?.current) {
      const show = f.phase === "catch" && f.fish;
      fishRef.current.visible = !!show;
      if (show) {
        const g = playerGroupRef.current;
        const yaw = g.rotation.y;
        fishRef.current.position.set(
          g.position.x + Math.sin(yaw) * 0.45,
          1.2 + Math.sin(f.phaseT * 6) * 0.05,
          g.position.z + Math.cos(yaw) * 0.45
        );
        fishRef.current.rotation.y = yaw + Math.PI / 2;
        const s = (f.fish.size || 1) * 0.9;
        fishRef.current.scale.setScalar(s);
      }
    }
  });

  return (
    <group userData={{ ignoreCameraCollision: true }}>
      {/* Aim target — ring on water */}
      <group ref={targetRef} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.85, 24]} />
          <meshToonMaterial
            color="#f0c040"
            transparent
            opacity={0.85}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.08, 0.18, 12]} />
          <meshToonMaterial
            color="#ffffff"
            transparent
            opacity={0.9}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Bobber */}
      <group ref={bobberRef} visible={false}>
        <mesh castShadow>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshToonMaterial color="#d43030" />
          <Outlines color={COLORS.outline} thickness={0.8} />
        </mesh>
        <mesh position={[0, 0.08, 0]}>
          <sphereGeometry args={[0.07, 6, 5]} />
          <meshToonMaterial color="#f5f0e8" />
        </mesh>
      </group>

      {/* Simple line (scaled stick) */}
      <mesh ref={lineRef} visible={false}>
        <cylinderGeometry args={[0.008, 0.008, 1, 4]} />
        <meshBasicMaterial color="#e8e0d0" />
      </mesh>

      {/* Catch display fish */}
      <group ref={fishRef} visible={false}>
        <CatchFishMesh fishingRef={fishingRef} />
      </group>
    </group>
  );
}

function CatchFishMesh({ fishingRef }) {
  const matRef = useRef();
  useFrame(() => {
    const fish = fishingRef?.current?.fish;
    if (matRef.current && fish) {
      matRef.current.color.set(fish.color || "#5a9fd4");
    }
  });
  return (
    <>
      <mesh castShadow>
        <sphereGeometry args={[0.16, 6, 5]} />
        <meshToonMaterial ref={matRef} color="#5a9fd4" />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0, 0, -0.2]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.1, 0.18, 4]} />
        <meshToonMaterial color="#4a80b0" />
      </mesh>
    </>
  );
}

/** Apply locked fishing body pose (pole arm raised). */
export function applyFishingPose(bodyRef, leftArmRef, rightArmRef, phase) {
  if (bodyRef?.current) {
    bodyRef.current.position.y = 0.94;
    bodyRef.current.rotation.x = phase === "cast" || phase === "reel" ? 0.08 : 0.04;
  }
  // Left arm brace / idle
  if (leftArmRef?.current) {
    leftArmRef.current.rotation.set(-0.25, 0.15, 0.25);
  }
  // Right arm holds pole forward-up
  if (rightArmRef?.current) {
    if (phase === "cast") {
      rightArmRef.current.rotation.set(-1.35, -0.2, -0.35);
    } else if (phase === "reel") {
      rightArmRef.current.rotation.set(
        -0.9 + Math.sin(performance.now() * 0.02) * 0.15,
        -0.25,
        -0.4
      );
    } else {
      rightArmRef.current.rotation.set(-1.05, -0.15, -0.3);
    }
  }
}

