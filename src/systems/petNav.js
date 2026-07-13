/**
 * Lightweight waypoint pathfinding so pets walk around the barn & cabin
 * on the way to food bowls (instead of bee-lining through walls).
 *
 * Pets know every ranch door/gate location and can push them open or closed
 * while pathing or following — same idea as the player's push-through gates.
 *
 * Cabin constants duplicated (avoid import cycle with Buildings → PetBowls).
 */

import {
  GATE_MID_X,
  GATE_Z,
  GATE_WIDTH,
  GATE_HINGE_X,
  GATE_PUSH_CLOSE_RANGE,
  PEN,
} from "../components/Environment/Fence";

/** Barn footprint (solid for pathing except door slots) */
const BARN = { hw: 9.2, hd: 6.2 };
/** Front door half-width opening */
const FRONT_DOOR = 4.0;
/** Right-wall pen door half-width (always open — no leaf) */
const PEN_DOOR = 3.1;
/** Rear sliding door half-width */
const BACK_DOOR = 2.6;

/** Cabin building footprint (world), padded — matches Buildings.jsx */
const CABIN_POS = { x: -32.5, z: 0 };
const CABIN_W = 14;
const CABIN_D = 11;
/** Matches Buildings CABIN_YARD (patio extended back) */
const CABIN_YARD = {
  halfW: 11,
  leftW: 23.5,
  front: 9.5,
  back: CABIN_D / 2 + CABIN_D * 0.5 + 1.5, // ~12.5
  gateHalf: 1.1,
};
const CABIN_PAD = 1.2;
const CABIN_DOOR_HALF = 0.75;
/** Garden gate local X (cabin-local ≈ world when yaw=0) */
const GARDEN_GATE_X = CABIN_POS.x - 15;

const OPEN_RANGE_BARN = 5.0;
const OPEN_RANGE_GATE = 3.4;
const OPEN_RANGE_CABIN_DOOR = 3.0;
const OPEN_RANGE_CABIN_GATE = 3.6;

/**
 * All ranch doors & gates pets know about (world XZ).
 * `kind` drives open/close handling in petPushAccess.
 *
 * kind:
 *  - barnFront / barnBack — sliding barn doors
 *  - penGate — horse pen swing gate
 *  - cabinFront / cabinBack — cabin hinged doors
 *  - swingGate — cabin yard picket gates (main / garden)
 *  - alwaysOpen — pen doorway (no leaf; nav only)
 */
