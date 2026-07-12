/**
 * Shared body registry so companions / livestock don't clip through each other.
 * Each animal writes its pose after moving, then resolves against the others.
 */

const bodies = new Map(); // id -> { x, z, r }

/** Publish (or update) this animal's collision circle for the current frame. */
export function setAnimalBody(id, x, z, r = 0.4) {
  if (!id) return;
  bodies.set(id, { x, z, r });
}

export function clearAnimalBody(id) {
  bodies.delete(id);
}

/**
 * Push `position` out of every other registered animal circle.
 * Mutates and returns the same Vector3-like object ({ x, z }).
 */
export function resolveAnimalOverlaps(position, radius, selfId) {
  if (!position) return position;
  let x = position.x;
  let z = position.z;

  // Two passes so multi-body piles settle a bit
  for (let pass = 0; pass < 2; pass++) {
    for (const [id, b] of bodies) {
      if (id === selfId || !b) continue;
      const minDist = radius + b.r;
      const dx = x - b.x;
      const dz = z - b.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minDist * minDist) continue;
      if (d2 < 1e-8) {
        // Exact overlap — nudge along a stable axis from id hash
        const ang = (String(id).length * 1.7) % (Math.PI * 2);
        x = b.x + Math.cos(ang) * minDist;
        z = b.z + Math.sin(ang) * minDist;
        continue;
      }
      const d = Math.sqrt(d2);
      const s = minDist / d;
      x = b.x + dx * s;
      z = b.z + dz * s;
    }
  }

  position.x = x;
  position.z = z;
  return position;
}
