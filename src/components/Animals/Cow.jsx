import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";
import { resolveAnimalCollisions } from "../../systems/colliders";
import {
  setAnimalBody,
  resolveAnimalOverlaps,
} from "../../systems/animalCollision";
import { BARN_PEN_ROAM } from "../Horse/Horse";
import { sfxMoo, sfxFart } from "../../systems/audio";

const WHITE = "#f2f0ea";
const BLACK = "#1a1a1e";
const PINK = "#e8a0a8";
const HOOF = "#2a2a28";
const SPOT = "#141418";

const WALK_SPEED = 1.65;
const ARRIVE = 1.1;
/** Collision radius matches 1.5× model scale */
const COW_SCALE = 1.5;
const COW_RADIUS = 0.75 * COW_SCALE;
/** Poop pile lifetime (seconds) */
const POOP_LIFE = 15;
/** Random interval between poops (seconds) — 2 to 5 minutes */
const POOP_INTERVAL_MIN = 120;
const POOP_INTERVAL_MAX = 300;
/** Random interval between moos (seconds) — 3 to 6 minutes */
const MOO_INTERVAL_MIN = 180;
const MOO_INTERVAL_MAX = 360;

function nextPoopInterval() {
  return randRange(POOP_INTERVAL_MIN, POOP_INTERVAL_MAX);
}

function nextMooInterval() {
  return randRange(MOO_INTERVAL_MIN, MOO_INTERVAL_MAX);
}

const _next = new THREE.Vector3();

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

function pickPenTarget() {
  // Prefer pen side of the barn (right of barn wall)
  return {
    x: randRange(Math.max(BARN_PEN_ROAM.minX, 10), BARN_PEN_ROAM.maxX - 0.5),
    z: randRange(BARN_PEN_ROAM.minZ + 0.3, BARN_PEN_ROAM.maxZ - 0.3),
  };
}

/** Single cow-pat pile — self-ages and removes after POOP_LIFE seconds */
function PoopPile({ x, z, onDone }) {
  const groupRef = useRef();
  const matsRef = useRef([]);
  const ageRef = useRef(0);
  const doneRef = useRef(false);
  const s = 0.85 + Math.sin(x * 12.3) * 0.1;

  useFrame((_, delta) => {
    if (doneRef.current) return;
    ageRef.current += delta;
    const t = Math.min(1, ageRef.current / POOP_LIFE);
    const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
    if (groupRef.current) {
      groupRef.current.scale.setScalar(s * (0.95 + fade * 0.05));
    }
    for (const m of matsRef.current) {
      if (!m) continue;
      m.transparent = fade < 0.999;
      m.opacity = fade;
      m.depthWrite = fade > 0.2;
    }
    if (ageRef.current >= POOP_LIFE) {
      doneRef.current = true;
      onDone?.();
    }
  });

  return (
    <group ref={groupRef} position={[x, 0.04, z]} scale={s}>
      <mesh castShadow receiveShadow position={[0, 0.04, 0]} scale={[1, 0.45, 0.9]}>
        <sphereGeometry args={[0.16, 7, 5]} />
        <meshToonMaterial
          ref={(m) => {
            matsRef.current[0] = m;
          }}
          color="#4a3020"
        />
        <Outlines color={COLORS.outline} thickness={0.5} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0.08, 0.05, 0.04]}
        scale={[0.7, 0.4, 0.65]}
      >
        <sphereGeometry args={[0.12, 6, 4]} />
        <meshToonMaterial
          ref={(m) => {
            matsRef.current[1] = m;
          }}
          color="#5a3a22"
        />
      </mesh>
      <mesh
        castShadow
        position={[-0.06, 0.045, -0.05]}
        scale={[0.55, 0.35, 0.55]}
      >
        <sphereGeometry args={[0.1, 5, 4]} />
        <meshToonMaterial
          ref={(m) => {
            matsRef.current[2] = m;
          }}
          color="#3a2818"
        />
      </mesh>
    </group>
  );
}

/**
 * Black & white Holstein-style cow.
 * Wanders the horse pen, randomly moos, and drops poop that vanishes after 15s.
 */
