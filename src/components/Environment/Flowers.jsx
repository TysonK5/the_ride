import { Outlines } from "@react-three/drei";
import { COLORS } from "../../materials/colors";
import { isInLake } from "../../systems/colliders";
import { isInCabinBuilding } from "../Town/Buildings";

export const FLOWER_PICK_RANGE = 2.2;
export const INITIAL_FLOWER_COUNT = 80;
/** Persist pick / plant positions across reloads */
const FLOWER_STORAGE_KEY = "the-ride-flowers-v1";

/** 20 distinct flower species (color / petal style / scale) */
export const FLOWER_TYPES = [
  { id: 0, name: "Prairie Rose", petal: "#e85a6a", center: "#f0c040", petals: 6, scale: 1 },
  { id: 1, name: "Bluebonnet", petal: "#3a6ec8", center: "#f5e6a0", petals: 5, scale: 0.95 },
  { id: 2, name: "Goldenrod", petal: "#f0b429", center: "#c49020", petals: 8, scale: 1.1 },
  { id: 3, name: "Lavender", petal: "#9a7ad4", center: "#f0e8ff", petals: 6, scale: 1.05 },
  { id: 4, name: "Daisy", petal: "#f5f0e8", center: "#f0c040", petals: 8, scale: 1 },
  { id: 5, name: "Poppy", petal: "#d43030", center: "#2a1a0a", petals: 5, scale: 1.05 },
  { id: 6, name: "Sunburst", petal: "#ff9a20", center: "#8a4010", petals: 10, scale: 1.15 },
  { id: 7, name: "Violet", petal: "#6a3ab0", center: "#e8d0ff", petals: 5, scale: 0.9 },
  { id: 8, name: "Coral Bell", petal: "#f08070", center: "#fff0e0", petals: 6, scale: 0.95 },
  { id: 9, name: "Mint Bloom", petal: "#60d4a0", center: "#f0fff8", petals: 7, scale: 1 },
  { id: 10, name: "Sky Petal", petal: "#7ec8f0", center: "#ffffff", petals: 6, scale: 1 },
  { id: 11, name: "Marigold", petal: "#e8a020", center: "#6a3010", petals: 9, scale: 1.05 },
  { id: 12, name: "Blush", petal: "#f0a0b8", center: "#ffe0e8", petals: 5, scale: 0.95 },
  { id: 13, name: "Indigo", petal: "#3040a0", center: "#c0c8f0", petals: 6, scale: 1 },
  { id: 14, name: "Buttercup", petal: "#f5d030", center: "#d4a020", petals: 5, scale: 0.85 },
  { id: 15, name: "Crimson", petal: "#a01828", center: "#f0c040", petals: 7, scale: 1.1 },
  { id: 16, name: "Sage Star", petal: "#80a060", center: "#e8f0d0", petals: 6, scale: 1 },
  { id: 17, name: "Peach Bell", petal: "#f0b888", center: "#fff5e8", petals: 5, scale: 0.95 },
  { id: 18, name: "Midnight", petal: "#2a2048", center: "#d0a0e0", petals: 8, scale: 1.05 },
  { id: 19, name: "Snowdrop", petal: "#f8f8ff", center: "#90c0e0", petals: 6, scale: 0.9 },
];

function rand(i, salt = 0) {
  const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Barn / cabin building / water — no spawn or plant here.
 * Horse pen, yard lawn, and dirt garden left of the house ARE plantable.
 */
export function isBlockedPlantSpot(x, z) {
  // Barn W=18 D=12 at origin — pad a little
  if (Math.abs(x) < 10 && Math.abs(z) < 7.5) return true;
  // Inside the log cabin only (garden + yard stay open for planting)
  if (isInCabinBuilding(x, z, 0.9)) return true;
  // Lake
  if (isInLake(x, z, 2)) return true;
  return false;
}

function spawnPosition(i) {
  // Prefer flats around ranch, avoid blocked zones
  for (let attempt = 0; attempt < 40; attempt++) {
    const a = rand(i, attempt) * Math.PI * 2;
    const r = 12 + rand(i, attempt + 50) * 170;
    const x = Math.cos(a) * r + (rand(i, attempt + 3) - 0.5) * 30;
    const z = Math.sin(a) * r + (rand(i, attempt + 7) - 0.5) * 30;
    if (!isBlockedPlantSpot(x, z) && Math.abs(x) < 190 && Math.abs(z) < 190) {
      return { x, z };
    }
  }
  return { x: 25 + rand(i, 1) * 30, z: 25 + rand(i, 2) * 30 };
}

function defaultFlowerInstances() {
  const instances = [];
  for (let i = 0; i < INITIAL_FLOWER_COUNT; i++) {
    const typeId = i % FLOWER_TYPES.length;
    const { x, z } = spawnPosition(i + 11);
    instances.push({
      id: i,
      typeId,
      x,
      z,
      rot: rand(i, 9) * Math.PI * 2,
      scale: 0.85 + rand(i, 4) * 0.4,
      active: true,
    });
  }
  return instances;
}

/** Load flower positions from localStorage (moved / planted flowers). */
export function loadFlowers() {
  try {
    const raw = localStorage.getItem(FLOWER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.instances)) return null;
    const instances = parsed.instances
      .filter(
        (f) =>
          f &&
          typeof f.x === "number" &&
          typeof f.z === "number" &&
          typeof f.typeId === "number"
      )
      .map((f, i) => ({
        id: typeof f.id === "number" ? f.id : i,
        typeId: Math.max(
          0,
          Math.min(FLOWER_TYPES.length - 1, Math.floor(f.typeId))
        ),
        x: f.x,
        z: f.z,
        rot: typeof f.rot === "number" ? f.rot : 0,
        scale:
          typeof f.scale === "number" ? Math.max(0.5, Math.min(2, f.scale)) : 1,
        active: f.active !== false,
      }));
    if (instances.length === 0) return null;
    return {
      heldTypeId:
        typeof parsed.heldTypeId === "number" ? parsed.heldTypeId : null,
      instances,
      nextId:
        typeof parsed.nextId === "number"
          ? parsed.nextId
          : Math.max(...instances.map((f) => f.id), 0) + 1,
    };
  } catch {
    return null;
  }
}

