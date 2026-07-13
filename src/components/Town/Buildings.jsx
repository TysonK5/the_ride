import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";
import { PetBowls } from "../Animals/PetBowls";
import { updateMovingFurniture } from "../../systems/furniture";

export const BARN_W = 18;
export const BARN_D = 12;
export const BARN_H = 7;
/** Door opening half-width (full opening ~8) */
export const DOOR_HALF = 4;
export const DOOR_LEAF_W = 3.9;
export const DOOR_LEAF_H = 4.6;
export const BARN_DOOR_RANGE = 4.5;
export const BARN_DOOR_Z = BARN_D / 2; // front face
export const BARN_BACK_Z = -BARN_D / 2; // back face
/**
 * How far each front leaf slides sideways when open.
 * Parks fully over the exterior side wall (past the door jamb).
 */
export const FRONT_DOOR_SLIDE = DOOR_LEAF_W + 0.55;
/**
 * How far in front of the wall face the sliding leaves sit so they stay
 * visible on the outside of the barn when open (not buried in the wall).
 */
export const FRONT_DOOR_EXTERIOR = 0.42;
/** Rear sliding door half-width (opening ~5.2) */
export const BACK_DOOR_HALF = 2.6;
export const BACK_DOOR_W = BACK_DOOR_HALF * 2;
export const BACK_DOOR_H = 4.4;
/** How far the rear slide door travels when open */
export const BACK_DOOR_SLIDE = BACK_DOOR_W + 0.45;
/** Exterior offset for rear door (outside back wall face) */
export const BACK_DOOR_EXTERIOR = 0.42;

/**
 * Always-open passage on the barn's right wall into the horse pen.
 * No door leaf — just a doorway gap in the wall.
 */
export const PEN_DOOR_HALF = 3.0; // full opening ~6.0 (widened)
export const PEN_DOOR_W = PEN_DOOR_HALF * 2;
export const PEN_DOOR_H = 3.7;
/** Local Z center of the pen doorway (mid aisle → pen) */
export const PEN_DOOR_Z = 0;

/** 3 open horse stalls along the left wall (no doors) */
export const STALL_COUNT = 3;
export const STALL_DEPTH = 3.6; // how far into the barn from left wall
export const STALL_H = 2.1;
export const STALL_WALL_T = 0.18;
export const STALL_LEFT_X = -BARN_W / 2; // -9
export const STALL_INNER_X = STALL_LEFT_X + STALL_DEPTH; // aisle edge of stalls

export function createBarnDoorState() {
  return {
    open: false,
    /** Front double doors — each leaf slides sideways (0 closed → FRONT_DOOR_SLIDE open) */
    leftSlide: 0,
    rightSlide: 0,
    /** Rear sliding door */
    backOpen: false,
    backSlide: 0, // 0 closed, BACK_DOOR_SLIDE fully open (moves +X)
  };
}

export function distToBarnDoors(x, z) {
  // Interact point just in front of the double doors
  return Math.hypot(x - 0, z - (BARN_DOOR_Z + 0.8));
}

export function distToBarnBackDoor(x, z) {
  return Math.hypot(x - 0, z - (BARN_BACK_Z - 0.8));
}

/**
 * Barn collision boxes. When doors are closed, front is solid across the opening.
 * When open, a gap allows walking inside; side/back walls remain solid.
 * Stall partitions (left side) are always solid; stall fronts stay open.
 */
export function getBarnColliders(doorState) {
  const t = 0.35; // wall half-thickness
  const hw = BARN_W / 2;
  const hd = BARN_D / 2;
  const open = !!doorState?.open;
  const backOpen = !!doorState?.backOpen;
  const pt = STALL_WALL_T;

  const boxes = [
    // Back wall left of sliding door
    {
      type: "box",
      minX: -hw,
      maxX: -BACK_DOOR_HALF,
      minZ: -hd - t,
      maxZ: -hd + t,
    },
    // Back wall right of sliding door
    {
      type: "box",
      minX: BACK_DOOR_HALF,
      maxX: hw,
      minZ: -hd - t,
      maxZ: -hd + t,
    },
    // Left wall
    { type: "box", minX: -hw - t, maxX: -hw + t, minZ: -hd, maxZ: hd },
    // Right wall — gap for always-open pen doorway (no door leaf)
    {
      type: "box",
      minX: hw - t,
      maxX: hw + t,
      minZ: -hd,
      maxZ: PEN_DOOR_Z - PEN_DOOR_HALF,
    },
    {
      type: "box",
      minX: hw - t,
      maxX: hw + t,
      minZ: PEN_DOOR_Z + PEN_DOOR_HALF,
      maxZ: hd,
    },
    // Front left of door
    {
      type: "box",
      minX: -hw,
      maxX: -DOOR_HALF,
      minZ: hd - t,
      maxZ: hd + t,
    },
    // Front right of door
    {
      type: "box",
      minX: DOOR_HALF,
      maxX: hw,
      minZ: hd - t,
      maxZ: hd + t,
    },
  ];

  // Stall partition walls (between / ends of the 3 open bays) — along X, no front doors
  const stallW = BARN_D / STALL_COUNT;
  for (let i = 1; i < STALL_COUNT; i++) {
    const z = -hd + i * stallW;
    boxes.push({
      type: "box",
      minX: STALL_LEFT_X,
      maxX: STALL_INNER_X,
      minZ: z - pt,
      maxZ: z + pt,
    });
  }
  // Feed troughs at the back of each stall (against left wall)
  for (let i = 0; i < STALL_COUNT; i++) {
    const z0 = -hd + i * stallW;
    const z1 = z0 + stallW;
    const zc = (z0 + z1) / 2;
    boxes.push({
      type: "box",
      minX: STALL_LEFT_X + 0.15,
      maxX: STALL_LEFT_X + 0.85,
      minZ: zc - stallW * 0.28,
      maxZ: zc + stallW * 0.28,
    });
  }

  if (!open) {
    // Closed front sliding doors block the opening
    boxes.push({
      type: "box",
      minX: -DOOR_HALF,
      maxX: DOOR_HALF,
      minZ: hd - t,
      maxZ: hd + t + FRONT_DOOR_EXTERIOR,
    });
  } else {
    // Leaves parked on the exterior of the side wall panels
    const leafOut = hd + FRONT_DOOR_EXTERIOR + 0.25;
    boxes.push(
      {
        type: "box",
        minX: -DOOR_HALF - DOOR_LEAF_W - 0.2,
        maxX: -DOOR_HALF + 0.15,
        minZ: hd - t * 0.3,
        maxZ: leafOut,
      },
      {
        type: "box",
        minX: DOOR_HALF - 0.15,
        maxX: DOOR_HALF + DOOR_LEAF_W + 0.2,
        minZ: hd - t * 0.3,
        maxZ: leafOut,
      }
    );
  }

  // Rear sliding door — closed blocks gap; open parks outside right panel
  if (!backOpen) {
    boxes.push({
      type: "box",
      minX: -BACK_DOOR_HALF,
      maxX: BACK_DOOR_HALF,
      minZ: -hd - t - BACK_DOOR_EXTERIOR,
      maxZ: -hd + t,
    });
  } else {
    // Slid open to the right, on exterior of the back-right wall
    boxes.push({
      type: "box",
      minX: BACK_DOOR_HALF - 0.1,
      maxX: BACK_DOOR_HALF + BACK_DOOR_W + 0.25,
      minZ: -hd - t - BACK_DOOR_EXTERIOR - 0.2,
      maxZ: -hd - t * 0.2,
    });
  }

  return boxes;
}

/** Three open horse stalls on the barn's left side — no doors */
function HorseStalls() {
  const stallW = BARN_D / STALL_COUNT;
  const woodDark = COLORS.woodDark;
  const straw = "#c9a84c";

  return (
    <group>
      {Array.from({ length: STALL_COUNT }).map((_, i) => {
        const z0 = -BARN_D / 2 + i * stallW;
        const z1 = z0 + stallW;
        const zc = (z0 + z1) / 2;
        const depth = STALL_DEPTH;
        const cx = STALL_LEFT_X + depth / 2;

        return (
          <group key={i}>
            {/* Straw bedding */}
            <mesh
              position={[cx, 0.08, zc]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
            >
              <planeGeometry args={[depth - 0.25, stallW - 0.25]} />
              <meshToonMaterial color={straw} />
            </mesh>

            {/* Kickboard / lower wall along left barn wall (inside face detail) */}
            <mesh
              position={[STALL_LEFT_X + 0.28, 0.55, zc]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.12, 1.1, stallW - 0.2]} />
              <meshToonMaterial color={woodDark} />
              <Outlines color={COLORS.outline} thickness={1} />
            </mesh>

            {/* Open aisle front — posts only, no doors or rails across the opening */}
            {[z0 + 0.12, z1 - 0.12].map((z, pi) => (
              <mesh
                key={`p-${pi}`}
                position={[STALL_INNER_X, STALL_H / 2, z]}
                castShadow
              >
                <boxGeometry args={[0.14, STALL_H, 0.14]} />
                <meshToonMaterial color={woodDark} />
                <Outlines color={COLORS.outline} thickness={1} />
              </mesh>
            ))}

            {/* Feed trough against left wall */}
            <mesh
              position={[STALL_LEFT_X + 0.5, 0.45, zc]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.55, 0.45, stallW * 0.55]} />
              <meshToonMaterial color={woodDark} />
              <Outlines color={COLORS.outline} thickness={1} />
            </mesh>
            {/* Hay in trough */}
            <mesh position={[STALL_LEFT_X + 0.5, 0.72, zc]} castShadow>
              <boxGeometry args={[0.4, 0.2, stallW * 0.4]} />
              <meshToonMaterial color="#d4c060" />
            </mesh>

            {/* Optional name plate bar on partition side */}
            <mesh position={[STALL_INNER_X - 0.05, 1.35, zc]} castShadow>
              <boxGeometry args={[0.08, 0.25, 0.7]} />
              <meshToonMaterial color={COLORS.woodLight} />
            </mesh>
          </group>
        );
      })}

      {/* Partition walls between stalls (full height of stall, open toward aisle) */}
      {Array.from({ length: STALL_COUNT - 1 }).map((_, i) => {
        const z = -BARN_D / 2 + (i + 1) * stallW;
        const cx = STALL_LEFT_X + STALL_DEPTH / 2;
        return (
          <group key={`part-${i}`}>
            {/* Solid lower half */}
            <mesh position={[cx, STALL_H * 0.35, z]} castShadow receiveShadow>
              <boxGeometry args={[STALL_DEPTH - 0.1, STALL_H * 0.7, STALL_WALL_T]} />
              <meshToonMaterial color={COLORS.wood} />
              <Outlines color={COLORS.outline} thickness={1.5} />
            </mesh>
            {/* Upper rail openings (classic stall look) */}
            {[0, 1, 2].map((ri) => (
              <mesh
                key={ri}
                position={[
                  STALL_LEFT_X + 0.35 + ri * ((STALL_DEPTH - 0.5) / 2),
                  STALL_H * 0.85,
                  z,
                ]}
                castShadow
              >
                <boxGeometry args={[0.12, STALL_H * 0.35, STALL_WALL_T]} />
                <meshToonMaterial color={COLORS.woodDark} />
              </mesh>
            ))}
            <mesh
              position={[cx, STALL_H, z]}
              castShadow
            >
              <boxGeometry args={[STALL_DEPTH - 0.1, 0.12, STALL_WALL_T]} />
              <meshToonMaterial color={COLORS.woodDark} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Front barn leaf that slides sideways (not hinged).
 * side: -1 left (slides -X when open), +1 right (slides +X when open).
 * Leaves sit proud of the exterior wall so open doors stay visible parked
 * on the outside of the side panels (not swallowed by the wall mesh).
 */
function BarnFrontSlideLeaf({ side, doorState }) {
  const groupRef = useRef();
  const white = COLORS.white;
  // Closed still on exterior face; open parks further out for a clear read
  const zClosed = BARN_DOOR_Z + FRONT_DOOR_EXTERIOR;
  // Closed: each leaf fills half the opening (centers at ±DOOR_LEAF_W/2)
  const closedX = side * (DOOR_LEAF_W / 2);

  useFrame((_, delta) => {
    if (!groupRef.current || !doorState) return;
    const target = doorState.open ? FRONT_DOOR_SLIDE : 0;
    const key = side < 0 ? "leftSlide" : "rightSlide";
    const cur = doorState[key] ?? 0;
    const next = cur + (target - cur) * Math.min(1, delta * 5);
    doorState[key] = Math.abs(next - target) < 0.01 ? target : next;
    // Left moves -X, right moves +X
    groupRef.current.position.x = closedX + side * doorState[key];
    // Nudge slightly further out while open so they read as wall-mounted
    const t = doorState[key] / Math.max(0.001, FRONT_DOOR_SLIDE);
    groupRef.current.position.z = zClosed + t * 0.12;
  });

  const leafT = 0.2;
  const face = leafT / 2 + 0.02;

  return (
    <group ref={groupRef} position={[closedX, DOOR_LEAF_H / 2 + 0.12, zClosed]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[DOOR_LEAF_W, DOOR_LEAF_H, leafT]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1.8} />
      </mesh>
      {/* Exterior face (+Z) — planks, braces, rails */}
      {[-1.4, -0.45, 0.45, 1.4].map((ox, i) => (
        <mesh key={`e-plank-${i}`} position={[ox, 0, face]}>
          <boxGeometry args={[0.08, DOOR_LEAF_H - 0.25, 0.04]} />
          <meshToonMaterial color={COLORS.wood} />
        </mesh>
      ))}
      <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0, face + 0.01]}>
        <boxGeometry args={[DOOR_LEAF_W * 0.95, 0.16, 0.05]} />
        <meshToonMaterial color={white} />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]} position={[0, 0, face + 0.01]}>
        <boxGeometry args={[DOOR_LEAF_W * 0.95, 0.16, 0.05]} />
        <meshToonMaterial color={white} />
      </mesh>
      <mesh position={[0, DOOR_LEAF_H * 0.38, face]}>
        <boxGeometry args={[DOOR_LEAF_W - 0.15, 0.14, 0.05]} />
        <meshToonMaterial color={white} />
      </mesh>
      <mesh position={[0, -DOOR_LEAF_H * 0.38, face]}>
        <boxGeometry args={[DOOR_LEAF_W - 0.15, 0.14, 0.05]} />
        <meshToonMaterial color={white} />
      </mesh>
      {/* Interior face (−Z) so open leaves look solid from the yard too */}
      {[-1.4, -0.45, 0.45, 1.4].map((ox, i) => (
        <mesh key={`i-plank-${i}`} position={[ox, 0, -face]}>
          <boxGeometry args={[0.08, DOOR_LEAF_H - 0.25, 0.04]} />
          <meshToonMaterial color={COLORS.wood} />
        </mesh>
      ))}
      <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0, -face - 0.01]}>
        <boxGeometry args={[DOOR_LEAF_W * 0.9, 0.14, 0.04]} />
        <meshToonMaterial color={white} />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]} position={[0, 0, -face - 0.01]}>
        <boxGeometry args={[DOOR_LEAF_W * 0.9, 0.14, 0.04]} />
        <meshToonMaterial color={white} />
      </mesh>
      {/* Exterior handle toward the meeting edge */}
      <mesh position={[-side * (DOOR_LEAF_W * 0.35), 0, face + 0.04]} castShadow>
        <boxGeometry args={[0.12, 0.38, 0.1]} />
        <meshToonMaterial color={COLORS.gold} />
      </mesh>
      {/* Roller hangers on the exterior track */}
      {[-DOOR_LEAF_W * 0.32, DOOR_LEAF_W * 0.32].map((ox, i) => (
        <mesh key={`hanger-${i}`} position={[ox, DOOR_LEAF_H * 0.48, face + 0.02]} castShadow>
          <boxGeometry args={[0.22, 0.18, 0.12]} />
          <meshToonMaterial color={COLORS.stoneDark} />
        </mesh>
      ))}
    </group>
  );
}

