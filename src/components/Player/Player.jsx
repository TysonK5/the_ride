import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";
import {
  MOUNT_RANGE,
  RIDE_SPEED,
  DRINK_DURATION,
  callNearestHorse,
} from "../Horse/Horse";
import {
  resolveCollisions,
  isNearShore,
  applyGroundHeight,
  getGroundHeight,
} from "../../systems/colliders";
import {
  getFenceColliders,
  distToGate,
  GATE_RANGE,
  tryPushBarnGate,
  setGateOpenFromPlayer,
} from "../Environment/Fence";
import {
  getBarnColliders,
  distToBarnDoors,
  distToBarnBackDoor,
  BARN_DOOR_RANGE,
  distToCabinDoor,
  distToCabinBackDoor,
  CABIN_DOOR_RANGE,
  tryPushCabinYardGates,
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
  applySeatedFishingLegs,
  TARGET_SPEED,
  CAST_DURATION,
  REEL_DURATION,
  CATCH_SHOW,
} from "./Fishing";
import {
  DOCK,
  canSitAtDockChair,
  distToDockChair,
} from "../Environment/Dock";
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
  sfxWhistle,
  sfxFishStart,
  sfxFishCast,
  sfxFishSplash,
  sfxFishBite,
  sfxFishReel,
  sfxFishCatch,
  sfxButterflyCatch,
} from "../../systems/audio";
import { PLAY_HALF } from "../../systems/map";
import {
  RIDER_SEAT_HEIGHT,
  RIDER_SEAT_Z,
  REIN_HAND_L,
  REIN_HAND_R,
  STIRRUP_FOOT,
} from "../Horse/Horse";
import {
  findNearestFurniture,
  beginMoveFurniture,
  placeFurniture,
  cancelMoveFurniture,
} from "../../systems/furniture";
import {
  findNearestButterfly,
  catchButterfly,
  releaseButterfly,
  ButterflyNet,
  BUTTERFLY_CATCH_RANGE,
} from "../Animals/Butterfly";

const MOVE_SPEED = 8;
const SPRINT_MULT = 2;
const CAMERA_DISTANCE = 6;
const RIDE_CAMERA_DISTANCE = 8;
/** Player root Y while mounted — hips rest on western saddle seat */
const SEAT_HEIGHT = RIDER_SEAT_HEIGHT;
/** Horse-local Z offset so the rider stays centered on the saddle */
const SEAT_Z = RIDER_SEAT_Z;

/**
 * Snap player root to the saddle seat on the given mount (horse-local seat).
 * Seat is fixed in horse space (saddle is NOT under the bobbing torso), so
 * matching this transform every frame keeps the rider glued mid-saddle.
 */
function placeRiderOnSaddle(playerGroup, rideState) {
  if (!playerGroup || !rideState) return;
  const hx = rideState.position.x;
  const hy = rideState.position.y ?? 0;
  const hz = rideState.position.z;
  const yaw = rideState.yaw ?? 0;
  // Explicit local seat — no residual offsets from prior frames
  horseLocalToWorld(hx, hy, hz, yaw, 0, SEAT_HEIGHT, SEAT_Z, _animPos);
  playerGroup.position.x = _animPos.x;
  playerGroup.position.y = _animPos.y;
  playerGroup.position.z = _animPos.z;
  playerGroup.rotation.set(0, yaw, 0);
  playerGroup.scale.set(1, 1, 1);
  playerGroup.updateMatrix();
}

/** Hip socket on the body (player-local) — legs stay attached here */
const HIP_ATTACH_L = { x: -0.13, y: 0.74, z: 0.02 };
const HIP_ATTACH_R = { x: 0.13, y: 0.74, z: 0.02 };
/** Shoulder sockets in body-local space (arm group origins) */
const SHOULDER_L = { x: -0.26, y: 0.33, z: 0 };
const SHOULDER_R = { x: 0.26, y: 0.33, z: 0 };
/** Rest length shoulder → hand center along arm −Y */
const ARM_HAND_LEN = 0.55;
/** Body root Y in player space while seated / standing upright */
const BODY_Y = 0.94;
/** Thigh length: hip origin → knee joint (matches mesh knee at y=-0.36) */
const THIGH_LEN = 0.36;
/** Shin length: knee → boot sole (knee at 0, shin, boot at ~-0.38) */
const SHIN_LEN = 0.4;

const _ikHip = new THREE.Vector3();
const _ikFoot = new THREE.Vector3();
const _ikDir = new THREE.Vector3();
const _ikMid = new THREE.Vector3();
const _ikAxis = new THREE.Vector3();
const _ikKnee = new THREE.Vector3();
const _ikPole = new THREE.Vector3();
const _ikDown = new THREE.Vector3(0, -1, 0);
const _ikQ = new THREE.Quaternion();
const _ikQInv = new THREE.Quaternion();
const _ikShin = new THREE.Vector3();
const WALK_ANIM_SPEED = 10;
const RUN_ANIM_SPEED = 18;
const PLAYER_RADIUS = 0.45;
const HORSE_RADIUS = 0.9;
const HORSE_COLLIDER_R = 1.1;
/** Unicorn vertical flight speeds */
const FLY_UP_SPEED = 9;
const FLY_DOWN_SPEED = 11;
const FLY_GRAVITY = 6;
const FLY_MAX_HEIGHT = 45;
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
/** Net swing to catch a butterfly (seconds) */
const NET_CATCH_DURATION = 0.75;
/** Progress at which the flower is actually picked / planted */
const FLOWER_ACTION_AT = 0.42;
/** Progress at which the butterfly is netted */
const NET_CATCH_AT = 0.38;

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
  out.y = hy + ly;
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

