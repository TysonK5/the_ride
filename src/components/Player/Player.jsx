import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";
import { MOUNT_RANGE, RIDE_SPEED, DRINK_DURATION } from "../Horse/Horse";
import { resolveCollisions, isNearShore } from "../../systems/colliders";
import {
  getFenceColliders,
  distToGate,
  GATE_RANGE,
} from "../Environment/Fence";
import {
  getBarnColliders,
  distToBarnDoors,
  distToBarnBackDoor,
  BARN_DOOR_RANGE,
  distToCabinDoor,
  CABIN_DOOR_RANGE,
  distToCabinGate,
  CABIN_GATE_AUTO_RANGE,
} from "../Town/Buildings";
import {
  BASE_MOUSE_SENS,
  DEFAULT_SETTINGS,
  isActionDown,
  formatKeyCode,
  formatBindingCode,
} from "../../systems/settings";
import {
  BASE_GAMEPAD_LOOK,
  sampleGamepadInput,
} from "../../systems/gamepad";
import {
  FLOWER_PICK_RANGE,
  findNearestFlower,
  isBlockedPlantSpot,
  getFlowerType,
  HeldFlowerPreview,
} from "../Environment/Flowers";
import {
  createFishingState,
  canFishHere,
  clampTargetToLake,
  defaultTargetFromShore,
  pickRandomFish,
  FishingPole,
  FishingWorldFX,
  applyFishingPose,
  TARGET_SPEED,
  CAST_DURATION,
  REEL_DURATION,
  CATCH_SHOW,
} from "./Fishing";
import {
  updateFootsteps,
  updateHoofsteps,
  sfxDoorWood,
  sfxGate,
  sfxFlowerPick,
  sfxFlowerPlant,
  sfxMount,
  sfxDismount,
  sfxHorseDrink,
  sfxFishStart,
  sfxFishCast,
  sfxFishSplash,
  sfxFishBite,
  sfxFishReel,
  sfxFishCatch,
} from "../../systems/audio";
import { PLAY_HALF } from "../../systems/map";

const MOVE_SPEED = 8;
const SPRINT_MULT = 2;
const CAMERA_DISTANCE = 6;
const RIDE_CAMERA_DISTANCE = 8;
/** Lift so hips sit deep on the western saddle seat (~1.60) */
/** Match lowered horse saddle seat (~1.50 world) */
const SEAT_HEIGHT = 0.7;
const WALK_ANIM_SPEED = 10;
const RUN_ANIM_SPEED = 18;
const PLAYER_RADIUS = 0.45;
const HORSE_RADIUS = 0.9;
const HORSE_COLLIDER_R = 1.1;
/** How close the camera can sit to the look target when fully blocked */
const CAM_MIN_DIST = 0.55;
/** Pull camera slightly off the hit surface toward the player */
const CAM_HIT_PADDING = 0.28;
/** Smooth zoom when dodging walls (higher = snappier) */
const CAM_COLLISION_SMOOTH = 14;
/** Mount / dismount animation length (seconds) */
const MOUNT_ANIM_DURATION = 1.85;
/** Crouch-reach-stand for picking a flower (seconds) */
const PICK_ANIM_DURATION = 0.9;
/** Kneel-plant-stand for planting a flower (seconds) */
const PLANT_ANIM_DURATION = 1.05;
/** Progress at which the flower is actually picked / planted */
const FLOWER_ACTION_AT = 0.42;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _target = new THREE.Vector3();
const _next = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _animPos = new THREE.Vector3();
const _camRaycaster = new THREE.Raycaster();

/** Map horse-local offset to world using horse yaw (Three.js Y rotation). */
function horseLocalToWorld(hx, hy, hz, yaw, lx, ly, lz, out) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out.x = hx + lx * c + lz * s;
  out.y = ly;
  out.z = hz - lx * s + lz * c;
  return out;
}

function smoothstep(t) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Hip + knee pose. Knee bend is rotation.x on the knee joint (shin). */
function setLegArticulated(hipRef, kneeRef, hipPos, hipRot, kneeBendX) {
  if (hipRef?.current) {
    hipRef.current.position.set(hipPos[0], hipPos[1], hipPos[2]);
    hipRef.current.rotation.set(hipRot[0], hipRot[1], hipRot[2]);
  }
  if (kneeRef?.current) {
    kneeRef.current.rotation.set(kneeBendX, 0, 0);
  }
}

function applySeatedPose(
  bodyRef,
  leftArmRef,
  rightArmRef,
  leftLegRef,
  rightLegRef,
  leftKneeRef,
  rightKneeRef,
  hatRef,
  carrying = false
) {
  // Seat on saddle; legs hang DOWN the outside of the horse (visible boots).
  // Hips wide of barrel; small forward tilt; soft knee so feet drop into stirrups.
  if (bodyRef.current) {
    bodyRef.current.position.y = 0.94;
    bodyRef.current.rotation.x = 0.04;
    bodyRef.current.rotation.z = 0;
  }
  if (leftArmRef.current) {
    // Keep flower in left hand while riding
    leftArmRef.current.rotation.set(
      carrying ? -0.75 : -0.55,
      carrying ? 0.28 : 0.12,
      carrying ? 0.4 : 0.22
    );
  }
  if (rightArmRef.current) {
    rightArmRef.current.rotation.set(-0.75, -0.08, -0.18);
  }
  // ±0.55 clears barrel (~0.22–0.28r). z-rot opens hip; low x-rot = hang down not through belly.
  // Soft knee keeps shin/boot outside and visible below the barrel.
  setLegArticulated(
    leftLegRef,
    leftKneeRef,
    [-0.55, 0.78, 0.1],
    [0.18, 0.15, 0.85],
    0.55
  );
  setLegArticulated(
    rightLegRef,
    rightKneeRef,
    [0.55, 0.78, 0.1],
    [0.18, -0.15, -0.85],
    0.55
  );
  if (hatRef.current) hatRef.current.rotation.z = 0;
}

function resetStandingPose(
  bodyRef,
  leftArmRef,
  rightArmRef,
  leftLegRef,
  rightLegRef,
  leftKneeRef,
  rightKneeRef,
  hatRef,
  carrying = false
) {
  if (bodyRef.current) {
    bodyRef.current.position.y = 0.94;
    bodyRef.current.rotation.x = 0;
  }
  if (leftArmRef.current) {
    if (carrying) {
      leftArmRef.current.rotation.set(-0.85, 0.35, 0.45);
    } else {
      leftArmRef.current.rotation.set(0, 0, 0);
    }
  }
  if (rightArmRef.current) rightArmRef.current.rotation.set(0, 0, 0);
  setLegArticulated(leftLegRef, leftKneeRef, [-0.11, 0.77, 0], [0, 0, 0], 0);
  setLegArticulated(rightLegRef, rightKneeRef, [0.11, 0.77, 0], [0, 0, 0], 0);
  if (hatRef.current) hatRef.current.rotation.z = 0;
}

/**
 * Pick / plant body animation.
 * t 0→1: crouch & reach (peak ~0.4), then stand back up.
 * pick: right hand reaches for ground flower, then left settles into carry.
 * plant: left hand (holding flower) reaches down to place it.
 */