/** Deterministic rand in [0,1) from integer seed */
function strawRand(i, salt = 0) {
  const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Loose straw scattered across the barn dirt floor — thin golden bits & small clumps.
 */
function BarnFloorStraw() {
  const pieces = useMemo(() => {
    const list = [];
    // Soft patch discs under scattered straw
    for (let i = 0; i < 28; i++) {
      list.push({
        kind: "patch",
        x: (strawRand(i, 1) - 0.5) * (BARN_W - 1.4),
        z: (strawRand(i, 2) - 0.5) * (BARN_D - 1.4),
        s: 0.7 + strawRand(i, 3) * 1.4,
        rot: strawRand(i, 4) * Math.PI,
        color: strawRand(i, 5) > 0.5 ? "#c9a84c" : "#b8923e",
      });
    }
    // Individual straw blades / clumps
    for (let i = 0; i < 110; i++) {
      list.push({
        kind: "blade",
        x: (strawRand(i, 11) - 0.5) * (BARN_W - 1.2),
        z: (strawRand(i, 12) - 0.5) * (BARN_D - 1.2),
        len: 0.25 + strawRand(i, 13) * 0.55,
        w: 0.03 + strawRand(i, 14) * 0.05,
        rot: strawRand(i, 15) * Math.PI * 2,
        yRot: strawRand(i, 16) * 0.4 - 0.2,
        color:
          strawRand(i, 17) > 0.66
            ? "#d4b45a"
            : strawRand(i, 18) > 0.5
              ? "#c9a84c"
              : "#a88838",
      });
    }
    // A few denser piles (especially near stalls / walls)
    for (let i = 0; i < 14; i++) {
      const nearStall = strawRand(i, 20) > 0.45;
      list.push({
        kind: "pile",
        x: nearStall
          ? -BARN_W / 2 + 1.2 + strawRand(i, 21) * 3.2
          : (strawRand(i, 22) - 0.5) * (BARN_W - 2),
        z: (strawRand(i, 23) - 0.5) * (BARN_D - 1.5),
        s: 0.35 + strawRand(i, 24) * 0.45,
        rot: strawRand(i, 25) * Math.PI,
        color: "#c4a040",
      });
    }
    return list;
  }, []);

  return (
    <group userData={{ ignoreCameraCollision: true }}>
      {pieces.map((p, i) => {
        if (p.kind === "patch") {
          return (
            <mesh
              key={`p-${i}`}
              position={[p.x, 0.05, p.z]}
              rotation={[-Math.PI / 2, 0, p.rot]}
              receiveShadow
            >
              <circleGeometry args={[p.s * 0.55, 6]} />
              <meshToonMaterial color={p.color} transparent opacity={0.55} />
            </mesh>
          );
        }
        if (p.kind === "pile") {
          return (
            <mesh
              key={`pile-${i}`}
              position={[p.x, 0.07, p.z]}
              rotation={[0.15, p.rot, 0.1]}
              castShadow
              receiveShadow
            >
              <sphereGeometry args={[p.s, 5, 4]} />
              <meshToonMaterial color={p.color} />
            </mesh>
          );
        }
        // blade
        return (
          <mesh
            key={`b-${i}`}
            position={[p.x, 0.055, p.z]}
            rotation={[-Math.PI / 2 + p.yRot, p.rot, p.yRot * 0.5]}
            castShadow
          >
            <boxGeometry args={[p.len, p.w, 0.02]} />
            <meshToonMaterial color={p.color} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Sliding barn door on the back wall (slides +X when open, parks outside) */
function BarnBackSlideDoor({ doorState }) {
  const groupRef = useRef();
  const white = COLORS.white;
  const zClosed = BARN_BACK_Z - BACK_DOOR_EXTERIOR;
  const closedX = 0; // door centered on opening
  const leafT = 0.2;
  const faceOut = -(leafT / 2 + 0.02); // exterior is −Z on back wall

  useFrame((_, delta) => {
    if (!groupRef.current || !doorState) return;
    const target = doorState.backOpen ? BACK_DOOR_SLIDE : 0;
    const cur = doorState.backSlide ?? 0;
    const next = cur + (target - cur) * Math.min(1, delta * 5);
    doorState.backSlide = Math.abs(next - target) < 0.01 ? target : next;
    groupRef.current.position.x = closedX + doorState.backSlide;
    const t = doorState.backSlide / Math.max(0.001, BACK_DOOR_SLIDE);
    groupRef.current.position.z = zClosed - t * 0.12;
  });

  return (
    <group ref={groupRef} position={[closedX, BACK_DOOR_H / 2 + 0.15, zClosed]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[BACK_DOOR_W, BACK_DOOR_H, leafT]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1.8} />
      </mesh>
      {/* Exterior face (−Z) */}
      {[-1.5, -0.5, 0.5, 1.5].map((ox, i) => (
        <mesh key={`e-${i}`} position={[ox, 0, faceOut]}>
          <boxGeometry args={[0.08, BACK_DOOR_H - 0.2, 0.04]} />
          <meshToonMaterial color={COLORS.wood} />
        </mesh>
      ))}
      {[BACK_DOOR_H * 0.28, -BACK_DOOR_H * 0.28].map((oy, i) => (
        <mesh key={`er-${i}`} position={[0, oy, faceOut - 0.01]}>
          <boxGeometry args={[BACK_DOOR_W - 0.15, 0.12, 0.05]} />
          <meshToonMaterial color={white} />
        </mesh>
      ))}
      {/* Interior face (+Z) */}
      {[-1.5, -0.5, 0.5, 1.5].map((ox, i) => (
        <mesh key={`i-${i}`} position={[ox, 0, -faceOut]}>
          <boxGeometry args={[0.08, BACK_DOOR_H - 0.2, 0.04]} />
          <meshToonMaterial color={COLORS.wood} />
        </mesh>
      ))}
      {/* Exterior handle */}
      <mesh position={[-BACK_DOOR_HALF + 0.35, 0, faceOut - 0.04]} castShadow>
        <boxGeometry args={[0.12, 0.35, 0.1]} />
        <meshToonMaterial color={COLORS.gold} />
      </mesh>
      {/* Roller hangers */}
      {[-BACK_DOOR_W * 0.28, BACK_DOOR_W * 0.28].map((ox, i) => (
        <mesh key={`bh-${i}`} position={[ox, BACK_DOOR_H * 0.48, faceOut]} castShadow>
          <boxGeometry args={[0.22, 0.18, 0.12]} />
          <meshToonMaterial color={COLORS.stoneDark} />
        </mesh>
      ))}
    </group>
  );
}

/** Large side-window size (opening cut into the long walls) */
const BARN_WIN_W = 3.1; // along Z (wall length)
const BARN_WIN_H = 2.9;
const BARN_WIN_Y = 3.2; // center height
const BARN_WIN_Z = 2.85; // ±z along each side wall

/**
 * Large barn window — white translucent glass + white frame/mullions.
 * Local +Z faces outward; place on left/right walls with Y rotation.
 * Wall openings must be cut separately (see BarnSideWallWithWindows).
 */
function BarnWindow({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  width = BARN_WIN_W,
  height = BARN_WIN_H,
}) {
  const white = COLORS.white;
  const frameD = 0.14;
  const bar = 0.13;

  return (
    <group position={position} rotation={rotation}>
      {/* White transparent glass (see-through into the barn) */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[width - 0.2, height - 0.2]} />
        <meshToonMaterial
          color="#ffffff"
          transparent
          opacity={0.28}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Soft white sheen so glass reads in light */}
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[width - 0.35, height - 0.35]} />
        <meshToonMaterial
          color="#f5f8ff"
          transparent
          opacity={0.12}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Outer white frame */}
      <mesh position={[0, height / 2 - bar / 2, frameD / 2]} castShadow>
        <boxGeometry args={[width, bar, frameD]} />
        <meshToonMaterial color={white} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0, -height / 2 + bar / 2, frameD / 2]} castShadow>
        <boxGeometry args={[width, bar, frameD]} />
        <meshToonMaterial color={white} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[-width / 2 + bar / 2, 0, frameD / 2]} castShadow>
        <boxGeometry args={[bar, height, frameD]} />
        <meshToonMaterial color={white} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[width / 2 - bar / 2, 0, frameD / 2]} castShadow>
        <boxGeometry args={[bar, height, frameD]} />
        <meshToonMaterial color={white} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>

      {/* Cross mullions */}
      <mesh position={[0, 0, frameD / 2 + 0.01]} castShadow>
        <boxGeometry args={[bar * 0.9, height - bar * 1.6, frameD * 0.9]} />
        <meshToonMaterial color={white} />
      </mesh>
      <mesh position={[0, 0, frameD / 2 + 0.01]} castShadow>
        <boxGeometry args={[width - bar * 1.6, bar * 0.9, frameD * 0.9]} />
        <meshToonMaterial color={white} />
      </mesh>

      {/* White sill */}
      <mesh position={[0, -height / 2 - 0.07, frameD * 0.75]} castShadow>
        <boxGeometry args={[width + 0.25, 0.12, 0.24]} />
        <meshToonMaterial color={white} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
    </group>
  );
}

/**
 * Long barn wall with two rectangular openings for large windows.
 * Used on the left wall only (right wall has a solid face + pen doorway).
 */
