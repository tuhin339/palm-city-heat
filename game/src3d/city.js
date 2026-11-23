// Palm City itself: a seeded street grid at sunset. Everything is procedural — the
// ground is one big canvas texture with the roads, dashes and crosswalks painted on,
// the towers wear canvas facades whose lit windows double as their emissive map, and
// the palms and streetlights are instanced so the whole city costs a handful of draw
// calls. buildCity returns the building footprints as AABBs for collision.

export const PITCH = 56; // distance between neighbouring street centrelines
export const ROAD_W = 16; // asphalt width
export const STREET_I = [-3, -2, -1, 0, 1, 2, 3]; // street indices on each axis
export const WORLD_HALF = 230; // the ground plane spans -230..230

const BLOCK = PITCH - ROAD_W; // 40 units of buildable land between roads

/** Centreline coordinate of street i. */
export const streetAt = (i) => i * PITCH;
/** Centre coordinate of block i (blocks sit between streets -3..2). */
export const blockAt = (i) => (i + 0.5) * PITCH;

// ---------------------------------------------------------------- environment

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#191038');
  grad.addColorStop(0.35, '#472060');
  grad.addColorStop(0.62, '#a03d63');
  grad.addColorStop(0.82, '#f2703f');
  grad.addColorStop(1.0, '#ffb36b');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowSprite(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({
    map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  return new THREE.Sprite(mat);
}

function buildEnvironment(scene) {
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xd96a4e, 120, 420);

  const sunDir = new THREE.Vector3(-0.62, 0.30, 0.42).normalize();
  const sun = new THREE.DirectionalLight(0xffb36b, 1.6);
  sun.position.copy(sunDir).multiplyScalar(300);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xff9a5c, 0x2c2438, 0.75));
  scene.add(new THREE.AmbientLight(0x604a6a, 0.5));

  // The sun itself: a bright disc with a halo, low over the western rooftops.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(16, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe3ae, fog: false }),
  );
  disc.position.copy(sunDir).multiplyScalar(430);
  disc.lookAt(0, 20, 0);
  scene.add(disc);
  const halo = glowSprite('rgba(255,170,90,0.85)', 'rgba(255,120,60,0)');
  halo.position.copy(disc.position);
  halo.scale.setScalar(150);
  scene.add(halo);
}

// ------------------------------------------------------------------- ground