/**
 * Two-bone IK: hip stays on the pelvis, boot sole aims at the stirrup iron.
 * Rest pose: thigh & shin along local −Y from each joint.
 */
function setLegIK(hipRef, kneeRef, hipPos, footX, footY, footZ, isLeft) {
  if (!hipRef?.current || !kneeRef?.current) return;

  hipRef.current.position.set(hipPos.x, hipPos.y, hipPos.z);
  _ikHip.set(hipPos.x, hipPos.y, hipPos.z);
  _ikFoot.set(footX, footY, footZ);

  _ikDir.subVectors(_ikFoot, _ikHip);
  let dist = _ikDir.length();
  const maxReach = THIGH_LEN + SHIN_LEN - 0.02;
  const minReach = 0.12;
  if (dist < 1e-5) {
    _ikDir.set(isLeft ? -0.25 : 0.25, -1, 0.08).normalize();
    dist = minReach;
    _ikFoot.copy(_ikHip).addScaledVector(_ikDir, dist);
  } else if (dist > maxReach) {
    _ikDir.multiplyScalar(1 / dist);
    dist = maxReach;
    _ikFoot.copy(_ikHip).addScaledVector(_ikDir, dist);
  } else if (dist < minReach) {
    _ikDir.multiplyScalar(1 / dist);
    dist = minReach;
    _ikFoot.copy(_ikHip).addScaledVector(_ikDir, dist);
  } else {
    _ikDir.multiplyScalar(1 / dist);
  }

  // Knee pole: outward + slightly forward (wraps outside the barrel)
  _ikPole.set(isLeft ? -0.6 : 0.6, 0.05, 0.85);

  const a =
    (THIGH_LEN * THIGH_LEN - SHIN_LEN * SHIN_LEN + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0.0001, THIGH_LEN * THIGH_LEN - a * a));
  _ikMid.copy(_ikHip).addScaledVector(_ikDir, a);
  _ikAxis.crossVectors(_ikDir, _ikPole);
  if (_ikAxis.lengthSq() < 1e-8) {
    _ikAxis.set(1, 0, 0);
  } else {
    _ikAxis.normalize();
  }
  _ikKnee.copy(_ikMid).addScaledVector(_ikAxis, h);

  // Hip: rest −Y → hip→knee
  _ikDir.subVectors(_ikKnee, _ikHip).normalize();
  _ikQ.setFromUnitVectors(_ikDown, _ikDir);
  hipRef.current.quaternion.copy(_ikQ);

  // Knee: rest −Y → knee→foot, expressed in hip local space
  _ikQInv.copy(_ikQ).invert();
  // foot in hip local
  _ikShin.copy(_ikFoot).sub(_ikHip).applyQuaternion(_ikQInv);
  // knee joint fixed at (0, -THIGH_LEN, 0) in hip local
  _ikShin.y += THIGH_LEN; // shinDir = footLocal - kneeLocal
  if (_ikShin.lengthSq() < 1e-8) {
    _ikShin.set(0, -1, 0);
  } else {
    _ikShin.normalize();
  }
  const qKnee = new THREE.Quaternion().setFromUnitVectors(_ikDown, _ikShin);
  kneeRef.current.quaternion.copy(qKnee);
}

/** Stirrup iron in player-local space (player root at seat on horse). */
function stirrupPlayerLocal(isLeft) {
  return {
    x: isLeft ? -STIRRUP_FOOT.x : STIRRUP_FOOT.x,
    y: STIRRUP_FOOT.y - SEAT_HEIGHT,
    z: STIRRUP_FOOT.z - SEAT_Z,
  };
}

/**
 * Horse-local rein-hand point → player-local (player root on saddle seat).
 */
function reinHandPlayerLocal(isLeft) {
  const h = isLeft ? REIN_HAND_L : REIN_HAND_R;
  return {
    x: h.x,
    y: h.y - SEAT_HEIGHT,
    z: h.z - SEAT_Z,
  };
}

/**
 * Aim a single-bone arm so the hand (arm local 0,−ARM_HAND_LEN,0) reaches target.
 * Shoulder stays in its body-local socket; target is body-local.
 */
function aimArmAtHand(armRef, shoulderBody, handBody, isLeft) {
  if (!armRef?.current) return;
  armRef.current.position.set(shoulderBody.x, shoulderBody.y, shoulderBody.z);
  _ikDir.set(
    handBody.x - shoulderBody.x,
    handBody.y - shoulderBody.y,
    handBody.z - shoulderBody.z
  );
  let dist = _ikDir.length();
  if (dist < 1e-4) {
    armRef.current.rotation.set(isLeft ? -0.55 : -0.75, 0, isLeft ? 0.2 : -0.18);
    return;
  }
  // Clamp so we don't over-stretch the visual arm
  if (dist > ARM_HAND_LEN * 1.08) {
    _ikDir.multiplyScalar((ARM_HAND_LEN * 1.08) / dist);
    dist = ARM_HAND_LEN * 1.08;
  }
  _ikDir.normalize();
  _ikQ.setFromUnitVectors(_ikDown, _ikDir);
  armRef.current.quaternion.copy(_ikQ);
}