function BarnSideWallWithWindows({ side, W, D, H, wallT, red }) {
  const x = side * (W / 2);
  const hd = D / 2;
  const winBottom = BARN_WIN_Y - BARN_WIN_H / 2;
  const winTop = BARN_WIN_Y + BARN_WIN_H / 2;
  const midH = BARN_WIN_H;
  const midY = BARN_WIN_Y;
  const zA = -BARN_WIN_Z;
  const zB = BARN_WIN_Z;
  const halfW = BARN_WIN_W / 2;

  const zRanges = [
    { z0: -hd, z1: zA - halfW },
    { z0: zA + halfW, z1: zB - halfW },
    { z0: zB + halfW, z1: hd },
  ];

  return (
    <group>
      <mesh position={[x, winBottom / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallT, winBottom, D]} />
        <meshToonMaterial color={red} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      <mesh
        position={[x, (winTop + H) / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[wallT, H - winTop, D]} />
        <meshToonMaterial color={red} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      {zRanges.map(({ z0, z1 }, i) => {
        const len = z1 - z0;
        if (len < 0.05) return null;
        return (
          <mesh
            key={i}
            position={[x, midY, (z0 + z1) / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[wallT, midH, len]} />
            <meshToonMaterial color={red} />
            <Outlines color={COLORS.outline} thickness={1.5} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Right barn wall: solid red face + always-open wide pen doorway (no windows, no door leaf).
 */
function BarnRightWallWithPenDoor({ W, D, H, wallT, red }) {
  const x = W / 2;
  const hd = D / 2;
  const doorZ0 = PEN_DOOR_Z - PEN_DOOR_HALF;
  const doorZ1 = PEN_DOOR_Z + PEN_DOOR_HALF;
  const woodDark = COLORS.woodDark;
  const segments = [
    { z0: -hd, z1: doorZ0 },
    { z0: doorZ1, z1: hd },
  ];

  return (
    <group>
      {/* Full-height wall panels on either side of the pen opening */}
      {segments.map(({ z0, z1 }, i) => {
        const len = z1 - z0;
        if (len < 0.05) return null;
        return (
          <mesh
            key={`rw-${i}`}
            position={[x, H / 2, (z0 + z1) / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[wallT, H, len]} />
            <meshToonMaterial color={red} />
            <Outlines color={COLORS.outline} thickness={2} />
          </mesh>
        );
      })}
      {/* Fill above the opening up to the eave */}
      <mesh
        position={[x, (PEN_DOOR_H + H) / 2, PEN_DOOR_Z]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[wallT, H - PEN_DOOR_H, PEN_DOOR_W]} />
        <meshToonMaterial color={red} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
      {/* Jambs */}
      {[doorZ0, doorZ1].map((z, i) => (
        <mesh
          key={`jamb-${i}`}
          position={[x, PEN_DOOR_H / 2, z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[wallT + 0.1, PEN_DOOR_H, 0.28]} />
          <meshToonMaterial color={woodDark} />
          <Outlines color={COLORS.outline} thickness={1.2} />
        </mesh>
      ))}
      {/* Lintel */}
      <mesh
        position={[x, PEN_DOOR_H + 0.14, PEN_DOOR_Z]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[wallT + 0.12, 0.28, PEN_DOOR_W + 0.4]} />
        <meshToonMaterial color={woodDark} />
        <Outlines color={COLORS.outline} thickness={1.2} />
      </mesh>
      {/* Threshold */}
      <mesh position={[x, 0.08, PEN_DOOR_Z]} castShadow receiveShadow>
        <boxGeometry args={[wallT + 0.4, 0.12, PEN_DOOR_W + 0.2]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>
    </group>
  );
}

/** Large classic red-and-white barn at the map center (hollow shell + openable doors) */
function Barn({ position = [0, 0, 0], rotation = 0, doorState }) {
  const W = BARN_W;
  const D = BARN_D;
  const H = BARN_H;
  const roofH = 4;
  const white = COLORS.white;
  const red = COLORS.roofRed;
  const wallT = 0.45;
  const doorH = 4.8;
  const frontZ = D / 2;
  const backZ = -D / 2;

  // Front wall segments left/right of door opening
  const sideFrontW = (W - DOOR_HALF * 2) / 2;
  const sideBackW = (W - BACK_DOOR_W) / 2;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Floor inside barn — dirt + loose straw */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W - 0.5, D - 0.5]} />
        <meshToonMaterial color={COLORS.dirtDark} />
      </mesh>
      <BarnFloorStraw />

      {/* 3 open horse stalls — left wall, no doors */}
      <HorseStalls />

      {/* Back wall — split for sliding door opening */}
      <mesh
        position={[-(BACK_DOOR_HALF + sideBackW / 2), H / 2, backZ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[sideBackW, H, wallT]} />
        <meshToonMaterial color={red} />
        <Outlines color={COLORS.outline} thickness={2.5} />
      </mesh>
      <mesh
        position={[BACK_DOOR_HALF + sideBackW / 2, H / 2, backZ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[sideBackW, H, wallT]} />
        <meshToonMaterial color={red} />
        <Outlines color={COLORS.outline} thickness={2.5} />
      </mesh>
      {/* Lintel above rear door */}
      <mesh
        position={[0, BACK_DOOR_H + (H - BACK_DOOR_H) / 2, backZ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[BACK_DOOR_W + 0.2, H - BACK_DOOR_H, wallT]} />
        <meshToonMaterial color={red} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      {/* Exterior track rail for rear sliding door */}
      <mesh
        position={[
          BACK_DOOR_W * 0.35,
          BACK_DOOR_H + 0.22,
          backZ - BACK_DOOR_EXTERIOR - 0.06,
        ]}
        castShadow
      >
        <boxGeometry args={[BACK_DOOR_W * 1.85, 0.12, 0.16]} />
        <meshToonMaterial color={COLORS.stoneDark} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>
      <BarnBackSlideDoor doorState={doorState} />

      {/* Left wall — two large windows */}
      <BarnSideWallWithWindows
        side={-1}
        W={W}
        D={D}
        H={H}
        wallT={wallT}
        red={red}
      />
      {/* Right wall — solid + wide open pen doorway (no windows, no door leaf) */}
      <BarnRightWallWithPenDoor
        W={W}
        D={D}
        H={H}
        wallT={wallT}
        red={red}
      />

      {/* Front walls beside door */}
      <mesh
        position={[-(DOOR_HALF + sideFrontW / 2), H / 2, frontZ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[sideFrontW, H, wallT]} />
        <meshToonMaterial color={red} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      <mesh
        position={[DOOR_HALF + sideFrontW / 2, H / 2, frontZ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[sideFrontW, H, wallT]} />
        <meshToonMaterial color={red} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>

      {/* Lintel above door opening */}
      <mesh
        position={[0, doorH + (H - doorH) / 2, frontZ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[DOOR_HALF * 2 + 0.2, H - doorH, wallT]} />
        <meshToonMaterial color={red} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      {/* Exterior track rail for front sliding doors (outside face) */}
      <mesh
        position={[0, DOOR_LEAF_H + 0.32, frontZ + FRONT_DOOR_EXTERIOR + 0.06]}
        castShadow
      >
        <boxGeometry
          args={[DOOR_HALF * 2 + FRONT_DOOR_SLIDE * 2.15, 0.12, 0.18]}
        />
        <meshToonMaterial color={COLORS.stoneDark} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>

      {/* White corner trim */}
      {[
        [-W / 2, -D / 2],
        [W / 2, -D / 2],
        [-W / 2, D / 2],
        [W / 2, D / 2],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, H / 2, z]} castShadow>
          <boxGeometry args={[0.35, H + 0.1, 0.35]} />
          <meshToonMaterial color={white} />
          <Outlines color={COLORS.outline} thickness={1.5} />
        </mesh>
      ))}

      {/* White horizontal band on front side panels */}
      <mesh position={[-(DOOR_HALF + sideFrontW / 2), H * 0.45, frontZ + 0.02]}>
        <boxGeometry args={[sideFrontW - 0.2, 0.3, 0.08]} />
        <meshToonMaterial color={white} />
      </mesh>
      <mesh position={[DOOR_HALF + sideFrontW / 2, H * 0.45, frontZ + 0.02]}>
        <boxGeometry args={[sideFrontW - 0.2, 0.3, 0.08]} />
        <meshToonMaterial color={white} />
      </mesh>
      {/* White band on back side panels */}
      <mesh
        position={[-(BACK_DOOR_HALF + sideBackW / 2), H * 0.45, backZ - 0.02]}
      >
        <boxGeometry args={[sideBackW - 0.2, 0.3, 0.08]} />
        <meshToonMaterial color={white} />
      </mesh>
      <mesh
        position={[BACK_DOOR_HALF + sideBackW / 2, H * 0.45, backZ - 0.02]}
      >
        <boxGeometry args={[sideBackW - 0.2, 0.3, 0.08]} />
        <meshToonMaterial color={white} />
      </mesh>

      {/* Gable fill */}
      <mesh position={[0, H + roofH * 0.35, 0]} castShadow>
        <boxGeometry args={[W * 0.15, roofH * 0.7, D + 0.1]} />
        <meshToonMaterial color={red} />
      </mesh>

      {/* Peaked roof */}
      <mesh
        position={[0, H + roofH * 0.45, D / 4 + 0.15]}
        rotation={[Math.PI / 5.5, 0, 0]}
        castShadow
      >
        <boxGeometry args={[W + 1.2, 0.35, D / 2 + 1.2]} />
        <meshToonMaterial color={COLORS.roof} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      <mesh
        position={[0, H + roofH * 0.45, -D / 4 - 0.15]}
        rotation={[-Math.PI / 5.5, 0, 0]}
        castShadow
      >
        <boxGeometry args={[W + 1.2, 0.35, D / 2 + 1.2]} />
        <meshToonMaterial color={COLORS.roof} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>

      <mesh position={[0, H + roofH * 0.85, 0]} castShadow>
        <boxGeometry args={[W + 0.4, 0.2, 0.35]} />
        <meshToonMaterial color={white} />
      </mesh>

      {/* Front double doors — slide left / right */}
      <BarnFrontSlideLeaf side={-1} doorState={doorState} />
      <BarnFrontSlideLeaf side={1} doorState={doorState} />

      {/* Loft door */}
      <mesh position={[0, H - 1.2, frontZ + 0.06]} castShadow>
        <boxGeometry args={[2.2, 1.8, 0.12]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
      <mesh
        position={[0, H - 1.2, frontZ + 0.14]}
        rotation={[0, 0, Math.PI / 4]}
      >
        <boxGeometry args={[2, 0.12, 0.05]} />
        <meshToonMaterial color={white} />
      </mesh>
      <mesh
        position={[0, H - 1.2, frontZ + 0.14]}
        rotation={[0, 0, -Math.PI / 4]}
      >
        <boxGeometry args={[2, 0.12, 0.05]} />
        <meshToonMaterial color={white} />
      </mesh>

      {/* 2 large white transparent windows on the left wall only */}
      <BarnWindow
        position={[-W / 2 - 0.02, BARN_WIN_Y, -BARN_WIN_Z]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <BarnWindow
        position={[-W / 2 - 0.02, BARN_WIN_Y, BARN_WIN_Z]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {/* Foundation skirt under walls (not a solid slab — interior floor stays visible) */}
      {[
        // Front
        [0, 0.1, frontZ + 0.15, W + 0.5, 0.2, 0.35],
        // Back
        [0, 0.1, backZ - 0.15, W + 0.5, 0.2, 0.35],
        // Left
        [-W / 2 - 0.15, 0.1, 0, 0.35, 0.2, D + 0.2],
        // Right
        [W / 2 + 0.15, 0.1, 0, 0.35, 0.2, D + 0.2],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={`found-${i}`} position={[x, y, z]} receiveShadow castShadow>
          <boxGeometry args={[w, h, d]} />
          <meshToonMaterial color={COLORS.stone} />
          <Outlines color={COLORS.outline} thickness={1} />
        </mesh>
      ))}

      {/* Pet bowls last so they draw cleanly above the floor */}
      <PetBowls />
    </group>
  );
}

/**
 * Cabin left of the barn (gap is clear space barn edge → yard edge).
 * Gap halved again (50% closer): 25 → 12.5.
 * Yard right edge ≈ -9 - 12.5 = -21.5; center x ≈ -32.5.
 */
export const CABIN_GAP = 12.5;
export const BARN_HALF_W = 9;
export const CABIN_W = 14;
export const CABIN_D = 11;
/** Covered back patio: full cabin width × 50% cabin depth */
export const PATIO_W = CABIN_W;
export const PATIO_D = CABIN_D * 0.5; // 5.5

export const CABIN_YARD = {
  /** Right yard half-width (toward barn) — also used for cabin placement */
  halfW: 11,
  /**
   * Left yard half-width (away from barn). Extended so a house-sized
   * garden plot fits left of the cabin inside the picket fence.
   */
  leftW: 23.5,
  halfD: 10,
  front: 9.5, // fence front past porch/garden
  /** Past cabin back wall + patio depth + a little walkway */
  back: CABIN_D / 2 + PATIO_D + 1.5, // ~12.5
  gateHalf: 1.1,
};
export const CABIN_POS = {
  x: -(BARN_HALF_W + CABIN_GAP + CABIN_YARD.halfW), // -32.5
  z: 0,
};
export const CABIN_YAW = 0;
/** Garden plot = same footprint as the cabin, left of the house */
export const GARDEN_W = CABIN_W;
export const GARDEN_D = CABIN_D;
/** Cabin-local center of garden (left of house with a small aisle) */
export const GARDEN_LOCAL = {
  x: -(CABIN_W / 2 + 1.0 + GARDEN_W / 2), // -15
  z: 0,
};
/** Wall eave height — roof peaks above this */
export const CABIN_H = 4.0;
/** Extra height of main roof peak above wall top */
export const CABIN_ROOF_RISE = 2.65;
export const CABIN_DOOR_W = 1.5;
export const CABIN_WALL_T = 0.45;

/** Cabin front / back door + auto picket gate */
export const CABIN_DOOR_RANGE = 2.8;
export const CABIN_DOOR_OPEN_ANGLE = 1.85; // ~106° open inward
/** Back door swings open outward onto patio (−Z) */
export const CABIN_BACK_DOOR_OPEN_ANGLE = -1.75;
export const CABIN_GATE_OPEN_ANGLE = 1.35;
export const CABIN_GATE_AUTO_RANGE = 3.2;

function makeSwingGateState() {
  return {
    open: false,
    /**
     * Swing sign for leaf rotation.y (or left leaf for double gates).
     * Front: +1 into yard (−Z), −1 outward (+Z)
     * Back:  +1 outward (−Z), −1 into yard (+Z)  — set by push helpers
     */
    openDir: 1,
    angle: 0,
    pushCooldown: 0,
  };
}

export function createCabinState() {
  return {
    /** Front door: interact to toggle */
    doorOpen: false,
    doorAngle: 0, // 0 closed → CABIN_DOOR_OPEN_ANGLE
    /** Back door onto covered patio */
    backDoorOpen: false,
    backDoorAngle: 0, // 0 closed → CABIN_BACK_DOOR_OPEN_ANGLE
    /** Main picket gate (path) — double leaf, push-to-open with direction */
    mainGate: makeSwingGateState(),
    /** Garden front — single swing, push-to-open */
    gardenFront: makeSwingGateState(),
    /** Garden back — single swing, push-to-open */
    gardenBack: makeSwingGateState(),
  };
}

function cabinLocalToWorld(lx, lz) {
  const c = Math.cos(CABIN_YAW);
  const s = Math.sin(CABIN_YAW);
  return {
    x: CABIN_POS.x + lx * c + lz * s,
    z: CABIN_POS.z - lx * s + lz * c,
  };
}

/** World position of cabin front door (for interact distance) */
export function getCabinDoorWorld() {
  return cabinLocalToWorld(0, CABIN_D / 2 + 0.4);
}

export function distToCabinDoor(x, z) {
  const d = getCabinDoorWorld();
  return Math.hypot(x - d.x, z - d.z);
}

/** World position of cabin back door (onto patio) */
export function getCabinBackDoorWorld() {
  return cabinLocalToWorld(0, -CABIN_D / 2 - 0.4);
}

export function distToCabinBackDoor(x, z) {
  const d = getCabinBackDoorWorld();
  return Math.hypot(x - d.x, z - d.z);
}

/** World position of picket gate center */
export function getCabinGateWorld() {
  return cabinLocalToWorld(0, CABIN_YARD.front);
}

export function distToCabinGate(x, z) {
  const g = getCabinGateWorld();
  return Math.hypot(x - g.x, z - g.z);
}

/** Local X of garden gates (aligned with garden plot center) */
export function getGardenGateLocalX() {
  return GARDEN_LOCAL.x;
}

export function getGardenFrontGateWorld() {
  return cabinLocalToWorld(getGardenGateLocalX(), CABIN_YARD.front);
}

export function getGardenBackGateWorld() {
  return cabinLocalToWorld(getGardenGateLocalX(), -CABIN_YARD.back);
}

export function distToGardenFrontGate(x, z) {
  const g = getGardenFrontGateWorld();
  return Math.hypot(x - g.x, z - g.z);
}

export function distToGardenBackGate(x, z) {
  const g = getGardenBackGateWorld();
  return Math.hypot(x - g.x, z - g.z);
}

/** World → cabin-local XZ */
export function worldToCabinLocal(x, z) {
  const dx = x - CABIN_POS.x;
  const dz = z - CABIN_POS.z;
  const c = Math.cos(-CABIN_YAW);
  const s = Math.sin(-CABIN_YAW);
  return {
    x: dx * c + dz * s,
    z: -dx * s + dz * c,
  };
}

/**
 * True if a point is inside the cabin yard (house + garden + picket fence),
 * with optional margin for tree clearance.
 */
export function isInCabinHomestead(x, z, margin = 2.5) {
  const p = worldToCabinLocal(x, z);
  const y = CABIN_YARD;
  const leftW = y.leftW ?? y.halfW;
  return (
    p.x >= -leftW - margin &&
    p.x <= y.halfW + margin &&
    p.z >= -y.back - margin &&
    p.z <= y.front + margin
  );
}

/** True if point is inside the log cabin footprint (world xz). */
export function isInCabinBuilding(x, z, margin = 0.6) {
  const p = worldToCabinLocal(x, z);
  return (
    Math.abs(p.x) <= CABIN_W / 2 + margin &&
    Math.abs(p.z) <= CABIN_D / 2 + margin
  );
}

/** True if point is on the dirt garden plot left of the house. */
export function isInGardenPlot(x, z, margin = 0.15) {
  const p = worldToCabinLocal(x, z);
  return (
    p.x >= GARDEN_LOCAL.x - GARDEN_W / 2 - margin &&
    p.x <= GARDEN_LOCAL.x + GARDEN_W / 2 + margin &&
    p.z >= GARDEN_LOCAL.z - GARDEN_D / 2 - margin &&
    p.z <= GARDEN_LOCAL.z + GARDEN_D / 2 + margin
  );
}

/** Axis-aligned collider from local wall rectangle (conservative AABB). */
function cabinWallBox(lx0, lx1, lz0, lz1, pad = 0.12) {
  const corners = [
    cabinLocalToWorld(lx0, lz0),
    cabinLocalToWorld(lx1, lz0),
    cabinLocalToWorld(lx0, lz1),
    cabinLocalToWorld(lx1, lz1),
  ];
  return {
    type: "box",
    minX: Math.min(...corners.map((p) => p.x)) - pad,
    maxX: Math.max(...corners.map((p) => p.x)) + pad,
    minZ: Math.min(...corners.map((p) => p.z)) - pad,
    maxZ: Math.max(...corners.map((p) => p.z)) + pad,
  };
}

/**
 * Hollow cabin walls so the player can walk inside.
 * Front has door gap when door is open; closed door blocks the opening.
 */
export function getCabinColliders(cabinState) {
  const hw = CABIN_W / 2;
  const hd = CABIN_D / 2;
  const t = CABIN_WALL_T;
  const door = CABIN_DOOR_W / 2;
  const boxes = [];

  // Front wall (z = +hd) — left & right of door
  boxes.push(cabinWallBox(-hw, -door, hd - t / 2, hd + t / 2));
  boxes.push(cabinWallBox(door, hw, hd - t / 2, hd + t / 2));
  // Closed front door fills the gap
  const doorClosed =
    !cabinState?.doorOpen && (cabinState?.doorAngle ?? 0) < 0.25;
  if (doorClosed) {
    boxes.push(cabinWallBox(-door, door, hd - t / 2, hd + t / 2));
  }
  // Back wall — left & right of patio door
  boxes.push(cabinWallBox(-hw, -door, -hd - t / 2, -hd + t / 2));
  boxes.push(cabinWallBox(door, hw, -hd - t / 2, -hd + t / 2));
  const backDoorClosed =
    !cabinState?.backDoorOpen &&
    Math.abs(cabinState?.backDoorAngle ?? 0) < 0.25;
  if (backDoorClosed) {
    boxes.push(cabinWallBox(-door, door, -hd - t / 2, -hd + t / 2));
  }
  // Left / right outer walls
  boxes.push(cabinWallBox(-hw - t / 2, -hw + t / 2, -hd, hd));
  boxes.push(cabinWallBox(hw - t / 2, hw + t / 2, -hd, hd));
  // Chimney mass (right-back exterior, clear of patio door)
  boxes.push(cabinWallBox(hw - 0.2, hw + 1.1, -hd + 0.3, -hd + 1.7));

  return boxes;
}

function swingGateClosed(g) {
  return !g?.open && Math.abs(g?.angle ?? 0) < 0.2;
}

/**
 * Thin picket-fence colliders around the cabin yard.
 * Main path gate + garden front/back gates open when swung open.
 */
export function getCabinYardColliders(cabinState) {
  const y = CABIN_YARD;
  const leftW = y.leftW ?? y.halfW;
  const gh = y.gateHalf;
  const gx = getGardenGateLocalX();
  const boxes = [];

  const frontZ0 = y.front - 0.08;
  const frontZ1 = y.front + 0.08;
  boxes.push(cabinWallBox(-leftW, gx - gh, frontZ0, frontZ1, 0.08));
  boxes.push(cabinWallBox(gx + gh, -gh, frontZ0, frontZ1, 0.08));
  boxes.push(cabinWallBox(gh, y.halfW, frontZ0, frontZ1, 0.08));

  if (swingGateClosed(cabinState?.mainGate)) {
    boxes.push(cabinWallBox(-gh, gh, frontZ0, frontZ1, 0.08));
  }
  if (swingGateClosed(cabinState?.gardenFront)) {
    boxes.push(cabinWallBox(gx - gh, gx + gh, frontZ0, frontZ1, 0.08));
  }

  const backZ0 = -y.back - 0.08;
  const backZ1 = -y.back + 0.08;
  boxes.push(cabinWallBox(-leftW, gx - gh, backZ0, backZ1, 0.08));
  boxes.push(cabinWallBox(gx + gh, y.halfW, backZ0, backZ1, 0.08));
  if (swingGateClosed(cabinState?.gardenBack)) {
    boxes.push(cabinWallBox(gx - gh, gx + gh, backZ0, backZ1, 0.08));
  }

  boxes.push(
    cabinWallBox(-leftW - 0.08, -leftW + 0.08, -y.back, y.front, 0.08)
  );
  boxes.push(
    cabinWallBox(y.halfW - 0.08, y.halfW + 0.08, -y.back, y.front, 0.08)
  );
  return boxes;
}

/**
 * Push-open a fence-line gate along local X (front or back of yard).
 * face: "front" | "back"
 * Returns true if open / direction changed (for SFX).
 */
export function tryPushCabinSwingGate(
  localX,
  localZ,
  velX,
  velZ,
  isMoving,
  gate,
  {
    gateX,
    gateZ,
    halfW,
    face, // "front" | "back"
  }
) {
  if (!gate || !isMoving) return false;

  const inOpening =
    localX >= gateX - halfW * 1.15 &&
    localX <= gateX + halfW * 1.15 &&
    localZ >= gateZ - 1.55 &&
    localZ <= gateZ + 1.55;

  // openDir: sign of leaf rotation.y (single leaf / left leaf)
  // Front: +rot → into yard (−Z); −rot → out (+Z)
  // Back:  +rot → out (−Z); −rot → into yard (+Z)
  let pushDir;
  if (Math.abs(velZ) > 0.001 && Math.abs(velZ) >= Math.abs(velX) * 0.25) {
    if (face === "front") {
      pushDir = velZ < 0 ? 1 : -1; // into yard / out
    } else {
      pushDir = velZ > 0 ? -1 : 1; // into yard / out
    }
  } else {
    // Side of fence fallback
    if (face === "front") {
      pushDir = localZ > gateZ ? 1 : -1; // outside → push in
    } else {
      pushDir = localZ < gateZ ? -1 : 1; // outside (more −Z) → push in
    }
  }

  const openDir = gate.openDir >= 0 ? 1 : -1;
  const ang = gate.angle ?? 0;
  const fullySwung = Math.abs(ang) > 0.45;

  // Leaf hangs from left hinge (gateX - halfW); open free end near hinge + openDir
  const hingeX = gateX - halfW;
  const nearOpenLeaf =
    fullySwung &&
    Math.abs(localX - hingeX) < 1.5 &&
    (openDir > 0
      ? localZ <= gateZ + 0.45 && localZ >= gateZ - halfW * 2.1
      : localZ >= gateZ - 0.45 && localZ <= gateZ + halfW * 2.1);

  if (!gate.open && inOpening) {
    gate.open = true;
    gate.openDir = pushDir;
    gate.pushCooldown = 0.55;
    return true;
  }
  if (!gate.open) return false;
  if ((gate.pushCooldown ?? 0) > 0) return false;

  if (inOpening && pushDir !== openDir) {
    const reversing =
      Math.abs(velZ) > 0.001 ||
      (face === "front"
        ? openDir > 0
          ? localZ > gateZ + 0.12
          : localZ < gateZ - 0.12
        : openDir < 0
          ? localZ < gateZ - 0.12
          : localZ > gateZ + 0.12);
    if (reversing) {
      gate.openDir = pushDir;
      gate.open = true;
      gate.pushCooldown = 0.35;
      return true;
    }
  }

  if (nearOpenLeaf) {
    const throughGap =
      localX >= gateX - halfW * 0.85 &&
      localX <= gateX + halfW * 0.85 &&
      Math.abs(localZ - gateZ) < 1.0;
    const closingPush =
      openDir > 0
        ? velZ > 0.0005 || (Math.abs(velZ) <= 0.0005 && localZ < gateZ - 0.3)
        : velZ < -0.0005 ||
          (Math.abs(velZ) <= 0.0005 && localZ > gateZ + 0.3);
    if (closingPush && !throughGap) {
      gate.open = false;
      gate.pushCooldown = 0.45;
      return true;
    }
  }

  return false;
}

/** Push all cabin yard gates (main double + garden singles). */
export function tryPushCabinYardGates(
  worldX,
  worldZ,
  velX,
  velZ,
  isMoving,
  cabinState
) {
  if (!cabinState || !isMoving) return false;
  const loc = worldToCabinLocal(worldX, worldZ);
  // Approximate cabin-local velocity (yaw 0 → same axes)
  const lvX = velX;
  const lvZ = velZ;
  const y = CABIN_YARD;
  const gh = y.gateHalf;
  const gx = getGardenGateLocalX();
  let changed = false;
  if (
    tryPushCabinSwingGate(loc.x, loc.z, lvX, lvZ, isMoving, cabinState.mainGate, {
      gateX: 0,
      gateZ: y.front,
      halfW: gh,
      face: "front",
    })
  )
    changed = true;
  if (
    tryPushCabinSwingGate(
      loc.x,
      loc.z,
      lvX,
      lvZ,
      isMoving,
      cabinState.gardenFront,
      {
        gateX: gx,
        gateZ: y.front,
        halfW: gh,
        face: "front",
      }
    )
  )
    changed = true;
  if (
    tryPushCabinSwingGate(
      loc.x,
      loc.z,
      lvX,
      lvZ,
      isMoving,
      cabinState.gardenBack,
      {
        gateX: gx,
        gateZ: -y.back,
        halfW: gh,
        face: "back",
      }
    )
  )
    changed = true;
  return changed;
}

/** White transparent cabin window (local +Z faces outward) */
function CabinWindow({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  width = 1.35,
  height = 1.25,
}) {
  const white = COLORS.white;
  const bar = 0.09;
  const frameD = 0.1;
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[width - 0.14, height - 0.14]} />
        <meshToonMaterial
          color="#ffffff"
          transparent
          opacity={0.3}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[width - 0.28, height - 0.28]} />
        <meshToonMaterial
          color="#f0f6ff"
          transparent
          opacity={0.12}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Frame */}
      {[
        [0, height / 2 - bar / 2, width, bar],
        [0, -height / 2 + bar / 2, width, bar],
        [-width / 2 + bar / 2, 0, bar, height],
        [width / 2 - bar / 2, 0, bar, height],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, frameD / 2]} castShadow>
          <boxGeometry args={[w, h, frameD]} />
          <meshToonMaterial color={white} />
        </mesh>
      ))}
      {/* Mullion cross */}
      <mesh position={[0, 0, frameD / 2 + 0.01]}>
        <boxGeometry args={[bar * 0.75, height - bar * 1.4, frameD * 0.85]} />
        <meshToonMaterial color={white} />
      </mesh>
      <mesh position={[0, 0, frameD / 2 + 0.01]}>
        <boxGeometry args={[width - bar * 1.4, bar * 0.75, frameD * 0.85]} />
        <meshToonMaterial color={white} />
      </mesh>
      <mesh position={[0, -height / 2 - 0.05, frameD * 0.6]} castShadow>
        <boxGeometry args={[width + 0.15, 0.08, 0.16]} />
        <meshToonMaterial color={white} />
      </mesh>
    </group>
  );
}

/** Horizontal log course strip (alternating tone) */
function LogCourse({ y, length, depth, z, x = 0, alongX = true, tone = 0 }) {
  const color = tone % 2 === 0 ? COLORS.wood : COLORS.woodDark;
  if (alongX) {
    return (
      <mesh position={[x, y, z]} castShadow receiveShadow>
        <boxGeometry args={[length, 0.34, depth]} />
        <meshToonMaterial color={color} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>
    );
  }
  return (
    <mesh position={[x, y, z]} castShadow receiveShadow>
      <boxGeometry args={[depth, 0.34, length]} />
      <meshToonMaterial color={color} />
      <Outlines color={COLORS.outline} thickness={0.8} />
    </mesh>
  );
}

/** Animated cabin front door leaf (hinge on left, swings +Y open inward) */
function CabinFrontDoor({ doorW, frontZ, cabinState }) {
  const hingeRef = useRef();
  useFrame((_, delta) => {
    if (!hingeRef.current || !cabinState) return;
    const target = cabinState.doorOpen ? CABIN_DOOR_OPEN_ANGLE : 0;
    const cur = cabinState.doorAngle ?? 0;
    const next = cur + (target - cur) * Math.min(1, delta * 6);
    cabinState.doorAngle = Math.abs(next - target) < 0.01 ? target : next;
    hingeRef.current.rotation.y = cabinState.doorAngle;
  });
  return (
    <group
      ref={hingeRef}
      position={[-doorW / 2 + 0.05, 1.28, frontZ + 0.05]}
    >
      <mesh position={[doorW / 2, 0, 0]} castShadow>
        <boxGeometry args={[doorW - 0.08, 2.5, 0.1]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1.2} />
      </mesh>
      <mesh position={[doorW - 0.28, 0, 0.08]}>
        <sphereGeometry args={[0.07, 6, 6]} />
        <meshToonMaterial color={COLORS.gold} />
      </mesh>
    </group>
  );
}

/**
 * Back door onto the covered patio. Hinge on the left (−X), swings open
 * outward (−Z / negative Y rot) onto the patio.
 */
function CabinBackDoor({ doorW, backZ, cabinState }) {
  const hingeRef = useRef();
  useFrame((_, delta) => {
    if (!hingeRef.current || !cabinState) return;
    const target = cabinState.backDoorOpen ? CABIN_BACK_DOOR_OPEN_ANGLE : 0;
    const cur = cabinState.backDoorAngle ?? 0;
    const next = cur + (target - cur) * Math.min(1, delta * 6);
    cabinState.backDoorAngle = Math.abs(next - target) < 0.01 ? target : next;
    hingeRef.current.rotation.y = cabinState.backDoorAngle;
  });
  return (
    <group
      ref={hingeRef}
      position={[-doorW / 2 + 0.05, 1.28, backZ - 0.05]}
    >
      <mesh position={[doorW / 2, 0, 0]} castShadow>
        <boxGeometry args={[doorW - 0.08, 2.5, 0.1]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1.2} />
      </mesh>
      {/* Window pane in upper half */}
      <mesh position={[doorW / 2, 0.45, -0.06]}>
        <boxGeometry args={[doorW - 0.35, 0.7, 0.03]} />
        <meshToonMaterial
          color="#e8f0f8"
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[doorW - 0.28, -0.15, -0.08]}>
        <sphereGeometry args={[0.07, 6, 6]} />
        <meshToonMaterial color={COLORS.gold} />
      </mesh>
    </group>
  );
}

/** Mesh kits for movable cabin furniture (local origin = placement point). */

function FridgeMesh() {
  const fridgeGreen = "#3d6b45";
  const fridgeGreenDark = "#2a4a30";
  const fridgeChrome = "#c8cdd4";
  return (
    <group>
      <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.85, 2.05, 0.95]} />
        <meshToonMaterial color={fridgeGreen} />
        <Outlines color={COLORS.outline} thickness={1.4} />
      </mesh>
      <mesh position={[0, 2.12, 0]} castShadow>
        <boxGeometry args={[0.88, 0.12, 0.98]} />
        <meshToonMaterial color={fridgeGreenDark} />
      </mesh>
      <mesh position={[0.44, 1.62, 0]} castShadow>
        <boxGeometry args={[0.06, 0.72, 0.88]} />
        <meshToonMaterial color={fridgeGreenDark} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>
      <mesh position={[0.44, 0.72, 0]} castShadow>
        <boxGeometry args={[0.06, 1.05, 0.88]} />
        <meshToonMaterial color={fridgeGreen} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>
      <mesh position={[0.5, 1.55, -0.28]} castShadow>
        <boxGeometry args={[0.08, 0.28, 0.06]} />
        <meshToonMaterial color={fridgeChrome} />
      </mesh>
      <mesh position={[0.5, 1.05, -0.28]} castShadow>
        <boxGeometry args={[0.08, 0.42, 0.06]} />
        <meshToonMaterial color={fridgeChrome} />
      </mesh>
      <mesh position={[0.48, 1.35, 0.18]}>
        <boxGeometry args={[0.03, 0.1, 0.28]} />
        <meshToonMaterial color={fridgeChrome} />
      </mesh>
    </group>
  );
}

function SinkMesh() {
  const sinkMetal = "#9aa3ad";
  const sinkMetalDark = "#6a727c";
  const porcelain = "#f2efe6";
  const fridgeChrome = "#c8cdd4";
  return (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.72, 0.84, 1.15]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={1.2} />
      </mesh>
      <mesh position={[0.37, 0.4, 0.02]}>
        <boxGeometry args={[0.03, 0.7, 1.0]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>
      <mesh position={[0, 0.88, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.08, 1.25]} />
        <meshToonMaterial color={sinkMetal} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0.02, 0.78, 0.28]} castShadow>
        <boxGeometry args={[0.48, 0.22, 0.55]} />
        <meshToonMaterial color={sinkMetalDark} />
      </mesh>
      <mesh position={[0.02, 0.86, 0.28]}>
        <boxGeometry args={[0.4, 0.08, 0.48]} />
        <meshToonMaterial color={porcelain} />
      </mesh>
      <mesh position={[-0.22, 1.05, 0.28]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 0.35, 6]} />
        <meshToonMaterial color={fridgeChrome} />
      </mesh>
      <mesh position={[-0.05, 1.28, 0.28]} rotation={[0, 0, -0.9]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.38, 6]} />
        <meshToonMaterial color={fridgeChrome} />
      </mesh>
      <mesh position={[-0.38, 1.15, 0]} castShadow>
        <boxGeometry args={[0.06, 0.45, 1.2]} />
        <meshToonMaterial color={COLORS.woodLight} />
      </mesh>
    </group>
  );
}