function groundTexture(rng) {
  const SIZE = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const px = (w) => ((w + WORLD_HALF) / (WORLD_HALF * 2)) * SIZE;
  const pw = (w) => (w / (WORLD_HALF * 2)) * SIZE;

  g.fillStyle = '#232329';
  g.fillRect(0, 0, SIZE, SIZE);

  // Block slabs: pale concrete squares the buildings stand on.
  g.fillStyle = '#4a4a55';
  for (const bi of [-3, -2, -1, 0, 1, 2]) {
    for (const bj of [-3, -2, -1, 0, 1, 2]) {
      g.fillRect(px(blockAt(bi) - BLOCK / 2), px(blockAt(bj) - BLOCK / 2), pw(BLOCK), pw(BLOCK));
    }
  }
  // A speckle of wear over the concrete.
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 900; i += 1) {
    g.fillRect(rng.range(0, SIZE), rng.range(0, SIZE), rng.range(2, 9), rng.range(2, 9));
  }

  // Asphalt bands along every street.
  g.fillStyle = '#2e2e35';
  for (const i of STREET_I) {
    g.fillRect(px(streetAt(i) - ROAD_W / 2), 0, pw(ROAD_W), SIZE);
    g.fillRect(0, px(streetAt(i) - ROAD_W / 2), SIZE, pw(ROAD_W));
  }

  // Crosswalks at every junction: zebra stripes on all four approaches.
  g.fillStyle = 'rgba(235,235,240,0.5)';
  for (const i of STREET_I) {
    for (const j of STREET_I) {
      const cx = streetAt(i);
      const cz = streetAt(j);
      for (let s = -3; s <= 3; s += 1) {
        if (s === 0) continue;
        g.fillRect(px(cx + s * 2.1 - 0.7), px(cz - ROAD_W / 2 - 3.4), pw(1.4), pw(2.6));
        g.fillRect(px(cx + s * 2.1 - 0.7), px(cz + ROAD_W / 2 + 0.8), pw(1.4), pw(2.6));
        g.fillRect(px(cx - ROAD_W / 2 - 3.4), px(cz + s * 2.1 - 0.7), pw(2.6), pw(1.4));
        g.fillRect(px(cx + ROAD_W / 2 + 0.8), px(cz + s * 2.1 - 0.7), pw(2.6), pw(1.4));
      }
    }
  }

  // Dashed yellow centrelines, broken at the junctions.
  g.fillStyle = '#e8b64c';
  for (const i of STREET_I) {
    for (let w = -WORLD_HALF; w < WORLD_HALF; w += 7) {
      const nearJunction = STREET_I.some((j) => Math.abs(w + 3.5 - streetAt(j)) < ROAD_W / 2 + 3);
      if (nearJunction) continue;
      g.fillRect(px(streetAt(i) - 0.22), px(w), pw(0.44), pw(3.6));
      g.fillRect(px(w), px(streetAt(i) - 0.22), pw(3.6), pw(0.44));
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------- buildings

const FACADES = [
  { base: '#8a6f5c', lit: ['#ffd27a', '#ffbe5c'] },
  { base: '#5c6a7a', lit: ['#bfe3ff', '#ffd27a'] },
  { base: '#9c5f52', lit: ['#ffd9a0', '#ffb36b'] },
  { base: '#4f6f6a', lit: ['#c8ffe8', '#ffd27a'] },
  { base: '#6e5a78', lit: ['#ffc4e0', '#ffd27a'] },
];

function facadeTextures(rng, spec) {
  const W = 128;
  const H = 256;
  const mapC = document.createElement('canvas');
  mapC.width = W;
  mapC.height = H;
  const emiC = document.createElement('canvas');
  emiC.width = W;
  emiC.height = H;
  const m = mapC.getContext('2d');
  const e = emiC.getContext('2d');
  m.fillStyle = spec.base;
  m.fillRect(0, 0, W, H);
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);
  const cols = 6;
  const rows = 14;
  const cw = W / cols;
  const ch = H / rows;
  for (let x = 0; x < cols; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      const lit = rng.chance(0.52);
      const wx = x * cw + 3;
      const wy = y * ch + 4;
      const ww = cw - 6;
      const wh = ch - 8;
      if (lit) {
        const col = rng.pick(spec.lit);
        m.fillStyle = col;
        m.fillRect(wx, wy, ww, wh);
        e.fillStyle = col;
        e.fillRect(wx, wy, ww, wh);
      } else {
        m.fillStyle = 'rgba(16,18,26,0.85)';
        m.fillRect(wx, wy, ww, wh);
      }
    }
  }
  const map = new THREE.CanvasTexture(mapC);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(emiC);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

function buildBuildings(scene, rng, colliders) {
  const variants = FACADES.map((spec) => {
    const { map, emissiveMap } = facadeTextures(rng, spec);
    return new THREE.MeshLambertMaterial({
      map, emissive: 0xffffff, emissiveMap, emissiveIntensity: 0.85,
    });
  });
  const roof = new THREE.MeshLambertMaterial({ color: 0x35313b });
  const box = new THREE.BoxGeometry(1, 1, 1);

  const addBuilding = (cx, cz, w, d, h) => {
    const side = rng.pick(variants);
    const mesh = new THREE.Mesh(box, [side, side, roof, roof, side, side]);
    mesh.scale.set(w, h, d);
    mesh.position.set(cx, h / 2, cz);
    scene.add(mesh);
    colliders.push({
      minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2,
    });
  };

  for (const bi of [-3, -2, -1, 0, 1, 2]) {
    for (const bj of [-3, -2, -1, 0, 1, 2]) {
      const cx = blockAt(bi);
      const cz = blockAt(bj);
      const distC = Math.hypot(cx, cz);
      const tallBoost = Math.max(0, 1 - distC / 260) * 30;
      const roll = rng.next();
      if (roll < 0.5) {
        // One tower per block.
        const w = rng.range(23, 32);
        addBuilding(cx + rng.range(-2, 2), cz + rng.range(-2, 2), w, rng.range(23, 32),
          rng.range(15, 32) + tallBoost);
      } else if (roll < 0.85) {
        // Two slimmer blocks side by side.
        const alongX = rng.chance(0.5);
        for (const off of [-10.5, 10.5]) {
          const w = rng.range(14, 18);
          const d = rng.range(22, 31);
          addBuilding(
            cx + (alongX ? off : rng.range(-2, 2)),
            cz + (alongX ? rng.range(-2, 2) : off),
            alongX ? w : d, alongX ? d : w,
            rng.range(10, 26) + tallBoost * 0.7,
          );
        }
      } else {
        // A low, wide shop block.
        addBuilding(cx, cz, rng.range(30, 35), rng.range(30, 35), rng.range(6, 9));
      }
    }
  }
}

// ------------------------------------------------------- palms + streetlights

function buildPalms(scene, rng) {
  const spots = [];
  for (const bi of [-3, -2, -1, 0, 1, 2]) {
    for (const bj of [-3, -2, -1, 0, 1, 2]) {
      const cx = blockAt(bi);
      const cz = blockAt(bj);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          if (rng.chance(0.62)) {
            spots.push({
              x: cx + sx * (BLOCK / 2 - 2.5) + rng.range(-1, 1),
              z: cz + sz * (BLOCK / 2 - 2.5) + rng.range(-1, 1),
            });
          }
        }
      }
    }
  }
  // A proud row down the central avenue.
  for (let w = -200; w <= 200; w += 19) {
    for (const side of [-1, 1]) {
      if (rng.chance(0.85)) spots.push({ x: side * (ROAD_W / 2 + 2.5), z: w + rng.range(-2, 2) });
      if (rng.chance(0.85)) spots.push({ x: w + rng.range(-2, 2), z: side * (ROAD_W / 2 + 2.5) });
    }
  }

  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.24, 1, 5);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3c });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);

  const frondGeo = new THREE.PlaneGeometry(3.1, 0.85);
  frondGeo.rotateX(-Math.PI / 2);
  frondGeo.translate(1.35, 0, 0);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e, side: THREE.DoubleSide });
  const FRONDS = 6;
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, spots.length * FRONDS);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  let fi = 0;
  spots.forEach((p, i) => {
    const h = rng.range(4.6, 7.2);
    const tiltX = rng.range(-0.07, 0.07);
    const tiltZ = rng.range(-0.07, 0.07);
    e.set(tiltX, 0, tiltZ);
    q.setFromEuler(e);
    v.set(p.x, 0, p.z);
    s.set(1, h, 1);
    m4.compose(v, q, s);
    trunks.setMatrixAt(i, m4);
    const topX = p.x - Math.sin(tiltZ) * h;
    const topZ = p.z + Math.sin(tiltX) * h;
    for (let k = 0; k < FRONDS; k += 1) {
      e.set(0, (k / FRONDS) * Math.PI * 2 + rng.range(-0.2, 0.2), rng.range(-0.62, -0.34), 'YXZ');
      q.setFromEuler(e);
      v.set(topX, h, topZ);
      s.set(1, 1, 1);
      m4.compose(v, q, s);
      fronds.setMatrixAt(fi, m4);
      fi += 1;
    }
  });
  scene.add(trunks);
  scene.add(fronds);
}