export const PET_ACCESS_POINTS = [
  {
    id: "barnFront",
    name: "Barn front doors",
    kind: "barnFront",
    x: 0,
    z: BARN.hd,
    range: OPEN_RANGE_BARN,
    // Approach nodes (outside → inside)
    out: { x: 0, z: BARN.hd + 1.6 },
    inn: { x: 0, z: BARN.hd - 2.2 },
  },
  {
    id: "barnBack",
    name: "Barn rear sliding door",
    kind: "barnBack",
    x: 0,
    z: -BARN.hd,
    range: OPEN_RANGE_BARN,
    out: { x: 0, z: -BARN.hd - 1.6 },
    inn: { x: 0, z: -BARN.hd + 2.2 },
  },
  {
    id: "penDoorway",
    name: "Barn → pen doorway (always open)",
    kind: "alwaysOpen",
    x: BARN.hw,
    z: 0,
    range: 3.0,
    out: { x: BARN.hw + 2.2, z: 0 },
    inn: { x: BARN.hw - 2.0, z: 0 },
  },
  {
    id: "penGate",
    name: "Horse pen gate",
    kind: "penGate",
    x: GATE_MID_X,
    z: GATE_Z,
    range: OPEN_RANGE_GATE,
    out: { x: GATE_MID_X, z: GATE_Z + 2.2 },
    inn: { x: GATE_MID_X, z: GATE_Z - 2.2 },
  },
  {
    id: "cabinFront",
    name: "Cabin front door",
    kind: "cabinFront",
    x: CABIN_POS.x,
    z: CABIN_POS.z + CABIN_D / 2,
    range: OPEN_RANGE_CABIN_DOOR,
    out: { x: CABIN_POS.x, z: CABIN_POS.z + CABIN_D / 2 + 1.4 },
    inn: { x: CABIN_POS.x, z: CABIN_POS.z + CABIN_D / 2 - 1.6 },
  },
  {
    id: "cabinBack",
    name: "Cabin patio door",
    kind: "cabinBack",
    x: CABIN_POS.x,
    z: CABIN_POS.z - CABIN_D / 2,
    range: OPEN_RANGE_CABIN_DOOR,
    out: { x: CABIN_POS.x, z: CABIN_POS.z - CABIN_D / 2 - 1.4 },
    inn: { x: CABIN_POS.x, z: CABIN_POS.z - CABIN_D / 2 + 1.6 },
  },
  {
    id: "cabinMainGate",
    name: "Cabin main path gate",
    kind: "swingGate",
    gateKey: "mainGate",
    face: "front",
    x: CABIN_POS.x,
    z: CABIN_POS.z + CABIN_YARD.front,
    range: OPEN_RANGE_CABIN_GATE,
    halfW: CABIN_YARD.gateHalf,
    out: { x: CABIN_POS.x, z: CABIN_POS.z + CABIN_YARD.front + 2.2 },
    inn: { x: CABIN_POS.x, z: CABIN_POS.z + CABIN_YARD.front - 2.2 },
  },
  {
    id: "gardenFront",
    name: "Garden front gate",
    kind: "swingGate",
    gateKey: "gardenFront",
    face: "front",
    x: GARDEN_GATE_X,
    z: CABIN_POS.z + CABIN_YARD.front,
    range: OPEN_RANGE_CABIN_GATE,
    halfW: CABIN_YARD.gateHalf,
    out: { x: GARDEN_GATE_X, z: CABIN_POS.z + CABIN_YARD.front + 2.2 },
    inn: { x: GARDEN_GATE_X, z: CABIN_POS.z + CABIN_YARD.front - 2.2 },
  },
  {
    id: "gardenBack",
    name: "Garden back gate",
    kind: "swingGate",
    gateKey: "gardenBack",
    face: "back",
    x: GARDEN_GATE_X,
    z: CABIN_POS.z - CABIN_YARD.back,
    range: OPEN_RANGE_CABIN_GATE,
    halfW: CABIN_YARD.gateHalf,
    out: { x: GARDEN_GATE_X, z: CABIN_POS.z - CABIN_YARD.back - 2.2 },
    inn: { x: GARDEN_GATE_X, z: CABIN_POS.z - CABIN_YARD.back + 2.2 },
  },
];

/**
 * Static nav graph nodes around ranch structures + barn interior + cabin.
 * Portal approach nodes come from PET_ACCESS_POINTS.
 */
const STATIC_NODES = [
  // Barn exterior ring
  { id: "bf", x: 0, z: 9.5 },
  { id: "bb", x: 0, z: -9.5 },
  { id: "bl", x: -11.5, z: 0 },
  { id: "br", x: 12.5, z: 0 },
  { id: "bnw", x: -11.5, z: 9.5 },
  { id: "bne", x: 12.5, z: 9.5 },
  { id: "bsw", x: -11.5, z: -9.5 },
  { id: "bse", x: 12.5, z: -9.5 },
  // Aisle / bowls (inside barn)
  { id: "bail", x: 2.5, z: 2.5 },
  { id: "food", x: 4.65, z: 3.4 },
  { id: "water", x: 4.65, z: 1.9 },
  { id: "pen_mid", x: 15, z: 0 },
  // Cabin exterior ring
  { id: "c_e", x: CABIN_POS.x + CABIN_YARD.halfW + 2.5, z: 0 },
  { id: "c_w", x: CABIN_POS.x - (CABIN_YARD.leftW ?? 23.5) - 2.5, z: 0 },
  { id: "c_n", x: CABIN_POS.x, z: CABIN_YARD.front + 2.5 },
  { id: "c_s", x: CABIN_POS.x, z: -CABIN_YARD.back - 2.5 },
  { id: "c_ne", x: CABIN_POS.x + 14, z: CABIN_YARD.front + 2 },
  { id: "c_nw", x: CABIN_POS.x - 20, z: CABIN_YARD.front + 2 },
  { id: "c_se", x: CABIN_POS.x + 14, z: -CABIN_YARD.back - 2 },
  { id: "c_sw", x: CABIN_POS.x - 20, z: -CABIN_YARD.back - 2 },
  // Cabin interior + patio
  { id: "cabin_main", x: CABIN_POS.x, z: CABIN_POS.z + 1.8 },
  { id: "cabin_bed", x: CABIN_POS.x + 1.5, z: CABIN_POS.z - 2.8 },
  { id: "patio", x: CABIN_POS.x, z: CABIN_POS.z - CABIN_D / 2 - 2.8 },
  // Mid ranch connectors
  { id: "mid", x: -16, z: 12 },
  { id: "mid2", x: -16, z: -10 },
  { id: "yard", x: 8, z: 14 },
  { id: "yard2", x: -8, z: 14 },
  // Portal approaches from registry
  ...PET_ACCESS_POINTS.flatMap((p) => [
    { id: `${p.id}_out`, x: p.out.x, z: p.out.z },
    { id: `${p.id}_in`, x: p.inn.x, z: p.inn.z },
  ]),
];

