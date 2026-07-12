import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";
import { resolveAnimalCollisions } from "../../systems/colliders";
import {
  setAnimalBody,
  resolveAnimalOverlaps,
} from "../../systems/animalCollision";
import { PLAY_HALF } from "../../systems/map";
import {
  createFeedState,
  updateCompanionMeal,
} from "./PetBowls";
import {
  CompanionWings,
  WING_RETRACT_DELAY,
  FLY_FOLLOW_SPEED,
  FLY_CATCH_UP,
} from "./CompanionWings";

/**
 * Callie palette — blue-merle / charcoal mutt from reference photo:
 * mottled slate body, silver chest ruff, soft floppy ears, amber eyes.
 */
const COAT = "#5a5a62";
const COAT_DARK = "#2e2e34";
const COAT_MID = "#6e6e78";
const SILVER = "#c8c4bc";
const CREAM = "#e8e4dc";
const NOSE = "#1a1a1c";
const EYE = "#6b4a28";
const EYE_LIGHT = "#a87840";
const COLLAR = "#1a1a1e";
const TAG = "#c0a050";

const FOLLOW_DIST = 2.6;
const RUN_SPEED = 8.2;
const CATCH_UP = 12;
const STOP_DIST = 1.55;
const SIT_DELAY = 0.4;
const DOG_RADIUS = 0.32;

const _target = new THREE.Vector3();
const _to = new THREE.Vector3();
const _next = new THREE.Vector3();

/**
 * Callie — slim fluffy merle ranch dog.
 * Follows the player while they move; sits when they stop.
 * Every 3–5 min visits barn food/water bowls (~30s), then resumes follow.
 */
