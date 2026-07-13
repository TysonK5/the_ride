import { Outlines } from "@react-three/drei";
import { COLORS } from "../../materials/colors";

/**
 * Wooden fishing dock extending from the south shore into the lake,
 * with a chair at the far end for sit-and-fish.
 *
 * Lake: center (0, -38), rx=28, rz=18 → south rim ≈ z=-20.
 */
export const DOCK = {
  x: 11,
  /** Shore end (outside / at rim) — higher Z, includes approach ramp */
  zShore: -17.4,
  /** Tip over open water — lower Z */
  zEnd: -30.2,
  halfW: 1.35,
  /** Top of deck boards */
  deckY: 0.34,
  /** Interact radius around the chair */
  sitRange: 2.4,
  /** Chair placement at the tip — backrest toward shore (+Z) */
  chair: {
    x: 11,
    z: -29.0,
    yaw: 0,
  },
  /**
   * Seat cushion top height above the dock deck (chair seat mesh center 0.42 + half thickness).
   * Used to place hips ON the seat rather than inside it.
   */
  seatTopAboveDeck: 0.47,
  /**
   * Player snap while seated.
   * Feet stay on the deck; body/legs pose lifts the pelvis onto the seat.
   * Mesh faces local +Z; water is −Z → yaw = π.
   * Z is slightly water-side of the chair center so the back clears the backrest.
   */
  sit: {
    x: 11,
    z: -29.12,
    yaw: Math.PI,
  },
};

export function isOnDock(x, z, margin = 0.2) {
  const { x: cx, zShore, zEnd, halfW } = DOCK;
  // Extra shore-side margin so the ramp stays walkable
  const zMin = Math.min(zShore, zEnd) - margin;
  const zMax = Math.max(zShore, zEnd) + 0.9 + margin;
  return (
    x >= cx - halfW - margin &&
    x <= cx + halfW + margin &&
    z >= zMin &&
    z <= zMax
  );
}

export function distToDockChair(px, pz) {
  const dx = px - DOCK.chair.x;
  const dz = pz - DOCK.chair.z;
  return Math.hypot(dx, dz);
}

export function canSitAtDockChair(px, pz, mounted, holdingFlower, busy) {
  if (mounted || holdingFlower || busy) return false;
  return distToDockChair(px, pz) <= DOCK.sitRange;
}

/** Plank count along the length */
const PLANK_COUNT = 14;