function applyFlowerActionPose(
  bodyRef,
  leftArmRef,
  rightArmRef,
  leftLegRef,
  rightLegRef,
  leftKneeRef,
  rightKneeRef,
  mode,
  t
) {
  // Bend envelope: rise to full crouch by 0.4, ease out to standing by 1.0
  let bend;
  if (t < 0.4) {
    bend = smoothstep(t / 0.4);
  } else {
    bend = 1 - smoothstep((t - 0.4) / 0.6);
  }

  if (bodyRef.current) {
    bodyRef.current.position.y = 0.94 - bend * 0.28;
    bodyRef.current.rotation.x = bend * 0.42;
  }

  const knee = bend * 0.85;
  setLegArticulated(
    leftLegRef,
    leftKneeRef,
    [-0.11, 0.77, 0],
    [bend * 0.4, 0, 0.05 * bend],
    knee
  );
  setLegArticulated(
    rightLegRef,
    rightKneeRef,
    [0.11, 0.77, 0],
    [bend * 0.4, 0, -0.05 * bend],
    knee
  );

  if (mode === "pick") {
    // Right arm reaches down toward the flower in front
    if (rightArmRef.current) {
      rightArmRef.current.rotation.set(
        -0.15 - bend * 1.25,
        -0.2 * bend,
        -0.35 * bend
      );
    }
    if (leftArmRef.current) {
      if (t < FLOWER_ACTION_AT) {
        // Brace / open while reaching with the other hand
        leftArmRef.current.rotation.set(
          -0.2 * bend,
          0.12 * bend,
          0.2 * bend
        );
      } else {
        // After grab: settle flower into left-hand carry
        const carryT = smoothstep((t - FLOWER_ACTION_AT) / (1 - FLOWER_ACTION_AT));
        leftArmRef.current.rotation.set(
          lerp(-0.2 * bend, -0.85, carryT),
          lerp(0.12 * bend, 0.35, carryT),
          lerp(0.2 * bend, 0.45, carryT)
        );
      }
    }
  } else {
    // plant — left arm (with flower) pushes down into the dirt
    if (leftArmRef.current) {
      leftArmRef.current.rotation.set(
        -0.7 - bend * 0.85,
        0.15 + bend * 0.2,
        0.3 + bend * 0.25
      );
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.set(
        -0.25 * bend,
        0.12 * bend,
        -0.2 * bend
      );
    }
  }
}

/**
 * Mount progress t in [0,1]:
 *  0.00–0.22 approach left/right side
 *  0.22–0.42 left/right foot into stirrup, rise
 *  0.42–0.72 swing far leg over the horse
 *  0.72–1.00 settle into seat
 * Dismount uses the same curve reversed (t from 1→0).
 */
function applyMountAnimation(
  groupRef,
  bodyRef,
  leftArmRef,
  rightArmRef,
  leftLegRef,
  rightLegRef,
  leftKneeRef,
  rightKneeRef,
  hatRef,
  rideState,
  side,
  t
) {
  const g = groupRef.current;
  if (!g || !rideState) return;

  const hx = rideState.position.x;
  const hz = rideState.position.z;
  const yaw = rideState.yaw;

  // Key poses in horse-local space
  // side -1 = horse left (traditional mount), +1 = horse right
  const beside = { x: side * 1.35, y: 0, z: 0.05 };
  const stirrup = { x: side * 0.5, y: 0.55, z: 0.08 };
  const highStirrup = { x: side * 0.2, y: SEAT_HEIGHT + 0.12, z: 0.0 };
  const seat = { x: 0, y: SEAT_HEIGHT, z: -0.02 };

  let lx;
  let ly;
  let lz;
  let phase = "approach";

  if (t < 0.22) {
    phase = "approach";
    const u = smoothstep(t / 0.22);
    lx = lerp(beside.x * 1.15, beside.x, u);
    ly = 0;
    lz = lerp(beside.z, beside.z, u);
  } else if (t < 0.42) {
    phase = "stirrup";
    const u = smoothstep((t - 0.22) / 0.2);
    lx = lerp(beside.x, stirrup.x, u);
    ly = lerp(0, stirrup.y, u);
    lz = lerp(beside.z, stirrup.z, u);
  } else if (t < 0.72) {
    phase = "swing";
    const u = smoothstep((t - 0.42) / 0.3);
    lx = lerp(stirrup.x, highStirrup.x, u);
    ly = lerp(stirrup.y, highStirrup.y, u);
    lz = lerp(stirrup.z, highStirrup.z, u);
  } else {
    phase = "settle";
    const u = smoothstep((t - 0.72) / 0.28);
    lx = lerp(highStirrup.x, seat.x, u);
    ly = lerp(highStirrup.y, seat.y, u);
    lz = lerp(highStirrup.z, seat.z, u);
  }

  horseLocalToWorld(hx, 0, hz, yaw, lx, ly, lz, _animPos);
  g.position.copy(_animPos);
  g.rotation.y = yaw;

  // Limb poses by phase — near leg = side < 0 ? left : right
  const nearIsLeft = side < 0;
  const nearHip = nearIsLeft ? leftLegRef : rightLegRef;
  const farHip = nearIsLeft ? rightLegRef : leftLegRef;
  const nearKnee = nearIsLeft ? leftKneeRef : rightKneeRef;
  const farKnee = nearIsLeft ? rightKneeRef : leftKneeRef;
  const s = side;

  if (bodyRef.current) {
    bodyRef.current.position.y = 0.94;
    if (phase === "stirrup") {
      bodyRef.current.rotation.x = 0.12;
      bodyRef.current.rotation.z = -s * 0.15;
    } else if (phase === "swing") {
      bodyRef.current.rotation.x = 0.05;
      bodyRef.current.rotation.z = -s * 0.08;
    } else if (phase === "settle") {
      bodyRef.current.rotation.x = 0.04;
      bodyRef.current.rotation.z = 0;
    } else {
      bodyRef.current.rotation.x = 0.05;
      bodyRef.current.rotation.z = 0;
    }
  }

  if (leftArmRef.current && rightArmRef.current) {
    if (phase === "approach") {
      leftArmRef.current.rotation.set(-0.3, 0, 0.1);
      rightArmRef.current.rotation.set(-0.3, 0, -0.1);
    } else if (phase === "stirrup") {
      leftArmRef.current.rotation.set(-0.9, 0.2, 0.25);
      rightArmRef.current.rotation.set(-0.7, -0.1, -0.2);
    } else if (phase === "swing") {
      leftArmRef.current.rotation.set(-1.0, 0.15, 0.3);
      rightArmRef.current.rotation.set(-0.95, -0.15, -0.3);
    } else {
      leftArmRef.current.rotation.set(-0.55, 0.12, 0.22);
      rightArmRef.current.rotation.set(-0.75, -0.08, -0.18);
    }
  }

  if (nearHip.current && farHip.current) {
    if (phase === "approach") {
      setLegArticulated(nearHip, nearKnee, [s * 0.12, 0.77, 0], [0.15, 0, s * 0.15], 0.15);
      setLegArticulated(farHip, farKnee, [-s * 0.12, 0.77, 0], [0, 0, 0], 0);
    } else if (phase === "stirrup") {
      // Near foot bent into stirrup (hip high bend + knee flex)
      setLegArticulated(
        nearHip,
        nearKnee,
        [s * 0.22, 0.68, 0.05],
        [-0.15, 0, s * 0.35],
        1.1
      );
      setLegArticulated(
        farHip,
        farKnee,
        [-s * 0.14, 0.72, 0],
        [0.4, 0, -s * 0.1],
        0.35
      );
    } else if (phase === "swing") {
      const u = smoothstep((t - 0.42) / 0.3);
      setLegArticulated(
        nearHip,
        nearKnee,
        [s * 0.5, 0.76, 0.1],
        [0.2, s * 0.12, s * 0.75],
        0.5
      );
      setLegArticulated(
        farHip,
        farKnee,
        [lerp(-s * 0.15, -s * 0.55, u), lerp(0.9, 0.78, u), lerp(0.2, 0.1, u)],
        [lerp(1.0, 0.18, u), lerp(0, -s * 0.15, u), lerp(-s * 0.2, -s * 0.85, u)],
        lerp(0.3, 0.55, u)
      );
    } else {
      // Settle: legs hang down both sides, feet visible
      const u = smoothstep((t - 0.72) / 0.28);
      setLegArticulated(
        nearHip,
        nearKnee,
        [lerp(s * 0.5, s * 0.55, u), 0.78, 0.1],
        [0.18, s * 0.15, s * 0.85],
        0.55
      );
      setLegArticulated(
        farHip,
        farKnee,
        [-s * 0.55, 0.78, 0.1],
        [0.18, -s * 0.15, -s * 0.85],
        0.55
      );
    }
  }

  if (hatRef.current) hatRef.current.rotation.z = 0;
}

