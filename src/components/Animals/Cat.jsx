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

const GREY = "#9a9aa0";
const GREY_DARK = "#6a6a72";
const WHITE = "#f5f0e8";
const BLACK = "#1e1e22";
const PINK = "#e8a0b0";

/** Shared track of the player — Player writes, Cat / Callie read */
export function createPlayerTrackState(initial = [0, 0, 8]) {
  return {
    position: new THREE.Vector3(...initial),
    yaw: 0,
    moving: false,
    mounted: false,
    /** True while mounted unicorn is airborne */
    airborne: false,
  };
}

const FOLLOW_DIST = 2.2; // try to stay this far behind player
const RUN_SPEED = 7.5;
const CATCH_UP = 11;
const STOP_DIST = 1.35; // close enough to settle
const SIT_DELAY = 0.45; // after stop before sit
const LAY_DELAY = 1.35; // after sit before lay
const CAT_RADIUS = 0.28;

const _target = new THREE.Vector3();
const _to = new THREE.Vector3();
const _next = new THREE.Vector3();

/**
 * Grey / white / black kitty — follows the player while they move;
 * sits then lies down when the player stops nearby.
 * Every 3–5 min visits barn food/water bowls (~30s), then resumes follow.
 */
export function Cat({
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
  const feedRef = useRef(createFeedState(0.85));
  const wingsActiveRef = useRef(false);
  const stateRef = useRef({
    mode: "walk", // walk | sit | lay | eat | drink | fly
    stopTimer: 0,
    sitTimer: 0,
    yaw: 0,
    pos: new THREE.Vector3(4, 0, 10),
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

    // Wings: out while unicorn flies; hold 5s after landing then retract
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

    // Skip meals while airborne chase
    const onMeal =
      !playerFlying &&
      st.pos.y < 0.5 &&
      updateCompanionMeal(st, feed, delta, 5.8);

    if (playerFlying || st.pos.y > 0.15) {
      // --- Air follow (unicorn flight) ---
      st.mode = "fly";
      st.stopTimer = 0;
      st.sitTimer = 0;
      if (feed.phase && feed.phase !== "idle") {
        // Abort meal trip mid-air
        feed.phase = "idle";
        feed.path = null;
        feed.hunger = Math.max(feed.hunger ?? 0, 30);
      }

      const backX = -Math.sin(pyaw);
      const backZ = -Math.cos(pyaw);
      const sideX = Math.cos(pyaw);
      const sideZ = -Math.sin(pyaw);
      const flyY = playerFlying ? Math.max(0.4, py + 0.35) : 0;
      _target.set(
        px + backX * FOLLOW_DIST + sideX * 0.4,
        flyY,
        pz + backZ * FOLLOW_DIST + sideZ * 0.4
      );

      _to.copy(_target).sub(st.pos);
      const dist = _to.length();
      if (dist > 0.08) {
        const speed = dist > 10 ? FLY_CATCH_UP : FLY_FOLLOW_SPEED;
        _to.normalize();
        const step = Math.min(dist, speed * delta);
        st.pos.x += _to.x * step;
        st.pos.y += _to.y * step;
        st.pos.z += _to.z * step;
        st.yaw = Math.atan2(_to.x, _to.z);
        st.walkPhase += delta * 16;
      }
      if (!playerFlying && st.pos.y < 0.05) st.pos.y = 0;
    } else if (!onMeal) {
      // Desired point: a little behind the player
      const backX = -Math.sin(pyaw);
      const backZ = -Math.cos(pyaw);
      _target.set(
        px + backX * FOLLOW_DIST + Math.cos(pyaw) * 0.35,
        0,
        pz + backZ * FOLLOW_DIST - Math.sin(pyaw) * 0.35
      );

      _to.copy(_target).sub(st.pos);
      _to.y = 0;
      const dist = _to.length();
      const playerMoving = !!track.moving;

      // --- Mode machine ---
      let wantFollow = playerMoving || dist > STOP_DIST * 1.35;

      if (wantFollow) {
        st.mode = "walk";
        st.stopTimer = 0;
        st.sitTimer = 0;

        const speed = dist > 8 ? CATCH_UP : RUN_SPEED;
        if (dist > 0.08) {
          _to.normalize();
          const step = Math.min(dist, speed * delta);
          st.pos.x += _to.x * step;
          st.pos.z += _to.z * step;
          st.yaw = Math.atan2(_to.x, _to.z);
          st.walkPhase += delta * (dist > 8 ? 16 : 11);
        }
      } else {
        // Near player and not moving — settle
        st.stopTimer += delta;
        if (
          st.mode === "walk" ||
          st.mode === "eat" ||
          st.mode === "drink" ||
          st.mode === "fly"
        ) {
          if (st.stopTimer >= SIT_DELAY) {
            st.mode = "sit";
            st.sitTimer = 0;
          } else {
            st.mode = "walk";
          }
        } else if (st.mode === "sit") {
          st.sitTimer += delta;
          if (st.sitTimer >= LAY_DELAY) st.mode = "lay";
        }
        // Face toward player while resting
        const faceX = px - st.pos.x;
        const faceZ = pz - st.pos.z;
        if (faceX * faceX + faceZ * faceZ > 0.01) {
          const targetYaw = Math.atan2(faceX, faceZ);
          let dy = targetYaw - st.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          st.yaw += dy * Math.min(1, delta * 4);
        }
        st.walkPhase *= 0.9;
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
        CAT_RADIUS,
        cabinState,
        barnDoorState,
        gateState
      );
      resolveAnimalOverlaps(_next, CAT_RADIUS, "cat");
      st.pos.x = _next.x;
      st.pos.z = _next.z;
    }
    setAnimalBody("cat", st.pos.x, st.pos.z, CAT_RADIUS);

    g.position.set(st.pos.x, st.pos.y, st.pos.z);
    g.rotation.y = st.yaw;

    // --- Pose ---
    const mode = st.mode;
    const swing = Math.sin(st.walkPhase);
    const t = performance.now() * 0.001;
    const feeding = mode === "eat" || mode === "drink";
    const flying = mode === "fly";

    if (bodyRef.current) {
      if (flying) {
        bodyRef.current.position.y = 0.22 + Math.sin(t * 14) * 0.04;
        bodyRef.current.rotation.x = -0.15;
        bodyRef.current.rotation.z = swing * 0.06;
      } else if (mode === "walk") {
        bodyRef.current.position.y = 0.22 + Math.abs(swing) * 0.03;
        bodyRef.current.rotation.x = 0;
        bodyRef.current.rotation.z = swing * 0.04;
      } else if (feeding) {
        bodyRef.current.position.y = 0.18;
        bodyRef.current.rotation.x = 0.2;
        bodyRef.current.rotation.z = 0;
      } else if (mode === "sit") {
        bodyRef.current.position.y = 0.18;
        bodyRef.current.rotation.x = -0.55; // haunches down
        bodyRef.current.rotation.z = 0;
      } else {
        // lay
        bodyRef.current.position.y = 0.1;
        bodyRef.current.rotation.x = -0.15;
        bodyRef.current.rotation.z = 0.75; // roll slightly onto side
      }
    }

    if (headRef.current) {
      if (mode === "walk") {
        headRef.current.position.set(0, 0.12, 0.28);
        headRef.current.rotation.set(0.1, 0, 0);
      } else if (feeding) {
        const bob = Math.sin(t * (mode === "drink" ? 8 : 6)) * 0.05;
        headRef.current.position.set(0, 0.0 + bob * 0.2, 0.3);
        headRef.current.rotation.set(0.9 + bob, 0, 0);
      } else if (mode === "sit") {
        headRef.current.position.set(0, 0.18, 0.22);
        headRef.current.rotation.set(0.25, 0, 0);
      } else {
        headRef.current.position.set(0.08, 0.06, 0.22);
        headRef.current.rotation.set(0.1, 0.3, 0.2);
      }
    }

    if (tailRef.current) {
      if (mode === "walk") {
        tailRef.current.rotation.x = -0.4 + swing * 0.25;
        tailRef.current.rotation.y = swing * 0.4;
        tailRef.current.position.set(0, 0.1, -0.28);
      } else if (feeding) {
        tailRef.current.rotation.x = -0.2;
        tailRef.current.rotation.y = Math.sin(t * 2.5) * 0.2;
        tailRef.current.position.set(0, 0.08, -0.26);
      } else if (mode === "sit") {
        tailRef.current.rotation.x = 0.2;
        tailRef.current.rotation.y = Math.sin(performance.now() * 0.003) * 0.3;
        tailRef.current.position.set(0, 0.05, -0.22);
      } else {
        tailRef.current.rotation.x = 0.5;
        tailRef.current.rotation.y = 0.8;
        tailRef.current.position.set(-0.05, 0.02, -0.2);
      }
    }

    // Legs
    legsRef.current.forEach((leg, i) => {
      if (!leg) return;
      const side = i % 2 === 0 ? -1 : 1;
      const front = i < 2;
      if (flying) {
        leg.rotation.x = front ? 0.5 : -0.35;
        leg.position.y = 0.02;
        leg.visible = true;
      } else if (mode === "walk") {
        const phase = swing * (front ? 1 : -1) * side;
        leg.rotation.x = phase * 0.55;
        leg.position.y = 0;
        leg.visible = true;
      } else if (feeding) {
        leg.rotation.x = front ? 0.2 : -0.05;
        leg.position.y = 0;
        leg.visible = true;
      } else if (mode === "sit") {
        // Front legs straight-ish, back tucked
        leg.rotation.x = front ? 0.15 : 1.1;
        leg.position.y = front ? 0 : 0.02;
        leg.visible = true;
      } else {
        // Lay — tuck legs
        leg.rotation.x = 0.9;
        leg.position.y = 0.02;
        leg.visible = true;
      }
    });
  });

  return (
    <group
      ref={groupRef}
      position={[4, 0, 10]}
      userData={{ ignoreCameraCollision: true }}
    >
      <group ref={bodyRef} position={[0, 0.22, 0]}>
        <CompanionWings
          activeRef={wingsActiveRef}
          color="#d8d0e8"
          colorTip="#b0a0d0"
          scale={0.95}
          position={[0, 0.1, -0.04]}
        />
        {/* Body — grey */}
        <mesh castShadow>
          <capsuleGeometry args={[0.14, 0.28, 4, 8]} />
          <meshToonMaterial color={GREY} />
          <Outlines color={COLORS.outline} thickness={1.2} />
        </mesh>
        {/* White chest / belly */}
        <mesh position={[0, -0.04, 0.06]} scale={[0.85, 0.7, 0.9]} castShadow>
          <sphereGeometry args={[0.13, 6, 5]} />
          <meshToonMaterial color={WHITE} />
        </mesh>
        {/* Black saddle patch */}
        <mesh position={[0, 0.08, -0.02]} scale={[0.7, 0.35, 0.8]} castShadow>
          <sphereGeometry args={[0.12, 6, 5]} />
          <meshToonMaterial color={BLACK} />
        </mesh>
        {/* Side black stripes */}
        {[-1, 1].map((s) => (
          <mesh
            key={`stripe-${s}`}
            position={[s * 0.12, 0.02, 0.02]}
            rotation={[0, 0, s * 0.2]}
            castShadow
          >
            <boxGeometry args={[0.04, 0.1, 0.22]} />
            <meshToonMaterial color={BLACK} />
          </mesh>
        ))}

        {/* Head */}
        <group ref={headRef} position={[0, 0.12, 0.28]}>
          <mesh castShadow>
            <sphereGeometry args={[0.13, 7, 6]} />
            <meshToonMaterial color={GREY} />
            <Outlines color={COLORS.outline} thickness={1.1} />
          </mesh>
          {/* White muzzle */}
          <mesh position={[0, -0.03, 0.1]} castShadow>
            <sphereGeometry args={[0.07, 6, 5]} />
            <meshToonMaterial color={WHITE} />
          </mesh>
          {/* Black eye patches */}
          {[-1, 1].map((s) => (
            <mesh key={`ep-${s}`} position={[s * 0.07, 0.03, 0.08]} castShadow>
              <sphereGeometry args={[0.04, 5, 4]} />
              <meshToonMaterial color={BLACK} />
            </mesh>
          ))}
          {/* Eyes */}
          {[-1, 1].map((s) => (
            <mesh key={`eye-${s}`} position={[s * 0.06, 0.04, 0.11]}>
              <sphereGeometry args={[0.028, 5, 4]} />
              <meshToonMaterial color="#2a8a40" />
            </mesh>
          ))}
          {/* Nose */}
          <mesh position={[0, -0.02, 0.15]}>
            <sphereGeometry args={[0.02, 4, 4]} />
            <meshToonMaterial color={PINK} />
          </mesh>
          {/* Ears */}
          {[-1, 1].map((s) => (
            <group
              key={`ear-${s}`}
              position={[s * 0.08, 0.12, -0.02]}
              rotation={[0.15, 0, s * 0.35]}
            >
              <mesh castShadow>
                <coneGeometry args={[0.05, 0.1, 4]} />
                <meshToonMaterial color={GREY_DARK} />
                <Outlines color={COLORS.outline} thickness={0.7} />
              </mesh>
              <mesh position={[0, 0.01, 0.01]} scale={[0.6, 0.7, 0.5]}>
                <coneGeometry args={[0.04, 0.08, 4]} />
                <meshToonMaterial color={PINK} />
              </mesh>
            </group>
          ))}
          {/* Whiskers */}
          {[-1, 1].map((s) =>
            [-0.02, 0.02].map((y, i) => (
              <mesh
                key={`w-${s}-${i}`}
                position={[s * 0.04, y - 0.02, 0.12]}
                rotation={[0, 0, s * 0.15]}
              >
                <boxGeometry args={[0.12, 0.008, 0.008]} />
                <meshToonMaterial color={WHITE} />
              </mesh>
            ))
          )}
        </group>

        {/* Tail */}
        <group ref={tailRef} position={[0, 0.1, -0.28]}>
          <mesh position={[0, 0.08, -0.06]} rotation={[0.6, 0, 0]} castShadow>
            <capsuleGeometry args={[0.035, 0.16, 3, 5]} />
            <meshToonMaterial color={GREY} />
            <Outlines color={COLORS.outline} thickness={0.6} />
          </mesh>
          <mesh position={[0, 0.18, -0.14]} rotation={[0.9, 0, 0]} castShadow>
            <capsuleGeometry args={[0.03, 0.12, 3, 5]} />
            <meshToonMaterial color={BLACK} />
          </mesh>
          <mesh position={[0, 0.24, -0.2]} castShadow>
            <sphereGeometry args={[0.035, 5, 4]} />
            <meshToonMaterial color={WHITE} />
          </mesh>
        </group>

        {/* Legs: FL FR BL BR */}
        {[
          [-0.09, 0.08, 0.12],
          [0.09, 0.08, 0.12],
          [-0.09, 0.08, -0.14],
          [0.09, 0.08, -0.14],
        ].map((pos, i) => (
          <group
            key={i}
            ref={(el) => {
              legsRef.current[i] = el;
            }}
            position={pos}
          >
            <mesh position={[0, -0.1, 0]} castShadow>
              <capsuleGeometry args={[0.035, 0.12, 3, 5]} />
              <meshToonMaterial color={i % 2 === 0 ? GREY_DARK : BLACK} />
              <Outlines color={COLORS.outline} thickness={0.5} />
            </mesh>
            {/* White paw tips */}
            <mesh position={[0, -0.18, 0.01]} castShadow>
              <sphereGeometry args={[0.04, 5, 4]} />
              <meshToonMaterial color={WHITE} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