function inBarnFootprint(x, z, pad = 0) {
  return Math.abs(x) <= BARN.hw + pad && Math.abs(z) <= BARN.hd + pad;
}

/**
 * True if point is in solid barn mass (not freestanding interior / door gaps).
 * Door gaps stay open in nav — pets open physical doors on approach.
 */
function inBarnSolid(x, z, r = 0.4) {
  if (!inBarnFootprint(x, z, r)) return false;
  const interior =
    Math.abs(x) < BARN.hw - 0.55 && Math.abs(z) < BARN.hd - 0.55;
  if (interior) {
    if (x < -5.2 && Math.abs(z) < BARN.hd - 0.5) return true;
    return false;
  }
  if (z > BARN.hd - 1.2 && Math.abs(x) < FRONT_DOOR - 0.2) return false;
  if (z < -BARN.hd + 1.2 && Math.abs(x) < BACK_DOOR - 0.15) return false;
  if (x > BARN.hw - 1.2 && Math.abs(z) < PEN_DOOR - 0.15) return false;
  return true;
}

/** Cabin mass with front/back door gaps as nav portals */
function inCabinSolid(x, z, r = 0.45) {
  const hw = CABIN_W / 2 + CABIN_PAD + r;
  const hd = CABIN_D / 2 + CABIN_PAD + r;
  const dx = x - CABIN_POS.x;
  const dz = z - CABIN_POS.z;
  if (Math.abs(dx) > hw || Math.abs(dz) > hd) return false;

  // Interior free (hollow cabin); thin partition treated soft for pets
  const interior =
    Math.abs(dx) < CABIN_W / 2 - 0.35 && Math.abs(dz) < CABIN_D / 2 - 0.35;
  if (interior) return false;

  // Wall band: allow front & back door openings
  if (dz > CABIN_D / 2 - 1.0 && Math.abs(dx) < CABIN_DOOR_HALF + 0.15)
    return false;
  if (dz < -CABIN_D / 2 + 1.0 && Math.abs(dx) < CABIN_DOOR_HALF + 0.15)
    return false;
  return true;
}

function inPenFenceSolid(x, z, r = 0.4) {
  const t = 0.28 + r;
  const { x0, x1, z0, z1 } = PEN;
  if (x >= x0 - t && x <= x1 + t && Math.abs(z - z0) <= t) return true;
  if (z >= z0 - t && z <= z1 + t && Math.abs(x - x1) <= t) return true;
  if (x >= x0 - t && x <= x1 + t && Math.abs(z - z1) <= t) {
    if (Math.abs(x - GATE_MID_X) < GATE_WIDTH * 0.52) return false;
    return true;
  }
  return false;
}

function inCabinYardFenceSolid(x, z, r = 0.35) {
  const leftW = CABIN_YARD.leftW ?? 23.5;
  const halfW = CABIN_YARD.halfW;
  const front = CABIN_YARD.front;
  const back = CABIN_YARD.back;
  const gh = CABIN_YARD.gateHalf;
  const t = 0.2 + r;
  const cx = CABIN_POS.x;
  const cz = CABIN_POS.z;

  const minX = cx - leftW;
  const maxX = cx + halfW;
  const minZ = cz - back;
  const maxZ = cz + front;

  if (z >= minZ - t && z <= maxZ + t) {
    if (Math.abs(x - minX) <= t || Math.abs(x - maxX) <= t) return true;
  }
  if (x >= minX - t && x <= maxX + t && Math.abs(z - maxZ) <= t) {
    if (Math.abs(x - cx) < gh + 0.15) return false;
    if (Math.abs(x - GARDEN_GATE_X) < gh + 0.15) return false;
    return true;
  }
  if (x >= minX - t && x <= maxX + t && Math.abs(z - minZ) <= t) {
    if (Math.abs(x - GARDEN_GATE_X) < gh + 0.15) return false;
    return true;
  }
  return false;
}