function updateCamera(
  camera,
  scene,
  playerGroup,
  yaw,
  pitch,
  mounted,
  delta,
  camDistSmoothRef
) {
  const idealDist = mounted ? RIDE_CAMERA_DISTANCE : CAMERA_DISTANCE;
  const lookY = mounted ? 2.2 : 1.5;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  _target.set(playerGroup.position.x, lookY, playerGroup.position.z);
  _camOffset.set(
    Math.sin(yaw) * idealDist * cosP,
    sinP * idealDist,
    Math.cos(yaw) * idealDist * cosP
  );

  const maxDist = _camOffset.length();
  let blockedDist = maxDist;
  if (maxDist > 1e-4) {
    _rayDir.copy(_camOffset).multiplyScalar(1 / maxDist);
    _camRaycaster.set(_target, _rayDir);
    _camRaycaster.far = maxDist;
    _camRaycaster.near = 0.05;

    const hits = _camRaycaster.intersectObjects(scene.children, true);
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      if (!isCameraObstacle(hit.object)) continue;
      blockedDist = Math.max(CAM_MIN_DIST, hit.distance - CAM_HIT_PADDING);
      break;
    }
  }

  const blend = 1 - Math.exp(-CAM_COLLISION_SMOOTH * delta);
  camDistSmoothRef.current = THREE.MathUtils.lerp(
    camDistSmoothRef.current,
    blockedDist,
    blend
  );
  const useDist = Math.min(camDistSmoothRef.current, blockedDist);

  if (maxDist > 1e-4) {
    camera.position.copy(_target).addScaledVector(_rayDir, useDist);
  } else {
    camera.position.copy(_target);
  }
  camera.lookAt(_target);
}

function isCameraObstacle(obj) {
  let o = obj;
  while (o) {
    if (o.userData?.ignoreCameraCollision) return false;
    o = o.parent;
  }
  if (!obj.isMesh) return false;
  // Skip soft/transparent surfaces (water highlights, etc.)
  const mat = obj.material;
  if (mat) {
    const m = Array.isArray(mat) ? mat[0] : mat;
    if (m?.transparent && m.opacity < 0.55) return false;
  }
  return true;
}