export function Cow({ cabinState, barnDoorState, gateState }) {
  const groupRef = useRef();
  const bodyRef = useRef();
  const headRef = useRef();
  const tailRef = useRef();
  const legsRef = useRef([]);
  const [poops, setPoops] = useState([]);
  const stateRef = useRef({
    pos: new THREE.Vector3(16, 0, 1),
    yaw: Math.PI * 0.5,
    mode: "stand", // stand | walk | graze | poop
    timer: randRange(2, 5),
    targetX: 16,
    targetZ: 1,
    walkPhase: 0,
    mooTimer: nextMooInterval(),
    poopTimer: nextPoopInterval(),
    poopAnimT: 0,
    nextPoopId: 1,
  });

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const st = stateRef.current;
    const d = Math.min(delta, 0.05);

    // --- Random moo (every 3–6 minutes) ---
    st.mooTimer -= d;
    if (st.mooTimer <= 0) {
      sfxMoo();
      st.mooTimer = nextMooInterval();
    }

    // --- Mode machine ---
    st.timer -= d;

    if (st.mode === "poop") {
      st.poopAnimT += d;
      st.walkPhase *= 0.85;
      if (st.poopAnimT >= 0.85) {
        const id = st.nextPoopId++;
        const rearX = st.pos.x - Math.sin(st.yaw) * 0.55;
        const rearZ = st.pos.z - Math.cos(st.yaw) * 0.55;
        setPoops((prev) => [
          ...prev.slice(-12), // cap active piles
          {
            id,
            x: rearX + (Math.random() - 0.5) * 0.15,
            z: rearZ + (Math.random() - 0.5) * 0.15,
          },
        ]);
        st.mode = "stand";
        st.timer = randRange(2, 5);
        st.poopTimer = nextPoopInterval(); // next pile in 2–5 min
        st.poopAnimT = 0;
      }
    } else {
      st.poopTimer -= d;
      if (st.poopTimer <= 0 && st.mode !== "walk") {
        st.mode = "poop";
        st.poopAnimT = 0;
        st.timer = 1;
        sfxFart();
      } else if (st.mode === "walk") {
        const dx = st.targetX - st.pos.x;
        const dz = st.targetZ - st.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < ARRIVE || st.timer <= 0) {
          st.mode = Math.random() < 0.4 ? "graze" : "stand";
          st.timer = randRange(2.5, 7);
          st.walkPhase = 0;
        } else {
          const step = Math.min(dist, WALK_SPEED * d);
          st.pos.x += (dx / dist) * step;
          st.pos.z += (dz / dist) * step;
          st.yaw = Math.atan2(dx, dz);
          st.walkPhase += d * 8;
        }
      } else if (st.timer <= 0) {
        // stand / graze → pick new wander
        if (Math.random() < 0.65) {
          const t = pickPenTarget();
          st.targetX = t.x;
          st.targetZ = t.z;
          st.mode = "walk";
          st.timer = randRange(6, 14);
        } else {
          st.mode = st.mode === "graze" ? "stand" : "graze";
          st.timer = randRange(2, 6);
          st.yaw += (Math.random() - 0.5) * 0.9;
        }
      }
    }

    // Clamp + structure collision
    st.pos.x = THREE.MathUtils.clamp(
      st.pos.x,
      BARN_PEN_ROAM.minX,
      BARN_PEN_ROAM.maxX
    );
    st.pos.z = THREE.MathUtils.clamp(
      st.pos.z,
      BARN_PEN_ROAM.minZ,
      BARN_PEN_ROAM.maxZ
    );
    st.pos.y = 0;
    _next.copy(st.pos);
    resolveAnimalCollisions(
      _next,
      COW_RADIUS,
      cabinState,
      barnDoorState,
      gateState
    );
    resolveAnimalOverlaps(_next, COW_RADIUS, "cow");
    st.pos.copy(_next);
    setAnimalBody("cow", st.pos.x, st.pos.z, COW_RADIUS);

    g.position.set(st.pos.x, 0, st.pos.z);
    g.rotation.y = st.yaw;

    // --- Pose ---
    const swing = Math.sin(st.walkPhase);
    const walking = st.mode === "walk";
    const pooping = st.mode === "poop";
    const grazing = st.mode === "graze";
    const t = performance.now() * 0.001;

    if (bodyRef.current) {
      if (pooping) {
        bodyRef.current.position.y = 0.72;
        bodyRef.current.rotation.x = 0.12;
        bodyRef.current.rotation.z = Math.sin(st.poopAnimT * 14) * 0.04;
      } else if (walking) {
        bodyRef.current.position.y = 0.78 + Math.abs(swing) * 0.025;
        bodyRef.current.rotation.x = 0.04;
        bodyRef.current.rotation.z = swing * 0.03;
      } else {
        bodyRef.current.position.y = 0.78;
        bodyRef.current.rotation.x = grazing ? 0.08 : 0;
        bodyRef.current.rotation.z = 0;
      }
    }

    if (headRef.current) {
      if (grazing) {
        headRef.current.position.set(0, 0.05, 0.72);
        headRef.current.rotation.set(
          0.85 + Math.sin(t * 2.2) * 0.08,
          0,
          0
        );
      } else if (pooping) {
        headRef.current.position.set(0, 0.22, 0.7);
        headRef.current.rotation.set(0.15, 0, 0);
      } else {
        headRef.current.position.set(0, 0.28, 0.7);
        headRef.current.rotation.set(
          walking ? 0.1 : 0.05 + Math.sin(t * 0.6) * 0.04,
          0,
          0
        );
      }
    }

    if (tailRef.current) {
      if (walking) {
        tailRef.current.rotation.x = -0.4 + swing * 0.2;
        tailRef.current.rotation.y = swing * 0.5;
      } else if (pooping) {
        tailRef.current.rotation.x = -0.2;
        tailRef.current.rotation.y = Math.sin(st.poopAnimT * 10) * 0.35;
      } else {
        tailRef.current.rotation.x = -0.35;
        tailRef.current.rotation.y = Math.sin(t * 2.8) * 0.45;
      }
    }

    legsRef.current.forEach((leg, i) => {
      if (!leg) return;
      const side = i % 2 === 0 ? -1 : 1;
      const front = i < 2;
      if (walking) {
        leg.rotation.x = swing * (front ? 1 : -1) * side * 0.45;
      } else if (pooping) {
        leg.rotation.x = front ? 0.15 : -0.2;
      } else {
        leg.rotation.x = 0;
      }
    });
  });

  return (
    <>
      {/* Poop piles in world space — each removes itself after 15s */}
      {poops.map((p) => (
        <PoopPile
          key={p.id}
          x={p.x}
          z={p.z}
          onDone={() =>
            setPoops((prev) => prev.filter((q) => q.id !== p.id))
          }
        />
      ))}

      <group
        ref={groupRef}
        position={[16, 0, 1]}
        scale={COW_SCALE}
        userData={{ ignoreCameraCollision: true }}
      >
        <group ref={bodyRef} position={[0, 0.78, 0]}>
          {/* Barrel body */}
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <capsuleGeometry args={[0.38, 0.85, 6, 12]} />
            <meshToonMaterial color={WHITE} />
            <Outlines color={COLORS.outline} thickness={1.4} />
          </mesh>
          {/* Black spots */}
          <mesh
            position={[0.18, 0.12, 0.1]}
            scale={[0.7, 0.55, 0.85]}
            castShadow
          >
            <sphereGeometry args={[0.28, 7, 6]} />
            <meshToonMaterial color={BLACK} />
          </mesh>
          <mesh
            position={[-0.2, 0.08, -0.15]}
            scale={[0.65, 0.5, 0.75]}
            castShadow
          >
            <sphereGeometry args={[0.26, 7, 6]} />
            <meshToonMaterial color={SPOT} />
          </mesh>
          <mesh
            position={[0.05, 0.15, -0.35]}
            scale={[0.55, 0.4, 0.5]}
            castShadow
          >
            <sphereGeometry args={[0.22, 6, 5]} />
            <meshToonMaterial color={BLACK} />
          </mesh>
          <mesh
            position={[-0.12, 0.1, 0.35]}
            scale={[0.5, 0.45, 0.55]}
            castShadow
          >
            <sphereGeometry args={[0.2, 6, 5]} />
            <meshToonMaterial color={BLACK} />
          </mesh>
          {/* Udder */}
          <mesh position={[0, -0.32, -0.05]} castShadow>
            <sphereGeometry args={[0.16, 6, 5]} />
            <meshToonMaterial color={PINK} />
          </mesh>
          {[-0.06, 0.06, -0.02, 0.02].map((sx, i) => (
            <mesh
              key={`ud-${i}`}
              position={[sx, -0.42, -0.08 + (i % 2) * 0.06]}
              castShadow
            >
              <capsuleGeometry args={[0.025, 0.05, 3, 5]} />
              <meshToonMaterial color={PINK} />
            </mesh>
          ))}

          {/* Head + neck */}
          <group ref={headRef} position={[0, 0.28, 0.7]}>
            <mesh position={[0, -0.05, -0.12]} castShadow>
              <capsuleGeometry args={[0.14, 0.2, 4, 7]} />
              <meshToonMaterial color={WHITE} />
              <Outlines color={COLORS.outline} thickness={0.9} />
            </mesh>
            <mesh castShadow>
              <sphereGeometry args={[0.22, 8, 7]} />
              <meshToonMaterial color={WHITE} />
              <Outlines color={COLORS.outline} thickness={1.2} />
            </mesh>
            {/* Face black patch */}
            <mesh position={[0.08, 0.04, 0.1]} scale={[0.55, 0.5, 0.45]} castShadow>
              <sphereGeometry args={[0.14, 6, 5]} />
              <meshToonMaterial color={BLACK} />
            </mesh>
            {/* Snout */}
            <mesh position={[0, -0.06, 0.22]} castShadow>
              <boxGeometry args={[0.2, 0.14, 0.16]} />
              <meshToonMaterial color={PINK} />
              <Outlines color={COLORS.outline} thickness={0.6} />
            </mesh>
            {/* Nostrils */}
            {[-1, 1].map((s) => (
              <mesh key={`n-${s}`} position={[s * 0.05, -0.05, 0.3]}>
                <sphereGeometry args={[0.025, 5, 4]} />
                <meshToonMaterial color="#5a3040" />
              </mesh>
            ))}
            {/* Eyes */}
            {[-1, 1].map((s) => (
              <group key={`e-${s}`} position={[s * 0.12, 0.06, 0.16]}>
                <mesh>
                  <sphereGeometry args={[0.04, 6, 5]} />
                  <meshToonMaterial color="#1a1a1a" />
                </mesh>
                <mesh position={[0.008 * s, 0.01, 0.02]}>
                  <sphereGeometry args={[0.015, 4, 3]} />
                  <meshToonMaterial color="#f8f0e0" />
                </mesh>
              </group>
            ))}
            {/* Ears */}
            {[-1, 1].map((s) => (
              <mesh
                key={`ear-${s}`}
                position={[s * 0.2, 0.12, 0.0]}
                rotation={[0.2, 0, s * 0.6]}
                castShadow
              >
                <sphereGeometry args={[0.08, 5, 4]} />
                <meshToonMaterial color={s > 0 ? BLACK : WHITE} />
                <Outlines color={COLORS.outline} thickness={0.5} />
              </mesh>
            ))}
            {/* Horn stubs */}
            {[-1, 1].map((s) => (
              <mesh
                key={`horn-${s}`}
                position={[s * 0.1, 0.2, -0.02]}
                rotation={[0.15, 0, s * 0.25]}
                castShadow
              >
                <coneGeometry args={[0.035, 0.12, 5]} />
                <meshToonMaterial color="#e8e0d0" />
              </mesh>
            ))}
          </group>

          {/* Tail */}
          <group ref={tailRef} position={[0, 0.15, -0.7]}>
            <mesh position={[0, 0.05, -0.12]} rotation={[0.8, 0, 0]} castShadow>
              <capsuleGeometry args={[0.035, 0.35, 3, 5]} />
              <meshToonMaterial color={WHITE} />
              <Outlines color={COLORS.outline} thickness={0.5} />
            </mesh>
            <mesh position={[0, 0.0, -0.32]} castShadow>
              <sphereGeometry args={[0.07, 5, 4]} />
              <meshToonMaterial color={BLACK} />
            </mesh>
          </group>

          {/* Legs FL FR BL BR */}
          {[
            [-0.22, -0.15, 0.32],
            [0.22, -0.15, 0.32],
            [-0.22, -0.15, -0.38],
            [0.22, -0.15, -0.38],
          ].map((pos, i) => (
            <group
              key={i}
              ref={(el) => {
                legsRef.current[i] = el;
              }}
              position={pos}
            >
              <mesh position={[0, -0.28, 0]} castShadow>
                <capsuleGeometry args={[0.07, 0.38, 4, 6]} />
                <meshToonMaterial
                  color={i === 0 || i === 3 ? BLACK : WHITE}
                />
                <Outlines color={COLORS.outline} thickness={0.6} />
              </mesh>
              <mesh position={[0, -0.52, 0.02]} castShadow>
                <sphereGeometry args={[0.08, 5, 4]} />
                <meshToonMaterial color={HOOF} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </>
  );
}