export function Dock() {
  const { x, zShore, zEnd, halfW, deckY } = DOCK;
  const length = Math.abs(zShore - zEnd);
  const midZ = (zShore + zEnd) / 2;
  const plankLen = length / PLANK_COUNT;
  const deckW = halfW * 2;

  const planks = [];
  for (let i = 0; i < PLANK_COUNT; i++) {
    const t = (i + 0.5) / PLANK_COUNT;
    const pz = zShore + (zEnd - zShore) * t;
    planks.push(
      <mesh
        key={`plank-${i}`}
        position={[x, deckY - 0.04, pz]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[deckW - 0.08, 0.08, plankLen * 0.92]} />
        <meshToonMaterial
          color={i % 2 === 0 ? COLORS.wood : COLORS.woodLight}
        />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>
    );
  }

  // Support posts along both sides (into the water)
  const posts = [];
  const postZs = [0.12, 0.35, 0.55, 0.75, 0.92].map(
    (t) => zShore + (zEnd - zShore) * t
  );
  for (const pz of postZs) {
    for (const side of [-1, 1]) {
      const px = x + side * (halfW - 0.12);
      posts.push(
        <group key={`post-${pz}-${side}`} position={[px, 0, pz]}>
          <mesh position={[0, deckY * 0.5 - 0.15, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.11, deckY + 0.45, 6]} />
            <meshToonMaterial color={COLORS.woodDark} />
            <Outlines color={COLORS.outline} thickness={0.9} />
          </mesh>
        </group>
      );
    }
  }

  // Side stringers under the planks
  const stringers = [-halfW + 0.18, halfW - 0.18].map((ox) => (
    <mesh
      key={`str-${ox}`}
      position={[x + ox, deckY - 0.12, midZ]}
      castShadow
    >
      <boxGeometry args={[0.14, 0.12, length]} />
      <meshToonMaterial color={COLORS.woodDark} />
    </mesh>
  ));

  // Simple side rails
  const railH = deckY + 0.55;
  const rails = [-halfW + 0.05, halfW - 0.05].map((ox) => (
    <group key={`rail-${ox}`}>
      <mesh position={[x + ox, railH, midZ]} castShadow>
        <boxGeometry args={[0.08, 0.08, length * 0.96]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={0.7} />
      </mesh>
      {[0.2, 0.5, 0.8].map((t) => {
        const pz = zShore + (zEnd - zShore) * t;
        return (
          <mesh
            key={`bal-${ox}-${t}`}
            position={[x + ox, deckY + 0.28, pz]}
            castShadow
          >
            <boxGeometry args={[0.07, 0.5, 0.07]} />
            <meshToonMaterial color={COLORS.woodDark} />
          </mesh>
        );
      })}
    </group>
  ));

  return (
    <group>
      {/* Shore ramp / approach pad */}
      <mesh
        position={[x, deckY * 0.42, zShore + 0.65]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[deckW + 0.25, deckY * 0.85, 1.4]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>

      {stringers}
      {posts}
      {planks}
      {rails}

      {/* End bumper beam */}
      <mesh position={[x, deckY + 0.02, zEnd]} castShadow>
        <boxGeometry args={[deckW + 0.1, 0.14, 0.2]} />
        <meshToonMaterial color={COLORS.woodDark} />
        <Outlines color={COLORS.outline} thickness={0.9} />
      </mesh>

      <DockChair
        position={[DOCK.chair.x, deckY, DOCK.chair.z]}
        rotation={[0, DOCK.chair.yaw, 0]}
      />
    </group>
  );
}

function DockChair({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Seat — open space in front of backrest for the player */}
      <mesh position={[0, 0.42, -0.02]} castShadow receiveShadow>
        <boxGeometry args={[0.78, 0.1, 0.72]} />
        <meshToonMaterial color={COLORS.wood} />
        <Outlines color={COLORS.outline} thickness={1.1} />
      </mesh>
      {/* Thin cushion pad on top so the sit surface reads clearly */}
      <mesh position={[0, 0.48, -0.04]} castShadow receiveShadow>
        <boxGeometry args={[0.72, 0.04, 0.62]} />
        <meshToonMaterial color={COLORS.woodLight} />
      </mesh>
      {/* Backrest toward shore (+Z); pushed back so sitter clears it */}
      <mesh position={[0, 0.82, 0.36]} castShadow>
        <boxGeometry args={[0.78, 0.78, 0.08]} />
        <meshToonMaterial color={COLORS.woodLight} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      {/* Legs */}
      {[
        [-0.3, 0.2, -0.28],
        [0.3, 0.2, -0.28],
        [-0.3, 0.2, 0.28],
        [0.3, 0.2, 0.28],
      ].map(([lx, ly, lz], i) => (
        <mesh key={i} position={[lx, ly, lz]} castShadow>
          <boxGeometry args={[0.08, 0.4, 0.08]} />
          <meshToonMaterial color={COLORS.woodDark} />
        </mesh>
      ))}
      {/* Armrests — wide enough that sitter sits between them */}
      <mesh position={[-0.42, 0.6, -0.02]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.66]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
      <mesh position={[0.42, 0.6, -0.02]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.66]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
      {/* Armrest posts */}
      {[-0.42, 0.42].map((ox) => (
        <mesh key={`ap-${ox}`} position={[ox, 0.52, 0.28]} castShadow>
          <boxGeometry args={[0.07, 0.22, 0.07]} />
          <meshToonMaterial color={COLORS.woodDark} />
        </mesh>
      ))}
    </group>
  );
}
