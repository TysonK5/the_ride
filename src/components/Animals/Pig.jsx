import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";
import { resolveAnimalCollisions } from "../../systems/colliders";
import {
  setAnimalBody,
  resolveAnimalOverlaps,
} from "../../systems/animalCollision";
import { PEN } from "../Environment/Fence";

/**
 * Pigs sized relative to the cow (COW_SCALE = 1.5 on a ~cow-scale base mesh).
 * Mom = 35% of cow, baby = 50% of mom.
 */
const COW_SCALE = 1.5;
/** Mom = 35% of cow, then doubled; baby = half of mom */
const MOM_SCALE = COW_SCALE * 0.35 * 2; // 1.05
const BABY_SCALE = MOM_SCALE * 0.5; // 0.525
const MOM_RADIUS = 0.75 * COW_SCALE * 0.35 * 2;
const BABY_RADIUS = MOM_RADIUS * 0.5;

const WALK_SPEED = 1.35;
const ARRIVE = 0.55;
const MOVE_DURATION = 30; // seconds of roaming
const LAY_DURATION = 240; // 4 minutes lying down
const PEN_MARGIN = 1.1;
const FOLLOW_DIST = 0.95; // baby behind mom (world units)

const PINK = "#f0a8b8";
const PINK_DARK = "#e08898";
const PINK_LIGHT = "#f8c8d0";
const SNOUT = "#e89098";
const HOOF = "#4a3038";

const _next = new THREE.Vector3();

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

function clampInPen(x, z, margin = PEN_MARGIN) {
  return {
    x: THREE.MathUtils.clamp(x, PEN.x0 + margin, PEN.x1 - margin),
    z: THREE.MathUtils.clamp(z, PEN.z0 + margin, PEN.z1 - margin),
  };
}

function pickPenTarget() {
  return {
    x: randRange(PEN.x0 + PEN_MARGIN, PEN.x1 - PEN_MARGIN),
    z: randRange(PEN.z0 + PEN_MARGIN, PEN.z1 - PEN_MARGIN),
  };
}

/** Curly / squirly pig tail — helical chain of blobs */
function CurlyTail({ scale = 1 }) {
  const segs = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const ang = t * Math.PI * 2.4;
    const r = 0.07 * (1 - t * 0.35) * scale;
    const x = Math.cos(ang) * r * 1.1;
    const y = 0.02 + t * 0.1 * scale;
    const z = -0.02 - Math.sin(ang) * r * 0.9 - t * 0.04;
    segs.push(
      <mesh
        key={i}
        position={[x, y, z]}
        castShadow
      >
        <sphereGeometry args={[0.028 * scale * (1 - t * 0.25), 5, 4]} />
        <meshToonMaterial color={i % 2 === 0 ? PINK : PINK_DARK} />
      </mesh>
    );
  }
  return (
    <group position={[0, 0.12, -0.42]}>
      {segs}
      {/* Tip curl */}
      <mesh position={[0.02, 0.12 * scale, -0.08]} castShadow>
        <sphereGeometry args={[0.022 * scale, 5, 4]} />
        <meshToonMaterial color={PINK_LIGHT} />
      </mesh>
    </group>
  );
}

/**
 * Pink pig body — base size roughly cow-unscaled proportions;
 * outer group applies MOM_SCALE / BABY_SCALE.
 */