function TableMesh() {
  const tableTop = "#8a5a30";
  const tableLeg = COLORS.woodDark;
  const benchWood = "#7a4e28";
  const porcelain = "#f2efe6";
  const tableLen = 2.55;
  const tableW = 0.95;
  const tableH = 0.78;
  return (
    <group>
      <mesh position={[0, tableH, 0]} castShadow receiveShadow>
        <boxGeometry args={[tableLen, 0.1, tableW]} />
        <meshToonMaterial color={tableTop} />
        <Outlines color={COLORS.outline} thickness={1.3} />
      </mesh>
      {[
        [-tableLen / 2 + 0.18, -tableW / 2 + 0.12],
        [tableLen / 2 - 0.18, -tableW / 2 + 0.12],
        [-tableLen / 2 + 0.18, tableW / 2 - 0.12],
        [tableLen / 2 - 0.18, tableW / 2 - 0.12],
      ].map(([x, z], i) => (
        <mesh key={`leg-${i}`} position={[x, tableH / 2 - 0.02, z]} castShadow>
          <cylinderGeometry args={[0.06, 0.075, tableH - 0.08, 6]} />
          <meshToonMaterial color={tableLeg} />
        </mesh>
      ))}
      {[-1, 1].map((side, i) => {
        const bz = side * (tableW / 2 + 0.42);
        const benchLen = tableLen - 0.15;
        const seatH = 0.46;
        return (
          <group key={`bench-${i}`} position={[0, 0, bz]}>
            <mesh position={[0, seatH, 0]} castShadow receiveShadow>
              <boxGeometry args={[benchLen, 0.09, 0.38]} />
              <meshToonMaterial color={benchWood} />
              <Outlines color={COLORS.outline} thickness={1.1} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0.05, tableH + 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 0.16, 6]} />
        <meshToonMaterial color="#c44a3a" />
      </mesh>
      <mesh position={[-0.55, tableH + 0.08, 0.12]}>
        <cylinderGeometry args={[0.1, 0.1, 0.04, 8]} />
        <meshToonMaterial color={porcelain} />
      </mesh>
      {/* Rug under table (moves with table) */}
      <mesh position={[0, 0.085, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3.4, 2.4]} />
        <meshToonMaterial color="#6a3a28" />
      </mesh>
    </group>
  );
}

/** Bed origin = mattress/frame center; headboard toward +X (right wall default). */
function BedMesh() {
  const bedW = 1.7;
  const bedL = 2.25;
  return (
    <group>
      <mesh position={[bedL / 2 + 0.05, 1.0, 0]} castShadow>
        <boxGeometry args={[0.12, 1.15, bedW + 0.12]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1.2} />
      </mesh>
      <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
        <boxGeometry args={[bedL, 0.36, bedW]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[bedL - 0.12, 0.2, bedW - 0.12]} />
        <meshToonMaterial color="#c8b090" />
      </mesh>
      <mesh position={[bedL / 2 - 0.35, 0.78, -0.35]} castShadow>
        <boxGeometry args={[0.38, 0.18, 0.55]} />
        <meshToonMaterial color="#e8dcc8" />
      </mesh>
      <mesh position={[bedL / 2 - 0.35, 0.78, 0.35]} castShadow>
        <boxGeometry args={[0.38, 0.18, 0.55]} />
        <meshToonMaterial color="#e8dcc8" />
      </mesh>
      <mesh position={[-bedL * 0.22, 0.72, 0]} castShadow>
        <boxGeometry args={[bedL * 0.32, 0.08, bedW - 0.18]} />
        <meshToonMaterial color="#6a4a32" />
      </mesh>
    </group>
  );
}

function NightstandMesh() {
  return (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.55, 0.75, 0.55]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.11, 0.22, 6]} />
        <meshToonMaterial color="#f0e8d0" />
      </mesh>
    </group>
  );
}