export const Player = forwardRef(function Player(
  {
    enabled,
    rideState,
    gateState,
    barnDoorState,
    cabinState,
    flowerState,
    onFlowerChange,
    onRideHint,
    settings,
  },
  ref
) {
  const groupRef = useRef();
  const bodyRef = useRef();
  const leftArmRef = useRef();
  const rightArmRef = useRef();
  const leftLegRef = useRef();
  const rightLegRef = useRef();
  const leftKneeRef = useRef();
  const rightKneeRef = useRef();
  const hatRef = useRef();
  const yawRef = useRef(0);
  const pitchRef = useRef(-0.15);
  const keysRef = useRef({});
  const interactPressedRef = useRef(false);
  const sprintPressedRef = useRef(false);
  // Local state so the hand-held mesh mounts as soon as you pick a flower
  const [heldTypeId, setHeldTypeId] = useState(
    () => flowerState?.heldTypeId ?? null
  );
  /** Show fishing rod in the right hand */
  const [fishingPoleOut, setFishingPoleOut] = useState(false);
  const fishingRef = useRef(createFishingState());
  const lastHintRef = useRef("");
  const walkCycleRef = useRef(0);
  const camDistSmoothRef = useRef(CAMERA_DISTANCE);
  const settingsRef = useRef(settings || DEFAULT_SETTINGS);
  settingsRef.current = settings || DEFAULT_SETTINGS;
  /** { active, mode: 'mount'|'dismount', t, side: -1 left / +1 right of horse } */
  const mountAnimRef = useRef({
    active: false,
    mode: null,
    t: 0,
    side: -1,
  });
  /**
   * Pick / plant crouch animation.
   * mode: 'pick' | 'plant'
   * didAction: true after flower state is committed at FLOWER_ACTION_AT
   */
  const flowerAnimRef = useRef({
    active: false,
    mode: null,
    t: 0,
    didAction: false,
    flowerId: null,
    typeId: null,
    plantX: 0,
    plantZ: 0,
    plantRot: 0,
    plantScale: 1,
  });
  const { camera, scene } = useThree();

  useImperativeHandle(ref, () => ({
    getPosition: () =>
      groupRef.current?.position ?? new THREE.Vector3(0, 0, 8),
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
      const s = settingsRef.current;
      const sens = BASE_MOUSE_SENS * (s.mouseSensitivity ?? 1);
      const invX = s.invertLookX ? -1 : 1;
      const invY = s.invertLookY ? -1 : 1;
      // Full free look — no pitch lock (yaw + pitch both unbounded / wrap)
      yawRef.current -= e.movementX * sens * invX;
      pitchRef.current -= e.movementY * sens * invY;
      // Keep pitch in [-π, π] for numeric stability (still full 360°)
      if (pitchRef.current > Math.PI) pitchRef.current -= Math.PI * 2;
      if (pitchRef.current < -Math.PI) pitchRef.current += Math.PI * 2;
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
    const mounted = rideState?.mounted ?? false;
    const anim = mountAnimRef.current;
    const flowerAnim = flowerAnimRef.current;
    const fishing = fishingRef.current;
    const busy =
      anim.active ||
      flowerAnim.active ||
      fishing.active ||
      !!rideState?.busy;

    // Dynamic colliders: barn walls/doors + fence + horse
    const extras = [
      ...getBarnColliders(barnDoorState),
      ...getFenceColliders(gateState),
    ];
    if (rideState && !mounted && !anim.active) {
      extras.push({
        type: "circle",
        x: rideState.position.x,
        z: rideState.position.z,
        r: HORSE_COLLIDER_R,
      });
    }

    const px = groupRef.current.position.x;
    const pz = groupRef.current.position.z;
    const barnDoorDist = distToBarnDoors(px, pz);
    const nearBarnDoors = !mounted && !busy && barnDoorDist <= BARN_DOOR_RANGE;
    const barnBackDist = distToBarnBackDoor(px, pz);
    const nearBarnBack = !mounted && !busy && barnBackDist <= BARN_DOOR_RANGE;
    const gateDist = distToGate(px, pz);
    const nearGate = !mounted && !busy && gateDist <= GATE_RANGE;
    const cabinDoorDist = distToCabinDoor(px, pz);
    const nearCabinDoor =
      !mounted && !busy && cabinDoorDist <= CABIN_DOOR_RANGE;
    // Auto picket gate — open when walking (or riding) near it
    const cabinGateDist = distToCabinGate(px, pz);
    if (cabinState) {
      cabinState.gateOpen = cabinGateDist <= CABIN_GATE_AUTO_RANGE;
    }
    const horseDist = rideState
      ? groupRef.current.position.distanceTo(rideState.position)
      : Infinity;
    const nearHorse = !mounted && !busy && horseDist <= MOUNT_RANGE;
    const horseX = rideState?.position.x ?? px;
    const horseZ = rideState?.position.z ?? pz;
    const atShore =
      mounted &&
      !busy &&
      !rideState?.drinking &&
      !rideState?.moving &&
      isNearShore(horseX, horseZ, 7);
    const drinking = !!rideState?.drinking;
    const holdingFlower = flowerState?.heldTypeId != null;
    const nearFlowerHit =
      !mounted && !busy && flowerState
        ? findNearestFlower(flowerState, px, pz, FLOWER_PICK_RANGE)
        : null;
    const canPlantHere =
      holdingFlower && !mounted && !busy && !isBlockedPlantSpot(px, pz);
    const nearFishing =
      canFishHere(px, pz, mounted, holdingFlower, busy && !fishing.active);

    const s = settingsRef.current;
    const bindings = s.bindings;
    const gp = sampleGamepadInput(s);

    // Right stick look (applies invert from mouse look settings)
    if (gp && (gp.lookX !== 0 || gp.lookY !== 0)) {
      const lookSens =
        BASE_GAMEPAD_LOOK * (s.gamepadLookSensitivity ?? 1) * delta;
      const invX = s.invertLookX ? -1 : 1;
      const invY = s.invertLookY ? -1 : 1;
      yawRef.current -= gp.lookX * lookSens * invX;
      pitchRef.current -= gp.lookY * lookSens * invY;
      if (pitchRef.current > Math.PI) pitchRef.current -= Math.PI * 2;
      if (pitchRef.current < -Math.PI) pitchRef.current += Math.PI * 2;
    }

    const interactKey = gp
      ? formatBindingCode(s.gamepadBindings?.interact) +
        " / " +
        formatKeyCode(bindings.interact)
      : formatKeyCode(bindings.interact);
    const sprintKey = gp
      ? formatBindingCode(s.gamepadBindings?.sprint) +
        " / " +
        formatKeyCode(bindings.sprint)
      : formatKeyCode(bindings.sprint);

    // --- Interact ---
    const interactDown =
      isActionDown(bindings, "interact", keys) || !!gp?.interact;
    const sprintDown =
      isActionDown(bindings, "sprint", keys) || !!gp?.sprint;

    // Fishing state machine (works while "busy" with fishing.active)
    if (interactDown && !interactPressedRef.current && fishing.active) {
      if (fishing.phase === "aim") {
        // Cast toward target
        fishing.phase = "cast";
        fishing.phaseT = 0;
        fishing.castFromX = groupRef.current.position.x;
        fishing.castFromZ = groupRef.current.position.z;
        fishing.castFromY = 1.6;
        fishing.bobberX = fishing.castFromX;
        fishing.bobberZ = fishing.castFromZ;
        fishing.bobberY = fishing.castFromY;
        sfxFishCast();
      } else if (fishing.phase === "bite") {
        // Reel in on the nibble
        fishing.phase = "reel";
        fishing.phaseT = 0;
        fishing.fish = pickRandomFish();
        sfxFishReel();
      } else if (fishing.phase === "catch") {
        // Dismiss catch and put pole away
        Object.assign(fishing, createFishingState());
        setFishingPoleOut(false);
      }
    } else if (
      sprintDown &&
      !sprintPressedRef.current &&
      fishing.active &&
      (fishing.phase === "aim" || fishing.phase === "wait")
    ) {
      // Cancel fishing (put rod away)
      Object.assign(fishing, createFishingState());
      setFishingPoleOut(false);
    }
    sprintPressedRef.current = sprintDown;

    if (interactDown && !interactPressedRef.current && !busy && !drinking) {
      if (mounted && rideState) {
        // At shore + stopped + haven't just drunk → drink; otherwise dismount
        if (atShore && !rideState.justDrank) {
          rideState.drinking = true;
          rideState.drinkTimer = 0;
          rideState.moving = false;
          rideState.sprinting = false;
          sfxHorseDrink();
        } else {
          rideState.justDrank = false;
          rideState.moving = false;
          rideState.sprinting = false;
          rideState.busy = true;
          anim.active = true;
          anim.mode = "dismount";
          anim.t = 0;
          anim.side = -1;
          sfxDismount();
        }
      } else {
        const acts = [];

        // Holding flower → plant (if valid) has priority; plays kneel/plant anim
        if (holdingFlower && flowerState) {
          acts.push({
            d: 0,
            run: () => {
              if (isBlockedPlantSpot(px, pz)) return;
              const yaw = groupRef.current.rotation.y;
              flowerAnim.active = true;
              flowerAnim.mode = "plant";
              flowerAnim.t = 0;
              flowerAnim.didAction = false;
              flowerAnim.typeId = flowerState.heldTypeId;
              sfxFlowerPlant();
              flowerAnim.plantX = px + Math.sin(yaw) * 0.65;
              flowerAnim.plantZ = pz + Math.cos(yaw) * 0.65;
              flowerAnim.plantRot = Math.random() * Math.PI * 2;
              flowerAnim.plantScale = 0.9 + Math.random() * 0.25;
              flowerAnim.flowerId = null;
              walkCycleRef.current = 0;
            },
          });
        } else if (nearFlowerHit && flowerState) {
          acts.push({
            d: nearFlowerHit.dist,
            run: () => {
              // Face the flower, then crouch-reach to pick it
              const f = nearFlowerHit.flower;
              groupRef.current.rotation.y = Math.atan2(f.x - px, f.z - pz);
              flowerAnim.active = true;
              flowerAnim.mode = "pick";
              flowerAnim.t = 0;
              flowerAnim.didAction = false;
              flowerAnim.flowerId = f.id;
              flowerAnim.typeId = f.typeId;
              walkCycleRef.current = 0;
              sfxFlowerPick();
            },
          });
        }

        if (nearBarnDoors && barnDoorState) {
          acts.push({
            d: barnDoorDist,
            run: () => {
              barnDoorState.open = !barnDoorState.open;
              sfxDoorWood();
            },
          });
        }
        if (nearBarnBack && barnDoorState) {
          acts.push({
            d: barnBackDist,
            run: () => {
              barnDoorState.backOpen = !barnDoorState.backOpen;
              sfxDoorWood();
            },
          });
        }
        if (nearCabinDoor && cabinState) {
          acts.push({
            d: cabinDoorDist,
            run: () => {
              cabinState.doorOpen = !cabinState.doorOpen;
              sfxDoorWood();
            },
          });
        }
        if (nearGate && gateState) {
          acts.push({
            d: gateDist,
            run: () => {
              gateState.open = !gateState.open;
              sfxGate();
            },
          });
        }
        if (nearHorse && rideState) {
          acts.push({
            d: horseDist,
            run: () => {
              const toPlayerX =
                groupRef.current.position.x - rideState.position.x;
              const toPlayerZ =
                groupRef.current.position.z - rideState.position.z;
              const c = Math.cos(rideState.yaw);
              const s = Math.sin(rideState.yaw);
              const localX = toPlayerX * c - toPlayerZ * s;
              anim.side = localX >= 0 ? 1 : -1;
              anim.active = true;
              anim.mode = "mount";
              anim.t = 0;
              rideState.busy = true;
              rideState.moving = false;
              rideState.sprinting = false;
              walkCycleRef.current = 0;
              sfxMount();
            },
          });
        }
        if (nearFishing) {
          acts.push({
            d: 0.4,
            run: () => {
              const t = defaultTargetFromShore(px, pz);
              fishing.active = true;
              fishing.phase = "aim";
              fishing.phaseT = 0;
              fishing.targetX = t.x;
              fishing.targetZ = t.z;
              fishing.bobberX = t.x;
              fishing.bobberZ = t.z;
              fishing.bobberY = 0.2;
              fishing.fish = null;
              fishing.resultText = "";
              fishing.waitDuration = 0;
              groupRef.current.rotation.y = Math.atan2(t.x - px, t.z - pz);
              walkCycleRef.current = 0;
              setFishingPoleOut(true);
              sfxFishStart();
            },
          });
        }
        acts.sort((a, b) => a.d - b.d);
        acts[0]?.run();
      }
    }
    interactPressedRef.current = interactDown;

    // Drink timer (3s) while mounted at shore
    if (rideState?.drinking) {
      rideState.drinkTimer = (rideState.drinkTimer ?? 0) + delta;
      rideState.moving = false;
      rideState.sprinting = false;
      if (rideState.drinkTimer >= DRINK_DURATION) {
        rideState.drinking = false;
        rideState.drinkTimer = 0;
        rideState.justDrank = true; // next E dismounts even if still at shore
      }
    }
    // Clear justDrank once you leave the shore so a return visit can drink again
    if (rideState?.justDrank && mounted && !isNearShore(horseX, horseZ, 7)) {
      rideState.justDrank = false;
    }

    // Proximity hint
    if (onRideHint) {
      let hint = "";
      if (anim.active) {
        hint =
          anim.mode === "mount" ? "Mounting…" : "Dismounting…";
      } else if (flowerAnim.active) {
        hint = flowerAnim.mode === "pick" ? "Picking…" : "Planting…";
      } else if (fishing.active) {
        if (fishing.phase === "aim") {
          hint = `${interactKey} cast · move aim · ${sprintKey} cancel`;
        } else if (fishing.phase === "cast") {
          hint = "Casting…";
        } else if (fishing.phase === "wait") {
          hint = "Waiting for a bite… · " + sprintKey + " cancel";
        } else if (fishing.phase === "bite") {
          hint = `${interactKey} to reel in!`;
        } else if (fishing.phase === "reel") {
          hint = "Reeling…";
        } else if (fishing.phase === "catch") {
          hint = fishing.resultText
            ? `${fishing.resultText} · ${interactKey} continue`
            : `${interactKey} continue`;
        }
      } else if (drinking || rideState?.drinking) {
        hint = "Horse is drinking…";
      } else if (mounted && atShore && !rideState?.justDrank) {
        hint = `${interactKey} to drink · hold still at water`;
      } else if (mounted) {
        hint = `${interactKey} to dismount · ${sprintKey} to gallop`;
      } else {
        const options = [];
        if (holdingFlower) {
          if (canPlantHere) {
            const name = getFlowerType(flowerState.heldTypeId).name;
            options.push({
              d: 0,
              text: `${interactKey} to plant ${name}`,
            });
          } else {
            options.push({
              d: 0,
              text: `Can't plant here (barn / house / water)`,
            });
          }
        } else if (nearFlowerHit) {
          const name = getFlowerType(nearFlowerHit.flower.typeId).name;
          options.push({
            d: nearFlowerHit.dist,
            text: `${interactKey} to pick ${name}`,
          });
        }
        if (nearFishing) {
          options.push({
            d: 0.4,
            text: `${interactKey} to fish`,
          });
        }
        if (nearBarnDoors) {
          options.push({
            d: barnDoorDist,
            text: barnDoorState?.open
              ? `${interactKey} to close front doors`
              : `${interactKey} to open front doors`,
          });
        }
        if (nearBarnBack) {
          options.push({
            d: barnBackDist,
            text: barnDoorState?.backOpen
              ? `${interactKey} to close sliding door`
              : `${interactKey} to open sliding door`,
          });
        }
        if (nearCabinDoor) {
          options.push({
            d: cabinDoorDist,
            text: cabinState?.doorOpen
              ? `${interactKey} to close cabin door`
              : `${interactKey} to open cabin door`,
          });
        }
        if (nearGate) {
          options.push({
            d: gateDist,
            text: gateState?.open
              ? `${interactKey} to close gate`
              : `${interactKey} to open gate`,
          });
        }
        if (nearHorse) {
          options.push({
            d: horseDist,
            text: `${interactKey} to mount horse`,
          });
        }
        options.sort((a, b) => a.d - b.d);
        if (options[0]) hint = options[0].text;
      }
      if (hint !== lastHintRef.current) {
        lastHintRef.current = hint;
        onRideHint(hint);
      }
    }

    // --- Mount / dismount animation (stirrup → leg over → seat) ---
    if (anim.active && rideState) {
      anim.t = Math.min(1, anim.t + delta / MOUNT_ANIM_DURATION);
      const rawT = anim.mode === "dismount" ? 1 - anim.t : anim.t;
      applyMountAnimation(
        groupRef,
        bodyRef,
        leftArmRef,
        rightArmRef,
        leftLegRef,
        rightLegRef,
        leftKneeRef,
        rightKneeRef,
        hatRef,
        rideState,
        anim.side,
        rawT
      );

      if (anim.t >= 1) {
        if (anim.mode === "mount") {
          rideState.mounted = true;
          rideState.busy = false;
          // Snap to final seat
          groupRef.current.position.set(
            rideState.position.x,
            SEAT_HEIGHT,
            rideState.position.z
          );
          groupRef.current.rotation.y = rideState.yaw;
          applySeatedPose(
            bodyRef,
            leftArmRef,
            rightArmRef,
            leftLegRef,
            rightLegRef,
            leftKneeRef,
            rightKneeRef,
            hatRef,
            flowerState?.heldTypeId != null
          );
        } else {
          rideState.mounted = false;
          rideState.busy = false;
          // Land beside horse (left side)
          horseLocalToWorld(
            rideState.position.x,
            0,
            rideState.position.z,
            rideState.yaw,
            anim.side * 1.45,
            0,
            0.1,
            _animPos
          );
          groupRef.current.position.copy(_animPos);
          groupRef.current.position.y = 0;
          resolveCollisions(
            groupRef.current.position,
            PLAYER_RADIUS,
            [
              ...getBarnColliders(barnDoorState),
              ...getFenceColliders(gateState),
              {
                type: "circle",
                x: rideState.position.x,
                z: rideState.position.z,
                r: HORSE_COLLIDER_R,
              },
            ],
            cabinState
          );
          resetStandingPose(
            bodyRef,
            leftArmRef,
            rightArmRef,
            leftLegRef,
            rightLegRef,
            leftKneeRef,
            rightKneeRef,
            hatRef,
            flowerState?.heldTypeId != null
          );
        }
        anim.active = false;
        anim.mode = null;
        anim.t = 0;
      }

      // Camera still follows during animation
      updateCamera(
        camera,
        scene,
        groupRef.current,
        yawRef.current,
        pitchRef.current,
        false,
        delta,
        camDistSmoothRef
      );
      return;
    }

    // --- Pick / plant crouch animation ---
    if (flowerAnim.active) {
      const dur =
        flowerAnim.mode === "pick" ? PICK_ANIM_DURATION : PLANT_ANIM_DURATION;
      flowerAnim.t = Math.min(1, flowerAnim.t + delta / dur);

      applyFlowerActionPose(
        bodyRef,
        leftArmRef,
        rightArmRef,
        leftLegRef,
        rightLegRef,
        leftKneeRef,
        rightKneeRef,
        flowerAnim.mode,
        flowerAnim.t
      );

      // Commit pick / plant at the bottom of the reach
      if (!flowerAnim.didAction && flowerAnim.t >= FLOWER_ACTION_AT && flowerState) {
        flowerAnim.didAction = true;
        if (flowerAnim.mode === "pick") {
          const flower = flowerState.instances.find(
            (f) => f.id === flowerAnim.flowerId
          );
          if (flower) flower.active = false;
          flowerState.heldTypeId = flowerAnim.typeId;
          setHeldTypeId(flowerAnim.typeId);
          onFlowerChange?.();
        } else if (flowerAnim.mode === "plant") {
          const typeId = flowerAnim.typeId ?? flowerState.heldTypeId;
          flowerState.heldTypeId = null;
          setHeldTypeId(null);
          flowerState.instances.push({
            id: Date.now() + Math.floor(Math.random() * 999),
            typeId,
            x: flowerAnim.plantX,
            z: flowerAnim.plantZ,
            rot: flowerAnim.plantRot,
            scale: flowerAnim.plantScale,
            active: true,
          });
          onFlowerChange?.();
        }
      }

      if (flowerAnim.t >= 1) {
        const carrying = flowerState?.heldTypeId != null;
        resetStandingPose(
          bodyRef,
          leftArmRef,
          rightArmRef,
          leftLegRef,
          rightLegRef,
          leftKneeRef,
          rightKneeRef,
          hatRef,
          carrying
        );
        flowerAnim.active = false;
        flowerAnim.mode = null;
        flowerAnim.t = 0;
        flowerAnim.didAction = false;
      }

      updateCamera(
        camera,
        scene,
        groupRef.current,
        yawRef.current,
        pitchRef.current,
        false,
        delta,
        camDistSmoothRef
      );
      return;
    }

    // --- Fishing: lock player, move cast target, cast / wait / reel ---
    if (fishing.active) {
      fishing.phaseT += delta;

      _forward.set(
        -Math.sin(yawRef.current),
        0,
        -Math.cos(yawRef.current)
      );
      _right.set(Math.cos(yawRef.current), 0, -Math.sin(yawRef.current));

      // Movement steers the aim target over the water (not the player)
      if (fishing.phase === "aim") {
        _move.set(0, 0, 0);
        if (isActionDown(bindings, "forward", keys)) _move.add(_forward);
        if (isActionDown(bindings, "back", keys)) _move.sub(_forward);
        if (isActionDown(bindings, "right", keys)) _move.add(_right);
        if (isActionDown(bindings, "left", keys)) _move.sub(_right);
        if (gp && (gp.moveX !== 0 || gp.moveZ !== 0)) {
          _move.addScaledVector(_right, gp.moveX);
          _move.addScaledVector(_forward, gp.moveZ);
        }
        if (_move.lengthSq() > 0) {
          _move.normalize().multiplyScalar(TARGET_SPEED * delta);
          const next = clampTargetToLake(
            fishing.targetX + _move.x,
            fishing.targetZ + _move.z
          );
          fishing.targetX = next.x;
          fishing.targetZ = next.z;
          // Face toward aim point
          groupRef.current.rotation.y = Math.atan2(
            fishing.targetX - groupRef.current.position.x,
            fishing.targetZ - groupRef.current.position.z
          );
        }
      }

      if (fishing.phase === "cast") {
        const t = Math.min(1, fishing.phaseT / CAST_DURATION);
        const ease = t * t * (3 - 2 * t);
        fishing.bobberX = THREE.MathUtils.lerp(
          fishing.castFromX,
          fishing.targetX,
          ease
        );
        fishing.bobberZ = THREE.MathUtils.lerp(
          fishing.castFromZ,
          fishing.targetZ,
          ease
        );
        // Arc through the air
        fishing.bobberY =
          THREE.MathUtils.lerp(fishing.castFromY, 0.18, ease) +
          Math.sin(ease * Math.PI) * 2.2;
        if (t >= 1) {
          fishing.phase = "wait";
          fishing.phaseT = 0;
          fishing.bobberY = 0.18;
          fishing.waitDuration = 1.4 + Math.random() * 2.8;
          sfxFishSplash();
        }
      } else if (fishing.phase === "wait") {
        fishing.bobberY = 0.16 + Math.sin(fishing.phaseT * 3.5) * 0.03;
        if (fishing.phaseT >= fishing.waitDuration) {
          fishing.phase = "bite";
          fishing.phaseT = 0;
          sfxFishBite();
        }
      } else if (fishing.phase === "bite") {
        // Bobber dunks — player must press interact (handled above)
        fishing.bobberY = 0.1 + Math.sin(fishing.phaseT * 14) * 0.1;
        // Missed the bite if too slow
        if (fishing.phaseT > 2.8) {
          fishing.phase = "wait";
          fishing.phaseT = 0;
          fishing.waitDuration = 1.2 + Math.random() * 2.2;
        }
      } else if (fishing.phase === "reel") {
        const t = Math.min(1, fishing.phaseT / REEL_DURATION);
        const ease = t * t;
        const px0 = groupRef.current.position.x;
        const pz0 = groupRef.current.position.z;
        fishing.bobberX = THREE.MathUtils.lerp(fishing.targetX, px0, ease);
        fishing.bobberZ = THREE.MathUtils.lerp(fishing.targetZ, pz0, ease);
        fishing.bobberY = THREE.MathUtils.lerp(0.15, 1.1, ease);
        if (t >= 1) {
          fishing.phase = "catch";
          fishing.phaseT = 0;
          const fish = fishing.fish || pickRandomFish();
          fishing.fish = fish;
          fishing.resultText = `Caught a ${fish.name}!`;
          sfxFishCatch();
        }
      } else if (fishing.phase === "catch") {
        if (fishing.phaseT >= CATCH_SHOW) {
          Object.assign(fishing, createFishingState());
          setFishingPoleOut(false);
        }
      }

      applyFishingPose(
        bodyRef,
        leftArmRef,
        rightArmRef,
        fishing.phase
      );
      // Legs stay planted
      setLegArticulated(
        leftLegRef,
        leftKneeRef,
        [-0.11, 0.77, 0],
        [0, 0, 0],
        0
      );
      setLegArticulated(
        rightLegRef,
        rightKneeRef,
        [0.11, 0.77, 0],
        [0, 0, 0],
        0
      );

      updateCamera(
        camera,
        scene,
        groupRef.current,
        yawRef.current,
        pitchRef.current,
        false,
        delta,
        camDistSmoothRef
      );
      return;
    }

    _forward.set(
      -Math.sin(yawRef.current),
      0,
      -Math.cos(yawRef.current)
    );
    _right.set(Math.cos(yawRef.current), 0, -Math.sin(yawRef.current));

    _move.set(0, 0, 0);
    if (isActionDown(bindings, "forward", keys)) _move.add(_forward);
    if (isActionDown(bindings, "back", keys)) _move.sub(_forward);
    if (isActionDown(bindings, "right", keys)) _move.add(_right);
    if (isActionDown(bindings, "left", keys)) _move.sub(_right);

    // Left stick + D-pad (sampleGamepadInput already merges them)
    if (gp && (gp.moveX !== 0 || gp.moveZ !== 0)) {
      _move.addScaledVector(_right, gp.moveX);
      _move.addScaledVector(_forward, gp.moveZ);
    }

    const isMoving = _move.lengthSq() > 0;
    const sprinting =
      isMoving &&
      (isActionDown(bindings, "sprint", keys) || !!gp?.sprint);
    const baseSpeed = mounted ? RIDE_SPEED : MOVE_SPEED;
    const speed = baseSpeed * (sprinting ? SPRINT_MULT : 1);

    // Footsteps / hooves while moving
    if (mounted) {
      updateHoofsteps(
        isMoving && !rideState?.drinking,
        sprinting,
        delta
      );
    } else {
      updateFootsteps(isMoving, sprinting, delta);
    }

    if (mounted && rideState) {
      // Can't ride away while drinking
      if (rideState.drinking) {
        rideState.moving = false;
        rideState.sprinting = false;
      } else {
        rideState.sprinting = sprinting && isMoving;
        if (isMoving) {
          _move.normalize().multiplyScalar(speed * delta);
          // Axis-separated collision for smoother sliding
          _next.copy(rideState.position);
          _next.x += _move.x;
          resolveCollisions(_next, HORSE_RADIUS, extras, cabinState);
          _next.z = rideState.position.z + _move.z;
          resolveCollisions(_next, HORSE_RADIUS, extras, cabinState);
          rideState.position.copy(_next);
          rideState.yaw = Math.atan2(_move.x, _move.z);
          rideState.moving = true;
        } else {
          rideState.moving = false;
          rideState.sprinting = false;
        }
      }

      rideState.position.x = THREE.MathUtils.clamp(
        rideState.position.x,
        -PLAY_HALF,
        PLAY_HALF
      );
      rideState.position.z = THREE.MathUtils.clamp(
        rideState.position.z,
        -PLAY_HALF,
        PLAY_HALF
      );
      rideState.position.y = 0;
      resolveCollisions(rideState.position, HORSE_RADIUS, extras, cabinState);

      groupRef.current.position.set(
        rideState.position.x,
        SEAT_HEIGHT,
        rideState.position.z
      );
      groupRef.current.rotation.y = rideState.yaw;

      applySeatedPose(
        bodyRef,
        leftArmRef,
        rightArmRef,
        leftLegRef,
        rightLegRef,
        leftKneeRef,
        rightKneeRef,
        hatRef,
        flowerState?.heldTypeId != null
      );
      walkCycleRef.current = 0;
    } else {
      if (isMoving) {
        _move.normalize().multiplyScalar(speed * delta);

        // Slide along walls: resolve X then Z
        _next.copy(groupRef.current.position);
        _next.x += _move.x;
        resolveCollisions(_next, PLAYER_RADIUS, extras, cabinState);
        _next.z = groupRef.current.position.z + _move.z;
        resolveCollisions(_next, PLAYER_RADIUS, extras, cabinState);

        groupRef.current.position.copy(_next);
        groupRef.current.rotation.y = Math.atan2(_move.x, _move.z);
        walkCycleRef.current +=
          delta * (sprinting ? RUN_ANIM_SPEED : WALK_ANIM_SPEED);
      } else {
        walkCycleRef.current *= 0.92;
        if (Math.abs(walkCycleRef.current) < 0.01) walkCycleRef.current = 0;
      }

      groupRef.current.position.x = THREE.MathUtils.clamp(
        groupRef.current.position.x,
        -PLAY_HALF,
        PLAY_HALF
      );
      groupRef.current.position.z = THREE.MathUtils.clamp(
        groupRef.current.position.z,
        -PLAY_HALF,
        PLAY_HALF
      );
      groupRef.current.position.y = 0;
      resolveCollisions(
        groupRef.current.position,
        PLAYER_RADIUS,
        extras,
        cabinState
      );

      // === Walk / run animation ===
      const swingAmp = sprinting ? 1.05 : 0.6;
      const swayAmp = sprinting ? 0.28 : 0.15;
      const bobAmp = sprinting ? 0.14 : 0.08;
      const swingAmount = Math.sin(walkCycleRef.current) * swingAmp;
      const swingAmountZ = Math.cos(walkCycleRef.current) * swayAmp;

      if (bodyRef.current) {
        bodyRef.current.position.y =
          0.94 + Math.abs(Math.sin(walkCycleRef.current)) * bobAmp;
        // Slight forward lean while sprinting
        bodyRef.current.rotation.x = sprinting && isMoving ? 0.12 : 0;
      }
      // Carrying: left arm stays bent forward so the flower sits in the hand
      const carrying = flowerState?.heldTypeId != null;
      if (leftArmRef.current) {
        if (carrying) {
          // Elbow-ish carry: arm forward & slightly out, gentle walk bob only
          leftArmRef.current.rotation.x = -0.85 + swingAmount * 0.08;
          leftArmRef.current.rotation.y = 0.35;
          leftArmRef.current.rotation.z = 0.45 + swingAmountZ * 0.06;
        } else {
          leftArmRef.current.rotation.x = -swingAmount * (sprinting ? 1.15 : 1);
          leftArmRef.current.rotation.y = 0;
          leftArmRef.current.rotation.z = swingAmountZ * (sprinting ? 0.45 : 0.3);
        }
      }
      if (rightArmRef.current) {
        rightArmRef.current.rotation.x = swingAmount * (sprinting ? 1.15 : 1);
        rightArmRef.current.rotation.y = 0;
        rightArmRef.current.rotation.z = -swingAmountZ * (sprinting ? 0.45 : 0.3);
      }
      // Walk/run with hip swing + knee bend
      const hipSwing = swingAmount * (sprinting ? 1.15 : 0.9);
      const kneeBend = Math.max(0, -Math.sin(walkCycleRef.current)) * (sprinting ? 1.0 : 0.7);
      const kneeBendOpp = Math.max(0, Math.sin(walkCycleRef.current)) * (sprinting ? 1.0 : 0.7);
      setLegArticulated(
        leftLegRef,
        leftKneeRef,
        [-0.11, 0.77, 0],
        [hipSwing, 0, -swingAmountZ * 0.2],
        kneeBend
      );
      setLegArticulated(
        rightLegRef,
        rightKneeRef,
        [0.11, 0.77, 0],
        [-hipSwing, 0, swingAmountZ * 0.2],
        kneeBendOpp
      );
      if (hatRef.current) {
        hatRef.current.rotation.z =
          Math.sin(walkCycleRef.current * 0.5) * (sprinting ? 0.06 : 0.03);
      }
    }

    updateCamera(
      camera,
      scene,
      groupRef.current,
      yawRef.current,
      pitchRef.current,
      mounted,
      delta,
      camDistSmoothRef
    );
  });

  return (
    <>
    <group
      ref={groupRef}
      position={[0, 0, 8]}
      userData={{ ignoreCameraCollision: true }}
    >
      {/* Feet on ground (boot sole at y≈0). Proportions ~ adult. */}

      {/* === BODY — head + arms parented so crouch/lean keeps them attached === */}
      <group ref={bodyRef} position={[0, 0.94, 0]}>
        {/* Torso / shirt — collar below chin */}
        <mesh castShadow>
          {/* radius 0.2 + length 0.42 → total ~0.82; top ≈ local +0.41 */}
          <capsuleGeometry args={[0.2, 0.42, 4, 8]} />
          <meshToonMaterial color="#3a5a8a" />
          <Outlines color={COLORS.outline} thickness={2} />
        </mesh>

        <mesh position={[0, -0.28, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 0.08, 8]} />
          <meshToonMaterial color={COLORS.woodDark} />
          <Outlines color={COLORS.outline} thickness={1.5} />
        </mesh>
        <mesh position={[0, -0.28, 0.18]} castShadow>
          <boxGeometry args={[0.09, 0.09, 0.04]} />
          <meshToonMaterial color={COLORS.gold} />
          <Outlines color={COLORS.outline} thickness={1} />
        </mesh>

        {/* HEAD — local y: world 1.57 − body 0.94 = 0.63 */}
        <group position={[0, 0.63, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.13, 8, 8]} />
            <meshToonMaterial color="#d4a574" />
            <Outlines color={COLORS.outline} thickness={2} />
          </mesh>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.055, 0.1, 3, 6]} />
            <meshToonMaterial color="#d4a574" />
          </mesh>

          <mesh position={[-0.045, 0.02, 0.11]} castShadow>
            <sphereGeometry args={[0.022, 4, 4]} />
            <meshToonMaterial color="#2a1a0a" />
          </mesh>
          <mesh position={[0.045, 0.02, 0.11]} castShadow>
            <sphereGeometry args={[0.022, 4, 4]} />
            <meshToonMaterial color="#2a1a0a" />
          </mesh>

          <group ref={hatRef} position={[0, 0.13, 0]}>
            <mesh castShadow position={[0, 0.07, 0]}>
              <cylinderGeometry args={[0.12, 0.15, 0.15, 8]} />
              <meshToonMaterial color={COLORS.woodDark} />
              <Outlines color={COLORS.outline} thickness={1.5} />
            </mesh>
            <mesh castShadow position={[0, -0.01, 0]}>
              <cylinderGeometry args={[0.24, 0.24, 0.035, 12]} />
              <meshToonMaterial color={COLORS.woodDark} />
              <Outlines color={COLORS.outline} thickness={1.5} />
            </mesh>
            <mesh position={[0, 0.0, 0]}>
              <cylinderGeometry args={[0.155, 0.155, 0.028, 8]} />
              <meshToonMaterial color="#8a2020" />
            </mesh>
          </group>
        </group>

        {/* Arms — local y: world 1.27 − body 0.94 = 0.33 */}
        {/* LEFT ARM — flower sticks to hand when carrying */}
        <group ref={leftArmRef} position={[-0.26, 0.33, 0]}>
          <mesh castShadow position={[0, -0.28, 0]}>
            <capsuleGeometry args={[0.055, 0.42, 4, 6]} />
            <meshToonMaterial color="#3a5a8a" />
            <Outlines color={COLORS.outline} thickness={1.5} />
          </mesh>
          {/* Hand + gripped flower (parented so it follows every arm swing) */}
          <group position={[0, -0.55, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[0.055, 6, 6]} />
              <meshToonMaterial color="#d4a574" />
              <Outlines color={COLORS.outline} thickness={1} />
            </mesh>
            {heldTypeId != null && <HeldFlowerPreview typeId={heldTypeId} />}
          </group>
        </group>

        {/* RIGHT ARM — fishing pole grips here */}
        <group ref={rightArmRef} position={[0.26, 0.33, 0]}>
          <mesh castShadow position={[0, -0.28, 0]}>
            <capsuleGeometry args={[0.055, 0.42, 4, 6]} />
            <meshToonMaterial color="#3a5a8a" />
            <Outlines color={COLORS.outline} thickness={1.5} />
          </mesh>
          <group position={[0, -0.55, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[0.055, 6, 6]} />
              <meshToonMaterial color="#d4a574" />
              <Outlines color={COLORS.outline} thickness={1} />
            </mesh>
            {fishingPoleOut && <FishingPole />}
          </group>
        </group>
      </group>

      {/* === LEFT LEG — hip → thigh → knee → shin → boot === */}
      <group ref={leftLegRef} position={[-0.11, 0.77, 0]}>
        {/* Thigh */}
        <mesh castShadow position={[0, -0.18, 0]}>
          <capsuleGeometry args={[0.07, 0.22, 4, 6]} />
          <meshToonMaterial color="#5c3a18" />
          <Outlines color={COLORS.outline} thickness={1.5} />
        </mesh>
        {/* Knee joint + shin + boot */}
        <group ref={leftKneeRef} position={[0, -0.36, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.065, 6, 6]} />
            <meshToonMaterial color="#5c3a18" />
          </mesh>
          <mesh castShadow position={[0, -0.18, 0]}>
            <capsuleGeometry args={[0.06, 0.22, 4, 6]} />
            <meshToonMaterial color="#5c3a18" />
            <Outlines color={COLORS.outline} thickness={1.2} />
          </mesh>
          {/* Boot sole ~ ground when standing */}
          <mesh castShadow position={[0, -0.38, 0.05]}>
            <boxGeometry args={[0.12, 0.1, 0.22]} />
            <meshToonMaterial color={COLORS.woodDark} />
            <Outlines color={COLORS.outline} thickness={1} />
          </mesh>
        </group>
      </group>

      {/* === RIGHT LEG === */}
      <group ref={rightLegRef} position={[0.11, 0.77, 0]}>
        <mesh castShadow position={[0, -0.18, 0]}>
          <capsuleGeometry args={[0.07, 0.22, 4, 6]} />
          <meshToonMaterial color="#5c3a18" />
          <Outlines color={COLORS.outline} thickness={1.5} />
        </mesh>
        <group ref={rightKneeRef} position={[0, -0.36, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.065, 6, 6]} />
            <meshToonMaterial color="#5c3a18" />
          </mesh>
          <mesh castShadow position={[0, -0.18, 0]}>
            <capsuleGeometry args={[0.06, 0.22, 4, 6]} />
            <meshToonMaterial color="#5c3a18" />
            <Outlines color={COLORS.outline} thickness={1.2} />
          </mesh>
          <mesh castShadow position={[0, -0.38, 0.05]}>
            <boxGeometry args={[0.12, 0.1, 0.22]} />
            <meshToonMaterial color={COLORS.woodDark} />
            <Outlines color={COLORS.outline} thickness={1} />
          </mesh>
        </group>
      </group>
    </group>
    <FishingWorldFX fishingRef={fishingRef} playerGroupRef={groupRef} />
    </>
  );
});
