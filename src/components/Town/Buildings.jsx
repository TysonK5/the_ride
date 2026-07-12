import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";

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
/** How far each front leaf slides outward when open */
export const FRONT_DOOR_SLIDE = DOOR_LEAF_W + 0.12;
/** Rear sliding door half-width (opening ~5.2) */
export const BACK_DOOR_HALF = 2.6;
export const BACK_DOOR_W = BACK_DOOR_HALF * 2;
export const BACK_DOOR_H = 4.4;
/** How far the rear slide door travels when open */
export const BACK_DOOR_SLIDE = BACK_DOOR_W + 0.15;

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
    // Right wall
    { type: "box", minX: hw - t, maxX: hw + t, minZ: -hd, maxZ: hd },
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
      maxZ: hd + t,
    });
  } else {
    // Leaves slid sideways, parked over the front wall panels
    boxes.push(
      {
        type: "box",
        minX: -DOOR_HALF - DOOR_LEAF_W,
        maxX: -DOOR_HALF,
        minZ: hd - t * 0.5,
        maxZ: hd + t * 1.3,
      },
      {
        type: "box",
        minX: DOOR_HALF,
        maxX: DOOR_HALF + DOOR_LEAF_W,
        minZ: hd - t * 0.5,
        maxZ: hd + t * 1.3,
      }
    );
  }

  // Rear sliding door — closed blocks gap; open parks over right wall panel
  if (!backOpen) {
    boxes.push({
      type: "box",
      minX: -BACK_DOOR_HALF,
      maxX: BACK_DOOR_HALF,
      minZ: -hd - t,
      maxZ: -hd + t,
    });
  } else {
    // Slid open to the right, overlapping the back-right wall segment
    boxes.push({
      type: "box",
      minX: BACK_DOOR_HALF,
      maxX: BACK_DOOR_HALF + BACK_DOOR_W,
      minZ: -hd - t * 1.5,
      maxZ: -hd - t * 0.3,
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
 */
function BarnFrontSlideLeaf({ side, doorState }) {
  const groupRef = useRef();
  const white = COLORS.white;
  const z = BARN_DOOR_Z + 0.1;
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
  });

  return (
    <group ref={groupRef} position={[closedX, DOOR_LEAF_H / 2 + 0.12, z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[DOOR_LEAF_W, DOOR_LEAF_H, 0.16]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
      {/* Vertical planks */}
      {[-1.4, -0.45, 0.45, 1.4].map((ox, i) => (
        <mesh key={i} position={[ox, 0, 0.09]}>
          <boxGeometry args={[0.08, DOOR_LEAF_H - 0.25, 0.04]} />
          <meshToonMaterial color={COLORS.wood} />
        </mesh>
      ))}
      {/* White cross braces */}
      <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0, 0.1]}>
        <boxGeometry args={[DOOR_LEAF_W * 0.95, 0.16, 0.05]} />
        <meshToonMaterial color={white} />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]} position={[0, 0, 0.1]}>
        <boxGeometry args={[DOOR_LEAF_W * 0.95, 0.16, 0.05]} />
        <meshToonMaterial color={white} />
      </mesh>
      {/* Horizontal rails */}
      <mesh position={[0, DOOR_LEAF_H * 0.38, 0.09]}>
        <boxGeometry args={[DOOR_LEAF_W - 0.15, 0.14, 0.05]} />
        <meshToonMaterial color={white} />
      </mesh>
      <mesh position={[0, -DOOR_LEAF_H * 0.38, 0.09]}>
        <boxGeometry args={[DOOR_LEAF_W - 0.15, 0.14, 0.05]} />
        <meshToonMaterial color={white} />
      </mesh>
      {/* Handle toward the meeting edge */}
      <mesh position={[-side * (DOOR_LEAF_W * 0.35), 0, 0.13]} castShadow>
        <boxGeometry args={[0.12, 0.38, 0.1]} />
        <meshToonMaterial color={COLORS.gold} />
      </mesh>
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

/** Sliding barn door on the back wall (slides +X when open) */
function BarnBackSlideDoor({ doorState }) {
  const groupRef = useRef();
  const white = COLORS.white;
  const z = BARN_BACK_Z - 0.1;
  const closedX = 0; // door centered on opening

  useFrame((_, delta) => {
    if (!groupRef.current || !doorState) return;
    const target = doorState.backOpen ? BACK_DOOR_SLIDE : 0;
    const cur = doorState.backSlide ?? 0;
    const next = cur + (target - cur) * Math.min(1, delta * 5);
    doorState.backSlide = Math.abs(next - target) < 0.01 ? target : next;
    groupRef.current.position.x = closedX + doorState.backSlide;
  });

  return (
    <group ref={groupRef} position={[closedX, BACK_DOOR_H / 2 + 0.15, z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[BACK_DOOR_W, BACK_DOOR_H, 0.18]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
      {/* Vertical planks look */}
      {[-1.5, -0.5, 0.5, 1.5].map((ox, i) => (
        <mesh key={i} position={[ox, 0, 0.1]}>
          <boxGeometry args={[0.08, BACK_DOOR_H - 0.2, 0.04]} />
          <meshToonMaterial color={COLORS.wood} />
        </mesh>
      ))}
      {/* Horizontal rails */}
      {[BACK_DOOR_H * 0.28, -BACK_DOOR_H * 0.28].map((oy, i) => (
        <mesh key={`r-${i}`} position={[0, oy, 0.11]}>
          <boxGeometry args={[BACK_DOOR_W - 0.15, 0.12, 0.05]} />
          <meshToonMaterial color={white} />
        </mesh>
      ))}
      {/* Handle */}
      <mesh position={[-BACK_DOOR_HALF + 0.35, 0, 0.14]} castShadow>
        <boxGeometry args={[0.12, 0.35, 0.1]} />
        <meshToonMaterial color={COLORS.gold} />
      </mesh>
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
 * side: -1 left (x = -W/2), +1 right (x = +W/2)
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

  // Z spans for wall columns around the two openings
  const zRanges = [
    { z0: -hd, z1: zA - halfW }, // back end
    { z0: zA + halfW, z1: zB - halfW }, // between windows
    { z0: zB + halfW, z1: hd }, // front end
  ];

  return (
    <group>
      {/* Full-width band below windows */}
      <mesh
        position={[x, winBottom / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[wallT, winBottom, D]} />
        <meshToonMaterial color={red} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      {/* Full-width band above windows */}
      <mesh
        position={[x, (winTop + H) / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[wallT, H - winTop, D]} />
        <meshToonMaterial color={red} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      {/* Vertical wall strips between / beside openings */}
      {zRanges.map(({ z0, z1 }, i) => {
        const len = z1 - z0;
        if (len < 0.05) return null;
        const zc = (z0 + z1) / 2;
        return (
          <mesh
            key={i}
            position={[x, midY, zc]}
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
      {/* Track rail for sliding door */}
      <mesh position={[BACK_DOOR_W * 0.25, BACK_DOOR_H + 0.2, backZ - 0.12]} castShadow>
        <boxGeometry args={[BACK_DOOR_W * 1.6, 0.1, 0.12]} />
        <meshToonMaterial color={COLORS.stoneDark} />
      </mesh>
      <BarnBackSlideDoor doorState={doorState} />

      {/* Left / right walls — openings for 4 large transparent windows */}
      <BarnSideWallWithWindows
        side={-1}
        W={W}
        D={D}
        H={H}
        wallT={wallT}
        red={red}
      />
      <BarnSideWallWithWindows
        side={1}
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
      {/* Track rail for front sliding doors */}
      <mesh
        position={[0, DOOR_LEAF_H + 0.28, frontZ + 0.14]}
        castShadow
      >
        <boxGeometry args={[DOOR_HALF * 2 + FRONT_DOOR_SLIDE * 1.15, 0.1, 0.14]} />
        <meshToonMaterial color={COLORS.stoneDark} />
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

      {/* 4 large white transparent windows (2 per long wall) */}
      <BarnWindow
        position={[-W / 2 - 0.02, BARN_WIN_Y, -BARN_WIN_Z]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <BarnWindow
        position={[-W / 2 - 0.02, BARN_WIN_Y, BARN_WIN_Z]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <BarnWindow
        position={[W / 2 + 0.02, BARN_WIN_Y, -BARN_WIN_Z]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      <BarnWindow
        position={[W / 2 + 0.02, BARN_WIN_Y, BARN_WIN_Z]}
        rotation={[0, -Math.PI / 2, 0]}
      />

      {/* Foundation */}
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[W + 0.4, 0.25, D + 0.4]} />
        <meshToonMaterial color={COLORS.stone} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
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
export const CABIN_YARD = {
  halfW: 11,
  halfD: 10,
  front: 9.5, // fence front past porch/garden
  back: 7.5,
  gateHalf: 1.1,
};
export const CABIN_POS = {
  x: -(BARN_HALF_W + CABIN_GAP + CABIN_YARD.halfW), // -32.5
  z: 0,
};
export const CABIN_YAW = 0;
export const CABIN_W = 14;
export const CABIN_D = 11;
/** Wall eave height — roof peaks above this */
export const CABIN_H = 4.0;
/** Extra height of main roof peak above wall top */
export const CABIN_ROOF_RISE = 2.65;
export const CABIN_DOOR_W = 1.5;
export const CABIN_WALL_T = 0.45;

/** Cabin front door + auto picket gate */
export const CABIN_DOOR_RANGE = 2.8;
export const CABIN_DOOR_OPEN_ANGLE = 1.85; // ~106° open inward
export const CABIN_GATE_OPEN_ANGLE = 1.35;
export const CABIN_GATE_AUTO_RANGE = 3.2;

export function createCabinState() {
  return {
    /** Front door: interact to toggle */
    doorOpen: false,
    doorAngle: 0, // 0 closed → CABIN_DOOR_OPEN_ANGLE
    /** Picket gate: auto-opens when player walks through */
    gateOpen: false,
    gateAngle: 0, // 0 closed → CABIN_GATE_OPEN_ANGLE
    /** Keep gate open briefly after leaving trigger */
    gateHold: 0,
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

/** World position of picket gate center */
export function getCabinGateWorld() {
  return cabinLocalToWorld(0, CABIN_YARD.front);
}

export function distToCabinGate(x, z) {
  const g = getCabinGateWorld();
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
 * True if a point is inside the cabin yard (house + picket fence),
 * with optional margin for tree clearance.
 */
export function isInCabinHomestead(x, z, margin = 2.5) {
  const p = worldToCabinLocal(x, z);
  const y = CABIN_YARD;
  return (
    p.x >= -y.halfW - margin &&
    p.x <= y.halfW + margin &&
    p.z >= -y.back - margin &&
    p.z <= y.front + margin
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
  // Back wall
  boxes.push(cabinWallBox(-hw, hw, -hd - t / 2, -hd + t / 2));
  // Left / right outer walls
  boxes.push(cabinWallBox(-hw - t / 2, -hw + t / 2, -hd, hd));
  boxes.push(cabinWallBox(hw - t / 2, hw + t / 2, -hd, hd));
  // Interior partition (main ↔ bedroom), gap for doorway
  const pz = -0.5;
  boxes.push(cabinWallBox(-hw + 0.2, -0.7, pz - t / 2, pz + t / 2));
  boxes.push(cabinWallBox(0.7, hw - 0.2, pz - t / 2, pz + t / 2));
  // Chimney mass (right-back exterior)
  boxes.push(cabinWallBox(hw - 0.2, hw + 1.1, -hd + 0.3, -hd + 1.7));

  return boxes;
}

/**
 * Thin picket-fence colliders around the cabin yard.
 * Gate gap opens when auto-gate is swung open.
 */
export function getCabinYardColliders(cabinState) {
  const y = CABIN_YARD;
  const boxes = [];
  // Front fence left / right of gate (local +Z)
  boxes.push(
    cabinWallBox(-y.halfW, -y.gateHalf, y.front - 0.08, y.front + 0.08, 0.08)
  );
  boxes.push(
    cabinWallBox(y.gateHalf, y.halfW, y.front - 0.08, y.front + 0.08, 0.08)
  );
  // Closed gate blocks the opening
  const gateClosed =
    !cabinState?.gateOpen && (cabinState?.gateAngle ?? 0) < 0.2;
  if (gateClosed) {
    boxes.push(
      cabinWallBox(
        -y.gateHalf,
        y.gateHalf,
        y.front - 0.08,
        y.front + 0.08,
        0.08
      )
    );
  }
  // Back
  boxes.push(
    cabinWallBox(-y.halfW, y.halfW, -y.back - 0.08, -y.back + 0.08, 0.08)
  );
  // Sides
  boxes.push(
    cabinWallBox(-y.halfW - 0.08, -y.halfW + 0.08, -y.back, y.front, 0.08)
  );
  boxes.push(
    cabinWallBox(y.halfW - 0.08, y.halfW + 0.08, -y.back, y.front, 0.08)
  );
  return boxes;
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
 * Western log cabin — hollow shell, 2 rooms (main + bedroom),
 * white transparent windows, openable front door, porch + chimney.
 */
function LogCabin({ position = [0, 0, 0], rotation = 0, cabinState }) {
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
  const partZ = -0.5; // interior partition
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
            {/* Back wall — full, but window hole mid */}
            {isWinRow ? (
              <>
                <LogCourse
                  y={y}
                  length={(W - 1.5) / 2}
                  depth={t}
                  z={backZ}
                  x={-(W + 1.5) / 4}
                  tone={i + 1}
                />
                <LogCourse
                  y={y}
                  length={(W - 1.5) / 2}
                  depth={t}
                  z={backZ}
                  x={(W + 1.5) / 4}
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

      {/* === Interior partition (bedroom / main) === */}
      <mesh position={[-3.6, H / 2, partZ]} castShadow receiveShadow>
        <boxGeometry args={[W / 2 - 1.1, H - 0.15, 0.24]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[3.6, H / 2, partZ]} castShadow receiveShadow>
        <boxGeometry args={[W / 2 - 1.1, H - 0.15, 0.24]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      {/* Partition lintel */}
      <mesh position={[0, H - 0.4, partZ]} castShadow>
        <boxGeometry args={[1.7, 0.8, 0.24]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>

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
      <CabinWindow
        position={[0, winY, backZ - 0.24]}
        rotation={[0, Math.PI, 0]}
        width={1.8}
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

      {/* === MAIN ROOM furniture (front half) === */}
      <mesh position={[-2.0, 0.75, 1.8]} castShadow>
        <boxGeometry args={[2.0, 0.1, 1.1]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      {[
        [-2.7, 1.4],
        [-1.3, 1.4],
        [-2.7, 2.2],
        [-1.3, 2.2],
      ].map(([x, z], i) => (
        <mesh key={`tl-${i}`} position={[x, 0.38, z]} castShadow>
          <cylinderGeometry args={[0.05, 0.06, 0.7, 5]} />
          <meshToonMaterial color={COLORS.wood} />
        </mesh>
      ))}
      <mesh position={[-2.0, 0.45, 2.75]} castShadow>
        <boxGeometry args={[0.5, 0.12, 0.5]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
      <mesh position={[-2.0, 0.75, 2.9]} castShadow>
        <boxGeometry args={[0.5, 0.55, 0.08]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>
      <mesh position={[-5.2, 0.75, 3.2]} castShadow>
        <boxGeometry args={[1.3, 1.4, 1.0]} />
        <meshToonMaterial color={COLORS.stoneDark} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[-5.2, 0.55, 3.4]}>
        <boxGeometry args={[0.55, 0.4, 0.15]} />
        <meshToonMaterial color="#2a1a10" />
      </mesh>
      <mesh position={[4.5, 1.7, 2.0]} castShadow>
        <boxGeometry args={[1.1, 0.08, 0.4]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
      <mesh position={[4.3, 1.88, 2.0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.24, 6]} />
        <meshToonMaterial color="#c44a3a" />
      </mesh>

      {/* === BEDROOM furniture (back half) === */}
      <mesh position={[2.4, 0.38, -3.0]} castShadow>
        <boxGeometry args={[2.5, 0.38, 1.6]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[2.4, 0.62, -3.0]} castShadow>
        <boxGeometry args={[2.3, 0.2, 1.4]} />
        <meshToonMaterial color="#c8b090" />
      </mesh>
      <mesh position={[1.3, 0.75, -3.0]} castShadow>
        <boxGeometry args={[0.4, 0.22, 0.8]} />
        <meshToonMaterial color="#e8dcc8" />
      </mesh>
      <mesh position={[1.05, 0.95, -3.0]} castShadow>
        <boxGeometry args={[0.14, 1.0, 1.6]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
      <mesh position={[-3.2, 0.42, -3.2]} castShadow>
        <boxGeometry args={[1.3, 0.75, 0.75]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[5.0, 0.42, -3.3]} castShadow>
        <boxGeometry args={[0.65, 0.75, 0.5]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>
      <mesh position={[5.0, 0.9, -3.3]}>
        <cylinderGeometry args={[0.09, 0.11, 0.22, 6]} />
        <meshToonMaterial color="#f0e8d0" />
      </mesh>

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

      {/* Foundation */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[W + 0.5, 0.22, D + 0.5]} />
        <meshToonMaterial color={COLORS.stone} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
    </group>
  );
}

/** Single white picket post + board */
function PicketPanel({ length = 1.2 }) {
  const posts = Math.max(2, Math.ceil(length / 0.45));
  return (
    <group>
      {Array.from({ length: posts }).map((_, i) => {
        const x = -length / 2 + (i / (posts - 1)) * length;
        return (
          <group key={i} position={[x, 0, 0]}>
            <mesh position={[0, 0.55, 0]} castShadow>
              <boxGeometry args={[0.07, 1.1, 0.07]} />
              <meshToonMaterial color={COLORS.white} />
            </mesh>
            {/* Pointed top */}
            <mesh position={[0, 1.18, 0]} castShadow>
              <coneGeometry args={[0.055, 0.16, 4]} />
              <meshToonMaterial color={COLORS.white} />
            </mesh>
          </group>
        );
      })}
      {/* Rails */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[length, 0.06, 0.05]} />
        <meshToonMaterial color={COLORS.white} />
      </mesh>
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[length, 0.06, 0.05]} />
        <meshToonMaterial color={COLORS.white} />
      </mesh>
    </group>
  );
}

/**
 * White waist-high picket fence, stone path to door, flower garden beds.
 * Gate auto-opens when the player walks through (cabinState).
 */
function CabinYard({ cabinState }) {
  const y = CABIN_YARD;
  const frontZ = CABIN_D / 2;
  const white = COLORS.white;
  const leftGateRef = useRef();
  const rightGateRef = useRef();

  useFrame((_, delta) => {
    if (!cabinState) return;
    // Auto open near player (Player sets gateOpen); hold then close
    if (cabinState.gateOpen) {
      cabinState.gateHold = 0.85;
    } else if (cabinState.gateHold > 0) {
      cabinState.gateHold = Math.max(0, cabinState.gateHold - delta);
    }
    const wantOpen = cabinState.gateOpen || cabinState.gateHold > 0;
    const target = wantOpen ? CABIN_GATE_OPEN_ANGLE : 0;
    const cur = cabinState.gateAngle ?? 0;
    const next = cur + (target - cur) * Math.min(1, delta * 7);
    cabinState.gateAngle = Math.abs(next - target) < 0.01 ? target : next;
    if (leftGateRef.current) leftGateRef.current.rotation.y = cabinState.gateAngle;
    if (rightGateRef.current)
      rightGateRef.current.rotation.y = -cabinState.gateAngle;
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

  // Garden flower clusters either side of path
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

  // Fence runs: front L/R, back, left, right
  const segs = [];
  // Front left of gate
  segs.push({
    key: "fl",
    x: (-y.halfW - y.gateHalf) / 2,
    z: y.front,
    rot: 0,
    len: y.halfW - y.gateHalf,
  });
  // Front right of gate
  segs.push({
    key: "fr",
    x: (y.halfW + y.gateHalf) / 2,
    z: y.front,
    rot: 0,
    len: y.halfW - y.gateHalf,
  });
  // Back
  segs.push({
    key: "bk",
    x: 0,
    z: -y.back,
    rot: 0,
    len: y.halfW * 2,
  });
  // Left
  segs.push({
    key: "lf",
    x: -y.halfW,
    z: (y.front - y.back) / 2 - y.back / 2 + y.front / 2 - y.back / 2,
    // center z of side: (-y.back + y.front) / 2
    rot: Math.PI / 2,
    len: y.front + y.back,
  });
  // Right
  segs.push({
    key: "rt",
    x: y.halfW,
    z: (-y.back + y.front) / 2,
    rot: Math.PI / 2,
    len: y.front + y.back,
  });
  // Fix left z to match right
  segs[3].z = (-y.back + y.front) / 2;

  return (
    <group>
      {/* Soft lawn patch for yard */}
      <mesh
        position={[0, 0.025, (-y.back + y.front) / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[y.halfW * 2 - 0.4, y.front + y.back - 0.4]} />
        <meshToonMaterial color="#5aaa3a" />
      </mesh>

      {/* Dirt garden beds flanking path */}
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

      {/* Garden flowers */}
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
      {/* Gate posts */}
      {[-y.gateHalf, y.gateHalf].map((x, i) => (
        <group key={`gp-${i}`} position={[x, 0, y.front]}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[0.12, 1.2, 0.12]} />
            <meshToonMaterial color={white} />
          </mesh>
          <mesh position={[0, 1.28, 0]}>
            <boxGeometry args={[0.16, 0.1, 0.16]} />
            <meshToonMaterial color={white} />
          </mesh>
        </group>
      ))}
      {/* Gate leaves — animate open when player walks through */}
      <group ref={leftGateRef} position={[-y.gateHalf, 0, y.front]}>
        <group position={[y.gateHalf * 0.85, 0, 0]}>
          <PicketPanel length={y.gateHalf * 1.7} />
        </group>
      </group>
      <group ref={rightGateRef} position={[y.gateHalf, 0, y.front]}>
        <group position={[-y.gateHalf * 0.85, 0, 0]}>
          <PicketPanel length={y.gateHalf * 1.7} />
        </group>
      </group>
    </group>
  );
}

/** Cabin + yard (fence, garden, path) as one placed group */
function CabinHomestead({ cabinState }) {
  return (
    <group
      position={[CABIN_POS.x, 0, CABIN_POS.z]}
      rotation={[0, CABIN_YAW, 0]}
    >
      <LogCabin position={[0, 0, 0]} rotation={0} cabinState={cabinState} />
      <CabinYard cabinState={cabinState} />
    </group>
  );
}

export function ValentineTown({ barnDoorState, cabinState }) {
  return (
    <group>
      <Barn position={[0, 0, 0]} rotation={0} doorState={barnDoorState} />
      <CabinHomestead cabinState={cabinState} />
    </group>
  );
}