function LeatherChairMesh() {
  const leather = "#4a3024";
  const leatherDark = "#2e1e16";
  const leatherHi = "#6a4834";
  return (
    <group>
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.85, 0.22, 0.8]} />
        <meshToonMaterial color={leather} />
        <Outlines color={COLORS.outline} thickness={1.1} />
      </mesh>
      <mesh position={[0, 0.85, -0.28]} castShadow>
        <boxGeometry args={[0.85, 0.85, 0.16]} />
        <meshToonMaterial color={leatherDark} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`arm-${s}`} position={[s * 0.4, 0.55, 0.05]} castShadow>
          <boxGeometry args={[0.12, 0.35, 0.7]} />
          <meshToonMaterial color={leatherHi} />
        </mesh>
      ))}
      <mesh position={[0, 0.52, 0.05]} castShadow>
        <boxGeometry args={[0.7, 0.12, 0.55]} />
        <meshToonMaterial color={leatherHi} />
      </mesh>
    </group>
  );
}

const FURNITURE_MESH = {
  bed: BedMesh,
  nightstand: NightstandMesh,
  fridge: FridgeMesh,
  sink: SinkMesh,
  table: TableMesh,
  chair1: LeatherChairMesh,
  chair2: LeatherChairMesh,
};

/**
 * Renders movable cabin furniture from furnitureState and follows the player
 * while a piece is being carried (useFrame).
 */