export function isNavBlocked(x, z, r = 0.4) {
  return (
    inBarnSolid(x, z, r) ||
    inCabinSolid(x, z, r) ||
    inPenFenceSolid(x, z, r) ||
    inCabinYardFenceSolid(x, z, r)
  );
}

export function segmentBlocked(ax, az, bx, bz, r = 0.4) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return isNavBlocked(ax, az, r);
  const steps = Math.max(2, Math.ceil(len / 0.55));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (isNavBlocked(ax + dx * t, az + dz * t, r)) return true;
  }
  return false;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearPortal(x, z, p) {
  return Math.hypot(x - p.x, z - p.z) < p.range;
}

function inPortalOpening(x, z, p, halfAlong = null) {
  const hw = halfAlong ?? p.halfW ?? 1.2;
  // Axis-aligned openings: barn front/back along X, pen gate along X, cabin doors along X
  if (
    p.kind === "barnFront" ||
    p.kind === "barnBack" ||
    p.kind === "cabinFront" ||
    p.kind === "cabinBack" ||
    p.kind === "penGate" ||
    p.kind === "swingGate"
  ) {
    const along = Math.abs(x - p.x);
    const thru = Math.abs(z - p.z);
    const halfOpen =
      p.kind === "barnFront"
        ? FRONT_DOOR
        : p.kind === "barnBack"
          ? BACK_DOOR
          : p.kind === "penGate"
            ? GATE_WIDTH * 0.55
            : hw + 0.35;
    return along < halfOpen && thru < 1.7;
  }
  return nearPortal(x, z, p);
}

/**
 * Push-open / push-close every known door and gate near the pet.
 * Uses movement (prev → current) like the player's push-through logic.
 *
 * Call every frame while the pet is walking (meal trips + follow).
 * Returns true if any access state changed.
 */
export function petPushAccess(
  x,
  z,
  prevX,
  prevZ,
  barnDoorState,
  gateState,
  cabinState
) {
  const velX = x - (prevX ?? x);
  const velZ = z - (prevZ ?? z);
  const speed = Math.hypot(velX, velZ);
  const moving = speed > 0.0004;
  let changed = false;

  for (const p of PET_ACCESS_POINTS) {
    if (p.kind === "alwaysOpen") continue;
    if (!nearPortal(x, z, p) && !inPortalOpening(x, z, p)) continue;

    if (p.kind === "barnFront" && barnDoorState) {
      if (handleSlidingDoor(barnDoorState, "open", x, z, p, velZ, moving))
        changed = true;
    } else if (p.kind === "barnBack" && barnDoorState) {
      if (handleSlidingDoor(barnDoorState, "backOpen", x, z, p, velZ, moving))
        changed = true;
    } else if (p.kind === "penGate" && gateState) {
      if (handlePenGate(gateState, x, z, velX, velZ, moving)) changed = true;
    } else if (p.kind === "cabinFront" && cabinState) {
      if (
        handleCabinHingeDoor(
          cabinState,
          "doorOpen",
          x,
          z,
          p,
          velZ,
          moving,
          /* outward is +Z */ 1
        )
      )
        changed = true;
    } else if (p.kind === "cabinBack" && cabinState) {
      if (
        handleCabinHingeDoor(
          cabinState,
          "backDoorOpen",
          x,
          z,
          p,
          velZ,
          moving,
          /* outward is −Z */ -1
        )
      )
        changed = true;
    } else if (p.kind === "swingGate" && cabinState?.[p.gateKey]) {
      if (
        handleCabinSwingGate(
          cabinState[p.gateKey],
          x,
          z,
          p,
          velX,
          velZ,
          moving
        )
      )
        changed = true;
    }
  }

  return changed;
}

/**
 * Sliding barn door: open when moving through a closed opening;
 * close when moving through an open opening from the "exit" side
 * after a short cooldown (pets don't instantly re-close on themselves).
 */