export function Callie({
  playerTrack,
  cabinState,
  barnDoorState,
  gateState,
}) {
  const groupRef = useRef();
  const bodyRef = useRef();
  const headRef = useRef();
  const tailRef = useRef();
  const legsRef = useRef([]);
  const earLRef = useRef();
  const earRRef = useRef();
  const feedRef = useRef(createFeedState(0.55));
  const wingsActiveRef = useRef(false);
  const stateRef = useRef({
    mode: "walk", // walk | sit | eat | drink | fly
    stopTimer: 0,
    yaw: Math.PI * 0.15,
    pos: new THREE.Vector3(-3.5, 0, 9),
    walkPhase: 0,
    wingsOut: false,
    wingTimer: 0,
  });

  useFrame((_, delta) => {
    const g = groupRef.current;
    const track = playerTrack;
    if (!g || !track) return;

    const st = stateRef.current;
    const feed = feedRef.current;
    const px = track.position.x;
    const py = track.position.y ?? 0;
    const pz = track.position.z;
    const pyaw = track.yaw ?? 0;
    const playerFlying = !!track.airborne;

    if (playerFlying) {
      st.wingsOut = true;
      st.wingTimer = 0;
    } else if (st.wingsOut) {
      if (st.pos.y <= 0.08) {
        st.wingTimer += delta;
        if (st.wingTimer >= WING_RETRACT_DELAY) {
          st.wingsOut = false;
          st.wingTimer = 0;
        }
      }
    }
    wingsActiveRef.current = st.wingsOut;

    const onMeal =
      !playerFlying &&
      st.pos.y < 0.5 &&
      updateCompanionMeal(st, feed, delta, 6.2);

    if (playerFlying || st.pos.y > 0.15) {
      st.mode = "fly";
      st.stopTimer = 0;
      if (feed.phase && feed.phase !== "idle") {
        feed.phase = "idle";
        feed.path = null;
        feed.hunger = Math.max(feed.hunger ?? 0, 30);
      }

      const backX = -Math.sin(pyaw);
      const backZ = -Math.cos(pyaw);
      const sideX = Math.cos(pyaw);
      const sideZ = -Math.sin(pyaw);
      const flyY = playerFlying ? Math.max(0.4, py + 0.25) : 0;
      // Left side of rider (cat takes right)
      _target.set(
        px + backX * FOLLOW_DIST - sideX * 0.55,
        flyY,
        pz + backZ * FOLLOW_DIST - sideZ * 0.55
      );

      _to.copy(_target).sub(st.pos);
      const dist = _to.length();
      if (dist > 0.1) {
        const speed = dist > 10 ? FLY_CATCH_UP : FLY_FOLLOW_SPEED;
        _to.normalize();
        const step = Math.min(dist, speed * delta);
        st.pos.x += _to.x * step;
        st.pos.y += _to.y * step;
        st.pos.z += _to.z * step;
        st.yaw = Math.atan2(_to.x, _to.z);
        st.walkPhase += delta * 15;
      }
      if (!playerFlying && st.pos.y < 0.05) st.pos.y = 0;
    } else if (!onMeal) {
      // Stay a little behind and to the player's left (cat takes the right)
      const backX = -Math.sin(pyaw);
      const backZ = -Math.cos(pyaw);
      const sideX = Math.cos(pyaw);
      const sideZ = -Math.sin(pyaw);
      _target.set(
        px + backX * FOLLOW_DIST - sideX * 0.55,
        0,
        pz + backZ * FOLLOW_DIST - sideZ * 0.55
      );

      _to.copy(_target).sub(st.pos);
      _to.y = 0;
      const dist = _to.length();
      const playerMoving = !!track.moving;

      let wantFollow = playerMoving || dist > STOP_DIST * 1.4;

      if (wantFollow) {
        st.mode = "walk";
        st.stopTimer = 0;

        const speed = dist > 9 ? CATCH_UP : RUN_SPEED;
        if (dist > 0.1) {
          _to.normalize();
          const step = Math.min(dist, speed * delta);
          st.pos.x += _to.x * step;
          st.pos.z += _to.z * step;
          st.yaw = Math.atan2(_to.x, _to.z);
          st.walkPhase += delta * (dist > 9 ? 15 : 11);
        }
      } else {
        st.stopTimer += delta;
        if (
          (st.mode === "walk" || st.mode === "fly") &&
          st.stopTimer >= SIT_DELAY
        ) {
          st.mode = "sit";
        }
        if (st.mode === "eat" || st.mode === "drink") st.mode = "sit";
        // Face player while sitting
        const faceX = px - st.pos.x;
        const faceZ = pz - st.pos.z;
        if (faceX * faceX + faceZ * faceZ > 0.02) {
          const targetYaw = Math.atan2(faceX, faceZ);
          let dy = targetYaw - st.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          st.yaw += dy * Math.min(1, delta * 3.5);
        }
        st.walkPhase *= 0.88;
      }
    }

    st.pos.x = THREE.MathUtils.clamp(st.pos.x, -PLAY_HALF, PLAY_HALF);
    st.pos.z = THREE.MathUtils.clamp(st.pos.z, -PLAY_HALF, PLAY_HALF);
    if (st.pos.y < 0) st.pos.y = 0;

    // Ground colliders only when near ground (fly over barn/fence/pond)
    if (st.pos.y < 0.25) {
      _next.copy(st.pos);
      resolveAnimalCollisions(
        _next,
        DOG_RADIUS,
        cabinState,
        barnDoorState,
        gateState
      );
      resolveAnimalOverlaps(_next, DOG_RADIUS, "callie");
      st.pos.x = _next.x;
      st.pos.z = _next.z;
    }
    setAnimalBody("callie", st.pos.x, st.pos.z, DOG_RADIUS);

    g.position.set(st.pos.x, st.pos.y, st.pos.z);
    g.rotation.y = st.yaw;

    const mode = st.mode;
    const swing = Math.sin(st.walkPhase);
    const t = performance.now() * 0.001;
    const feeding = mode === "eat" || mode === "drink";
    const flying = mode === "fly";

    // --- Body pose ---
    if (bodyRef.current) {
      if (flying) {
        bodyRef.current.position.y = 0.34 + Math.sin(t * 14) * 0.045;
        bodyRef.current.rotation.x = -0.12;
        bodyRef.current.rotation.z = swing * 0.05;
      } else if (mode === "walk") {
        bodyRef.current.position.y = 0.34 + Math.abs(swing) * 0.035;
        bodyRef.current.rotation.x = 0.05;
        bodyRef.current.rotation.z = swing * 0.035;
      } else if (feeding) {
        // Standing over bowl, slight crouch
        bodyRef.current.position.y = 0.3;
        bodyRef.current.rotation.x = 0.22;
        bodyRef.current.rotation.z = 0;
      } else {
        // Sit — haunches down, chest up
        bodyRef.current.position.y = 0.26;
        bodyRef.current.rotation.x = -0.72;
        bodyRef.current.rotation.z = 0;
      }
    }

    // --- Head ---
    if (headRef.current) {
      if (flying) {
        headRef.current.position.set(0, 0.14, 0.36);
        headRef.current.rotation.set(-0.1, 0, 0);
      } else if (mode === "walk") {
        headRef.current.position.set(0, 0.16, 0.38);
        headRef.current.rotation.set(0.08, 0, 0);
      } else if (feeding) {
        // Dip muzzle into bowl + small bob
        const bob = Math.sin(t * (mode === "drink" ? 7 : 5.5)) * 0.06;
        headRef.current.position.set(0, 0.02 + bob * 0.3, 0.4);
        headRef.current.rotation.set(0.85 + bob, 0, 0);
      } else {
        headRef.current.position.set(0, 0.28, 0.28);
        headRef.current.rotation.set(0.35 + Math.sin(t * 0.7) * 0.03, 0, 0);
      }
    }

    // Floppy ear sway
    if (earLRef.current) {
      earLRef.current.rotation.z =
        -0.55 +
        (mode === "walk" || flying
          ? swing * 0.12
          : Math.sin(t * 1.1) * 0.04);
      earLRef.current.rotation.x = mode === "sit" ? 0.35 : 0.15;
    }
    if (earRRef.current) {
      earRRef.current.rotation.z =
        0.55 +
        (mode === "walk" || flying
          ? -swing * 0.12
          : Math.sin(t * 1.1 + 1) * 0.04);
      earRRef.current.rotation.x = mode === "sit" ? 0.35 : 0.15;
    }

    // --- Tail ---
    if (tailRef.current) {
      if (flying) {
        tailRef.current.position.set(0, 0.14, -0.4);
        tailRef.current.rotation.x = -0.2;
        tailRef.current.rotation.y = swing * 0.35;
      } else if (mode === "walk") {
        tailRef.current.position.set(0, 0.12, -0.42);
        tailRef.current.rotation.x = -0.55 + swing * 0.2;
        tailRef.current.rotation.y = swing * 0.55;
      } else if (feeding) {
        tailRef.current.position.set(0, 0.1, -0.4);
        tailRef.current.rotation.x = -0.3;
        tailRef.current.rotation.y = Math.sin(t * 3) * 0.25;
      } else {
        tailRef.current.position.set(0, 0.02, -0.32);
        tailRef.current.rotation.x = 0.15;
        tailRef.current.rotation.y = Math.sin(t * 5.5) * 0.55;
      }
    }

    // --- Legs ---
    legsRef.current.forEach((leg, i) => {
      if (!leg) return;
      const side = i % 2 === 0 ? -1 : 1;
      const front = i < 2;
      if (flying) {
        leg.rotation.x = front ? 0.55 : -0.3;
        leg.position.y = 0.02;
      } else if (mode === "walk") {
        const phase = swing * (front ? 1 : -1) * side;
        leg.rotation.x = phase * 0.65;
        leg.position.y = 0;
      } else if (feeding) {
        leg.rotation.x = front ? 0.25 : -0.1;
        leg.position.y = 0;
      } else {
        leg.rotation.x = front ? 0.2 : 1.35;
        leg.position.y = front ? 0 : 0.04;
      }
    });
  });

  return (
    <group
      ref={groupRef}
      position={[-3.5, 0, 9]}
      userData={{ ignoreCameraCollision: true }}
    >
      {/* Slimmer overall proportions */}
      <group scale={[0.78, 0.94, 0.88]}>
        <group ref={bodyRef} position={[0, 0.34, 0]}>
          <CompanionWings
            activeRef={wingsActiveRef}
            color="#c8c0d8"
            colorTip="#a898c8"
            scale={1.15}
            position={[0, 0.12, -0.02]}
          />
          {/* Torso — thinner dog body */}
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <capsuleGeometry args={[0.15, 0.44, 5, 10]} />
            <meshToonMaterial color={COAT} />
            <Outlines color={COLORS.outline} thickness={1.3} />
          </mesh>
          {/* Merle dark mottling on back */}
          <mesh
            position={[0, 0.08, -0.02]}
            scale={[0.65, 0.35, 0.95]}
            castShadow
          >
            <sphereGeometry args={[0.15, 7, 6]} />
            <meshToonMaterial color={COAT_DARK} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh
              key={`merle-${s}`}
              position={[s * 0.1, 0.03, s * 0.06]}
              scale={[0.4, 0.45, 0.7]}
              castShadow
            >
              <sphereGeometry args={[0.1, 6, 5]} />
              <meshToonMaterial color={COAT_MID} />
            </mesh>
          ))}
          {/* Silver-white chest ruff */}
          <mesh
            position={[0, -0.02, 0.18]}
            scale={[0.9, 0.9, 0.85]}
            castShadow
          >
            <sphereGeometry args={[0.14, 7, 6]} />
            <meshToonMaterial color={SILVER} />
          </mesh>
          <mesh
            position={[0, -0.05, 0.12]}
            scale={[0.8, 0.5, 0.7]}
            castShadow
          >
            <sphereGeometry args={[0.12, 6, 5]} />
            <meshToonMaterial color={CREAM} />
          </mesh>
          {/* Fluffy neck mane tufts */}
          {[-1, 0, 1].map((s, i) => (
            <mesh
              key={`mane-${i}`}
              position={[s * 0.08, 0.07, 0.22 + Math.abs(s) * 0.02]}
              rotation={[0.4, s * 0.25, s * 0.2]}
              castShadow
            >
              <sphereGeometry args={[0.055 - Math.abs(s) * 0.008, 5, 4]} />
              <meshToonMaterial color={i === 1 ? SILVER : COAT_MID} />
            </mesh>
          ))}

          {/* Collar + tag */}
          <mesh position={[0, 0.05, 0.28]} rotation={[0.4, 0, 0]} castShadow>
            <torusGeometry args={[0.12, 0.018, 6, 14]} />
            <meshToonMaterial color={COLLAR} />
          </mesh>
          <mesh position={[0.02, -0.02, 0.36]} castShadow>
            <sphereGeometry args={[0.03, 5, 4]} />
            <meshToonMaterial color={TAG} />
            <Outlines color={COLORS.outline} thickness={0.4} />
          </mesh>

          {/* Head */}
          <group ref={headRef} position={[0, 0.16, 0.38]}>
            <mesh castShadow>
              <sphereGeometry args={[0.145, 8, 7]} />
              <meshToonMaterial color={COAT} />
              <Outlines color={COLORS.outline} thickness={1.2} />
            </mesh>
            <mesh
              position={[-0.07, 0.035, 0.07]}
              scale={[0.55, 0.5, 0.45]}
              castShadow
            >
              <sphereGeometry args={[0.085, 5, 4]} />
              <meshToonMaterial color={COAT_DARK} />
            </mesh>
            <mesh
              position={[0.075, 0.02, 0.05]}
              scale={[0.4, 0.45, 0.4]}
              castShadow
            >
              <sphereGeometry args={[0.075, 5, 4]} />
              <meshToonMaterial color={COAT_MID} />
            </mesh>
            {/* Long snout */}
            <mesh
              position={[0, -0.02, 0.15]}
              rotation={[0.15, 0, 0]}
              castShadow
            >
              <capsuleGeometry args={[0.055, 0.12, 4, 7]} />
              <meshToonMaterial color={COAT_MID} />
              <Outlines color={COLORS.outline} thickness={0.7} />
            </mesh>
            <mesh position={[0, -0.03, 0.24]} castShadow>
              <sphereGeometry args={[0.055, 6, 5]} />
              <meshToonMaterial color={COAT_DARK} />
            </mesh>
            <mesh position={[0, 0.0, 0.29]} castShadow>
              <sphereGeometry args={[0.035, 6, 5]} />
              <meshToonMaterial color={NOSE} />
              <Outlines color={COLORS.outline} thickness={0.5} />
            </mesh>
            <mesh position={[0, -0.01, 0.32]} scale={[1.2, 0.6, 0.5]}>
              <sphereGeometry args={[0.012, 4, 3]} />
              <meshToonMaterial color="#0a0a0c" />
            </mesh>
            <mesh position={[0, -0.045, 0.25]} rotation={[0.2, 0, 0]}>
              <boxGeometry args={[0.05, 0.01, 0.035]} />
              <meshToonMaterial color={NOSE} />
            </mesh>
            {/* Amber eyes */}
            {[-1, 1].map((s) => (
              <group key={`eye-${s}`} position={[s * 0.065, 0.045, 0.12]}>
                <mesh>
                  <sphereGeometry args={[0.028, 6, 5]} />
                  <meshToonMaterial color={EYE} />
                </mesh>
                <mesh position={[0.004 * s, 0.007, 0.01]}>
                  <sphereGeometry args={[0.012, 5, 4]} />
                  <meshToonMaterial color={EYE_LIGHT} />
                </mesh>
                <mesh position={[0.007 * s, 0.009, 0.015]}>
                  <sphereGeometry args={[0.006, 4, 3]} />
                  <meshToonMaterial color="#f8f0e0" />
                </mesh>
              </group>
            ))}
            {[-1, 1].map((s) => (
              <mesh
                key={`brow-${s}`}
                position={[s * 0.06, 0.09, 0.09]}
                rotation={[0.3, 0, s * 0.2]}
                castShadow
              >
                <sphereGeometry args={[0.03, 5, 4]} />
                <meshToonMaterial color={SILVER} />
              </mesh>
            ))}
            {/* Floppy ears */}
            <group
              ref={earLRef}
              position={[-0.11, 0.07, 0.0]}
              rotation={[0.15, 0.2, -0.55]}
            >
              <mesh castShadow>
                <capsuleGeometry args={[0.045, 0.13, 4, 6]} />
                <meshToonMaterial color={COAT_DARK} />
                <Outlines color={COLORS.outline} thickness={0.7} />
              </mesh>
              <mesh position={[0.01, -0.02, 0.02]} scale={[0.7, 0.85, 0.5]}>
                <capsuleGeometry args={[0.032, 0.09, 3, 5]} />
                <meshToonMaterial color="#8a7870" />
              </mesh>
            </group>
            <group
              ref={earRRef}
              position={[0.11, 0.07, 0.0]}
              rotation={[0.15, -0.2, 0.55]}
            >
              <mesh castShadow>
                <capsuleGeometry args={[0.045, 0.13, 4, 6]} />
                <meshToonMaterial color={COAT} />
                <Outlines color={COLORS.outline} thickness={0.7} />
              </mesh>
              <mesh position={[-0.01, -0.02, 0.02]} scale={[0.7, 0.85, 0.5]}>
                <capsuleGeometry args={[0.032, 0.09, 3, 5]} />
                <meshToonMaterial color="#9a8880" />
              </mesh>
            </group>
            <mesh
              position={[0, -0.09, 0.11]}
              scale={[1.0, 0.65, 0.85]}
              castShadow
            >
              <sphereGeometry args={[0.07, 5, 4]} />
              <meshToonMaterial color={SILVER} />
            </mesh>
          </group>

          {/* Fluffy tail */}
          <group ref={tailRef} position={[0, 0.12, -0.42]}>
            <mesh
              position={[0, 0.06, -0.08]}
              rotation={[0.7, 0, 0]}
              castShadow
            >
              <capsuleGeometry args={[0.042, 0.18, 4, 6]} />
              <meshToonMaterial color={COAT} />
              <Outlines color={COLORS.outline} thickness={0.7} />
            </mesh>
            <mesh
              position={[0, 0.14, -0.18]}
              rotation={[1.0, 0, 0]}
              castShadow
            >
              <capsuleGeometry args={[0.038, 0.14, 3, 5]} />
              <meshToonMaterial color={COAT_DARK} />
            </mesh>
            <mesh position={[0, 0.18, -0.26]} castShadow>
              <sphereGeometry args={[0.045, 5, 4]} />
              <meshToonMaterial color={COAT_MID} />
            </mesh>
          </group>

          {/* Legs: FL FR BL BR — closer together for slim build */}
          {[
            [-0.09, 0.02, 0.18],
            [0.09, 0.02, 0.18],
            [-0.09, 0.02, -0.2],
            [0.09, 0.02, -0.2],
          ].map((pos, i) => (
            <group
              key={i}
              ref={(el) => {
                legsRef.current[i] = el;
              }}
              position={pos}
            >
              <mesh position={[0, -0.14, 0]} castShadow>
                <capsuleGeometry args={[0.035, 0.18, 3, 6]} />
                <meshToonMaterial
                  color={i % 2 === 0 ? COAT_DARK : COAT}
                />
                <Outlines color={COLORS.outline} thickness={0.55} />
              </mesh>
              <mesh position={[0, -0.26, 0.02]} castShadow>
                <sphereGeometry args={[0.04, 5, 4]} />
                <meshToonMaterial color={COAT_DARK} />
              </mesh>
              <mesh position={[0, -0.28, 0.04]} scale={[1.1, 0.4, 0.9]}>
                <sphereGeometry args={[0.025, 4, 3]} />
                <meshToonMaterial color="#1a1a1c" />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}
