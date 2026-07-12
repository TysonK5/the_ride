import { useRef, forwardRef, useImperativeHandle } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";

const WHITE = "#f5f5f0";
const WHITE_SHADE = "#e8e4dc";
const MANE = "#ece8e0";
const MANE_DARK = "#d0ccc4";
const HOOF = "#2a2a28";
const SADDLE = "#6b4423";
const SADDLE_DARK = "#4a2e16";
const SADDLE_LIGHT = "#8a5a32";
const BLANKET = "#3a4a5a";
const BLANKET_TRIM = "#c4a060";
const BAG = "#2a2218";
const REIN = "#3a2810";

export const MOUNT_RANGE = 3.5;
export const RIDE_SPEED = 14;

/** Shared mutable ride state (Player writes, Horse reads). */
export function createRideState(initialPos = [10, 0, 12]) {
  return {
    mounted: false,
    /** True while mount/dismount animation plays — blocks control */
    busy: false,
    /** Horse drinking at shore */
    drinking: false,
    /** Elapsed seconds of drink animation (0 → DRINK_DURATION) */
    drinkTimer: 0,
    /** After a drink, next E dismounts even if still at shore */
    justDrank: false,
    position: new THREE.Vector3(...initialPos),
    yaw: 0,
    moving: false,
    sprinting: false,
    near: false,
  };
}

export const DRINK_DURATION = 3;

/**
 * Leg from hip `position` down so the hoof sole sits on y=0.
 * hipY should be ~0.82 so hoof center at y≈radius.
 */
function Leg({ position, sign, thick = 0.12 }) {
  const hipY = position[1];
  const hoofR = thick * 1.05;
  // Hoof center so bottom touches ground: hipY + hoofLocalY - hoofR = 0
  const hoofLocalY = -(hipY - hoofR);
  const shinY = hoofLocalY + 0.2;
  const thighY = shinY + 0.28;

  return (
    <group position={position} userData={{ leg: sign }}>
      {/* Upper leg */}
      <mesh position={[0, thighY, 0]} castShadow>
        <capsuleGeometry args={[thick, 0.28, 4, 6]} />
        <meshToonMaterial color={WHITE} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      {/* Lower leg */}
      <mesh position={[0, shinY, 0.02]} castShadow>
        <capsuleGeometry args={[thick * 0.75, 0.22, 4, 6]} />
        <meshToonMaterial color={WHITE_SHADE} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>
      {/* Rounded hoof — sole on the ground */}
      <mesh position={[0, hoofLocalY, 0.04]} castShadow>
        <sphereGeometry args={[hoofR, 6, 5]} />
        <meshToonMaterial color={HOOF} />
      </mesh>
    </group>
  );
}

/**
 * Mane in neck-pivot local space so it follows head when drinking.
 * Neck pivot is at (0, 1.35, 0.5) horse-local.
 */
function FlowingMane({ rideState, gaitRef }) {
  const strandsRef = useRef([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const move = rideState?.moving || rideState?.drinking ? 1 : 0.35;
    const sprint = rideState?.sprinting ? 1.4 : 1;
    const gait = gaitRef?.current ?? 0;

    strandsRef.current.forEach((strand, i) => {
      if (!strand) return;
      const phase = t * (2.2 + i * 0.15) * sprint + i * 0.7 + gait * 0.3;
      const sway = Math.sin(phase) * 0.18 * move;
      const bob = Math.cos(phase * 1.3) * 0.08 * move;
      strand.rotation.z = sway * (1 + i * 0.12);
      strand.rotation.x = 0.15 + bob * (1 + i * 0.08);
    });
  });

  // Local to neck pivot (was absolute horse positions minus pivot)
  const bases = [
    [0, 0.12, 0.08],
    [0, 0.25, 0.22],
    [0, 0.38, 0.36],
    [0, 0.5, 0.48],
    [0, 0.6, 0.58],
  ];

  return (
    <group>
      {bases.map((pos, i) => (
        <group
          key={i}
          ref={(el) => {
            strandsRef.current[i] = el;
          }}
          position={pos}
        >
          <mesh position={[0, 0.12, -0.02]} castShadow>
            <capsuleGeometry args={[0.05 - i * 0.004, 0.22, 3, 5]} />
            <meshToonMaterial color={i % 2 === 0 ? MANE : MANE_DARK} />
            <Outlines color={COLORS.outline} thickness={0.6} />
          </mesh>
          <mesh
            position={[-0.06, 0.08, 0]}
            rotation={[0, 0, 0.35]}
            castShadow
          >
            <capsuleGeometry args={[0.03, 0.14, 3, 4]} />
            <meshToonMaterial color={MANE_DARK} />
          </mesh>
          <mesh
            position={[0.06, 0.08, 0]}
            rotation={[0, 0, -0.35]}
            castShadow
          >
            <capsuleGeometry args={[0.03, 0.14, 3, 4]} />
            <meshToonMaterial color={MANE} />
          </mesh>
        </group>
      ))}
      {/* Forelock near ears (head-relative within pivot) */}
      <mesh position={[0, 0.82, 0.68]} castShadow>
        <capsuleGeometry args={[0.04, 0.16, 3, 5]} />
        <meshToonMaterial color={MANE} />
        <Outlines color={COLORS.outline} thickness={0.6} />
      </mesh>
    </group>
  );
}