function handleSlidingDoor(state, openKey, x, z, p, velZ, moving) {
  if (!state || !moving) return false;
  if (!inPortalOpening(x, z, p)) return false;

  // Through-motion along Z for front/back doors
  const through =
    Math.abs(velZ) > 0.0008 &&
    Math.abs(velZ) >= Math.abs(x - p.x) * 0.01 + 0.0003;

  if (!state[openKey] && through) {
    state[openKey] = true;
    state._petCooldown = 0.55;
    return true;
  }

  // Close: doors open, pet still in opening, after cooldown, and moving
  // clearly through (they "push" past and leave the leaf parked closed
  // when reversing back across the threshold while open).
  const cd = state._petCooldown ?? 0;
  if (state[openKey] && through && cd <= 0) {
    // Only close if pet is roughly outside the barn (not dining inside)
    const outside =
      p.kind === "barnFront"
        ? z > p.z + 0.15
        : z < p.z - 0.15;
    // Closing push: walk back out and reverse? Actually allow close when
    // walking out through the open doorway (leaving barn) OR walking in
    // and the pet wants to shut behind — use: close when moving away from
    // barn interior after having opened (outside side + vel outward).
    const leaving =
      p.kind === "barnFront"
        ? velZ > 0.001 && z > p.z - 0.4
        : velZ < -0.001 && z < p.z + 0.4;
    if (outside && leaving) {
      state[openKey] = false;
      state._petCooldown = 0.55;
      return true;
    }
  }
  return false;
}

function handlePenGate(gate, x, z, velX, velZ, moving) {
  if (!gate || !moving) return false;

  const inOpening =
    x >= GATE_MID_X - GATE_WIDTH * 0.55 &&
    x <= GATE_MID_X + GATE_WIDTH * 0.55 &&
    z >= GATE_Z - 1.65 &&
    z <= GATE_Z + 1.65;

  const openDir = gate.openDir >= 0 ? 1 : -1;
  const ang = gate.angle ?? 0;
  const fullySwung = Math.abs(ang) > 0.55;

  // openDir −1 into pen (−Z), +1 out (+Z)
  let pushDir;
  if (Math.abs(velZ) > 0.001 && Math.abs(velZ) >= Math.abs(velX) * 0.25) {
    pushDir = velZ > 0 ? 1 : -1;
  } else {
    pushDir = z > GATE_Z ? -1 : 1;
  }

  const nearOpenLeaf =
    fullySwung &&
    Math.abs(x - GATE_HINGE_X) < GATE_PUSH_CLOSE_RANGE &&
    (openDir < 0
      ? z <= GATE_Z + 0.5 && z >= GATE_Z - GATE_WIDTH - 0.45
      : z >= GATE_Z - 0.5 && z <= GATE_Z + GATE_WIDTH + 0.45);

  if (!gate.open && inOpening) {
    gate.open = true;
    gate.openDir = pushDir;
    gate.pushCooldown = 0.55;
    return true;
  }
  if (!gate.open) return false;
  if ((gate.pushCooldown ?? 0) > 0) return false;

  // Reverse through → flip swing
  if (inOpening && pushDir !== openDir) {
    const reversing =
      Math.abs(velZ) > 0.001 ||
      (openDir < 0 && z > GATE_Z + 0.15) ||
      (openDir > 0 && z < GATE_Z - 0.15);
    if (reversing) {
      gate.openDir = pushDir;
      gate.open = true;
      gate.pushCooldown = 0.35;
      return true;
    }
  }

  // Walk into open leaf toward closed line → close
  if (nearOpenLeaf) {
    const closingPush =
      openDir < 0
        ? velZ > 0.0005 || (Math.abs(velZ) <= 0.0005 && z < GATE_Z - 0.4)
        : velZ < -0.0005 || (Math.abs(velZ) <= 0.0005 && z > GATE_Z + 0.4);
    const throughGap =
      x >= GATE_MID_X - GATE_WIDTH * 0.4 &&
      x <= GATE_MID_X + GATE_WIDTH * 0.4 &&
      Math.abs(z - GATE_Z) < 1.1;
    if (closingPush && !throughGap) {
      gate.open = false;
      gate.pushCooldown = 0.45;
      return true;
    }
  }

  return false;
}

/**
 * Cabin hinged doors (front / patio). Open when moving through closed;
 * close when moving through open from outside after cooldown.
 */