function buildStreetlights(scene, rng) {
  const spots = [];
  for (const i of STREET_I) {
    for (const j of STREET_I) {
      for (const [sx, sz] of [[-1, -1], [1, 1]]) {
        if (rng.chance(0.8)) {
          spots.push({ x: streetAt(i) + sx * (ROAD_W / 2 + 1.6), z: streetAt(j) + sz * (ROAD_W / 2 + 1.6) });
        }
      }
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 5.6, 5);
  poleGeo.translate(0, 2.8, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
  const headGeo = new THREE.BoxGeometry(0.55, 0.22, 0.55);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
  const m4 = new THREE.Matrix4();
  spots.forEach((p, i) => {
    m4.makeTranslation(p.x, 0, p.z);
    poles.setMatrixAt(i, m4);
    m4.makeTranslation(p.x, 5.65, p.z);
    heads.setMatrixAt(i, m4);
  });
  scene.add(poles);
  scene.add(heads);
}

// -------------------------------------------------------------------- entry

/** Grow the whole city into `scene`; returns { colliders } for the physics. */
export function buildCity(scene, rng) {
  buildEnvironment(scene);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
    new THREE.MeshLambertMaterial({ map: groundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const colliders = [];
  buildBuildings(scene, rng, colliders);
  buildPalms(scene, rng);
  buildStreetlights(scene, rng);
  return { colliders };
}