function PigMesh({ baby = false }) {
  const earPink = baby ? PINK_LIGHT : PINK_DARK;
  return (
    <group>
      {/* Body */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.32, 0.55, 5, 10]} />
        <meshToonMaterial color={PINK} />
        <Outlines color={COLORS.outline} thickness={1.1} />
      </mesh>
      {/* Belly */}
      <mesh position={[0, -0.12, 0.05]} scale={[1.05, 0.7, 1.1]} castShadow>
        <sphereGeometry args={[0.28, 7, 6]} />
        <meshToonMaterial color={PINK_LIGHT} />
      </mesh>
      {/* Haunches */}
      {[-1, 1].map((s) => (
        <mesh
          key={`h-${s}`}
          position={[s * 0.18, -0.02, -0.22]}
          scale={[0.55, 0.65, 0.7]}
          castShadow
        >
          <sphereGeometry args={[0.2, 6, 5]} />
          <meshToonMaterial color={PINK_DARK} />
        </mesh>
      ))}
      {/* Shoulder */}
      {[-1, 1].map((s) => (
        <mesh
          key={`s-${s}`}
          position={[s * 0.16, 0.02, 0.22]}
          scale={[0.5, 0.55, 0.55]}
          castShadow
        >
          <sphereGeometry args={[0.18, 6, 5]} />
          <meshToonMaterial color={PINK} />
        </mesh>
      ))}

      {/* Head */}
      <group position={[0, 0.08, 0.48]}>
        <mesh castShadow>
          <sphereGeometry args={[0.22, 8, 7]} />
          <meshToonMaterial color={PINK} />
          <Outlines color={COLORS.outline} thickness={1} />
        </mesh>
        {/* Snout disk */}
        <mesh position={[0, -0.02, 0.2]} castShadow>
          <cylinderGeometry args={[0.1, 0.11, 0.1, 10]} />
          <meshToonMaterial color={SNOUT} />
          <Outlines color={COLORS.outline} thickness={0.6} />
        </mesh>
        <mesh position={[0, -0.02, 0.26]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.095, 12]} />
          <meshToonMaterial color={PINK_LIGHT} />
        </mesh>
        {/* Nostrils */}
        {[-1, 1].map((s) => (
          <mesh key={`n-${s}`} position={[s * 0.035, -0.015, 0.27]}>
            <sphereGeometry args={[0.022, 5, 4]} />
            <meshToonMaterial color="#5a3040" />
          </mesh>
        ))}
        {/* Eyes */}
        {[-1, 1].map((s) => (
          <group key={`e-${s}`} position={[s * 0.1, 0.08, 0.14]}>
            <mesh>
              <sphereGeometry args={[0.035, 6, 5]} />
              <meshToonMaterial color="#1a1a1a" />
            </mesh>
            <mesh position={[0.008 * s, 0.01, 0.015]}>
              <sphereGeometry args={[0.012, 4, 3]} />
              <meshToonMaterial color="#f8f0e0" />
            </mesh>
          </group>
        ))}
        {/* Floppy ears */}
        {[-1, 1].map((s) => (
          <mesh
            key={`ear-${s}`}
            position={[s * 0.16, 0.14, 0.02]}
            rotation={[0.35, 0, s * 0.7]}
            castShadow
          >
            <sphereGeometry args={[0.09, 5, 4]} />
            <meshToonMaterial color={earPink} />
            <Outlines color={COLORS.outline} thickness={0.5} />
          </mesh>
        ))}
      </group>

      <CurlyTail scale={1} />

      {/* Legs */}
      {[
        [-0.16, -0.2, 0.22],
        [0.16, -0.2, 0.22],
        [-0.16, -0.2, -0.28],
        [0.16, -0.2, -0.28],
      ].map((pos, i) => (
        <group key={i} position={pos}>
          <mesh position={[0, -0.12, 0]} castShadow>
            <capsuleGeometry args={[0.05, 0.14, 3, 5]} />
            <meshToonMaterial color={PINK_DARK} />
            <Outlines color={COLORS.outline} thickness={0.45} />
          </mesh>
          <mesh position={[0, -0.24, 0.01]} castShadow>
            <sphereGeometry args={[0.055, 5, 4]} />
            <meshToonMaterial color={HOOF} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Shared mom track so the piglet can follow.
 */
function createMomTrack(x, z) {
  return {
    x,
    z,
    yaw: 0,
    laying: false,
  };
}

/**
 * Mom pig: roam randomly for 30s, then lie down for 4 minutes, repeat.
 * Baby follows mom.
 */
export function Pigs({ cabinState, barnDoorState, gateState }) {
  const momTrack = useMemo(
    () => createMomTrack((PEN.x0 + PEN.x1) / 2 + 2, 1.5),
    []
  );

  return (
    <group>
      <MomPig
        momTrack={momTrack}
        cabinState={cabinState}
        barnDoorState={barnDoorState}
        gateState={gateState}
      />
      <BabyPig
        momTrack={momTrack}
        cabinState={cabinState}
        barnDoorState={barnDoorState}
        gateState={gateState}
      />
    </group>
  );
}

function MomPig({ momTrack, cabinState, barnDoorState, gateState }) {
  const groupRef = useRef();
  const bodyRef = useRef();
  const legsRef = useRef([]);
  const stateRef = useRef({
    pos: new THREE.Vector3(momTrack.x, 0, momTrack.z),
    yaw: 0,
    mode: "walk", // walk | lay
    phaseTimer: MOVE_DURATION,
    targetX: momTrack.x,
    targetZ: momTrack.z,
    walkPhase: 0,
    retargetT: 0,
  });

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const st = stateRef.current;
    const d = Math.min(delta, 0.05);

    st.phaseTimer -= d;

    if (st.mode === "walk") {
      st.retargetT -= d;
      if (st.retargetT <= 0) {
        const t = pickPenTarget();
        st.targetX = t.x;
        st.targetZ = t.z;
        st.retargetT = randRange(3, 8);
      }

      const dx = st.targetX - st.pos.x;
      const dz = st.targetZ - st.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > ARRIVE) {
        const step = Math.min(dist, WALK_SPEED * d);
        st.pos.x += (dx / dist) * step;
        st.pos.z += (dz / dist) * step;
        st.yaw = Math.atan2(dx, dz);
        st.walkPhase += d * 9;
      } else {
        st.walkPhase *= 0.9;
        // pick new point soon
        st.retargetT = Math.min(st.retargetT, 0.4);
      }

      if (st.phaseTimer <= 0) {
        st.mode = "lay";
        st.phaseTimer = LAY_DURATION;
        st.walkPhase = 0;
      }
    } else {
      // laying
      st.walkPhase *= 0.85;
      if (st.phaseTimer <= 0) {
        st.mode = "walk";
        st.phaseTimer = MOVE_DURATION;
        st.retargetT = 0.2;
        const t = pickPenTarget();
        st.targetX = t.x;
        st.targetZ = t.z;
      }
    }

    const c = clampInPen(st.pos.x, st.pos.z);
    st.pos.x = c.x;
    st.pos.z = c.z;
    st.pos.y = 0;

    _next.copy(st.pos);
    resolveAnimalCollisions(
      _next,
      MOM_RADIUS,
      cabinState,
      barnDoorState,
      gateState
    );
    resolveAnimalOverlaps(_next, MOM_RADIUS, "pig-mom");
    const c2 = clampInPen(_next.x, _next.z);
    st.pos.x = c2.x;
    st.pos.z = c2.z;
    setAnimalBody("pig-mom", st.pos.x, st.pos.z, MOM_RADIUS);

    momTrack.x = st.pos.x;
    momTrack.z = st.pos.z;
    momTrack.yaw = st.yaw;
    momTrack.laying = st.mode === "lay";

    g.position.set(st.pos.x, 0, st.pos.z);
    g.rotation.y = st.yaw;

    // Pose
    const swing = Math.sin(st.walkPhase);
    if (bodyRef.current) {
      if (st.mode === "lay") {
        // Roll onto side / settle low
        bodyRef.current.position.y = 0.12;
        bodyRef.current.rotation.z = 0.95;
        bodyRef.current.rotation.x = 0.05;
      } else {
        bodyRef.current.position.y = 0.32 + Math.abs(swing) * 0.02;
        bodyRef.current.rotation.z = 0;
        bodyRef.current.rotation.x = 0.04;
      }
    }
    legsRef.current.forEach((leg, i) => {
      if (!leg) return;
      if (st.mode === "lay") {
        leg.rotation.x = 0.4;
        leg.visible = true;
      } else {
        const side = i % 2 === 0 ? -1 : 1;
        const front = i < 2;
        leg.rotation.x = swing * (front ? 1 : -1) * side * 0.4;
      }
    });
  });

  return (
    <group
      ref={groupRef}
      position={[momTrack.x, 0, momTrack.z]}
      scale={MOM_SCALE}
      userData={{ ignoreCameraCollision: true }}
    >
      <group ref={bodyRef} position={[0, 0.32, 0]}>
        <PigMesh />
        {/* Legs as separate refs for gait — re-grab from mesh would be hard;
            use invisible proxies for animation on a second set */}
        {[
          [-0.16, -0.2, 0.22],
          [0.16, -0.2, 0.22],
          [-0.16, -0.2, -0.28],
          [0.16, -0.2, -0.28],
        ].map((pos, i) => (
          <group
            key={i}
            ref={(el) => {
              legsRef.current[i] = el;
            }}
            position={pos}
          />
        ))}
      </group>
    </group>
  );
}

