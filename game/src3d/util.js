// Small shared geometry helpers for the 3D systems: the same circle-versus-AABB
// push-out the player car uses in main.js, and a building line-of-sight test built
// on the colliders city.js returns. Both work in the ground plane (x, z).

/** Push a circle at `pos` (an {x, z} holder, mutated) out of every building AABB. */
export function collideCircle(colliders, pos, radius) {
  let hit = false;
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    let dx = pos.x - cx;
    let dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 < 1e-6) {
      const pens = [
        pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z,
      ];
      const m = Math.min(...pens);
      if (m === pens[0]) pos.x = b.minX - radius;
      else if (m === pens[1]) pos.x = b.maxX + radius;
      else if (m === pens[2]) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    } else {
      const d = Math.sqrt(d2);
      dx /= d;
      dz /= d;
      pos.x = cx + dx * radius;
      pos.z = cz + dz * radius;
    }
  }
  return hit;
}

/** True when a building blocks the straight line from (ax, az) to (bx, bz). */
export function segmentBlocked(colliders, ax, az, bx, bz) {
  const distance = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(distance / 4));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    for (const b of colliders) {
      if (x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ) return true;
    }
  }
  return false;
}

/** Shortest signed turn from one heading to another, in (-PI, PI]. */
export function wrapAngle(a) {
  let d = a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distance between two {x, z} holders. */
export function dist2d(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