function CabinMovableFurniture({ furnitureState, playerTrack }) {
  const groupRefs = useRef({});

  useFrame(() => {
    if (!furnitureState?.items) return;
    if (furnitureState.movingId && playerTrack?.position) {
      updateMovingFurniture(
        furnitureState,
        playerTrack.position.x,
        playerTrack.position.z,
        playerTrack.yaw ?? 0
      );
    }
    for (const item of furnitureState.items) {
      const g = groupRefs.current[item.id];
      if (!g) continue;
      g.position.set(item.x, 0, item.z);
      g.rotation.y = item.yaw || 0;
      // Lift slightly while moving so it reads as "carried"
      g.position.y = furnitureState.movingId === item.id ? 0.12 : 0;
    }
  });

  if (!furnitureState?.items) return null;

  return (
    <group userData={{ ignoreCameraCollision: true }}>
      {furnitureState.items.map((item) => {
        const Mesh = FURNITURE_MESH[item.id];
        if (!Mesh) return null;
        return (
          <group
            key={item.id}
            ref={(el) => {
              if (el) groupRefs.current[item.id] = el;
            }}
            position={[item.x, 0, item.z]}
            rotation={[0, item.yaw || 0, 0]}
          >
            <Mesh />
          </group>
        );
      })}
    </group>
  );
}

/**
 * Covered back patio: cabin width × 50% cabin depth.
 * Stone fireplace with chairs/benches around a fire pit seating circle.
 */