/** Multi-segment flowing tail */
function FlowingTail({ rideState, gaitRef }) {
  const segRefs = useRef([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const move = rideState?.moving ? 1 : 0.4;
    const sprint = rideState?.sprinting ? 1.5 : 1;
    const gait = gaitRef?.current ?? 0;

    segRefs.current.forEach((seg, i) => {
      if (!seg) return;
      const phase = t * (2.5 * sprint) + i * 0.55 + gait * 0.25;
      const side = Math.sin(phase) * (0.22 + i * 0.06) * move;
      const lift = Math.cos(phase * 0.9) * (0.1 + i * 0.04) * move;
      seg.rotation.y = side;
      seg.rotation.x = 0.35 + i * 0.12 + lift;
    });
  });

  return (
    <group position={[0, 1.12, -0.85]}>
      {/* Dock */}
      <mesh castShadow>
        <sphereGeometry args={[0.1, 6, 5]} />
        <meshToonMaterial color={MANE_DARK} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>

      {/* Cascading tail segments */}
      {[0, 1, 2, 3, 4].map((i) => (
        <group
          key={i}
          ref={(el) => {
            segRefs.current[i] = el;
          }}
          position={[0, -0.08 - i * 0.18, -0.12 - i * 0.1]}
        >
          <mesh castShadow>
            <capsuleGeometry
              args={[0.09 - i * 0.01, 0.16 - i * 0.015, 4, 6]}
            />
            <meshToonMaterial color={i % 2 === 0 ? MANE : MANE_DARK} />
            <Outlines color={COLORS.outline} thickness={0.7} />
          </mesh>
          {/* Soft outer fluff */}
          {i < 4 && (
            <>
              <mesh position={[-0.07, -0.04, 0]} castShadow>
                <sphereGeometry args={[0.06 - i * 0.008, 5, 4]} />
                <meshToonMaterial color={MANE} />
              </mesh>
              <mesh position={[0.07, -0.04, 0]} castShadow>
                <sphereGeometry args={[0.06 - i * 0.008, 5, 4]} />
                <meshToonMaterial color={MANE_DARK} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
}

function HorseBody({ gaitRef, rideState }) {
  const rootRef = useRef();
  const neckPivotRef = useRef();
  const drinkAngleRef = useRef(0);

  useFrame((_, delta) => {
    if (!rootRef.current) return;
    const amp = rideState?.sprinting ? 0.7 : 0.45;
    const swing = Math.sin(gaitRef.current) * amp;
    for (const child of rootRef.current.children) {
      if (child.userData?.leg != null) {
        child.rotation.x = swing * child.userData.leg;
      }
    }

    // Drink: dip head to water then raise (3s total)
    // 0–0.4s lower, 0.4–2.4s hold, 2.4–3.0s raise
    let targetDip = 0;
    if (rideState?.drinking) {
      const t = rideState.drinkTimer ?? 0;
      if (t < 0.4) {
        targetDip = (t / 0.4) * 0.95; // lower
      } else if (t < 2.4) {
        targetDip = 0.95 + Math.sin(t * 8) * 0.03; // hold + sip bob
      } else if (t < DRINK_DURATION) {
        targetDip = 0.95 * (1 - (t - 2.4) / 0.6); // raise
      }
    }
    drinkAngleRef.current = THREE.MathUtils.lerp(
      drinkAngleRef.current,
      targetDip,
      1 - Math.exp(-10 * delta)
    );
    if (neckPivotRef.current) {
      // Rest neck already tilted; add dip toward ground/water
      neckPivotRef.current.rotation.x = drinkAngleRef.current;
    }
  });

  return (
    <group ref={rootRef}>
      {/* === Rounded torso (heights tuned so legs reach the ground) === */}
      <mesh position={[0, 1.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.95, 6, 10]} />
        <meshToonMaterial color={WHITE} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      {/* Chest / barrel blend */}
      <mesh position={[0, 0.95, 0.55]} castShadow>
        <sphereGeometry args={[0.22, 8, 7]} />
        <meshToonMaterial color={WHITE} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
      {/* Rump */}
      <mesh position={[0, 1.05, -0.55]} castShadow>
        <sphereGeometry args={[0.21, 8, 7]} />
        <meshToonMaterial color={WHITE_SHADE} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>

      {/* Neck+head pivot (withers) — dips when drinking */}
      <group ref={neckPivotRef} position={[0, 1.22, 0.5]}>
        {/* === Neck (tilted capsule) === */}
        <mesh position={[0, 0.22, 0.38]} rotation={[0.55, 0, 0]} castShadow>
          <capsuleGeometry args={[0.14, 0.38, 4, 8]} />
          <meshToonMaterial color={WHITE} />
          <Outlines color={COLORS.outline} thickness={1.5} />
        </mesh>

        {/* === Head (continuous skull → cheek → muzzle) === */}
        <group position={[0, 0.55, 0.65]}>
          <mesh castShadow>
            <sphereGeometry args={[0.19, 8, 7]} />
            <meshToonMaterial color={WHITE} />
            <Outlines color={COLORS.outline} thickness={1.5} />
          </mesh>
          <mesh position={[0, -0.04, 0.18]} rotation={[0.35, 0, 0]} castShadow>
            <capsuleGeometry args={[0.125, 0.16, 4, 8]} />
            <meshToonMaterial color={WHITE} />
            <Outlines color={COLORS.outline} thickness={1.2} />
          </mesh>
          <mesh position={[0, -0.06, 0.28]} castShadow>
            <sphereGeometry args={[0.13, 7, 6]} />
            <meshToonMaterial color={WHITE} />
          </mesh>
          <mesh position={[0, -0.1, 0.42]} castShadow>
            <sphereGeometry args={[0.125, 7, 6]} />
            <meshToonMaterial color={WHITE_SHADE} />
            <Outlines color={COLORS.outline} thickness={1} />
          </mesh>
          <mesh position={[0, -0.16, 0.38]} castShadow>
            <sphereGeometry args={[0.095, 6, 5]} />
            <meshToonMaterial color={WHITE_SHADE} />
          </mesh>
          {[-0.045, 0.045].map((x, i) => (
            <mesh key={`nos-${i}`} position={[x, -0.08, 0.54]}>
              <sphereGeometry args={[0.025, 4, 4]} />
              <meshToonMaterial color="#3a3030" />
            </mesh>
          ))}
          {[-0.1, 0.1].map((x, i) => (
            <mesh
              key={`ear-${i}`}
              position={[x, 0.28, -0.06]}
              rotation={[0.2, 0, x > 0 ? -0.2 : 0.2]}
              castShadow
            >
              <capsuleGeometry args={[0.04, 0.1, 3, 5]} />
              <meshToonMaterial color={WHITE} />
              <Outlines color={COLORS.outline} thickness={0.8} />
            </mesh>
          ))}
          {[-0.13, 0.13].map((x, i) => (
            <mesh key={`eye-${i}`} position={[x, 0.06, 0.16]}>
              <sphereGeometry args={[0.045, 5, 5]} />
              <meshToonMaterial color="#1a1a1a" />
            </mesh>
          ))}
          <Bridle />
          {/* Bit anchors for reins (follow head/neck when drinking) */}
          <group position={[-0.14, -0.12, 0.48]} userData={{ bitAnchor: "L" }} />
          <group position={[0.14, -0.12, 0.48]} userData={{ bitAnchor: "R" }} />
        </group>
        {/* Mane rides with neck/head */}
        <FlowingMane rideState={rideState} gaitRef={gaitRef} />
      </group>

      <FlowingTail rideState={rideState} gaitRef={gaitRef} />

      {/* Reins track bit anchors in world space */}
      <Reins rideState={rideState} neckPivotRef={neckPivotRef} />

      <WesternSaddle />

      {/* Legs — hip height 0.82 so hoof soles sit on y=0 */}
      <Leg position={[-0.13, 0.82, 0.5]} sign={1} thick={0.095} />
      <Leg position={[0.13, 0.82, 0.5]} sign={-1} thick={0.095} />
      <Leg position={[-0.14, 0.82, -0.5]} sign={-1} thick={0.1} />
      <Leg position={[0.14, 0.82, -0.5]} sign={1} thick={0.1} />
    </group>
  );
}

/** Western saddle — thin, rounded forms (less blocky) */
function WesternSaddle() {
  return (
    <group position={[0, 1.37, -0.05]}>
      {/* === Soft blanket pad === */}
      <mesh position={[0, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.28, 5, 10]} />
        <meshToonMaterial color={BLANKET} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>
      {/* Trim rings front/back */}
      <mesh position={[0, -0.01, 0.26]} castShadow>
        <torusGeometry args={[0.2, 0.015, 5, 12]} />
        <meshToonMaterial color={BLANKET_TRIM} />
      </mesh>
      <mesh position={[0, -0.01, -0.26]} castShadow>
        <torusGeometry args={[0.2, 0.015, 5, 12]} />
        <meshToonMaterial color={BLANKET_TRIM} />
      </mesh>

      {/* === Rounded seat tree === */}
      <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.22, 5, 10]} />
        <meshToonMaterial color={SADDLE} />
        <Outlines color={COLORS.outline} thickness={1.2} />
      </mesh>
      {/* Soft seat cushion */}
      <mesh position={[0, 0.14, 0.02]} castShadow>
        <sphereGeometry args={[0.14, 8, 6]} />
        <meshToonMaterial color={SADDLE_DARK} />
      </mesh>

      {/* Side skirts — thin curved leather */}
      {[-1, 1].map((side) => (
        <mesh
          key={`skirt-${side}`}
          position={[side * 0.2, 0.0, 0]}
          rotation={[0.2, 0, side * 0.55]}
          castShadow
        >
          <capsuleGeometry args={[0.08, 0.18, 4, 8]} />
          <meshToonMaterial color={SADDLE_DARK} />
          <Outlines color={COLORS.outline} thickness={0.8} />
        </mesh>
      ))}

      {/* === Pommel + slim horn === */}
      <mesh position={[0, 0.14, 0.18]} castShadow>
        <sphereGeometry args={[0.09, 7, 6]} />
        <meshToonMaterial color={SADDLE_LIGHT} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0, 0.26, 0.18]} castShadow>
        <capsuleGeometry args={[0.025, 0.08, 4, 6]} />
        <meshToonMaterial color={SADDLE_DARK} />
      </mesh>
      <mesh position={[0, 0.33, 0.18]} castShadow>
        <sphereGeometry args={[0.055, 7, 6]} />
        <meshToonMaterial color={SADDLE_LIGHT} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>

      {/* === Rounded cantle === */}
      <mesh position={[0, 0.16, -0.18]} castShadow>
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshToonMaterial color={SADDLE_LIGHT} />
        <Outlines color={COLORS.outline} thickness={1.2} />
      </mesh>
      <mesh position={[0, 0.2, -0.2]} scale={[1.15, 0.55, 0.7]} castShadow>
        <sphereGeometry args={[0.1, 7, 5]} />
        <meshToonMaterial color={SADDLE} />
      </mesh>

      {/* === Thin cinch straps === */}
      <mesh position={[0, -0.28, 0.04]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.018, 0.42, 3, 6]} />
        <meshToonMaterial color={REIN} />
      </mesh>
      <mesh position={[0, -0.48, 0.04]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.015, 0.36, 3, 6]} />
        <meshToonMaterial color={REIN} />
      </mesh>
      <mesh position={[0.2, -0.18, 0.06]} castShadow>
        <sphereGeometry args={[0.035, 5, 5]} />
        <meshToonMaterial color={COLORS.gold} />
      </mesh>

      {/* === Soft saddlebags === */}
      {[-1, 1].map((side) => (
        <group key={`bag-${side}`} position={[side * 0.22, 0.0, -0.38]}>
          <mesh castShadow>
            <sphereGeometry args={[0.11, 7, 6]} />
            <meshToonMaterial color={BAG} />
            <Outlines color={COLORS.outline} thickness={1} />
          </mesh>
          <mesh position={[0, 0.06, 0]} scale={[1.05, 0.45, 1.05]} castShadow>
            <sphereGeometry args={[0.1, 6, 5]} />
            <meshToonMaterial color={SADDLE_DARK} />
          </mesh>
          <mesh position={[0, 0.0, 0.08]} castShadow>
            <capsuleGeometry args={[0.012, 0.08, 3, 5]} />
            <meshToonMaterial color={REIN} />
          </mesh>
        </group>
      ))}
      {/* Slim bedroll */}
      <mesh position={[0, 0.18, -0.34]} rotation={[0.35, 0, Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.055, 0.22, 4, 8]} />
        <meshToonMaterial color="#4a5a3a" />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>

      {/* === Stirrups far out so boots hang visible off the sides === */}
      {[-1, 1].map((side) => (
        <group key={`stirrup-${side}`} position={[side * 0.52, -0.08, 0.08]}>
          <mesh position={[0, -0.12, 0]} castShadow>
            <capsuleGeometry args={[0.035, 0.14, 4, 6]} />
            <meshToonMaterial color={SADDLE} />
          </mesh>
          <mesh position={[0, -0.32, 0]} castShadow>
            <capsuleGeometry args={[0.014, 0.28, 3, 5]} />
            <meshToonMaterial color={REIN} />
          </mesh>
          <mesh
            position={[0, -0.55, 0.01]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <torusGeometry args={[0.075, 0.014, 5, 12]} />
            <meshToonMaterial color="#8a8070" />
          </mesh>
          <mesh position={[0, -0.59, 0.01]} castShadow>
            <capsuleGeometry args={[0.02, 0.07, 3, 5]} />
            <meshToonMaterial color="#8a8070" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Leather bridle / harness on the head */
function Bridle() {
  const leather = REIN;
  const metal = COLORS.gold;

  return (
    <group>
      {/* Noseband */}
      <mesh position={[0, -0.1, 0.4]} rotation={[0.2, 0, 0]}>
        <torusGeometry args={[0.15, 0.018, 6, 14]} />
        <meshToonMaterial color={leather} />
      </mesh>
      {/* Browband */}
      <mesh position={[0, 0.12, 0.05]} rotation={[1.2, 0, 0]}>
        <torusGeometry args={[0.18, 0.016, 6, 12, Math.PI]} />
        <meshToonMaterial color={leather} />
      </mesh>
      {/* Cheek pieces (left / right) */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.15, 0.0, 0.2]}
          rotation={[0.4, 0, side * 0.15]}
          castShadow
        >
          <capsuleGeometry args={[0.015, 0.28, 3, 5]} />
          <meshToonMaterial color={leather} />
        </mesh>
      ))}
      {/* Throatlatch under jaw */}
      <mesh position={[0, -0.18, 0.08]} rotation={[1.1, 0, 0]}>
        <torusGeometry args={[0.14, 0.012, 5, 12, Math.PI]} />
        <meshToonMaterial color={leather} />
      </mesh>
      {/* Crown piece over poll */}
      <mesh position={[0, 0.2, -0.02]} rotation={[0.3, 0, 0]} castShadow>
        <capsuleGeometry args={[0.018, 0.22, 3, 5]} />
        <meshToonMaterial color={leather} />
      </mesh>
      {/* Bit rings */}
      {[-1, 1].map((side) => (
        <mesh key={`bit-${side}`} position={[side * 0.14, -0.12, 0.48]}>
          <torusGeometry args={[0.04, 0.01, 5, 10]} />
          <meshToonMaterial color={metal} />
        </mesh>
      ))}
      {/* Bit bar */}
      <mesh position={[0, -0.12, 0.48]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.012, 0.22, 3, 5]} />
        <meshToonMaterial color={metal} />
      </mesh>
    </group>
  );
}

/** Reins: bit anchors under head → rider hands (or draped on neck) */
function Reins({ rideState, neckPivotRef }) {
  const groupRef = useRef();
  const leftRef = useRef();
  const rightRef = useRef();
  const leftMidRef = useRef();
  const rightMidRef = useRef();

  useFrame(() => {
    const mounted = !!rideState?.mounted;
    const root = groupRef.current?.parent;
    if (!root || !neckPivotRef?.current) return;

    // Bit anchors are children of head group under neck pivot — get horse-local pos
    neckPivotRef.current.updateWorldMatrix(true, true);
    root.updateWorldMatrix(true, true);

    // Head local bit offsets (same as Bridle bit rings)
    _tmp.set(-0.14, -0.12, 0.48);
    // Head is at (0, 0.55, 0.65) under neck pivot
    _bitL.set(-0.14, 0.55 - 0.12, 0.65 + 0.48);
    _bitR.set(0.14, 0.55 - 0.12, 0.65 + 0.48);
    // Transform by neck pivot (includes drink dip) into horse body space
    neckPivotRef.current.localToWorld(_bitL);
    neckPivotRef.current.localToWorld(_bitR);
    root.worldToLocal(_bitL);
    root.worldToLocal(_bitR);

    const handL = mounted
      ? _handL.set(-0.22, 1.58, 0.35)
      : _handL.set(-0.12, 1.42, 0.7);
    const handR = mounted
      ? _handR.set(0.22, 1.58, 0.35)
      : _handR.set(0.12, 1.42, 0.7);

    const midL = _midL
      .copy(_bitL)
      .lerp(handL, 0.5)
      .add(_tmp.set(mounted ? -0.04 : -0.06, mounted ? 0.05 : -0.04, 0));
    const midR = _midR
      .copy(_bitR)
      .lerp(handR, 0.5)
      .add(_tmp.set(mounted ? 0.04 : 0.06, mounted ? 0.05 : -0.04, 0));

    placeReinSegment(leftRef.current, _bitL, midL);
    placeReinSegment(leftMidRef.current, midL, handL);
    placeReinSegment(rightRef.current, _bitR, midR);
    placeReinSegment(rightMidRef.current, midR, handR);
  });

  return (
    <group ref={groupRef}>
      <mesh ref={leftRef} castShadow>
        <capsuleGeometry args={[0.015, 1, 3, 5]} />
        <meshToonMaterial color={REIN} />
      </mesh>
      <mesh ref={leftMidRef} castShadow>
        <capsuleGeometry args={[0.015, 1, 3, 5]} />
        <meshToonMaterial color={REIN} />
      </mesh>
      <mesh ref={rightRef} castShadow>
        <capsuleGeometry args={[0.015, 1, 3, 5]} />
        <meshToonMaterial color={REIN} />
      </mesh>
      <mesh ref={rightMidRef} castShadow>
        <capsuleGeometry args={[0.015, 1, 3, 5]} />
        <meshToonMaterial color={REIN} />
      </mesh>
      {rideState?.mounted && (
        <>
          <mesh position={[-0.22, 1.58, 0.35]} castShadow>
            <sphereGeometry args={[0.04, 5, 5]} />
            <meshToonMaterial color={REIN} />
          </mesh>
          <mesh position={[0.22, 1.58, 0.35]} castShadow>
            <sphereGeometry args={[0.04, 5, 5]} />
            <meshToonMaterial color={REIN} />
          </mesh>
        </>
      )}
    </group>
  );
}

const _bitL = new THREE.Vector3();
const _bitR = new THREE.Vector3();
const _handL = new THREE.Vector3();
const _handR = new THREE.Vector3();
const _midL = new THREE.Vector3();
const _midR = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

function placeReinSegment(mesh, from, to) {
  if (!mesh) return;
  _dir.copy(to).sub(from);
  const len = Math.max(_dir.length(), 0.05);
  _mid.copy(from).add(to).multiplyScalar(0.5);
  mesh.position.copy(_mid);
  // Capsule default axis is Y — aim Y along the rein
  _dir.normalize();
  _quat.setFromUnitVectors(_up, _dir);
  mesh.quaternion.copy(_quat);
  mesh.scale.set(1, len, 1);
}

export const Horse = forwardRef(function Horse({ rideState }, ref) {
  const groupRef = useRef();
  const gaitRef = useRef(0);

  useImperativeHandle(ref, () => ({
    getPosition: () => rideState.position.clone(),
  }));

  useFrame((_, delta) => {
    if (!groupRef.current || !rideState) return;

    groupRef.current.position.copy(rideState.position);
    groupRef.current.rotation.y = rideState.yaw;

    if (rideState.moving) {
      gaitRef.current += delta * (rideState.sprinting ? 22 : 12);
    } else {
      gaitRef.current *= 0.9;
      if (Math.abs(gaitRef.current) < 0.01) gaitRef.current = 0;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[10, 0, 12]}
      userData={{ ignoreCameraCollision: true }}
    >
      <HorseBody gaitRef={gaitRef} rideState={rideState} />
    </group>
  );
});