function BabyPig({ momTrack, cabinState, barnDoorState, gateState }) {
  const groupRef = useRef();
  const bodyRef = useRef();
  const stateRef = useRef({
    pos: new THREE.Vector3(momTrack.x - 0.8, 0, momTrack.z),
    yaw: 0,
    walkPhase: 0,
  });

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g || !momTrack) return;
    const st = stateRef.current;
    const d = Math.min(delta, 0.05);

    // Follow behind mom
    const backX = -Math.sin(momTrack.yaw);
    const backZ = -Math.cos(momTrack.yaw);
    const side = 0.25;
    const tx =
      momTrack.x +
      backX * FOLLOW_DIST +
      Math.cos(momTrack.yaw) * side;
    const tz =
      momTrack.z +
      backZ * FOLLOW_DIST -
      Math.sin(momTrack.yaw) * side;

    const dx = tx - st.pos.x;
    const dz = tz - st.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.08) {
      const speed = momTrack.laying ? 0.9 : 2.1;
      const step = Math.min(dist, speed * d);
      st.pos.x += (dx / dist) * step;
      st.pos.z += (dz / dist) * step;
      st.yaw = Math.atan2(dx, dz);
      st.walkPhase += d * 12;
    } else {
      st.walkPhase *= 0.9;
      // Face same way as mom when settled
      let dy = momTrack.yaw - st.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      st.yaw += dy * Math.min(1, d * 3);
    }

    // When mom lays, piglet sits/settles nearby
    const c = clampInPen(st.pos.x, st.pos.z, PEN_MARGIN * 0.85);
    st.pos.x = c.x;
    st.pos.z = c.z;

    _next.copy(st.pos);
    resolveAnimalCollisions(
      _next,
      BABY_RADIUS,
      cabinState,
      barnDoorState,
      gateState
    );
    resolveAnimalOverlaps(_next, BABY_RADIUS, "pig-baby");
    const c2 = clampInPen(_next.x, _next.z, PEN_MARGIN * 0.85);
    st.pos.x = c2.x;
    st.pos.z = c2.z;
    setAnimalBody("pig-baby", st.pos.x, st.pos.z, BABY_RADIUS);

    g.position.set(st.pos.x, 0, st.pos.z);
    g.rotation.y = st.yaw;

    const swing = Math.sin(st.walkPhase);
    if (bodyRef.current) {
      if (momTrack.laying && dist < 0.35) {
        bodyRef.current.position.y = 0.08;
        bodyRef.current.rotation.z = 0.75;
        bodyRef.current.rotation.x = 0;
      } else {
        bodyRef.current.position.y = 0.28 + Math.abs(swing) * 0.025;
        bodyRef.current.rotation.z = 0;
        bodyRef.current.rotation.x = 0.05;
      }
    }
  });

  return (
    <group
      ref={groupRef}
      position={[momTrack.x - 0.8, 0, momTrack.z]}
      scale={BABY_SCALE}
      userData={{ ignoreCameraCollision: true }}
    >
      <group ref={bodyRef} position={[0, 0.28, 0]}>
        <PigMesh baby />
      </group>
    </group>
  );
}