function handleCabinHingeDoor(
  cabinState,
  openKey,
  x,
  z,
  p,
  velZ,
  moving,
  outwardSign
) {
  if (!cabinState || !moving) return false;
  if (!inPortalOpening(x, z, p)) return false;

  const through = Math.abs(velZ) > 0.0008;
  const open = !!cabinState[openKey];
  const cdKey = `_${openKey}PetCd`;
  const cd = cabinState[cdKey] ?? 0;

  if (!open && through) {
    cabinState[openKey] = true;
    cabinState[cdKey] = 0.55;
    return true;
  }

  if (open && through && cd <= 0) {
    // Close when leaving through outward side
    const outside = outwardSign > 0 ? z > p.z + 0.1 : z < p.z - 0.1;
    const leaving = outwardSign > 0 ? velZ > 0.001 : velZ < -0.001;
    if (outside && leaving) {
      cabinState[openKey] = false;
      cabinState[cdKey] = 0.55;
      return true;
    }
  }
  return false;
}

function handleCabinSwingGate(gate, x, z, p, velX, velZ, moving) {
  if (!gate || !moving) return false;

  const halfW = (p.halfW ?? 1.1) * 1.15;
  const gateX = p.x;
  const gateZ = p.z;
  const face = p.face; // "front" | "back"

  // World ≈ cabin-local (yaw 0)
  const inOpening =
    x >= gateX - halfW &&
    x <= gateX + halfW &&
    z >= gateZ - 1.55 &&
    z <= gateZ + 1.55;

  let pushDir;
  if (Math.abs(velZ) > 0.001 && Math.abs(velZ) >= Math.abs(velX) * 0.25) {
    if (face === "front") {
      pushDir = velZ < 0 ? 1 : -1; // into yard / out
    } else {
      pushDir = velZ > 0 ? -1 : 1;
    }
  } else if (face === "front") {
    pushDir = z > gateZ ? 1 : -1;
  } else {
    pushDir = z < gateZ ? -1 : 1;
  }

  const openDir = gate.openDir >= 0 ? 1 : -1;
  const ang = gate.angle ?? 0;
  const fullySwung = Math.abs(ang) > 0.45;
  const hingeX = gateX - (p.halfW ?? 1.1);
  const nearOpenLeaf =
    fullySwung &&
    Math.abs(x - hingeX) < 1.5 &&
    (openDir > 0
      ? z <= gateZ + 0.45 && z >= gateZ - (p.halfW ?? 1.1) * 2.1
      : z >= gateZ - 0.45 && z <= gateZ + (p.halfW ?? 1.1) * 2.1);

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
          ? z > gateZ + 0.12
          : z < gateZ - 0.12
        : openDir < 0
          ? z < gateZ - 0.12
          : z > gateZ + 0.12);
    if (reversing) {
      gate.openDir = pushDir;
      gate.open = true;
      gate.pushCooldown = 0.35;
      return true;
    }
  }

  if (nearOpenLeaf) {
    const throughGap =
      x >= gateX - (p.halfW ?? 1.1) * 0.85 &&
      x <= gateX + (p.halfW ?? 1.1) * 0.85 &&
      Math.abs(z - gateZ) < 1.0;
    const closingPush =
      openDir > 0
        ? velZ > 0.0005 || (Math.abs(velZ) <= 0.0005 && z < gateZ - 0.3)
        : velZ < -0.0005 ||
          (Math.abs(velZ) <= 0.0005 && z > gateZ + 0.3);
    if (closingPush && !throughGap) {
      gate.open = false;
      gate.pushCooldown = 0.45;
      return true;
    }
  }

  return false;
}

/**
 * Tick pet cooldowns on door state objects (call once per frame from pets).
 */
export function tickPetAccessCooldowns(delta, barnDoorState, cabinState) {
  if (barnDoorState && barnDoorState._petCooldown > 0) {
    barnDoorState._petCooldown = Math.max(0, barnDoorState._petCooldown - delta);
  }
  if (cabinState) {
    for (const k of ["_doorOpenPetCd", "_backDoorOpenPetCd"]) {
      if ((cabinState[k] ?? 0) > 0) {
        cabinState[k] = Math.max(0, cabinState[k] - delta);
      }
    }
  }
}

/**
 * @deprecated use petPushAccess — kept for meal helpers
 * Opens nearby portals (no close). Prefer petPushAccess for full behavior.
 */