function CabinBackPatio() {
  const backZ = -CABIN_D / 2;
  // Deck runs from cabin back wall outward (−Z)
  const deckMidZ = backZ - PATIO_D / 2;
  const roofY = 2.85;
  const postH = 2.7;
  // Fireplace near the far edge of the patio
  const fireZ = backZ - PATIO_D * 0.72;
  const seatR = 1.55;

  return (
    <group userData={{ ignoreCameraCollision: true }}>
      {/* Deck floor — full cabin width × half depth */}
      <mesh position={[0, 0.07, deckMidZ]} receiveShadow castShadow>
        <boxGeometry args={[PATIO_W, 0.14, PATIO_D]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={1.4} />
      </mesh>
      {/* Deck board lines */}
      {Array.from({ length: 10 }).map((_, i) => (
        <mesh
          key={`deck-line-${i}`}
          position={[(i - 4.5) * (PATIO_W / 10), 0.145, deckMidZ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.04, PATIO_D - 0.2]} />
          <meshToonMaterial color={COLORS.woodDark} />
        </mesh>
      ))}
      {/* Perimeter beam */}
      <mesh position={[0, 0.18, backZ - PATIO_D]} castShadow>
        <boxGeometry args={[PATIO_W + 0.15, 0.12, 0.16]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>
      <mesh position={[-PATIO_W / 2, 0.18, deckMidZ]} castShadow>
        <boxGeometry args={[0.16, 0.12, PATIO_D]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>
      <mesh position={[PATIO_W / 2, 0.18, deckMidZ]} castShadow>
        <boxGeometry args={[0.16, 0.12, PATIO_D]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>

      {/* Cover posts + roof */}
      {[
        [-PATIO_W / 2 + 0.35, backZ - 0.35],
        [PATIO_W / 2 - 0.35, backZ - 0.35],
        [-PATIO_W / 2 + 0.35, backZ - PATIO_D + 0.35],
        [PATIO_W / 2 - 0.35, backZ - PATIO_D + 0.35],
        [0, backZ - PATIO_D + 0.35],
      ].map(([x, z], i) => (
        <mesh key={`pp-${i}`} position={[x, postH / 2 + 0.1, z]} castShadow>
          <cylinderGeometry args={[0.11, 0.13, postH, 6]} />
          <meshToonMaterial color={COLORS.woodDark} />
          <Outlines color={COLORS.outline} thickness={0.9} />
        </mesh>
      ))}
      {/* Beams */}
      <mesh position={[0, roofY - 0.15, backZ - 0.35]} castShadow>
        <boxGeometry args={[PATIO_W - 0.2, 0.16, 0.18]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
      <mesh position={[0, roofY - 0.15, backZ - PATIO_D + 0.35]} castShadow>
        <boxGeometry args={[PATIO_W - 0.2, 0.16, 0.18]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
      {[-PATIO_W / 2 + 0.35, PATIO_W / 2 - 0.35, 0].map((x, i) => (
        <mesh key={`beam-${i}`} position={[x, roofY - 0.15, deckMidZ]} castShadow>
          <boxGeometry args={[0.16, 0.14, PATIO_D - 0.5]} />
          <meshToonMaterial color={COLORS.wood} />
        </mesh>
      ))}
      {/* Covered roof slab (slight pitch away from house) */}
      <mesh
        position={[0, roofY + 0.12, deckMidZ]}
        rotation={[-0.08, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[PATIO_W + 0.5, 0.14, PATIO_D + 0.55]} />
        <meshToonMaterial color={COLORS.roof} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
      {/* Rafter hints under roof */}
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh
          key={`raft-${i}`}
          position={[(i - 3) * (PATIO_W / 7), roofY - 0.02, deckMidZ]}
          castShadow
        >
          <boxGeometry args={[0.08, 0.1, PATIO_D - 0.3]} />
          <meshToonMaterial color={COLORS.woodDark} />
        </mesh>
      ))}

      {/* ---- Stone outdoor fireplace (far end of patio) ---- */}
      <group position={[0, 0, fireZ]}>
        {/* Hearth base */}
        <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 0.35, 1.6]} />
          <meshToonMaterial color={COLORS.stone} />
          <Outlines color={COLORS.outline} thickness={1.3} />
        </mesh>
        {/* Firebox shell */}
        <mesh position={[0, 1.15, -0.15]} castShadow>
          <boxGeometry args={[1.9, 1.5, 1.1]} />
          <meshToonMaterial color={COLORS.stoneDark} />
          <Outlines color={COLORS.outline} thickness={1.3} />
        </mesh>
        {/* Fire opening */}
        <mesh position={[0, 0.85, 0.42]}>
          <boxGeometry args={[1.15, 0.9, 0.12]} />
          <meshToonMaterial color="#1a120c" />
        </mesh>
        {/* Glow / fire */}
        <mesh position={[0, 0.75, 0.2]}>
          <boxGeometry args={[0.7, 0.55, 0.4]} />
          <meshToonMaterial color="#e87830" />
        </mesh>
        <mesh position={[0, 0.95, 0.15]}>
          <boxGeometry args={[0.4, 0.35, 0.25]} />
          <meshToonMaterial color="#f0c040" />
        </mesh>
        {/* Chimney stack */}
        <mesh position={[0, 2.4, -0.15]} castShadow>
          <boxGeometry args={[0.85, 1.2, 0.85]} />
          <meshToonMaterial color={COLORS.stone} />
          <Outlines color={COLORS.outline} thickness={1} />
        </mesh>
        <mesh position={[0, 3.1, -0.15]} castShadow>
          <boxGeometry args={[1.05, 0.22, 1.05]} />
          <meshToonMaterial color={COLORS.stoneDark} />
        </mesh>
        {/* Mantel shelf */}
        <mesh position={[0, 1.55, 0.45]} castShadow>
          <boxGeometry args={[2.1, 0.1, 0.35]} />
          <meshToonMaterial color={COLORS.woodDark} />
        </mesh>
      </group>

      {/* Sitting circle around the fireplace */}
      {[
        { a: 0.35, kind: "chair" },
        { a: 0.85, kind: "chair" },
        { a: 1.35, kind: "bench" },
        { a: 1.85, kind: "chair" },
        { a: 2.35, kind: "chair" },
        { a: 2.85, kind: "bench" },
      ].map(({ a, kind }, i) => {
        // Arc in front of fireplace (toward cabin / +Z side of fire)
        const ang = Math.PI * 0.15 + a * 0.55;
        // Place seats on the cabin side of the fireplace
        const sx = Math.cos(ang) * seatR;
        const sz = fireZ + Math.sin(ang) * seatR * 0.85 + 0.35;
        const yaw = Math.atan2(-sx, fireZ - sz);
        if (kind === "bench") {
          return (
            <group key={`seat-${i}`} position={[sx, 0.14, sz]} rotation={[0, yaw, 0]}>
              <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.35, 0.1, 0.42]} />
                <meshToonMaterial color="#6a4224" />
                <Outlines color={COLORS.outline} thickness={1} />
              </mesh>
              <mesh position={[0, 0.7, -0.14]} castShadow>
                <boxGeometry args={[1.35, 0.55, 0.1]} />
                <meshToonMaterial color="#5a3620" />
              </mesh>
              {[-0.55, 0.55].map((ox, j) => (
                <mesh key={j} position={[ox, 0.2, 0.1]} castShadow>
                  <boxGeometry args={[0.08, 0.38, 0.08]} />
                  <meshToonMaterial color={COLORS.woodDark} />
                </mesh>
              ))}
            </group>
          );
        }
        return (
          <group key={`seat-${i}`} position={[sx, 0.14, sz]} rotation={[0, yaw, 0]}>
            <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.55, 0.1, 0.5]} />
              <meshToonMaterial color="#6a4224" />
              <Outlines color={COLORS.outline} thickness={1} />
            </mesh>
            <mesh position={[0, 0.72, -0.18]} castShadow>
              <boxGeometry args={[0.55, 0.55, 0.1]} />
              <meshToonMaterial color="#5a3620" />
            </mesh>
            {[
              [-0.2, 0.18],
              [0.2, 0.18],
              [-0.2, -0.18],
              [0.2, -0.18],
            ].map(([ox, oz], j) => (
              <mesh key={j} position={[ox, 0.2, oz]} castShadow>
                <boxGeometry args={[0.07, 0.38, 0.07]} />
                <meshToonMaterial color={COLORS.woodDark} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* Small side table */}
      <mesh position={[-2.4, 0.45, fireZ + 1.1]} castShadow>
        <cylinderGeometry args={[0.28, 0.3, 0.08, 8]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
      <mesh position={[-2.4, 0.22, fireZ + 1.1]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.4, 6]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>
    </group>
  );
}

/**
 * Western log cabin — open-plan hollow shell (no center wall),
 * white transparent windows, openable front/back doors, porch + chimney.
 */
function LogCabin({
  position = [0, 0, 0],
  rotation = 0,
  cabinState,
  furnitureState = null,
  playerTrack = null,
}) {
  const W = CABIN_W;
  const D = CABIN_D;
  const H = CABIN_H;
  const logH = 0.38;
  const logRows = Math.floor(H / logH);
  const t = CABIN_WALL_T;
  const frontZ = D / 2;
  const backZ = -D / 2;
  const doorW = CABIN_DOOR_W;
  const winY = 1.95;
  const winH = 1.35;
  const doorH = 2.55;

  // Build exterior wall pieces with openings (as log rows + solid fill where needed)
  const sideFrontW = (W - doorW) / 2;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* === Floor === */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W - 0.3, D - 0.3]} />
        <meshToonMaterial color="#6b4a28" />
      </mesh>
      {/* Floor boards hint */}
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh
          key={`board-${i}`}
          position={[(i - 5.5) * 1.1, 0.07, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.08, D - 0.5]} />
          <meshToonMaterial color="#5a3a1a" />
        </mesh>
      ))}
      {/* Rug in main room */}
      <mesh
        position={[0, 0.08, 1.6]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[4.2, 2.8]} />
        <meshToonMaterial color="#8a3030" />
      </mesh>

      {/* === Log walls with openings (row by row) === */}
      {Array.from({ length: logRows }).map((_, i) => {
        const y = logH / 2 + i * logH;
        const isDoorRow = y < doorH;
        const isWinRow = y > 1.25 && y < 2.75;
        return (
          <group key={`logs-${i}`}>
            {/* Front — left of door */}
            <LogCourse
              y={y}
              length={sideFrontW + 0.1}
              depth={t}
              z={frontZ}
              x={-(doorW / 2 + sideFrontW / 2)}
              tone={i}
            />
            {/* Front — right of door */}
            <LogCourse
              y={y}
              length={sideFrontW + 0.1}
              depth={t}
              z={frontZ}
              x={doorW / 2 + sideFrontW / 2}
              tone={i}
            />
            {/* Front lintel above door */}
            {!isDoorRow && (
              <LogCourse
                y={y}
                length={doorW + 0.15}
                depth={t}
                z={frontZ}
                x={0}
                tone={i}
              />
            )}
            {/* Back wall — door gap (and upper lintel / sides) for patio door */}
            {isDoorRow ? (
              <>
                <LogCourse
                  y={y}
                  length={sideFrontW + 0.1}
                  depth={t}
                  z={backZ}
                  x={-(doorW / 2 + sideFrontW / 2)}
                  tone={i + 1}
                />
                <LogCourse
                  y={y}
                  length={sideFrontW + 0.1}
                  depth={t}
                  z={backZ}
                  x={doorW / 2 + sideFrontW / 2}
                  tone={i + 1}
                />
              </>
            ) : (
              <LogCourse
                y={y}
                length={W + 0.2}
                depth={t}
                z={backZ}
                x={0}
                tone={i + 1}
              />
            )}
            {/* Left wall — window gap */}
            {isWinRow ? (
              <>
                <LogCourse
                  y={y}
                  length={(D - 1.4) / 2}
                  depth={t}
                  x={-W / 2}
                  z={-(D + 1.4) / 4}
                  alongX={false}
                  tone={i}
                />
                <LogCourse
                  y={y}
                  length={(D - 1.4) / 2}
                  depth={t}
                  x={-W / 2}
                  z={(D + 1.4) / 4}
                  alongX={false}
                  tone={i}
                />
              </>
            ) : (
              <LogCourse
                y={y}
                length={D}
                depth={t}
                x={-W / 2}
                z={0}
                alongX={false}
                tone={i}
              />
            )}
            {/* Right wall — window gap (main room side) */}
            {isWinRow ? (
              <>
                <LogCourse
                  y={y}
                  length={(D - 1.4) / 2}
                  depth={t}
                  x={W / 2}
                  z={-(D + 1.4) / 4}
                  alongX={false}
                  tone={i + 1}
                />
                <LogCourse
                  y={y}
                  length={(D - 1.4) / 2}
                  depth={t}
                  x={W / 2}
                  z={(D + 1.4) / 4}
                  alongX={false}
                  tone={i + 1}
                />
              </>
            ) : (
              <LogCourse
                y={y}
                length={D}
                depth={t}
                x={W / 2}
                z={0}
                alongX={false}
                tone={i + 1}
              />
            )}
          </group>
        );
      })}

      {/* Corner posts */}
      {[
        [-W / 2, -D / 2],
        [W / 2, -D / 2],
        [-W / 2, D / 2],
        [W / 2, D / 2],
      ].map(([x, z], j) => (
        <mesh key={`post-${j}`} position={[x, H / 2, z]} castShadow>
          <cylinderGeometry args={[0.22, 0.24, H + 0.15, 6]} />
          <meshToonMaterial color={COLORS.woodDark} />
          <Outlines color={COLORS.outline} thickness={1} />
        </mesh>
      ))}

      {/* === Roof (taller peak) === */}
      <mesh
        position={[0, H + CABIN_ROOF_RISE * 0.55, D / 4 + 0.1]}
        rotation={[Math.PI / 4.4, 0, 0]}
        castShadow
      >
        <boxGeometry args={[W + 1.8, 0.3, D / 2 + 1.35]} />
        <meshToonMaterial color={COLORS.roof} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      <mesh
        position={[0, H + CABIN_ROOF_RISE * 0.55, -D / 4 - 0.1]}
        rotation={[-Math.PI / 4.4, 0, 0]}
        castShadow
      >
        <boxGeometry args={[W + 1.8, 0.3, D / 2 + 1.35]} />
        <meshToonMaterial color={COLORS.roof} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      {/* Ridge beam / gable fill */}
      <mesh position={[0, H + CABIN_ROOF_RISE * 0.72, 0]} castShadow>
        <boxGeometry args={[0.5, CABIN_ROOF_RISE * 0.95, D + 0.2]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
      <mesh position={[0, H + CABIN_ROOF_RISE + 0.08, 0]} castShadow>
        <boxGeometry args={[W + 0.5, 0.18, 0.35]} />
        <meshToonMaterial color={COLORS.white} />
      </mesh>

      {/* === Front door (interact open/close) === */}
      <CabinFrontDoor doorW={doorW} frontZ={frontZ} cabinState={cabinState} />
      {/* === Back door onto covered patio === */}
      <CabinBackDoor doorW={doorW} backZ={backZ} cabinState={cabinState} />

      {/* === Transparent white windows === */}
      <CabinWindow
        position={[-(doorW / 2 + sideFrontW * 0.55), winY, frontZ + 0.24]}
        width={1.45}
        height={winH}
      />
      <CabinWindow
        position={[doorW / 2 + sideFrontW * 0.55, winY, frontZ + 0.24]}
        width={1.45}
        height={winH}
      />
      {/* Back wall windows flanking the patio door */}
      <CabinWindow
        position={[-(doorW / 2 + sideFrontW * 0.55), winY, backZ - 0.24]}
        rotation={[0, Math.PI, 0]}
        width={1.45}
        height={winH}
      />
      <CabinWindow
        position={[doorW / 2 + sideFrontW * 0.55, winY, backZ - 0.24]}
        rotation={[0, Math.PI, 0]}
        width={1.45}
        height={winH}
      />
      <CabinWindow
        position={[-W / 2 - 0.24, winY, 1.2]}
        rotation={[0, -Math.PI / 2, 0]}
        width={1.55}
        height={winH}
      />
      <CabinWindow
        position={[W / 2 + 0.24, winY, 1.2]}
        rotation={[0, Math.PI / 2, 0]}
        width={1.55}
        height={winH}
      />

      {/* Shelf + jar on right wall (fixed décor) */}
      <mesh position={[4.5, 1.7, 2.0]} castShadow>
        <boxGeometry args={[1.1, 0.08, 0.4]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
      <mesh position={[4.3, 1.88, 2.0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.24, 6]} />
        <meshToonMaterial color="#c44a3a" />
      </mesh>

      {/* Movable furniture (bed, chairs, kitchen pieces) — positions saved per session */}
      <CabinMovableFurniture
        furnitureState={furnitureState}
        playerTrack={playerTrack}
      />

      {/* === Fixed stone fireplace (left rear corner) — not movable === */}
      {(() => {
        const fx = -W / 2 + 1.55;
        const fz = -D / 2 + 1.7;
        return (
          <group>
            <mesh position={[fx + 0.35, 0.1, fz + 0.35]} receiveShadow castShadow>
              <boxGeometry args={[2.6, 0.12, 2.4]} />
              <meshToonMaterial color={COLORS.stone} />
              <Outlines color={COLORS.outline} thickness={1} />
            </mesh>
            <mesh position={[fx, 1.15, fz]} castShadow receiveShadow>
              <boxGeometry args={[1.5, 2.2, 1.35]} />
              <meshToonMaterial color={COLORS.stoneDark} />
              <Outlines color={COLORS.outline} thickness={1.4} />
            </mesh>
            <mesh position={[fx + 0.55, 0.85, fz + 0.35]}>
              <boxGeometry args={[0.45, 1.0, 0.7]} />
              <meshToonMaterial color="#1a120c" />
            </mesh>
            <mesh position={[fx + 0.35, 0.72, fz + 0.25]}>
              <boxGeometry args={[0.35, 0.45, 0.4]} />
              <meshToonMaterial color="#e87830" />
            </mesh>
            <mesh position={[fx + 0.32, 0.9, fz + 0.22]}>
              <boxGeometry args={[0.22, 0.28, 0.22]} />
              <meshToonMaterial color="#f0c040" />
            </mesh>
            <mesh position={[fx + 0.15, 1.55, fz + 0.15]} castShadow>
              <boxGeometry args={[1.75, 0.12, 1.55]} />
              <meshToonMaterial color={COLORS.woodDark} />
            </mesh>
            <mesh position={[fx - 0.1, 2.7, fz - 0.1]} castShadow>
              <boxGeometry args={[1.15, 1.4, 1.0]} />
              <meshToonMaterial color={COLORS.stone} />
            </mesh>
          </group>
        );
      })()}

      {/* Interior ceiling boards (thin) */}
      <mesh position={[0, H - 0.08, 0]} receiveShadow>
        <boxGeometry args={[W - 0.5, 0.08, D - 0.5]} />
        <meshToonMaterial color="#5c3a18" />
      </mesh>

      {/* === Chimney (right-back exterior) — taller to clear roof === */}
      <group position={[W / 2 + 0.35, 0, backZ + 0.9]}>
        <mesh position={[0, 3.4, 0]} castShadow>
          <boxGeometry args={[1.25, 6.6, 1.25]} />
          <meshToonMaterial color={COLORS.stone} />
          <Outlines color={COLORS.outline} thickness={1.5} />
        </mesh>
        <mesh position={[0, 6.85, 0]} castShadow>
          <boxGeometry args={[1.55, 0.35, 1.55]} />
          <meshToonMaterial color={COLORS.stoneDark} />
        </mesh>
      </group>

      {/* === Porch (taller posts + higher roof) === */}
      <mesh position={[0, 0.08, frontZ + 1.15]} receiveShadow castShadow>
        <boxGeometry args={[W * 0.85, 0.16, 2.0]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      {[-W * 0.35, W * 0.35].map((x, i) => (
        <mesh key={`pp-${i}`} position={[x, 1.45, frontZ + 1.9]} castShadow>
          <cylinderGeometry args={[0.1, 0.12, 2.8, 6]} />
          <meshToonMaterial color={COLORS.woodDark} />
        </mesh>
      ))}
      <mesh position={[0, 2.85, frontZ + 1.9]} castShadow>
        <boxGeometry args={[W * 0.78, 0.14, 0.16]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
      {/* Porch roof — raised */}
      <mesh
        position={[0, 3.35, frontZ + 1.15]}
        rotation={[0.32, 0, 0]}
        castShadow
      >
        <boxGeometry args={[W * 0.95, 0.14, 2.5]} />
        <meshToonMaterial color={COLORS.roof} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
      {/* Porch roof ridge lip */}
      <mesh position={[0, 3.55, frontZ + 0.35]} castShadow>
        <boxGeometry args={[W * 0.92, 0.12, 0.2]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>

      {/* Covered patio behind cabin (full width × 50% depth) */}
      <CabinBackPatio />

      {/* Foundation */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[W + 0.5, 0.22, D + 0.5]} />
        <meshToonMaterial color={COLORS.stone} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
    </group>
  );
}

/** Regular picket fence post height (boards); gates use 1.3× this */
const PICKET_H = 1.1;
const PICKET_GATE_SCALE = 1.3;

/** Single white picket post + board. scaleY=1 regular fence; 1.3 for gates. */
function PicketPanel({ length = 1.2, scaleY = 1 }) {
  const posts = Math.max(2, Math.ceil(length / 0.45));
  const h = PICKET_H * scaleY;
  const midY = h / 2;
  const tipY = h + 0.08 * scaleY;
  const tipH = 0.16 * scaleY;
  return (
    <group>
      {Array.from({ length: posts }).map((_, i) => {
        const x = -length / 2 + (i / (posts - 1)) * length;
        return (
          <group key={i} position={[x, 0, 0]}>
            <mesh position={[0, midY, 0]} castShadow>
              <boxGeometry args={[0.07, h, 0.07]} />
              <meshToonMaterial color={COLORS.white} />
            </mesh>
            {/* Pointed top */}
            <mesh position={[0, tipY, 0]} castShadow>
              <coneGeometry args={[0.055 * Math.min(1.15, scaleY), tipH, 4]} />
              <meshToonMaterial color={COLORS.white} />
            </mesh>
          </group>
        );
      })}
      {/* Rails */}
      <mesh position={[0, 0.35 * scaleY, 0]} castShadow>
        <boxGeometry args={[length, 0.06, 0.05]} />
        <meshToonMaterial color={COLORS.white} />
      </mesh>
      <mesh position={[0, 0.75 * scaleY, 0]} castShadow>
        <boxGeometry args={[length, 0.06, 0.05]} />
        <meshToonMaterial color={COLORS.white} />
      </mesh>
    </group>
  );
}

/** Brown dirt mound row (elongated raised bed) for the vegetable/flower garden */
function DirtMoundRow({ length = 12, width = 1.15, height = 0.32 }) {
  const dirt = "#6b4428";
  const dirtHi = "#8a5a34";
  // Overlapping flattened spheres along the row for a soft mounded look
  const n = Math.max(3, Math.round(length / 1.35));
  const bumps = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = (t - 0.5) * (length - width * 0.9);
    const wobble = Math.sin(i * 2.1) * 0.06;
    bumps.push({
      x,
      z: wobble,
      sx: width * (0.85 + (i % 3) * 0.08),
      sy: height * (0.9 + (i % 2) * 0.15),
      sz: width * (0.75 + (i % 4) * 0.06),
    });
  }
  return (
    <group>
      {/* Continuous soil base under bumps */}
      <mesh position={[0, height * 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[length * 0.98, height * 0.35, width * 0.95]} />
        <meshToonMaterial color={dirt} />
      </mesh>
      {bumps.map((b, i) => (
        <mesh
          key={i}
          position={[b.x, b.sy * 0.55, b.z]}
          scale={[b.sx, b.sy, b.sz]}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[0.5, 8, 6]} />
          <meshToonMaterial color={i % 2 === 0 ? dirt : dirtHi} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * House-sized garden left of the cabin: soil pad + 4 rows of dirt mounds.
 * Local to cabin group (same space as CabinYard).
 */
function HouseGarden() {
  const gx = GARDEN_LOCAL.x;
  const gz = GARDEN_LOCAL.z;
  const pad = 0.35;
  const wood = COLORS.woodDark;
  // 4 rows spaced along depth (Z), each mound runs along width (X)
  const rowCount = 4;
  const innerD = GARDEN_D - pad * 2;
  const rowSpacing = innerD / rowCount;
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const z = gz - innerD / 2 + rowSpacing * (i + 0.5);
    rows.push({ z, length: GARDEN_W - pad * 2.4 });
  }

  return (
    <group position={[gx, 0, gz]}>
      {/* Soil footprint — same size as the house */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GARDEN_W, GARDEN_D]} />
        <meshToonMaterial color="#5c3a20" />
      </mesh>
      <mesh position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GARDEN_W - 0.35, GARDEN_D - 0.35]} />
        <meshToonMaterial color="#6e4528" />
      </mesh>

      {/* Timber border */}
      {[
        [0, GARDEN_D / 2 - 0.08, GARDEN_W, 0.16, 0.22],
        [0, -GARDEN_D / 2 + 0.08, GARDEN_W, 0.16, 0.22],
        [GARDEN_W / 2 - 0.08, 0, 0.16, GARDEN_D, 0.22],
        [-GARDEN_W / 2 + 0.08, 0, 0.16, GARDEN_D, 0.22],
      ].map(([x, z, w, d, h], i) => (
        <mesh key={i} position={[x, h / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshToonMaterial color={wood} />
          <Outlines color={COLORS.outline} thickness={0.6} />
        </mesh>
      ))}

      {/* 4 rows of brown dirt mounds */}
      {rows.map((r, i) => (
        <group key={i} position={[0, 0.02, r.z - gz]}>
          <DirtMoundRow length={r.length} width={1.2} height={0.34} />
        </group>
      ))}
    </group>
  );
}

/** Smooth swing-gate angle toward openDir * CABIN_GATE_OPEN_ANGLE or 0 */
function stepSwingGateVisual(gate, delta) {
  if (!gate) return 0;
  if (gate.pushCooldown > 0) {
    gate.pushCooldown = Math.max(0, gate.pushCooldown - delta);
  }
  const dir = gate.openDir >= 0 ? 1 : -1;
  const target = gate.open ? dir * CABIN_GATE_OPEN_ANGLE : 0;
  const cur = gate.angle ?? 0;
  const next = cur + (target - cur) * Math.min(1, delta * 7);
  gate.angle = Math.abs(next - target) < 0.01 ? target : next;
  return gate.angle;
}

/**
 * White waist-high picket fence, stone path, garden, and push-open gates.
 * Main path = double leaf; garden front/back = single swing leaf.
 * Open direction follows player push (same idea as barn pen gate).
 */
function CabinYard({ cabinState }) {
  const y = CABIN_YARD;
  const leftW = y.leftW ?? y.halfW;
  const frontZ = CABIN_D / 2;
  const white = COLORS.white;
  const gh = y.gateHalf;
  const gx = getGardenGateLocalX();
  const leftGateRef = useRef();
  const rightGateRef = useRef();
  const gFrontRef = useRef();
  const gBackRef = useRef();

  useFrame((_, delta) => {
    if (!cabinState) return;
    // Main double gate: leaves mirror with ±angle
    const mainA = stepSwingGateVisual(cabinState.mainGate, delta);
    if (leftGateRef.current) leftGateRef.current.rotation.y = mainA;
    if (rightGateRef.current) rightGateRef.current.rotation.y = -mainA;

    // Garden singles: full-width leaf, hinge on left post
    const gfA = stepSwingGateVisual(cabinState.gardenFront, delta);
    if (gFrontRef.current) gFrontRef.current.rotation.y = gfA;

    const gbA = stepSwingGateVisual(cabinState.gardenBack, delta);
    if (gBackRef.current) gBackRef.current.rotation.y = gbA;
  });

  // Stone path from gate (front fence) to porch
  const pathStartZ = y.front - 0.3;
  const pathEndZ = frontZ + 2.0;
  const pathLen = pathStartZ - pathEndZ;
  const pathMidZ = (pathStartZ + pathEndZ) / 2;
  const stones = [];
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const z = pathStartZ + (pathEndZ - pathStartZ) * t;
    const wobble = Math.sin(i * 1.7) * 0.12;
    stones.push({
      x: wobble,
      z,
      s: 0.38 + (i % 3) * 0.06,
      rot: (i * 0.4) % 1,
    });
  }

  // Small decorative flower clusters either side of path (porch beds)
  const flowers = [];
  const petalColors = [
    "#e85a6a",
    "#3a6ec8",
    "#f0b429",
    "#9a7ad4",
    "#f5f0e8",
    "#d43030",
    "#60d4a0",
    "#f0a0b8",
  ];
  for (let i = 0; i < 36; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    flowers.push({
      x: side * (1.35 + (row % 5) * 0.55 + (i % 3) * 0.1),
      z: frontZ + 2.6 + (row % 6) * 0.55 + (i % 4) * 0.08,
      color: petalColors[i % petalColors.length],
      h: 0.25 + (i % 5) * 0.06,
      s: 0.7 + (i % 4) * 0.12,
    });
  }

  const sideZ = (-y.back + y.front) / 2;
  // Fence runs — front: left of garden gate | between garden & main | right of main
  // back: left of garden gate | right of garden gate
  const segs = [
    {
      key: "f-left",
      x: (-leftW + (gx - gh)) / 2,
      z: y.front,
      rot: 0,
      len: gx - gh - (-leftW),
    },
    {
      key: "f-mid",
      x: (gx + gh + -gh) / 2,
      z: y.front,
      rot: 0,
      len: -gh - (gx + gh),
    },
    {
      key: "f-right",
      x: (gh + y.halfW) / 2,
      z: y.front,
      rot: 0,
      len: y.halfW - gh,
    },
    {
      key: "b-left",
      x: (-leftW + (gx - gh)) / 2,
      z: -y.back,
      rot: 0,
      len: gx - gh - (-leftW),
    },
    {
      key: "b-right",
      x: (gx + gh + y.halfW) / 2,
      z: -y.back,
      rot: 0,
      len: y.halfW - (gx + gh),
    },
    {
      key: "lf",
      x: -leftW,
      z: sideZ,
      rot: Math.PI / 2,
      len: y.front + y.back,
    },
    {
      key: "rt",
      x: y.halfW,
      z: sideZ,
      rot: Math.PI / 2,
      len: y.front + y.back,
    },
  ].filter((s) => s.len > 0.05);

  const lawnW = leftW + y.halfW - 0.4;
  const lawnX = (y.halfW - leftW) / 2;

  return (
    <group>
      {/* Soft lawn patch for yard (includes garden wing) */}
      <mesh
        position={[lawnX, 0.025, sideZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[lawnW, y.front + y.back - 0.4]} />
        <meshToonMaterial color="#5aaa3a" />
      </mesh>

      {/* House-sized dirt garden — left of cabin */}
      <HouseGarden />

      {/* Dirt beds flanking path (decorative) */}
      <mesh
        position={[-2.6, 0.05, frontZ + 3.6]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[3.6, 3.2]} />
        <meshToonMaterial color="#7a5430" />
      </mesh>
      <mesh
        position={[2.6, 0.05, frontZ + 3.6]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[3.6, 3.2]} />
        <meshToonMaterial color="#7a5430" />
      </mesh>

      {/* Stone walking path */}
      <mesh
        position={[0, 0.04, pathMidZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[1.35, pathLen + 0.4]} />
        <meshToonMaterial color="#8a8a90" />
      </mesh>
      {stones.map((s, i) => (
        <mesh
          key={`st-${i}`}
          position={[s.x, 0.07, s.z]}
          rotation={[-Math.PI / 2, 0, s.rot]}
          castShadow
          receiveShadow
        >
          <circleGeometry args={[s.s, 6]} />
          <meshToonMaterial
            color={i % 2 === 0 ? COLORS.stone : COLORS.stoneDark}
          />
        </mesh>
      ))}

      {/* Porch path flowers */}
      {flowers.map((f, i) => (
        <group key={`gf-${i}`} position={[f.x, 0, f.z]} scale={f.s}>
          <mesh position={[0, f.h * 0.45, 0]}>
            <capsuleGeometry args={[0.02, f.h * 0.5, 3, 4]} />
            <meshToonMaterial color="#3a7a3a" />
          </mesh>
          <mesh position={[0, f.h + 0.05, 0]} castShadow>
            <sphereGeometry args={[0.08, 5, 4]} />
            <meshToonMaterial color={f.color} />
          </mesh>
          <mesh position={[0, f.h + 0.05, 0]}>
            <sphereGeometry args={[0.035, 4, 4]} />
            <meshToonMaterial color="#f0c040" />
          </mesh>
        </group>
      ))}

      {/* Picket fence */}
      {segs.map((s) => (
        <group key={s.key} position={[s.x, 0, s.z]} rotation={[0, s.rot, 0]}>
          <PicketPanel length={s.len} />
        </group>
      ))}

      {/* Gate posts — 30% taller than regular pickets so openings stand out */}
      {(() => {
        const gatePostH = 1.2 * PICKET_GATE_SCALE;
        return [
          [-gh, y.front],
          [gh, y.front],
          [gx - gh, y.front],
          [gx + gh, y.front],
          [gx - gh, -y.back],
          [gx + gh, -y.back],
        ].map(([px, pz], i) => (
          <group key={`gp-${i}`} position={[px, 0, pz]}>
            <mesh position={[0, gatePostH / 2, 0]} castShadow>
              <boxGeometry args={[0.12, gatePostH, 0.12]} />
              <meshToonMaterial color={white} />
            </mesh>
            <mesh position={[0, gatePostH + 0.08, 0]}>
              <boxGeometry args={[0.18, 0.12, 0.18]} />
              <meshToonMaterial color={white} />
            </mesh>
          </group>
        ));
      })()}

      {/* Main path gate — double leaves (taller pickets) */}
      <group ref={leftGateRef} position={[-gh, 0, y.front]}>
        <group position={[gh * 0.85, 0, 0]}>
          <PicketPanel length={gh * 1.7} scaleY={PICKET_GATE_SCALE} />
        </group>
      </group>
      <group ref={rightGateRef} position={[gh, 0, y.front]}>
        <group position={[-gh * 0.85, 0, 0]}>
          <PicketPanel length={gh * 1.7} scaleY={PICKET_GATE_SCALE} />
        </group>
      </group>

      {/* Garden front — single swing leaf */}
      <group ref={gFrontRef} position={[gx - gh, 0, y.front]}>
        <group position={[gh * 0.95, 0, 0]}>
          <PicketPanel length={gh * 1.9} scaleY={PICKET_GATE_SCALE} />
        </group>
      </group>

      {/* Garden back — single swing leaf */}
      <group ref={gBackRef} position={[gx - gh, 0, -y.back]}>
        <group position={[gh * 0.95, 0, 0]}>
          <PicketPanel length={gh * 1.9} scaleY={PICKET_GATE_SCALE} />
        </group>
      </group>
    </group>
  );
}

/** Cabin + yard (fence, garden, path) as one placed group */
function CabinHomestead({ cabinState, furnitureState, playerTrack }) {
  return (
    <group
      position={[CABIN_POS.x, 0, CABIN_POS.z]}
      rotation={[0, CABIN_YAW, 0]}
    >
      <LogCabin
        position={[0, 0, 0]}
        rotation={0}
        cabinState={cabinState}
        furnitureState={furnitureState}
        playerTrack={playerTrack}
      />
      <CabinYard cabinState={cabinState} />
    </group>
  );
}

export function ValentineTown({
  barnDoorState,
  cabinState,
  furnitureState = null,
  playerTrack = null,
}) {
  return (
    <group>
      <Barn position={[0, 0, 0]} rotation={0} doorState={barnDoorState} />
      <CabinHomestead
        cabinState={cabinState}
        furnitureState={furnitureState}
        playerTrack={playerTrack}
      />
    </group>
  );
}
