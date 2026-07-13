import { useRef, useMemo } from "react";
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

const LINE_SEGMENTS = 28;

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
    /** True when fishing from the dock chair (seated pose) */
    seated: false,
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
 * Fishing rod in the right hand — vertical shaft (tip up) when the arm is raised.
 * Hand sits under the arm; arm local −Y points up when raised, so we flip the
 * pole so its +Y (shaft) runs the same way (world vertical).
 * tipRef marks the line attachment at the tip.
 */
export function FishingPole({ tipRef }) {
  // π on X: pole +Y aligns with hand −Y → tip above head when arm is up
  // small extra tilt keeps tip slightly forward over the water
  return (
    <group position={[0.0, 0.0, 0.02]} rotation={[Math.PI - 0.12, 0.08, 0.05]}>
      {/* Grip / butt in palm */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.026, 0.16, 6]} />
        <meshToonMaterial color="#3a2818" />
      </mesh>
      {/* Lower cork section */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.02, 0.22, 6]} />
        <meshToonMaterial color="#8a6040" />
      </mesh>
      {/* Long vertical shaft */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.008, 0.016, 1.35, 6]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={0.55} />
      </mesh>
      {/* Upper tip section */}
      <mesh position={[0, 1.72, 0]} castShadow>
        <cylinderGeometry args={[0.004, 0.008, 0.28, 5]} />
        <meshToonMaterial color="#d4c4a0" />
      </mesh>
      {/* Tip eyelet — line attaches here */}
      <mesh position={[0, 1.88, 0.015]}>
        <torusGeometry args={[0.018, 0.004, 4, 8]} />
        <meshToonMaterial color={COLORS.gold} />
      </mesh>
      {/* Invisible tip anchor for the fishing line */}
      <group ref={tipRef} position={[0, 1.9, 0]} />
    </group>
  );
}

/**
 * World-space aim ring, bobber, and curved fishing line tip → bobber.
 */