export function petEnsureAccess(x, z, barnDoorState, gateState, cabinState) {
  // Force-open closed portals when standing on them (fallback / meal start)
  for (const p of PET_ACCESS_POINTS) {
    if (!nearPortal(x, z, p)) continue;
    if (p.kind === "barnFront" && barnDoorState && !barnDoorState.open) {
      barnDoorState.open = true;
    } else if (p.kind === "barnBack" && barnDoorState && !barnDoorState.backOpen) {
      barnDoorState.backOpen = true;
    } else if (p.kind === "penGate" && gateState && !gateState.open) {
      gateState.open = true;
      gateState.openDir = z > GATE_Z ? -1 : 1;
      gateState.pushCooldown = 0.4;
    } else if (p.kind === "cabinFront" && cabinState && !cabinState.doorOpen) {
      cabinState.doorOpen = true;
    } else if (p.kind === "cabinBack" && cabinState && !cabinState.backDoorOpen) {
      cabinState.backDoorOpen = true;
    } else if (p.kind === "swingGate" && cabinState?.[p.gateKey]) {
      const g = cabinState[p.gateKey];
      if (!g.open) {
        g.open = true;
        if (p.face === "front") {
          g.openDir = z > p.z ? 1 : -1;
        } else {
          g.openDir = z < p.z ? -1 : 1;
        }
        g.pushCooldown = 0.4;
      }
    }
  }
}

/** Prefer barn front doors at the start of a meal trip */
export function petOpenBarnForMeal(barnDoorState) {
  if (barnDoorState) barnDoorState.open = true;
}

/**
 * Build a path of {x,z} points from start to goal around barn/cabin/fence.
 * Returns array including goal (not including start).
 */
export function planPetPath(sx, sz, gx, gz) {
  const goal = { x: gx, z: gz };

  if (!segmentBlocked(sx, sz, gx, gz, 0.45)) {
    return [goal];
  }

  const nodes = [
    { id: "__start", x: sx, z: sz },
    { id: "__goal", x: gx, z: gz },
    ...STATIC_NODES,
  ];

  const N = nodes.length;
  const adj = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const d = dist(nodes[i], nodes[j]);
      if (d > 30) continue;
      if (segmentBlocked(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z, 0.4))
        continue;
      adj[i].push({ j, d });
      adj[j].push({ j: i, d });
    }
  }

  const INF = 1e12;
  const distArr = new Array(N).fill(INF);
  const prev = new Array(N).fill(-1);
  const used = new Array(N).fill(false);
  distArr[0] = 0;
  for (let iter = 0; iter < N; iter++) {
    let u = -1;
    let best = INF;
    for (let i = 0; i < N; i++) {
      if (!used[i] && distArr[i] < best) {
        best = distArr[i];
        u = i;
      }
    }
    if (u < 0 || best >= INF) break;
    used[u] = true;
    if (u === 1) break;
    for (const { j, d } of adj[u]) {
      const nd = distArr[u] + d;
      if (nd < distArr[j]) {
        distArr[j] = nd;
        prev[j] = u;
      }
    }
  }

  if (prev[1] < 0 && distArr[1] >= INF) {
    // Fallback via major portals
    return [
      ...PET_ACCESS_POINTS.filter((p) => p.kind !== "alwaysOpen").flatMap(
        (p) => [p.out, p.inn]
      ),
      goal,
    ];
  }

  const chain = [];
  let cur = 1;
  while (cur !== 0 && cur >= 0) {
    chain.push(nodes[cur]);
    cur = prev[cur];
  }
  chain.reverse();
  const path = chain
    .filter((n) => n.id !== "__start")
    .map((n) => ({ x: n.x, z: n.z }));
  if (
    path.length === 0 ||
    path[path.length - 1].x !== goal.x ||
    path[path.length - 1].z !== goal.z
  ) {
    path.push(goal);
  }
  return path;
}

/**
 * Advance along a planned path. Mutates st.pos / yaw / walkPhase.
 * Returns true when final point reached.
 */
export function followPetPath(st, feed, delta, walkSpeed, arrive = 0.7) {
  if (!feed.path || feed.path.length === 0) return true;
  let idx = feed.pathIndex ?? 0;
  if (idx >= feed.path.length) return true;

  const tgt = feed.path[idx];
  const dx = tgt.x - st.pos.x;
  const dz = tgt.z - st.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < arrive) {
    feed.pathIndex = idx + 1;
    if (feed.pathIndex >= feed.path.length) return true;
    return false;
  }
  const step = Math.min(d, walkSpeed * delta);
  st.pos.x += (dx / d) * step;
  st.pos.z += (dz / d) * step;
  st.yaw = Math.atan2(dx, dz);
  st.walkPhase = (st.walkPhase ?? 0) + delta * 12;
  st.mode = "walk";
  return false;
}
