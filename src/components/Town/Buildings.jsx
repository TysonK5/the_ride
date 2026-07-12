import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import { COLORS } from "../../materials/colors";

export const BARN_W = 18;
export const BARN_D = 12;
export const BARN_H = 7;
/** Door opening half-width (full opening ~8) */
export const DOOR_HALF = 4;
export const DOOR_LEAF_W = 3.9;
export const BARN_DOOR_RANGE = 4.5;
export const BARN_DOOR_Z = BARN_D / 2; // front face
export const BARN_BACK_Z = -BARN_D / 2; // back face
/** Rear sliding door half-width (opening ~5.2) */
export const BACK_DOOR_HALF = 2.6;
export const BACK_DOOR_W = BACK_DOOR_HALF * 2;
export const BACK_DOOR_H = 4.4;
/** How far the slide door travels when open */
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
    leftAngle: 0,
    rightAngle: 0,
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
    // Closed front doors block the opening
    boxes.push({
      type: "box",
      minX: -DOOR_HALF,
      maxX: DOOR_HALF,
      minZ: hd - t,
      maxZ: hd + t,
    });
  } else {
    // Open leaves swing outward along ±X from hinges — thin blockers outside
    boxes.push(
      {
        type: "box",
        minX: -DOOR_HALF - t,
        maxX: -DOOR_HALF + t,
        minZ: hd,
        maxZ: hd + DOOR_LEAF_W,
      },
      {
        type: "box",
        minX: DOOR_HALF - t,
        maxX: DOOR_HALF + t,
        minZ: hd,
        maxZ: hd + DOOR_LEAF_W,
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

function BarnDoorLeaf({ side, doorState }) {
  // side: -1 left, +1 right
  const groupRef = useRef();
  const hingeX = side * DOOR_HALF;
  const z = BARN_DOOR_Z + 0.08;

  useFrame((_, delta) => {
    if (!groupRef.current || !doorState) return;
    // Left opens outward (+Y rot), right opens outward (-Y rot)
    const target = doorState.open
      ? side < 0
        ? Math.PI / 2
        : -Math.PI / 2
      : 0;
    const key = side < 0 ? "leftAngle" : "rightAngle";
    const cur = doorState[key];
    const next = cur + (target - cur) * Math.min(1, delta * 5);
    doorState[key] = Math.abs(next - target) < 0.01 ? target : next;
    groupRef.current.rotation.y = doorState[key];
  });

  const white = COLORS.white;
  // Leaf extends from hinge toward center when closed (local +X for left door is toward center)
  // Left hinge at -DOOR_HALF: leaf should extend in +X (toward 0)
  // Right hinge at +DOOR_HALF: leaf should extend in -X (toward 0)
  const leafDir = side < 0 ? 1 : -1;
  const leafCenterX = leafDir * (DOOR_LEAF_W / 2);

  return (
    <group ref={groupRef} position={[hingeX, 2.4, z]}>
      <group position={[leafCenterX, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[DOOR_LEAF_W, 4.6, 0.15]} />
          <meshToonMaterial color={COLORS.woodDark} />
          <Outlines color={COLORS.outline} thickness={1.5} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0, 0.1]}>
          <boxGeometry args={[DOOR_LEAF_W + 0.3, 0.18, 0.06]} />
          <meshToonMaterial color={white} />
        </mesh>
        <mesh rotation={[0, 0, -Math.PI / 4]} position={[0, 0, 0.1]}>
          <boxGeometry args={[DOOR_LEAF_W + 0.3, 0.18, 0.06]} />
          <meshToonMaterial color={white} />
        </mesh>
        <mesh position={[0, 2.15, 0.08]}>
          <boxGeometry args={[DOOR_LEAF_W, 0.2, 0.08]} />
          <meshToonMaterial color={white} />
        </mesh>
        <mesh position={[0, -2.15, 0.08]}>
          <boxGeometry args={[DOOR_LEAF_W, 0.2, 0.08]} />
          <meshToonMaterial color={white} />
        </mesh>
      </group>
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
      {/* Floor inside barn */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W - 0.5, D - 0.5]} />
        <meshToonMaterial color={COLORS.dirtDark} />
      </mesh>

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

      {/* Left / right walls */}
      <mesh position={[-W / 2, H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallT, H, D]} />
        <meshToonMaterial color={red} />
        <Outlines color={COLORS.outline} thickness={2.5} />
      </mesh>
      <mesh position={[W / 2, H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[wallT, H, D]} />
        <meshToonMaterial color={red} />
        <Outlines color={COLORS.outline} thickness={2.5} />
      </mesh>

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

      {/* Double barn doors */}
      <BarnDoorLeaf side={-1} doorState={doorState} />
      <BarnDoorLeaf side={1} doorState={doorState} />

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

      {/* Side windows */}
      {[-1, 1].map((side) =>
        [-3, 3].map((zOff, j) => (
          <group
            key={`${side}-${j}`}
            position={[side * (W / 2 + 0.04), 3.2, zOff]}
          >
            <mesh rotation={[0, (side * Math.PI) / 2, 0]}>
              <planeGeometry args={[1.4, 1.4]} />
              <meshToonMaterial color="#87ceeb" />
            </mesh>
            <mesh position={[side * 0.05, 0, 0]}>
              <boxGeometry args={[0.12, 1.6, 1.6]} />
              <meshToonMaterial color={white} />
            </mesh>
          </group>
        ))
      )}

      {/* Foundation */}
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[W + 0.4, 0.25, D + 0.4]} />
        <meshToonMaterial color={COLORS.stone} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
    </group>
  );
}

/** Single-story log cabin */
function LogCabin({ position = [0, 0, 0], rotation = 0 }) {
  const W = 8;
  const D = 6;
  const H = 3.2;
  const logH = 0.38;
  const logRows = Math.floor(H / logH);

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {Array.from({ length: logRows }).map((_, i) => (
        <group key={`fb-${i}`}>
          <mesh
            position={[0, logH / 2 + i * logH, D / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[W + 0.3, logH * 0.92, 0.45]} />
            <meshToonMaterial
              color={i % 2 === 0 ? COLORS.wood : COLORS.woodDark}
            />
            <Outlines color={COLORS.outline} thickness={1} />
          </mesh>
          <mesh
            position={[0, logH / 2 + i * logH, -D / 2]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[W + 0.3, logH * 0.92, 0.45]} />
            <meshToonMaterial
              color={i % 2 === 0 ? COLORS.woodDark : COLORS.wood}
            />
            <Outlines color={COLORS.outline} thickness={1} />
          </mesh>
        </group>
      ))}

      {Array.from({ length: logRows }).map((_, i) => (
        <group key={`lr-${i}`}>
          <mesh
            position={[-W / 2, logH / 2 + i * logH, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.45, logH * 0.92, D]} />
            <meshToonMaterial
              color={i % 2 === 0 ? COLORS.woodDark : COLORS.wood}
            />
            <Outlines color={COLORS.outline} thickness={1} />
          </mesh>
          <mesh
            position={[W / 2, logH / 2 + i * logH, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.45, logH * 0.92, D]} />
            <meshToonMaterial
              color={i % 2 === 0 ? COLORS.wood : COLORS.woodDark}
            />
            <Outlines color={COLORS.outline} thickness={1} />
          </mesh>
        </group>
      ))}

      {Array.from({ length: logRows }).map((_, i) =>
        [
          [-W / 2, -D / 2],
          [W / 2, -D / 2],
          [-W / 2, D / 2],
          [W / 2, D / 2],
        ].map(([x, z], j) => (
          <mesh
            key={`c-${i}-${j}`}
            position={[x, logH / 2 + i * logH, z]}
            castShadow
          >
            <cylinderGeometry args={[0.2, 0.2, 0.9, 6]} />
            <meshToonMaterial color={COLORS.woodDark} />
          </mesh>
        ))
      )}

      <mesh
        position={[0, H + 1.1, D / 4 + 0.1]}
        rotation={[Math.PI / 5.2, 0, 0]}
        castShadow
      >
        <boxGeometry args={[W + 1.4, 0.25, D / 2 + 1]} />
        <meshToonMaterial color={COLORS.roof} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      <mesh
        position={[0, H + 1.1, -D / 4 - 0.1]}
        rotation={[-Math.PI / 5.2, 0, 0]}
        castShadow
      >
        <boxGeometry args={[W + 1.4, 0.25, D / 2 + 1]} />
        <meshToonMaterial color={COLORS.roof} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>

      <mesh position={[0, H + 0.7, 0]} castShadow>
        <boxGeometry args={[0.5, 1.6, D + 0.2]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>

      <mesh position={[0, 1.15, D / 2 + 0.28]} castShadow>
        <boxGeometry args={[1.1, 2.1, 0.12]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1.5} />
      </mesh>
      <mesh position={[0.35, 1.15, D / 2 + 0.36]}>
        <sphereGeometry args={[0.06, 6, 6]} />
        <meshToonMaterial color={COLORS.gold} />
      </mesh>

      {[-2.4, 2.4].map((x, i) => (
        <group key={i} position={[x, 1.8, D / 2 + 0.28]}>
          <mesh>
            <boxGeometry args={[1.1, 1, 0.1]} />
            <meshToonMaterial color="#87ceeb" />
            <Outlines color={COLORS.outline} thickness={1} />
          </mesh>
          <mesh position={[0, 0, 0.06]}>
            <boxGeometry args={[0.06, 1, 0.04]} />
            <meshToonMaterial color={COLORS.woodDark} />
          </mesh>
          <mesh position={[0, 0, 0.06]}>
            <boxGeometry args={[1.1, 0.06, 0.04]} />
            <meshToonMaterial color={COLORS.woodDark} />
          </mesh>
        </group>
      ))}

      <group position={[W / 2 - 0.6, 0, -0.5]}>
        <mesh position={[0, 2.2, 0]} castShadow>
          <boxGeometry args={[1.2, 4.4, 1.2]} />
          <meshToonMaterial color={COLORS.stone} />
          <Outlines color={COLORS.outline} thickness={1.5} />
        </mesh>
        <mesh position={[0, 4.5, 0]} castShadow>
          <boxGeometry args={[1.5, 0.35, 1.5]} />
          <meshToonMaterial color={COLORS.stoneDark} />
          <Outlines color={COLORS.outline} thickness={1} />
        </mesh>
      </group>

      <mesh position={[0, 0.08, D / 2 + 1]} receiveShadow castShadow>
        <boxGeometry args={[3.5, 0.16, 1.6]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      {[-1.4, 1.4].map((x, i) => (
        <mesh key={i} position={[x, 0.9, D / 2 + 1.6]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 1.7, 6]} />
          <meshToonMaterial color={COLORS.woodDark} />
        </mesh>
      ))}
      <mesh position={[0, 1.7, D / 2 + 1.6]} castShadow>
        <boxGeometry args={[3.2, 0.12, 0.12]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
    </group>
  );
}

export function ValentineTown({ barnDoorState }) {
  return (
    <group>
      <Barn position={[0, 0, 0]} rotation={0} doorState={barnDoorState} />
      <LogCabin position={[-22, 0, 14]} rotation={Math.PI / 6} />
    </group>
  );
}