/**
 * Seated rider: boots on stirrups, hands stuck to rein ends.
 */
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
  if (bodyRef.current) {
    bodyRef.current.position.y = BODY_Y;
    bodyRef.current.rotation.x = 0.05;
    bodyRef.current.rotation.z = 0;
  }

  // Hands → rein ends (body-local targets). If carrying a flower, left hand keeps carry pose.
  if (carrying) {
    if (leftArmRef.current) {
      leftArmRef.current.position.set(SHOULDER_L.x, SHOULDER_L.y, SHOULDER_L.z);
      leftArmRef.current.rotation.set(-0.75, 0.28, 0.4);
    }
  } else {
    const handL = reinHandPlayerLocal(true);
    aimArmAtHand(
      leftArmRef,
      SHOULDER_L,
      { x: handL.x, y: handL.y - BODY_Y, z: handL.z },
      true
    );
  }
  {
    const handR = reinHandPlayerLocal(false);
    aimArmAtHand(
      rightArmRef,
      SHOULDER_R,
      { x: handR.x, y: handR.y - BODY_Y, z: handR.z },
      false
    );
  }

  const footL = stirrupPlayerLocal(true);
  const footR = stirrupPlayerLocal(false);
  setLegIK(
    leftLegRef,
    leftKneeRef,
    HIP_ATTACH_L,
    footL.x,
    footL.y,
    footL.z,
    true
  );
  setLegIK(
    rightLegRef,
    rightKneeRef,
    HIP_ATTACH_R,
    footR.x,
    footR.y,
    footR.z,
    false
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
  const hy = rideState.position.y ?? 0;
  const hz = rideState.position.z;
  const yaw = rideState.yaw;

  // Key poses in horse-local space (Y is relative to horse feet / ground)
  // side -1 = horse left (traditional mount), +1 = horse right
  const beside = { x: side * 1.35, y: 0, z: 0.05 };
  const stirrup = { x: side * 0.5, y: 0.55, z: 0.08 };
  const highStirrup = { x: side * 0.2, y: SEAT_HEIGHT + 0.12, z: SEAT_Z };
  const seat = { x: 0, y: SEAT_HEIGHT, z: SEAT_Z };

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

  horseLocalToWorld(hx, hy, hz, yaw, lx, ly, lz, _animPos);
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
      const footNear = stirrupPlayerLocal(nearIsLeft);
      const footFar = stirrupPlayerLocal(!nearIsLeft);
      const hipNear = nearIsLeft ? HIP_ATTACH_L : HIP_ATTACH_R;
      const hipFar = nearIsLeft ? HIP_ATTACH_R : HIP_ATTACH_L;
      // Near leg plants on its stirrup early
      setLegIK(
        nearHip,
        nearKnee,
        hipNear,
        footNear.x,
        footNear.y,
        footNear.z,
        nearIsLeft
      );
      // Far leg swings high over the seat, then IK to far stirrup
      if (u < 0.55) {
        setLegArticulated(
          farHip,
          farKnee,
          [s * 0.08, lerp(0.9, 1.05, u / 0.55), lerp(0.15, 0.35, u / 0.55)],
          [lerp(0.5, 1.2, u / 0.55), 0, -s * 0.15],
          0.25
        );
      } else {
        const v = (u - 0.55) / 0.45;
        setLegIK(
          farHip,
          farKnee,
          hipFar,
          lerp(s * 0.1, footFar.x, v),
          lerp(0.9, footFar.y, v),
          lerp(0.3, footFar.z, v),
          !nearIsLeft
        );
      }
    } else {
      // Settle — full seated IK (hips on pelvis, boots in irons)
      applySeatedPose(
        bodyRef,
        leftArmRef,
        rightArmRef,
        leftLegRef,
        rightLegRef,
        leftKneeRef,
        rightKneeRef,
        hatRef,
        false
      );
    }
  }

  if (hatRef.current && phase !== "settle") hatRef.current.rotation.z = 0;
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
  // Follow player height (important when unicorn is flying)
  const lookY = playerGroup.position.y + (mounted ? 1.5 : 1.5);
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
    unicornRideState,
    gateState,
    barnDoorState,
    cabinState,
    furnitureState = null,
    flowerState,
    butterflyState = null,
    playerTrack,
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
  const mountPressedRef = useRef(false);
  /** Last sample for gate push velocity; primed = false until first frame */
  const gatePushPrevRef = useRef({ x: 0, z: 0, primed: false });
  const callHorsePressedRef = useRef(false);
  // Local state so the hand-held mesh mounts as soon as you pick a flower
  const [heldTypeId, setHeldTypeId] = useState(
    () => flowerState?.heldTypeId ?? null
  );
  /**
   * Net state:
   * - showNet: net is visible on the right hand
   * - heldButterfly: payload in the net until release (null when empty)
   * - netAnim: short swing when first catching
   */
  const [showNet, setShowNet] = useState(false);
  const [heldButterfly, setHeldButterfly] = useState(null);
  const netAnimRef = useRef({
    active: false,
    t: 0,
    didCatch: false,
    butterflyId: null,
  });
  /** Show fishing rod in the right hand */
  const [fishingPoleOut, setFishingPoleOut] = useState(false);
  const fishingRef = useRef(createFishingState());
  const fishingPoleTipRef = useRef();
  const lastHintRef = useRef("");
  const walkCycleRef = useRef(0);
  const camDistSmoothRef = useRef(CAMERA_DISTANCE);
  const settingsRef = useRef(settings || DEFAULT_SETTINGS);
  settingsRef.current = settings || DEFAULT_SETTINGS;
  /** { active, mode: 'mount'|'dismount', t, side, mount: rideState ref } */
  const mountAnimRef = useRef({
    active: false,
    mode: null,
    t: 0,
    side: -1,
    mount: null,
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

  /**
   * Late seat lock: runs after Horse mesh sync (priority -1) so the rider
   * cannot lag a frame ahead of the saddle while the horse moves.
   */
  useFrame(() => {
    if (!enabled || !groupRef.current) return;
    const active =
      (rideState?.mounted && rideState) ||
      (unicornRideState?.mounted && unicornRideState) ||
      null;
    if (!active) return;
    placeRiderOnSaddle(groupRef.current, active);
  }, -2);

  useFrame((_, delta) => {
    if (!groupRef.current || !enabled) return;

    const keys = keysRef.current;
    const anim = mountAnimRef.current;
    const flowerAnim = flowerAnimRef.current;
    const fishing = fishingRef.current;
    // Horse + unicorn share the same ride-state API
    const mounts = [rideState, unicornRideState].filter(Boolean);
    const activeRide = mounts.find((m) => m.mounted) ?? null;
    const mounted = !!activeRide;
    // Mount used during mount/dismount anim
    const animMount = anim.active ? anim.mount : null;
    const rideForAnim = animMount || activeRide || rideState;
    const busy =
      anim.active ||
      flowerAnim.active ||
      netAnimRef.current.active ||
      fishing.active ||
      mounts.some((m) => m.busy);

    // Dynamic colliders: barn walls/doors + fence + idle mounts
    const extras = [
      ...getBarnColliders(barnDoorState),
      ...getFenceColliders(gateState),
    ];
    if (!anim.active) {
      for (const m of mounts) {
        if (!m.mounted) {
          extras.push({
            type: "circle",
            x: m.position.x,
            z: m.position.z,
            r: HORSE_COLLIDER_R,
          });
        }
      }
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
    const cabinBackDoorDist = distToCabinBackDoor(px, pz);
    const nearCabinBackDoor =
      !mounted && !busy && cabinBackDoorDist <= CABIN_DOOR_RANGE;
    // Nearest free mount (horse or unicorn)
    let nearMount = null;
    let nearMountDist = Infinity;
    if (!mounted && !busy) {
      for (const m of mounts) {
        if (m.busy) continue;
        const d = groupRef.current.position.distanceTo(m.position);
        if (d <= MOUNT_RANGE && d < nearMountDist) {
          nearMount = m;
          nearMountDist = d;
        }
      }
    }
    const nearHorse = !!nearMount;
    const horseDist = nearMountDist;
    const horseX = (activeRide || nearMount || rideState)?.position.x ?? px;
    const horseZ = (activeRide || nearMount || rideState)?.position.z ?? pz;
    const atShore =
      mounted &&
      !busy &&
      !activeRide?.drinking &&
      !activeRide?.moving &&
      isNearShore(horseX, horseZ, 7);
    const drinking = !!activeRide?.drinking;
    const holdingFlower = flowerState?.heldTypeId != null;
    const nearFlowerHit =
      !mounted && !busy && flowerState
        ? findNearestFlower(flowerState, px, pz, FLOWER_PICK_RANGE)
        : null;
    const carryingButterfly =
      !!heldButterfly || !!butterflyState?.held;
    const nearButterflyHit =
      !mounted &&
      !busy &&
      !holdingFlower &&
      !carryingButterfly &&
      butterflyState
        ? findNearestButterfly(
            butterflyState,
            px,
            groupRef.current.position.y,
            pz,
            BUTTERFLY_CATCH_RANGE
          )
        : null;
    const canPlantHere =
      holdingFlower && !mounted && !busy && !isBlockedPlantSpot(px, pz);
    const nearFishing =
      canFishHere(px, pz, mounted, holdingFlower, busy && !fishing.active);
    const nearDockChair = canSitAtDockChair(
      px,
      pz,
      mounted,
      holdingFlower,
      busy && !fishing.active
    );

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
    const mountKey = gp
      ? formatBindingCode(s.gamepadBindings?.mount) +
        " / " +
        formatKeyCode(bindings.mount || "KeyR")
      : formatKeyCode(bindings.mount || "KeyR");
    const callKey = gp
      ? formatBindingCode(s.gamepadBindings?.callHorse) +
        " / " +
        formatKeyCode(bindings.callHorse || "KeyH")
      : formatKeyCode(bindings.callHorse || "KeyH");
    const flyKey = gp
      ? formatBindingCode(s.gamepadBindings?.fly) +
        " / " +
        formatKeyCode(bindings.fly || "Space")
      : formatKeyCode(bindings.fly || "Space");
    const flyDownKey = gp
      ? formatBindingCode(s.gamepadBindings?.flyDown) +
        " / " +
        formatKeyCode(bindings.flyDown || "KeyC")
      : formatKeyCode(bindings.flyDown || "KeyC");

    // --- Interact ---
    const interactDown =
      isActionDown(bindings, "interact", keys) || !!gp?.interact;
    const sprintDown =
      isActionDown(bindings, "sprint", keys) || !!gp?.sprint;
    const mountDown =
      isActionDown(bindings, "mount", keys) || !!gp?.mount;
    const callHorseDown =
      isActionDown(bindings, "callHorse", keys) || !!gp?.callHorse;
    const flyUpDown =
      isActionDown(bindings, "fly", keys) || !!gp?.fly;
    const flyDownDown =
      isActionDown(bindings, "flyDown", keys) || !!gp?.flyDown;

    // Fishing state machine (works while "busy" with fishing.active)
    if (interactDown && !interactPressedRef.current && fishing.active) {
      if (fishing.phase === "aim") {
        // Cast toward target
        fishing.phase = "cast";
        fishing.phaseT = 0;
        fishing.castFromX = groupRef.current.position.x;
        fishing.castFromZ = groupRef.current.position.z;
        fishing.castFromY = fishing.seated
          ? groupRef.current.position.y + 1.35
          : 1.6;
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

    // --- Mount / dismount (dedicated control, default R) ---
    if (mountDown && !mountPressedRef.current && !busy && !drinking && !fishing.active) {
      if (mounted && activeRide) {
        // Land unicorn before dismount
        activeRide.airborne = false;
        applyGroundHeight(activeRide.position);
        activeRide.justDrank = false;
        activeRide.moving = false;
        activeRide.sprinting = false;
        activeRide.busy = true;
        anim.active = true;
        anim.mode = "dismount";
        anim.t = 0;
        anim.side = -1;
        anim.mount = activeRide;
        sfxDismount();
      } else if (nearMount) {
        const m = nearMount;
        const toPlayerX = groupRef.current.position.x - m.position.x;
        const toPlayerZ = groupRef.current.position.z - m.position.z;
        const c = Math.cos(m.yaw);
        const sYaw = Math.sin(m.yaw);
        const localX = toPlayerX * c - toPlayerZ * sYaw;
        anim.side = localX >= 0 ? 1 : -1;
        anim.active = true;
        anim.mode = "mount";
        anim.t = 0;
        anim.mount = m;
        m.busy = true;
        m.moving = false;
        m.sprinting = false;
        m.aiMode = "stand";
        walkCycleRef.current = 0;
        sfxMount();
      }
    }
    mountPressedRef.current = mountDown;

    // --- Call horse (whistle) — closest free mount only comes ---
    if (
      callHorseDown &&
      !callHorsePressedRef.current &&
      !mounted &&
      !busy &&
      !drinking &&
      !fishing.active
    ) {
      const called = callNearestHorse(mounts, px, pz);
      sfxWhistle();
      if (called) {
        // Brief HUD feedback
        lastHintRef.current = "";
        onRideHint?.(
          `${called.name === "unicorn" ? "Unicorn" : "Horse"} is coming…`
        );
      }
    }
    callHorsePressedRef.current = callHorseDown;

    // Keep called mount tracking the player while they approach
    for (const m of mounts) {
      if (m && !m.mounted && m.aiMode === "come") {
        m.callTargetX = px;
        m.callTargetZ = pz;
      }
    }

    // --- Furniture move: place if carrying, or pick up nearest cabin piece ---
    const nearFurniture =
      !mounted &&
      !busy &&
      furnitureState &&
      !furnitureState.movingId
        ? findNearestFurniture(furnitureState, px, pz)
        : null;
    let furnitureInteracted = false;
    if (
      interactDown &&
      !interactPressedRef.current &&
      !busy &&
      !drinking &&
      !mounted &&
      furnitureState
    ) {
      if (furnitureState.movingId) {
        placeFurniture(furnitureState);
        furnitureInteracted = true;
      } else if (nearFurniture && !holdingFlower && !nearFlowerHit) {
        beginMoveFurniture(furnitureState, nearFurniture.item.id);
        furnitureInteracted = true;
      }
    }
    // Cancel furniture move with sprint press edge while carrying
    if (
      furnitureState?.movingId &&
      sprintDown &&
      !sprintPressedRef.current &&
      !fishing.active
    ) {
      cancelMoveFurniture(furnitureState);
    }

    // --- Release butterfly from net (interact while carrying) ---
    let butterflyInteracted = false;
    if (
      interactDown &&
      !interactPressedRef.current &&
      !busy &&
      !drinking &&
      !mounted &&
      carryingButterfly &&
      !furnitureInteracted
    ) {
      releaseButterfly(
        butterflyState,
        px,
        pz,
        groupRef.current.rotation.y
      );
      setHeldButterfly(null);
      setShowNet(false);
      if (rightArmRef.current) rightArmRef.current.rotation.set(0, 0, 0);
      butterflyInteracted = true;
      sfxButterflyCatch();
    }

    // --- Interact (doors, flowers, fishing, horse drink — not mount) ---
    if (
      interactDown &&
      !interactPressedRef.current &&
      !busy &&
      !drinking &&
      !furnitureInteracted &&
      !butterflyInteracted &&
      !carryingButterfly &&
      !furnitureState?.movingId
    ) {
      if (mounted && activeRide) {
        // At shore + stopped + haven't just drunk → drink (dismount is R)
        if (atShore && !activeRide.justDrank) {
          activeRide.drinking = true;
          activeRide.drinkTimer = 0;
          activeRide.moving = false;
          activeRide.sprinting = false;
          sfxHorseDrink();
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

        if (nearButterflyHit && butterflyState) {
          acts.push({
            d: nearButterflyHit.dist,
            run: () => {
              const b = nearButterflyHit.butterfly;
              groupRef.current.rotation.y = Math.atan2(
                b.pos.x - px,
                b.pos.z - pz
              );
              const netAnim = netAnimRef.current;
              netAnim.active = true;
              netAnim.t = 0;
              netAnim.didCatch = false;
              netAnim.butterflyId = b.id;
              setShowNet(true);
              walkCycleRef.current = 0;
              sfxButterflyCatch();
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
        if (nearCabinBackDoor && cabinState) {
          acts.push({
            d: cabinBackDoorDist,
            run: () => {
              cabinState.backDoorOpen = !cabinState.backDoorOpen;
              sfxDoorWood();
            },
          });
        }
        if (nearGate && gateState) {
          acts.push({
            d: gateDist,
            run: () => {
              setGateOpenFromPlayer(gateState, pz, !gateState.open);
              sfxGate();
            },
          });
        }
        if (nearDockChair) {
          acts.push({
            d: distToDockChair(px, pz),
            run: () => {
              // Snap into the dock chair and start fishing seated, facing water
              const sx = DOCK.sit.x;
              const sz = DOCK.sit.z;
              const t = defaultTargetFromShore(sx, sz);
              // Same facing convention as walking: atan2(dx, dz) → mesh +Z toward target
              const faceYaw = Math.atan2(t.x - sx, t.z - sz);
              groupRef.current.position.set(sx, DOCK.deckY, sz);
              groupRef.current.rotation.y = faceYaw;
              yawRef.current = faceYaw;
              fishing.active = true;
              fishing.seated = true;
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
              fishing.castFromY = DOCK.deckY + 1.35;
              walkCycleRef.current = 0;
              setFishingPoleOut(true);
              sfxFishStart();
            },
          });
        } else if (nearFishing) {
          acts.push({
            d: 0.4,
            run: () => {
              const t = defaultTargetFromShore(px, pz);
              fishing.active = true;
              fishing.seated = false;
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
    for (const m of mounts) {
      if (m.drinking) {
        m.drinkTimer = (m.drinkTimer ?? 0) + delta;
        m.moving = false;
        m.sprinting = false;
        if (m.drinkTimer >= DRINK_DURATION) {
          m.drinking = false;
          m.drinkTimer = 0;
          m.justDrank = true;
        }
      }
      if (m.justDrank && m.mounted && !isNearShore(m.position.x, m.position.z, 7)) {
        m.justDrank = false;
      }
    }

    // Proximity hint
    if (onRideHint) {
      let hint = "";
      if (anim.active) {
        hint =
          anim.mode === "mount" ? "Mounting…" : "Dismounting…";
      } else if (furnitureState?.movingId) {
        const piece = furnitureState.items.find(
          (f) => f.id === furnitureState.movingId
        );
        const name = piece?.name || "item";
        hint = `Moving ${name} · ${interactKey} place · ${sprintKey} cancel`;
      } else if (netAnimRef.current.active) {
        hint = "Catching butterfly…";
      } else if (carryingButterfly) {
        const name = heldButterfly?.name || butterflyState?.held?.name || "butterfly";
        hint = `Carrying ${name} · ${interactKey} to release`;
      } else if (flowerAnim.active) {
        hint = flowerAnim.mode === "pick" ? "Picking…" : "Planting…";
      } else if (fishing.active) {
        if (fishing.phase === "aim") {
          hint = fishing.seated
            ? `${interactKey} cast · move aim · ${sprintKey} stand up`
            : `${interactKey} cast · move aim · ${sprintKey} cancel`;
        } else if (fishing.phase === "cast") {
          hint = "Casting…";
        } else if (fishing.phase === "wait") {
          hint =
            "Waiting for a bite… · " +
            sprintKey +
            (fishing.seated ? " stand up" : " cancel");
        } else if (fishing.phase === "bite") {
          hint = `${interactKey} to reel in!`;
        } else if (fishing.phase === "reel") {
          hint = "Reeling…";
        } else if (fishing.phase === "catch") {
          hint = fishing.resultText
            ? `${fishing.resultText} · ${interactKey} continue`
            : `${interactKey} continue`;
        }
      } else if (drinking || activeRide?.drinking) {
        hint = `${activeRide?.name === "unicorn" ? "Unicorn" : "Horse"} is drinking…`;
      } else if (mounted && atShore && !activeRide?.justDrank && !activeRide?.airborne) {
        hint = `${interactKey} to drink · ${mountKey} to dismount · hold still at water`;
      } else if (mounted && activeRide?.name === "unicorn") {
        hint = activeRide.airborne
          ? `${flyKey} up · ${flyDownKey} down · ${mountKey} dismount · ${sprintKey} dash`
          : `${flyKey} to fly · ${mountKey} dismount · ${sprintKey} gallop`;
      } else if (mounted) {
        hint = `${mountKey} to dismount · ${sprintKey} to gallop`;
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
              text: `Can't plant here (barn / cabin floor / water)`,
            });
          }
        } else if (nearFlowerHit) {
          const name = getFlowerType(nearFlowerHit.flower.typeId).name;
          options.push({
            d: nearFlowerHit.dist,
            text: `${interactKey} to pick ${name}`,
          });
        }
        if (nearButterflyHit) {
          options.push({
            d: nearButterflyHit.dist,
            text: `${interactKey} to catch butterfly`,
          });
        }
        if (nearDockChair) {
          options.push({
            d: distToDockChair(px, pz),
            text: `${interactKey} to sit & fish`,
          });
        } else if (nearFishing) {
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
        if (nearFurniture) {
          options.push({
            d: nearFurniture.dist,
            text: `${interactKey} to move ${nearFurniture.item.name}`,
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
        if (nearCabinBackDoor) {
          options.push({
            d: cabinBackDoorDist,
            text: cabinState?.backDoorOpen
              ? `${interactKey} to close patio door`
              : `${interactKey} to open patio door`,
          });
        }
        if (nearGate) {
          options.push({
            d: gateDist,
            text: gateState?.open
              ? `${interactKey} to close gate · or push the leaf closed`
              : `${interactKey} to open gate · or walk through (swings with you)`,
          });
        }
        if (nearMount) {
          const label =
            nearMount.name === "unicorn" ? "unicorn" : "horse";
          options.push({
            d: horseDist,
            text: `${mountKey} to mount ${label}`,
          });
        }
        // Soft prompt for whistle when a free mount exists (low priority)
        const freeMount = mounts.find(
          (m) => m && !m.mounted && !m.busy && !m.drinking
        );
        if (freeMount) {
          const coming = mounts.some((m) => m?.aiMode === "come");
          options.push({
            d: 50,
            text: coming
              ? `${freeMount.name === "unicorn" ? "Unicorn" : "Horse"} is coming…`
              : `${callKey} to call horse`,
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
    if (anim.active && rideForAnim) {
      const rs = rideForAnim;
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
        rs,
        anim.side,
        rawT
      );

      if (anim.t >= 1) {
        if (anim.mode === "mount") {
          rs.mounted = true;
          rs.busy = false;
          // Snap to final seat (saddle center, not horse origin)
          placeRiderOnSaddle(groupRef.current, rs);
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
          rs.mounted = false;
          rs.busy = false;
          // Land beside mount (on local ground height)
          horseLocalToWorld(
            rs.position.x,
            rs.position.y ?? 0,
            rs.position.z,
            rs.yaw,
            anim.side * 1.45,
            0,
            0.1,
            _animPos
          );
          groupRef.current.position.copy(_animPos);
          resolveCollisions(
            groupRef.current.position,
            PLAYER_RADIUS,
            [
              ...getBarnColliders(barnDoorState),
              ...getFenceColliders(gateState),
              {
                type: "circle",
                x: rs.position.x,
                z: rs.position.z,
                r: HORSE_COLLIDER_R,
              },
            ],
            cabinState
          );
          applyGroundHeight(groupRef.current.position);
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
        anim.mount = null;
      }

      // Camera still follows during animation
      if (playerTrack) {
        playerTrack.position.copy(groupRef.current.position);
        playerTrack.yaw = groupRef.current.rotation.y;
        playerTrack.moving = true;
        playerTrack.mounted = false;
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

    // --- Butterfly net catch swing ---
    const netAnim = netAnimRef.current;
    if (netAnim.active) {
      netAnim.t = Math.min(1, netAnim.t + delta / NET_CATCH_DURATION);
      // Swing right arm with net
      if (rightArmRef.current) {
        const swing = Math.sin(netAnim.t * Math.PI);
        rightArmRef.current.rotation.set(
          -0.4 - swing * 1.4,
          -0.35 * swing,
          -0.5 - swing * 0.6
        );
      }
      if (bodyRef.current) {
        bodyRef.current.rotation.x = 0.08 * Math.sin(netAnim.t * Math.PI);
      }
      // Commit catch mid-swing — butterfly stays in net until released
      if (!netAnim.didCatch && netAnim.t >= NET_CATCH_AT && butterflyState) {
        netAnim.didCatch = true;
        const held = catchButterfly(butterflyState, netAnim.butterflyId);
        if (held) {
          setHeldButterfly(held);
          setShowNet(true);
        }
        sfxButterflyCatch();
      }
      if (netAnim.t >= 1) {
        netAnim.active = false;
        netAnim.t = 0;
        netAnim.butterflyId = null;
        // Keep net out if we have a butterfly; otherwise put it away
        if (!butterflyState?.held && !heldButterfly) {
          setShowNet(false);
          if (rightArmRef.current) rightArmRef.current.rotation.set(0, 0, 0);
        }
        if (bodyRef.current) bodyRef.current.rotation.x = 0;
      }
      if (playerTrack) {
        playerTrack.position.copy(groupRef.current.position);
        playerTrack.yaw = groupRef.current.rotation.y;
        playerTrack.moving = false;
        playerTrack.mounted = false;
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
          const id =
            typeof flowerState.nextId === "number"
              ? flowerState.nextId++
              : Date.now() + Math.floor(Math.random() * 999);
          flowerState.instances.push({
            id,
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

      if (playerTrack) {
        playerTrack.position.copy(groupRef.current.position);
        playerTrack.yaw = groupRef.current.rotation.y;
        playerTrack.moving = false;
        playerTrack.mounted = false;
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
        fishing.phase,
        !!fishing.seated
      );
      if (fishing.seated) {
        // Keep seated on the dock chair
        groupRef.current.position.x = DOCK.sit.x;
        groupRef.current.position.z = DOCK.sit.z;
        groupRef.current.position.y = DOCK.deckY;
        applySeatedFishingLegs(
          leftLegRef,
          leftKneeRef,
          rightLegRef,
          rightKneeRef,
          setLegArticulated
        );
      } else {
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
      }

      if (playerTrack) {
        playerTrack.position.copy(groupRef.current.position);
        playerTrack.yaw = groupRef.current.rotation.y;
        playerTrack.moving = false;
        playerTrack.mounted = false;
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
        isMoving && !activeRide?.drinking,
        sprinting,
        delta
      );
    } else {
      updateFootsteps(isMoving, sprinting, delta);
    }

    if (mounted && activeRide) {
      const isUnicorn = activeRide.name === "unicorn";
      const prevRideY = activeRide.position.y;
      // Can't ride away while drinking
      if (activeRide.drinking) {
        activeRide.moving = false;
        activeRide.sprinting = false;
        activeRide.airborne = false;
        applyGroundHeight(activeRide.position, prevRideY);
      } else {
        activeRide.sprinting = sprinting && isMoving;

        // Unicorn flight first so airborne status is current for horizontal move
        if (isUnicorn) {
          const up = flyUpDown;
          const down = flyDownDown;
          const vertMult = sprinting ? 1.35 : 1;
          const floorY = getGroundHeight(
            activeRide.position.x,
            activeRide.position.z
          );
          if (up) {
            activeRide.position.y += FLY_UP_SPEED * vertMult * delta;
          } else if (down) {
            activeRide.position.y -= FLY_DOWN_SPEED * vertMult * delta;
          } else if (activeRide.position.y > floorY + 0.05) {
            // Soft gravity when not holding fly keys
            activeRide.position.y -= FLY_GRAVITY * delta;
          }
          activeRide.position.y = THREE.MathUtils.clamp(
            activeRide.position.y,
            floorY,
            FLY_MAX_HEIGHT
          );
          activeRide.airborne = activeRide.position.y > floorY + 0.15;
        } else {
          activeRide.airborne = false;
        }

        if (isMoving) {
          const airMult = activeRide.airborne ? 1.15 : 1;
          _move.normalize().multiplyScalar(speed * airMult * delta);
          _next.copy(activeRide.position);
          if (activeRide.airborne) {
            // Fly over fences, buildings, pond — no XZ colliders
            _next.x += _move.x;
            _next.z += _move.z;
          } else {
            // Axis-separated collision for smoother sliding (XZ only)
            _next.x += _move.x;
            resolveCollisions(_next, HORSE_RADIUS, extras, cabinState);
            _next.z = activeRide.position.z + _move.z;
            resolveCollisions(_next, HORSE_RADIUS, extras, cabinState);
          }
          _next.y = activeRide.position.y;
          activeRide.position.copy(_next);
          activeRide.yaw = Math.atan2(_move.x, _move.z);
          activeRide.moving = true;
        } else {
          activeRide.moving = false;
          activeRide.sprinting = false;
        }
      }

      activeRide.position.x = THREE.MathUtils.clamp(
        activeRide.position.x,
        -PLAY_HALF,
        PLAY_HALF
      );
      activeRide.position.z = THREE.MathUtils.clamp(
        activeRide.position.z,
        -PLAY_HALF,
        PLAY_HALF
      );
      // Stand on raised floors when not flying
      if (!activeRide.airborne) {
        resolveCollisions(
          activeRide.position,
          HORSE_RADIUS,
          extras,
          cabinState
        );
        applyGroundHeight(activeRide.position, prevRideY);
      }

      // Glue rider to saddle seat every frame (same transform as horse mesh)
      placeRiderOnSaddle(groupRef.current, activeRide);

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
      const prevPlayerY = groupRef.current.position.y;
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
      resolveCollisions(
        groupRef.current.position,
        PLAYER_RADIUS,
        extras,
        cabinState
      );
      // Step onto barn / cabin / patio / garden floors (never walk under them)
      applyGroundHeight(groupRef.current.position, prevPlayerY);

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
        if (carryingButterfly || (showNet && heldButterfly)) {
          // Arm straight up — net held vertical above the head
          rightArmRef.current.rotation.x = -2.95 + swingAmount * 0.03;
          rightArmRef.current.rotation.y = 0.08;
          rightArmRef.current.rotation.z = -0.22 + swingAmountZ * 0.04;
        } else if (showNet) {
          // Brief empty-net swing recovery
          rightArmRef.current.rotation.x = -0.55 + swingAmount * 0.06;
          rightArmRef.current.rotation.y = -0.12;
          rightArmRef.current.rotation.z = -0.38;
        } else {
          rightArmRef.current.rotation.x = swingAmount * (sprinting ? 1.15 : 1);
          rightArmRef.current.rotation.y = 0;
          rightArmRef.current.rotation.z =
            -swingAmountZ * (sprinting ? 0.45 : 0.3);
        }
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

    // Share position with follower pets (cat, dog, etc.)
    if (playerTrack) {
      playerTrack.position.copy(groupRef.current.position);
      playerTrack.yaw = groupRef.current.rotation.y;
      playerTrack.moving = mounted
        ? !!(activeRide?.moving || activeRide?.airborne)
        : isMoving;
      playerTrack.mounted = mounted;
      playerTrack.airborne = !!(
        mounted &&
        activeRide?.name === "unicorn" &&
        activeRide?.airborne
      );
    }

    // Gates — open/close with push direction (barn + cabin/garden pickets)
    if ((gateState || cabinState) && !busy) {
      const gx =
        mounted && activeRide
          ? activeRide.position.x
          : groupRef.current.position.x;
      const gz =
        mounted && activeRide
          ? activeRide.position.z
          : groupRef.current.position.z;
      const gMoving = mounted ? !!activeRide?.moving : isMoving;
      const prev = gatePushPrevRef.current;
      if (!prev.primed) {
        gatePushPrevRef.current = { x: gx, z: gz, primed: true };
      } else {
        // Prefer live input when blocked so direction still reads
        let velX = gx - prev.x;
        let velZ = gz - prev.z;
        if (gMoving && Math.hypot(velX, velZ) < 0.0005) {
          const wishLen = Math.hypot(_move.x, _move.z);
          if (wishLen > 0.0001) {
            velX = _move.x;
            velZ = _move.z;
          }
        }
        let gateSfx = false;
        if (
          gateState &&
          tryPushBarnGate(gx, gz, velX, velZ, gMoving, gateState)
        ) {
          gateSfx = true;
        }
        if (
          cabinState &&
          tryPushCabinYardGates(gx, gz, velX, velZ, gMoving, cabinState)
        ) {
          gateSfx = true;
        }
        if (gateSfx) sfxGate();
        gatePushPrevRef.current = { x: gx, z: gz, primed: true };
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
            {fishingPoleOut && <FishingPole tipRef={fishingPoleTipRef} />}
            {(showNet || heldButterfly || butterflyState?.held) && (
              <ButterflyNet
                scale={1.05}
                held={heldButterfly || butterflyState?.held}
              />
            )}
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
    <FishingWorldFX
      fishingRef={fishingRef}
      playerGroupRef={groupRef}
      poleTipRef={fishingPoleTipRef}
    />
    </>
  );
});