/** Save active flower placements + held flower to localStorage. */
export function saveFlowers(flowerState) {
  if (!flowerState) return false;
  try {
    const active = flowerState.instances.filter((f) => f.active);
    const payload = {
      heldTypeId: flowerState.heldTypeId,
      nextId: flowerState.nextId ?? Date.now(),
      instances: active.map((f) => ({
        id: f.id,
        typeId: f.typeId,
        x: Math.round(f.x * 100) / 100,
        z: Math.round(f.z * 100) / 100,
        rot: Math.round((f.rot ?? 0) * 1000) / 1000,
        scale: Math.round((f.scale ?? 1) * 100) / 100,
        active: true,
      })),
    };
    localStorage.setItem(FLOWER_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function createFlowerState() {
  const saved = loadFlowers();
  if (saved) {
    return {
      heldTypeId: saved.heldTypeId,
      instances: saved.instances,
      nextId: saved.nextId,
      version: 0,
    };
  }
  const instances = defaultFlowerInstances();
  return {
    /** Held flower type id, or null */
    heldTypeId: null,
    instances,
    nextId: INITIAL_FLOWER_COUNT + 1,
    /** Bump to force React re-render after pick/plant */
    version: 0,
  };
}

/** Allocate a stable id for a newly planted flower */
export function nextFlowerId(flowerState) {
  const id = flowerState.nextId ?? Date.now();
  flowerState.nextId = id + 1;
  return id;
}

export function getFlowerType(typeId) {
  return FLOWER_TYPES[typeId] ?? FLOWER_TYPES[0];
}

export function findNearestFlower(flowerState, x, z, maxDist = FLOWER_PICK_RANGE) {
  let best = null;
  let bestD = maxDist;
  for (const f of flowerState.instances) {
    if (!f.active) continue;
    const d = Math.hypot(f.x - x, f.z - z);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best ? { flower: best, dist: bestD } : null;
}

/** Low-poly stylized flower by type */
export function FlowerMesh({ typeId, scale = 1 }) {
  const t = getFlowerType(typeId);
  const s = scale * t.scale;
  const petalCount = t.petals;
  const petalLen = 0.12 * s;
  const petalW = 0.07 * s;

  return (
    <group scale={s}>
      {/* Stem */}
      <mesh position={[0, 0.18, 0]} castShadow>
        <capsuleGeometry args={[0.015, 0.28, 3, 5]} />
        <meshToonMaterial color="#3a7a3a" />
      </mesh>
      {/* Leaf */}
      <mesh position={[0.06, 0.14, 0]} rotation={[0, 0, 0.8]} castShadow>
        <sphereGeometry args={[0.05, 5, 4]} />
        <meshToonMaterial color="#4a9a4a" />
      </mesh>
      {/* Center */}
      <mesh position={[0, 0.36, 0]} castShadow>
        <sphereGeometry args={[0.045, 6, 5]} />
        <meshToonMaterial color={t.center} />
        <Outlines color={COLORS.outline} thickness={0.6} />
      </mesh>
      {/* Petals */}
      {Array.from({ length: petalCount }).map((_, i) => {
        const a = (i / petalCount) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[
              Math.cos(a) * 0.07,
              0.36,
              Math.sin(a) * 0.07,
            ]}
            rotation={[0.4, a, 0]}
            castShadow
          >
            <sphereGeometry args={[petalW, 5, 4]} />
            <meshToonMaterial color={t.petal} />
          </mesh>
        );
      })}
    </group>
  );
}

export function Flowers({ flowerState }) {
  // Re-render when version changes (parent passes new version prop via key or state)
  const list = flowerState.instances;

  return (
    <group userData={{ ignoreCameraCollision: true }}>
      {list.map(
        (f) =>
          f.active && (
            <group
              key={f.id}
              position={[f.x, 0, f.z]}
              rotation={[0, f.rot, 0]}
            >
              <FlowerMesh typeId={f.typeId} scale={f.scale} />
            </group>
          )
      )}
    </group>
  );
}

/**
 * Flower gripped in the left hand (parent at hand center: origin of this group).
 * Stem rests in the palm; bloom points up and slightly outward.
 */
export function HeldFlowerPreview({ typeId }) {
  if (typeId == null) return null;
  return (
    <group
      // Hand-local: stem base just below palm, bloom above knuckles
      position={[0.04, -0.06, 0.05]}
      // Tilt so it reads as carried, not planted in the ground
      rotation={[0.35, 0.55, 0.85]}
    >
      <FlowerMesh typeId={typeId} scale={0.95} />
    </group>
  );
}