export function FishingWorldFX({ fishingRef, playerGroupRef, poleTipRef }) {
  const targetRef = useRef();
  const bobberRef = useRef();
  const fishRef = useRef();
  const lineObjRef = useRef();
  const _tip = useRef(new THREE.Vector3()).current;
  const _bob = useRef(new THREE.Vector3()).current;
  const _mid = useRef(new THREE.Vector3()).current;
  const _ctrl = useRef(new THREE.Vector3()).current;
  const _tmp = useRef(new THREE.Vector3()).current;

  const { line, positions } = useMemo(() => {
    const positions = new Float32Array((LINE_SEGMENTS + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    const mat = new THREE.LineBasicMaterial({
      color: 0xf2ebe0,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    return { line, positions };
  }, []);

  useFrame(() => {
    const f = fishingRef?.current;
    if (!f?.active) {
      if (targetRef.current) targetRef.current.visible = false;
      if (bobberRef.current) bobberRef.current.visible = false;
      if (line) line.visible = false;
      if (fishRef.current) fishRef.current.visible = false;
      return;
    }

    // Aim target
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
        let by = f.bobberY;
        if (f.phase === "wait") {
          // Gentle float on water
          by = f.bobberY + Math.sin(performance.now() * 0.004) * 0.03;
        } else if (f.phase === "bite") {
          by =
            f.bobberY - 0.08 + Math.sin(performance.now() * 0.02) * 0.12;
        }
        bobberRef.current.position.set(f.bobberX, by, f.bobberZ);
        _bob.set(f.bobberX, by, f.bobberZ);
      }
    }

    // Line from real pole tip → bobber (curved)
    const showLine =
      f.phase === "cast" ||
      f.phase === "wait" ||
      f.phase === "bite" ||
      f.phase === "reel";

    if (line) {
      line.visible = showLine;
      if (showLine) {
        // Prefer live tip transform; fall back to overhead estimate
        if (poleTipRef?.current) {
          poleTipRef.current.getWorldPosition(_tip);
        } else if (playerGroupRef?.current) {
          const g = playerGroupRef.current;
          const yaw = g.rotation.y;
          _tip.set(
            g.position.x + Math.sin(yaw) * 0.15 + Math.cos(yaw) * 0.25,
            g.position.y + 2.55,
            g.position.z + Math.cos(yaw) * 0.15 - Math.sin(yaw) * 0.25
          );
        } else {
          _tip.set(f.castFromX, f.castFromY + 1.2, f.castFromZ);
        }

        if (
          f.phase !== "wait" &&
          f.phase !== "bite" &&
          f.phase !== "cast" &&
          f.phase !== "reel"
        ) {
          _bob.set(f.bobberX, f.bobberY, f.bobberZ);
        } else if (f.phase === "cast" || f.phase === "reel") {
          _bob.set(f.bobberX, f.bobberY, f.bobberZ);
        }

        const dist = _tip.distanceTo(_bob);
        // Sag: heavier curve while bobber sits in water; lighter during cast/reel
        let sag = 0.15;
        if (f.phase === "wait" || f.phase === "bite") {
          // Clear catenary-style droop under its own weight
          sag = Math.min(2.4, 0.45 + dist * 0.16);
          if (f.phase === "bite") sag += 0.15;
        } else if (f.phase === "cast") {
          // Slight arc mid-cast
          const t = Math.min(1, f.phaseT / CAST_DURATION);
          sag = Math.sin(t * Math.PI) * Math.min(1.1, dist * 0.1);
        } else if (f.phase === "reel") {
          sag = Math.min(1.0, 0.2 + dist * 0.08);
        }

        // Quadratic Bezier: tip → lowered mid → bobber
        _mid.addVectors(_tip, _bob).multiplyScalar(0.5);
        _mid.y -= sag;
        // Bias control point slightly toward tip for a natural hang off the rod
        _ctrl.copy(_mid);
        _ctrl.lerp(_tip, 0.12);
        _ctrl.y = _mid.y;

        for (let i = 0; i <= LINE_SEGMENTS; i++) {
          const t = i / LINE_SEGMENTS;
          // Quadratic bezier: (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
          const u = 1 - t;
          _tmp.set(0, 0, 0);
          _tmp.addScaledVector(_tip, u * u);
          _tmp.addScaledVector(_ctrl, 2 * u * t);
          _tmp.addScaledVector(_bob, t * t);
          const o = i * 3;
          positions[o] = _tmp.x;
          positions[o + 1] = _tmp.y;
          positions[o + 2] = _tmp.z;
        }
        const attr = line.geometry.getAttribute("position");
        attr.needsUpdate = true;
        line.geometry.computeBoundingSphere();
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

      {/* Curved line tip → bobber */}
      <primitive object={line} ref={lineObjRef} />

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

/**
 * Fishing body pose — right arm nearly vertical so the pole stands upright
 * (tip above the head), not laid out horizontal.
 * When `seated`, pelvis rests ON the dock chair seat (not inside the mesh).
 */
export function applyFishingPose(
  bodyRef,
  leftArmRef,
  rightArmRef,
  phase,
  seated = false
) {
  if (bodyRef?.current) {
    // Standing torso ~0.94; seated torso sits above the chair seat (~0.47 deck-rel)
    // so the capsule bottom clears the cushion instead of sinking through it.
    bodyRef.current.position.y = seated ? 0.78 : 0.94;
    bodyRef.current.rotation.x = seated
      ? 0.06
      : phase === "cast" || phase === "reel"
        ? 0.04
        : 0.01;
  }
  // Left arm brace / idle (slightly out so it clears armrests)
  if (leftArmRef?.current) {
    leftArmRef.current.rotation.set(
      seated ? -0.28 : -0.15,
      0.12,
      seated ? 0.42 : 0.2
    );
  }
  // Right arm straight up (hand above shoulder) → pole shaft vertical
  if (rightArmRef?.current) {
    if (phase === "cast") {
      rightArmRef.current.rotation.set(
        seated ? -2.4 : -2.55,
        -0.18,
        0.05
      );
    } else if (phase === "reel") {
      rightArmRef.current.rotation.set(
        (seated ? -2.3 : -2.45) + Math.sin(performance.now() * 0.018) * 0.08,
        -0.16,
        0.02
      );
    } else {
      rightArmRef.current.rotation.set(seated ? -2.4 : -2.5, -0.12, 0.08);
    }
  }
}

/**
 * Seated leg pose for dock chair fishing.
 * Hips sit on the seat cushion; thighs go forward (local +Z / toward water);
 * shins fold so boots rest near the deck in front of the chair.
 */
export function applySeatedFishingLegs(
  leftLegRef,
  leftKneeRef,
  rightLegRef,
  rightKneeRef,
  setLeg
) {
  // Hip Y ≈ seat top (0.47) + small sit padding; thighs forward, knees bent
  setLeg(
    leftLegRef,
    leftKneeRef,
    [-0.13, 0.58, 0.04],
    [-1.02, 0.06, 0.05],
    1.18
  );
  setLeg(
    rightLegRef,
    rightKneeRef,
    [0.13, 0.58, 0.04],
    [-1.02, -0.06, -0.05],
    1.18
  );
}
