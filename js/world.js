// Sleep On It - the world: one block of Maple Street built from flat-shaded primitives.
// Classic script. SOI.world.build(scene, mode) -> handle (see CONTRACTS.md, "SOI.world").
//
// Layout (meters, +X east, -Z north, street along z = 0):
//   Maple Street   paved, z -3.5..3.5, x -70..60, yellow dashed center line, sidewalks to |z| 5.5, dusty verge to 7
//   Kid's house    (-35,-14) 12 x 8, porch + door on the south face, path to the sidewalk, mailbox (-35,-4.5)
//   Yard           x -46..-24, z -38..-19, fenced; big tree + tree house (-40,-31), sandbox (-32,-27), side gate (-24,-21)
//   Neighbors      north (-5,-16) (25,-16); south (-50,16) (-20,16) (10,16) (40,16)
//   Dirt lane      x = 5, z -4..-46, crosses the creek (z = -40, all x) on a footbridge at (5,-40)
//   Bus stop       sign + bench at (20,-5); school bus (30,-4) along x, headlights facing west
//   School gate    pillars (60,+-3.5), iron bars between, wall x = 60 out to z = +-14 (then a plain fence to the world edge)
//   School         (78,-4) 24 x 14, faces west toward the gate, bell tower
//   World edge     four invisible collider walls just inside the bounds
// Day and dream share every position and collider; only colors, lights and a few props differ.
window.SOI = window.SOI || {};

SOI.world = (function () {
  'use strict';

  const W = SOI.data.world;
  let C = null;       // current build context
  let D = false;      // dream mode?
  const matCache = {};

  // ---------- small utilities ----------
  function hash(a, b) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }
  function rng(seed) { let t = seed >>> 0; return function () { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  // Dream tone: desaturate and darken toward violet-grey.
  function dim(hex) { const c = new THREE.Color(hex), h = {}; c.getHSL(h); c.setHSL(0.72, h.s * 0.35, Math.max(0.09, h.l * 0.6)); return c.getHex(); }
  function T(day, dream) { return D ? (dream !== undefined ? dream : dim(day)) : day; }
  function mat(color) {
    const k = 'l' + color;
    return matCache[k] || (matCache[k] = new THREE.MeshLambertMaterial({ color: color, flatShading: true }));
  }
  function basic(color) {
    const k = 'b' + color;
    return matCache[k] || (matCache[k] = new THREE.MeshBasicMaterial({ color: color }));
  }

  // box with its BASE at y (not center). Added to parent when given.
  function box(parent, w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x || 0, (y || 0) + h / 2, z || 0);
    if (parent) parent.add(m);
    return m;
  }
  function cyl(parent, rt, rb, h, color, x, y, z, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 7), mat(color));
    m.position.set(x || 0, (y || 0) + h / 2, z || 0);
    if (parent) parent.add(m);
    return m;
  }
  function ball(parent, r, color, x, y, z, ws, hs) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws || 7, hs || 5), mat(color));
    m.position.set(x || 0, y || 0, z || 0);
    if (parent) parent.add(m);
    return m;
  }

  // Context helpers
  function addProp(obj, x, z) { C.group.add(obj); C.props.push({ mesh: obj, x: x, z: z }); return obj; }
  function collide(x, z, w, d, h) { C.colliders.push(h ? { x: x, z: z, w: w, d: d, h: h } : { x: x, z: z, w: w, d: d }); }
  function interact(o) { C.interactables.push(o); }
  function addLight(x, y, z) {
    if (C.pointLights >= 10) return;
    const l = new THREE.PointLight(0xffb347, 1.4, 14);
    l.position.set(x, y, z);
    C.group.add(l); C.lights.push(l); C.pointLights++;
  }

  // Unit hip roof: base is a 1 x 1 square at y = 0, apex at y = 1. Scale it to fit.
  let roofGeo = null;
  function roofGeometry() {
    if (!roofGeo) { roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); roofGeo.rotateY(Math.PI / 4); roofGeo.translate(0, 0.5, 0); }
    return roofGeo;
  }

  // ---------- ground ----------
  const POTHOLES = [[-20, 2], [10, -2], [38, 2], [-56, -2], [-6, 0], [50, -2]];

  function groundColor(x, z, out) {
    const ix = Math.round((x - W.minX) / W.cell), iz = Math.round((z - W.minZ) / W.cell);
    const n = hash(ix, iz), n2 = hash(ix * 7 + 3, iz * 13 + 1);
    const az = Math.abs(z);
    let c = D ? 0x2e2a45 : 0x7ba04c;                                              // grass
    let j = (n - 0.5) * 0.14;
    if (x >= -46 && x <= -24 && z >= -38 && z <= -19) c = D ? 0x33304c : 0x86ab55;       // the yard is a bit lusher
    // sidewalk and dusty verge
    if (x <= 60 && az > 3.5 && az <= 7) c = (az <= 5.5) ? (D ? 0x4a4560 : 0xbdb7a8) : (D ? 0x3a3350 : 0xb59a6a);
    // path from the front door
    if ((x === -36 || x === -34) && z >= -8 && z <= -4) c = D ? 0x4a3f55 : 0xc4a470;
    // school forecourt
    if (x > 60 && x <= 66 && az <= 6) c = D ? 0x4a4560 : 0xbdb7a8;
    // dirt lane
    if (Math.abs(x - 5) <= 2 && z >= -46 && z <= -4) c = D ? 0x4a3f55 : 0xc4a470;
    // creek and banks
    const dz = Math.abs(z + 40);
    if (dz <= 4) c = D ? 0x2f2a3c : 0x7d7a4e;
    if (dz <= 2) { c = D ? 0x23345a : 0x5f8499; j = (n - 0.5) * 0.06; }
    // paved road
    if (x <= 60 && az <= 3.5) {
      c = D ? 0x2c2a38 : 0x6e6e72; j = (n - 0.5) * 0.06;
      if (D) {
        if (n2 < 0.13) { c = 0x0a090e; j = 0; } else if (n2 < 0.34) { c = 0x1c1a26; }
      }
      if (z === 0 && x >= -70 && x <= 58 && ((x - W.minX) / 2) % 4 < 2) {
        if (!D) c = 0xe6c530; else if (n2 > 0.25) c = 0x8a7a2a;
      }
      if (D) for (let p = 0; p < POTHOLES.length; p++) { if (Math.abs(x - POTHOLES[p][0]) <= 1 && Math.abs(z - POTHOLES[p][1]) <= 1) { c = 0x050408; j = 0; } }
    }
    const col = new THREE.Color(c);
    out[0] = Math.min(1, Math.max(0, col.r + j)); out[1] = Math.min(1, Math.max(0, col.g + j)); out[2] = Math.min(1, Math.max(0, col.b + j));
  }

  function paintGround() {
    const geo = new THREE.PlaneGeometry(W.maxX - W.minX, W.maxZ - W.minZ, (W.maxX - W.minX) / W.cell, (W.maxZ - W.minZ) / W.cell);
    const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), tmp = [0, 0, 0];
    const cx = (W.minX + W.maxX) / 2, cz = (W.minZ + W.maxZ) / 2;
    for (let i = 0; i < pos.count; i++) {
      groundColor(pos.getX(i) + cx, -pos.getY(i) + cz, tmp);
      colors[i * 3] = tmp[0]; colors[i * 3 + 1] = tmp[1]; colors[i * 3 + 2] = tmp[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, 0, cz);
    C.group.add(ground);
    return ground;
  }

  // ---------- objects ----------
  function win(g, x, y, z, rotY, lit) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), lit ? basic(0xffb347) : mat(D ? 0x15121f : 0x9ec3d6));
    m.position.set(x, y, z); m.rotation.y = rotY; g.add(m);
  }

  // o: { x, z, w, d, h, wall, roof, roofH, door, rot, lit:[front window indices], lights:n, porch, label }
  function house(o) {
    const g = new THREE.Group(); g.position.set(o.x, 0, o.z); g.rotation.y = o.rot || 0;
    const w = o.w, d = o.d, h = o.h || 6.4, roofH = (o.roofH || 2.6) * (D ? (o.porch ? 1.3 : 1.15) : 1);
    box(g, w, h, d, T(o.wall), 0, 0, 0);
    const roof = new THREE.Mesh(roofGeometry(), mat(T(o.roof)));
    roof.scale.set(w + 1.2, roofH, d + 1.2); roof.position.y = h; g.add(roof);
    box(g, 1, 2.4, 1, T(0x8a6a58), w * 0.25, h + 0.4, -d * 0.15);             // chimney
    box(g, w + 0.1, 0.35, d + 0.1, T(0xd9d0bd), 0, 0, 0);                      // foundation band
    box(g, 1.2, 2.3, 0.2, T(o.door || 0x7a4a2f), o.porch ? 0 : w * 0.05, 0.1, d / 2 + 0.05);   // door
    // windows: front (lower row leaves the door clear), back, sides
    const fx = w * 0.32, low = [-fx, fx], up = [-fx, 0, fx], front = [];
    low.forEach(x => front.push([x, 1.9])); up.forEach(x => front.push([x, 5.1]));
    const lit = o.lit || [];
    let lightsLeft = D ? (o.lights || 1) : 0;
    const rot = o.rot || 0, cs = Math.cos(rot), sn = Math.sin(rot);
    front.forEach((p, i) => {
      const isLit = D && lit.indexOf(i) >= 0;
      win(g, p[0], p[1], d / 2 + 0.04, 0, isLit);
      if (isLit && lightsLeft > 0) {
        lightsLeft--;
        const lx = p[0], lz = d / 2 + 1.5;
        addLight(o.x + lx * cs + lz * sn, p[1], o.z - lx * sn + lz * cs);
      }
    });
    low.concat(up).forEach((x, i) => win(g, x, i < 2 ? 1.9 : 5.1, -d / 2 - 0.04, Math.PI, false));
    [1.9, 5.1].forEach(y => { win(g, w / 2 + 0.04, y, 0, Math.PI / 2, false); win(g, -w / 2 - 0.04, y, 0, -Math.PI / 2, false); });
    if (o.porch) {
      box(g, 7, 0.35, 3, T(0xb89a6a), 0, 0, d / 2 + 1.5);                       // porch slab
      box(g, 7.4, 0.25, 3.4, T(o.roof), 0, 3.1, d / 2 + 1.5);                   // porch roof
      box(g, 0.25, 3.1, 0.25, T(0xe8dcc0), -3.2, 0, d / 2 + 2.8);
      box(g, 0.25, 3.1, 0.25, T(0xe8dcc0), 3.2, 0, d / 2 + 2.8);
      box(g, 1.6, 0.2, 0.6, T(0xb89a6a), 0, 0, d / 2 + 3.2);                    // step
    } else {
      box(g, 2.2, 0.2, 1.2, T(0xbdb7a8), w * 0.05, 0, d / 2 + 0.6);             // stoop
    }
    addProp(g, o.x, o.z);
    collide(o.x, o.z, w, d);
    C.mapFeatures.push({ kind: 'house', x: o.x, z: o.z, w: w, d: d, label: o.label });
    return g;
  }

  function tree(o) {
    const g = new THREE.Group(); g.position.set(o.x, 0, o.z);
    const th = o.h || 3.2, tr = o.big ? 0.55 : 0.35, cr = o.r || 2.4;
    cyl(g, tr * 0.8, tr, th, T(0x6b4a2f, 0x2a2530), 0, 0, 0, 6);
    if (!D) {
      const cols = [0xd9822b, 0xb5b83a, 0xb8402e, 0xe0a63a];
      ball(g, cr, cols[o.k % cols.length], 0, th + cr * 0.55, 0, 7, 5);
      ball(g, cr * 0.65, cols[(o.k + 1) % cols.length], cr * 0.5, th + cr * 0.2, cr * 0.2, 6, 4);
    } else {
      [[0.9, 0.5], [-0.9, 0.2], [0.1, -0.9]].forEach((b, i) => {                // bare branches
        const br = cyl(g, 0.06, 0.14, cr * 0.9, 0x2a2530, 0, 0, 0, 5);
        br.rotation.z = -b[0] * 0.8; br.rotation.x = b[1] * 0.8; br.rotation.y = i;
        br.position.set(b[0] * 0.5, th * 0.8 + 0.7, b[1] * 0.5);
      });
      if (o.k % 3 === 0) ball(g, cr * 0.55, 0x1c1a2a, 0, th + cr * 0.4, 0, 6, 4).scale.y = 0.6;  // sparse dark canopy
    }
    addProp(g, o.x, o.z);
    const s = o.big ? 1.5 : 1.0;
    collide(o.x, o.z, s, s);
    C.mapFeatures.push({ kind: 'tree', x: o.x, z: o.z });
    return g;
  }

  // Straight axis-aligned fence from (x1,z1) to (x2,z2). Thin collider box.
  function fence(x1, z1, x2, z2, color, h) {
    const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    const g = new THREE.Group(); g.position.set(mx, 0, mz); g.rotation.y = Math.atan2(-dz, dx);
    h = h || 1.2;
    const col = color ? color : T(0xd8cbb0);
    box(g, L, 0.12, 0.08, col, 0, h * 0.35, 0); box(g, L, 0.12, 0.08, col, 0, h * 0.8, 0);
    const n = Math.max(1, Math.round(L / 2));
    for (let i = 0; i <= n; i++) box(g, 0.14, h, 0.14, col, -L / 2 + (L * i) / n, 0, 0);
    addProp(g, mx, mz);
    if (Math.abs(dx) >= Math.abs(dz)) collide(mx, mz, L, 0.3, h); else collide(mx, mz, 0.3, L, h);
    return g;
  }

  function mailbox(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    box(g, 0.14, 1.0, 0.14, T(0x6b4a2f), 0, 0, 0);
    box(g, 0.5, 0.4, 0.8, T(0x3f6fb5), 0, 1.0, 0);
    box(g, 0.05, 0.3, 0.1, T(0xd9503f), 0.3, 1.1, 0.1);
    addProp(g, x, z);
    C.mapFeatures.push({ kind: 'mailbox', x: x, z: z });
  }

  function treeHouse(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    box(g, 3.2, 0.2, 3.2, T(0x8a6a45), 0, 3.6, 0);                              // platform
    box(g, 2.6, 1.8, 2.6, T(0xb98a52), 0, 3.8, 0);                              // fort
    const roof = new THREE.Mesh(roofGeometry(), mat(T(0x9a4a35)));
    roof.scale.set(3.4, 1.2, 3.4); roof.position.y = 5.6; g.add(roof);
    box(g, 0.7, 0.9, 0.06, T(0x35333d), 0, 4.1, 1.33);                          // door hole
    // ladder (thin boxes) leaning against the trunk, foot near (-39,-33)
    const lad = new THREE.Group(); lad.position.set(1.0, 0, -2.0); lad.rotation.x = -0.28;
    box(lad, 0.08, 3.9, 0.08, T(0x6b4a2f), -0.3, 0, 0); box(lad, 0.08, 3.9, 0.08, T(0x6b4a2f), 0.3, 0, 0);
    for (let i = 0; i < 8; i++) box(lad, 0.6, 0.06, 0.06, T(0x6b4a2f), 0, 0.4 + i * 0.45, 0);
    g.add(lad);
    addProp(g, x, z);
    C.mapFeatures.push({ kind: 'treehouse', x: x, z: z });
  }

  function sandbox(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    box(g, 3, 0.18, 3, T(0xe3cf9a), 0, 0, 0);
    const wood = T(0x8a6a45);
    box(g, 3.3, 0.35, 0.15, wood, 0, 0, 1.58); box(g, 3.3, 0.35, 0.15, wood, 0, 0, -1.58);
    box(g, 0.15, 0.35, 3, wood, 1.58, 0, 0); box(g, 0.15, 0.35, 3, wood, -1.58, 0, 0);
    box(g, 0.5, 0.4, 0.4, T(0xd9503f), -0.8, 0.18, -0.6);                       // bucket block
    addProp(g, x, z);
  }

  function toyTruck(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = 0.5;
    box(g, 1.1, 0.4, 0.6, T(0xd9503f), 0, 0.2, 0); box(g, 0.4, 0.4, 0.6, T(0xe6a93c), 0.4, 0.5, 0);
    [[-0.35, 0.3], [0.35, 0.3], [-0.35, -0.3], [0.35, -0.3]].forEach(p => {
      const wh = cyl(g, 0.12, 0.12, 0.1, T(0x222222), p[0], 0, p[1], 6); wh.rotation.x = Math.PI / 2; wh.position.y = 0.14;
    });
    addProp(g, x, z);
  }

  function toy(x, z, kind, color) {
    const m = kind === 'ball' ? ball(null, 0.28, T(color), 0, 0.28, 0, 6, 4) : box(null, 0.5, 0.5, 0.5, T(color), 0, 0, 0);
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = x; g.add(m);
    addProp(g, x, z);
  }

  // Pickup visuals (day only).
  function pickupVisual(id, x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    if (id === 'rope') { cyl(g, 0.3, 0.3, 0.14, 0xb59a6a, 0, 0, 0, 8); box(g, 0.1, 0.08, 0.7, 0xb59a6a, 0.3, 0, 0.5); }
    else if (id === 'padlock') { box(g, 0.28, 0.3, 0.12, 0x4a4a52, 0, 0.9, 0); box(g, 0.16, 0.16, 0.1, 0x8a8a92, 0, 1.2, 0); }
    else if (id === 'ball') ball(g, 0.3, 0xd9503f, 0, 0.3, 0, 7, 5);
    else if (id === 'marbles') [[0, 0.2, 0xd9503f], [0.2, -0.1, 0x3f6fb5], [-0.15, -0.2, 0x6c9a4a]].forEach(p => ball(g, 0.1, p[2], p[0], 0.28, p[1], 5, 4));
    else if (id === 'tape') cyl(g, 0.22, 0.22, 0.14, 0x9a9aa0, 0, 0.35, 0, 8);
    else if (id === 'torch') { const m = cyl(g, 0.07, 0.07, 0.4, 0xe6a93c, 0, 0.35, 0, 6); m.rotation.z = Math.PI / 2; }
    return addProp(g, x, z);
  }

  function bus(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const body = T(0xf0b82a, 0x6b5320), dark = 0x18161f, glass = T(0x2a3040, 0x0f0e16);
    box(g, 11, 2.3, 2.6, body, 0, 0.6, 0);
    box(g, 10.8, 0.2, 2.5, T(0xf6cc55, 0x5a4519), 0, 2.9, 0);
    box(g, 11.04, 0.25, 2.64, dark, 0, 1.2, 0);                                  // black stripe
    box(g, 11.1, 0.3, 2.7, dark, 0, 0.45, 0);                                    // bumpers / skirt
    for (let i = 0; i < 6; i++) {
      const wx = -4.2 + i * 1.7;
      box(g, 1.2, 0.8, 0.05, glass, wx, 1.65, 1.32);
      box(g, 1.2, 0.8, 0.05, glass, wx, 1.65, -1.32);
    }
    box(g, 0.05, 1.0, 2.2, glass, -5.52, 1.6, 0);                                // windshield (west end)
    [[-3.5, 1.3], [-3.5, -1.3], [3.5, 1.3], [3.5, -1.3]].forEach(p => {
      const wh = cyl(g, 0.5, 0.5, 0.3, 0x111111, p[0], 0, p[1], 8); wh.rotation.x = Math.PI / 2; wh.position.y = 0.5;
    });
    [0.8, -0.8].forEach(zz => {                                                  // headlights face west
      const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 10), D ? basic(0xffe066) : mat(0xddd9c4));
      hl.rotation.z = Math.PI / 2; hl.position.set(-5.55, 0.95, zz); g.add(hl);
    });
    if (D) {                                                                      // rust streaks
      box(g, 0.6, 1.4, 0.03, 0x4a2a18, 1, 0.8, 1.33); box(g, 0.5, 1.0, 0.03, 0x4a2a18, -2.5, 0.9, 1.33); box(g, 0.7, 1.2, 0.03, 0x4a2a18, 3.5, 0.8, -1.33);
    }
    addProp(g, x, z);
    collide(x, z, 11, 2.6);
    C.mapFeatures.push({ kind: 'bus', x: x, z: z, w: 11, d: 2.6, rot: 0 });
  }

  function busStop(x, z) {
    const s = new THREE.Group(); s.position.set(x - 1, 0, z);
    cyl(s, 0.06, 0.06, 2.6, T(0x777780), 0, 0, 0, 6);
    box(s, 0.8, 0.8, 0.07, T(0xd9503f), 0, 1.9, 0);
    addProp(s, x - 1, z); collide(x - 1, z, 0.4, 0.4);
    const b = new THREE.Group(); b.position.set(x + 1.5, 0, z - 0.2);
    box(b, 2, 0.12, 0.6, T(0x8a6a45), 0, 0.5, 0); box(b, 2, 0.5, 0.1, T(0x8a6a45), 0, 0.7, -0.28);
    box(b, 0.1, 0.5, 0.5, T(0x35333d), -0.9, 0, 0); box(b, 0.1, 0.5, 0.5, T(0x35333d), 0.9, 0, 0);
    addProp(b, x + 1.5, z - 0.2); collide(x + 1.5, z - 0.2, 2, 0.7, 1.2);
    C.mapFeatures.push({ kind: 'busstop', x: x, z: z });
  }

  function bridge(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const wood = T(0x9a7448), dk = T(0x6b4a2f);
    box(g, 3.6, 0.2, 6, wood, 0, 0.1, 0);
    for (let i = 0; i < 6; i++) box(g, 3.7, 0.04, 0.12, dk, 0, 0.3, -2.5 + i);
    [-1.75, 1.75].forEach(xx => { box(g, 0.1, 0.9, 6, wood, xx, 0.3, 0); [-2.8, 0, 2.8].forEach(zz => box(g, 0.2, 1.1, 0.2, dk, xx, 0, zz)); });
    addProp(g, x, z);
    C.mapFeatures.push({ kind: 'bridge', x: x, z: z, rot: 0 });
  }

  function schoolGate(x) {
    const ph = D ? 6 : 4, brick = T(0xb0654a), cap = T(0xd9d0bd), iron = D ? 0x100e18 : 0x2a2a32;
    [-3.5, 3.5].forEach(zz => {
      const g = new THREE.Group(); g.position.set(x, 0, zz);
      box(g, 1, ph, 1, brick, 0, 0, 0); box(g, 1.3, 0.25, 1.3, cap, 0, ph, 0);
      addProp(g, x, zz); collide(x, zz, 1, 1);
    });
    const bars = new THREE.Group(); bars.position.set(x, 0, 0);
    const bh = D ? 4.8 : 3.2;
    for (let i = 0; i <= 14; i++) box(bars, 0.08, bh, 0.08, iron, 0, 0, -3 + i * (6 / 14));
    box(bars, 0.1, 0.12, 6, iron, 0, bh * 0.85, 0); box(bars, 0.1, 0.12, 6, iron, 0, 0.5, 0);
    addProp(bars, x, 0); collide(x, 0, 0.4, 6);
    [-1, 1].forEach(s => {                                                       // low brick wall out to z = +-14
      const g = new THREE.Group(); g.position.set(x, 0, s * 9);
      box(g, 0.6, 1.8, 10, brick, 0, 0, 0); box(g, 0.8, 0.15, 10, cap, 0, 1.8, 0);
      addProp(g, x, s * 9); collide(x, s * 9, 0.6, 10);
    });
    // plain iron fence from the wall ends to the world edge so the school stays out of reach
    fence(x, 14, x, W.maxZ - 1, iron, 1.8); fence(x, -14, x, W.minZ + 1, iron, 1.8);
    C.mapFeatures.push({ kind: 'gate', x: x, z: 0, w: 7 });
  }

  function school(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -Math.PI / 2;   // local +z faces west (toward the gate)
    const w = 14, d = 24, h = 7.4, wall = T(0xe3d3ac, 0x3a3548);
    box(g, w, h, d, wall, 0, 0, 0);
    const roof = new THREE.Mesh(roofGeometry(), mat(T(0x8a4a35)));
    roof.scale.set(w + 1, 2.2, d + 1); roof.position.y = h; g.add(roof);
    box(g, w + 0.2, 0.4, d + 0.2, T(0xb0654a), 0, 0, 0);
    const tower = new THREE.Group(); tower.position.set(0, h + 0.6, d / 2 - 4); tower.scale.y = D ? 1.4 : 1;
    box(tower, 3.6, 5, 3.6, wall, 0, 0, 0); box(tower, 1.6, 1.4, 0.3, T(0x35333d), 0, 2.4, 1.85);
    const cap = new THREE.Mesh(roofGeometry(), mat(T(0x8a4a35))); cap.scale.set(4.4, 2.4, 4.4); cap.position.y = 5; tower.add(cap);
    g.add(tower);
    box(g, 2.6, 2.6, 0.2, T(0x6b4a2f), 0, 0.1, d / 2 + 0.05);                      // double door
    box(g, 4, 0.2, 1.6, T(0xbdb7a8), 0, 0, d / 2 + 0.8);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {                // long sides
      const wz = -d / 2 + 2 + i * ((d - 4) / 5), y = row ? 5.2 : 2.0;
      win(g, w / 2 + 0.04, y, wz, Math.PI / 2, false); win(g, -w / 2 - 0.04, y, wz, -Math.PI / 2, false);
    }
    let litLeft = D ? 1 : 0;
    for (let row = 0; row < 2; row++) [-4.5, -2.4, 2.4, 4.5].forEach((xx, i) => {  // front end (faces the gate)
      const isLit = litLeft > 0 && row === 1 && i === 0;
      win(g, xx, row ? 5.2 : 2.0, d / 2 + 0.04, 0, isLit);
      if (isLit) { litLeft--; addLight(x - (d / 2 + 1.5), 5.2, z + xx); }
    });
    addProp(g, x, z);
    collide(x, z, 24, 14);
    C.mapFeatures.push({ kind: 'school', x: x, z: z, w: 24, d: 14, label: 'School' });
  }

  function weeds() {
    const r = rng(7);
    for (let i = 0; i < 36; i++) {
      const x = -66 + r() * 124, z = (r() - 0.5) * 6.4;
      if (x > 23 && x < 37 && z < -1.5) continue;
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const n = 2 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5 + r() * 0.3, 4), mat(0x1f3a22));
        c.position.set((r() - 0.5) * 0.3, 0.3, (r() - 0.5) * 0.3); c.rotation.z = (r() - 0.5) * 0.4; g.add(c);
      }
      addProp(g, x, z);
    }
  }

  // ---------- build ----------
  function build(scene, mode) {
    D = mode === 'dream';
    C = { group: new THREE.Group(), props: [], colliders: [], interactables: [], lights: [], mapFeatures: [], pointLights: 0 };
    scene.add(C.group);

    const ground = paintGround();

    // Map features that are not objects
    C.mapFeatures.push({ kind: 'road', width: 7, points: [[-70, 0], [60, 0]] });
    C.mapFeatures.push({ kind: 'lane', width: 3.5, points: [[5, -3.5], [5, -45]] });
    C.mapFeatures.push({ kind: 'creek', width: 4, points: [[-70, -40], [90, -40]] });

    // Houses
    house({ x: -35, z: -14, w: 12, d: 8, wall: 0xefe0b8, roof: 0x8a4a35, door: 0x3f6fb5, porch: true, lit: [1, 3], lights: 2, label: 'Home' });
    house({ x: -5, z: -16, w: 10, d: 9, wall: 0xa9b99a, roof: 0x7a4a3a, lit: [2] });
    house({ x: 25, z: -16, w: 10, d: 9, wall: 0xd8b66a, roof: 0x6a4a42, lit: [3] });
    house({ x: -50, z: 16, w: 10, d: 9, wall: 0x9fb8c8, roof: 0x8a4a35, lit: [0], rot: Math.PI });
    house({ x: -20, z: 16, w: 9, d: 8, wall: 0xb9684f, roof: 0x4a4a52, lit: [2], rot: Math.PI });
    house({ x: 10, z: 16, w: 10, d: 9, wall: 0xb7a9bd, roof: 0x7a4a3a, lit: [3, 4], rot: Math.PI });
    house({ x: 40, z: 16, w: 10, d: 8, wall: 0xe8e4d8, roof: 0x8a4a35, lit: [1], rot: Math.PI });

    // Yard fence: open at the house's back (house spans x -41..-29) and at the side gate (x -24, z -22..-20)
    fence(-46, -38, -24, -38); fence(-46, -38, -46, -19); fence(-24, -38, -24, -22); fence(-24, -20, -24, -19);
    fence(-46, -19, -41, -19); fence(-29, -19, -24, -19);
    [-22, -20].forEach(zz => { const p = new THREE.Group(); p.position.set(-24, 0, zz); box(p, 0.25, 1.5, 0.25, T(0x8a6a45), 0, 0, 0); addProp(p, -24, zz); });
    // fences between neighbors
    fence(10, -21, 10, -11); fence(-35, 11, -35, 21); fence(-5, 11, -5, 21); fence(25, 11, 25, 21);

    // Yard contents
    tree({ x: -40, z: -31, h: 5, r: 3.8, big: true, k: 0 });
    treeHouse(-40, -31);
    sandbox(-32, -27); toyTruck(-41, -29);
    toy(-44, -24, 'box', 0x3f6fb5); toy(-36, -33, 'ball', 0xe6a93c); toy(-28, -24, 'box', 0x6c9a4a);
    toy(-43, -35, 'ball', 0xd9503f); toy(-33, -36, 'box', 0xe6a93c); toy(-27, -31, 'box', 0xd9503f);
    mailbox(-35, -4.5);

    // Street furniture, creek crossing, school
    busStop(20, -5); bus(30, -4);
    bridge(5, -40);
    schoolGate(60);
    school(78, -4);

    // Trees: street verges, house surrounds, yard
    [[-60, -7], [-18, -8], [14, -9], [42, -8], [-62, 8], [-28, 8], [-6, 8], [24, 8], [52, -8], [52, 8], [-28, -34], [-10, -30]]
      .forEach((p, i) => tree({ x: p[0], z: p[1], h: 3 + (i % 3) * 0.4, r: 2.2 + (i % 4) * 0.25, k: i + 1 }));

    if (D) weeds();

    // Interactables (day: items + the bus stop trip; dream: only the door and the looks)
    if (!D) {
      const items = [['rope', -41, -29, 'Pick up rope'], ['padlock', -24.6, -21, 'Take the padlock'], ['ball', -30, -33, 'Pick up ball'],
        ['marbles', -32, -27, 'Pick up marbles'], ['tape', -32, -9.5, 'Pick up tape'], ['torch', -38, -9.5, 'Pick up flashlight'],
        ['smallkey', -35, -4.5, 'Look inside the mailbox']];
      items.forEach(it => {
        const mesh = it[0] !== 'smallkey' ? pickupVisual(it[0], it[1], it[2]) : null;
        interact({ id: it[0], type: 'item', itemId: it[0], x: it[1], z: it[2], radius: 1.8, label: it[3], mesh });
      });
      interact({ id: 'busstop', type: 'event', eventId: 'tripped', x: 20, z: -4, radius: 3, label: '' });
    }
    interact({ id: 'frontdoor', type: 'door', x: -35, z: -8.5, radius: 1.8, label: 'Go inside' });
    interact({ id: 'treehouse', type: 'look', x: -39, z: -33, radius: 2, label: 'Climb up?', text: 'The fort. Your best friend left a comic up there. Later.' });
    interact({ id: 'gate', type: 'look', x: 60, z: 0, radius: 3, label: 'Look through the gate', text: 'Locked for the night. Past the bars, the school. You can see the front doors from here.' });

    // World edge: invisible walls just inside the bounds
    const cx = (W.minX + W.maxX) / 2, cz = (W.minZ + W.maxZ) / 2, ww = W.maxX - W.minX, dd = W.maxZ - W.minZ;
    collide(W.minX + 0.5, cz, 1, dd); collide(W.maxX - 0.5, cz, 1, dd);
    collide(cx, W.minZ + 0.5, ww, 1); collide(cx, W.maxZ - 0.5, ww, 1);

    // Lights
    if (!D) {
      const sun = new THREE.DirectionalLight(0xffe1b3, 1.4); sun.position.set(-42, 28, 42);   // southwest, ~25 deg elevation
      const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a6a3a, 0.9);
      C.group.add(sun, hemi); C.lights.unshift(sun, hemi);
    } else {
      const moon = new THREE.DirectionalLight(0x9a9ff0, 1.1); moon.position.set(60, 30, 0);   // from the east
      const hemi = new THREE.HemisphereLight(0x5a5494, 0x1a1630, 1.4);
      C.group.add(moon, hemi); C.lights.unshift(moon, hemi);
    }

    const places = [['home', -35, -12, 12], ['yard', -35, -29, 12], ['street', 0, 0, 60], ['busstop', 24, -3, 9], ['gate', 60, 0, 10]]
      .map(p => ({ id: p[0], name: SOI.data.places[p[0]].name, x: p[1], z: p[2], radius: p[3] }));

    const enemySpawns = D ? [['street', -10, 1], ['street', 0, -1], ['street', 12, 2], ['street', 45, 0],
      ['busstop', 18, -3], ['busstop', 22, -1], ['busstop', 26, -5], ['busstop', 30, 2], ['busstop', 24, 4], ['busstop', 34, -2]]
      .map(p => ({ x: p[1], z: p[2], placeId: p[0] })) : [];

    // rotY is a heading angle where forward = (sin rotY, cos rotY) in XZ; 0 faces +Z (south, toward the street)
    const spawn = { x: -35, z: -6, rotY: 0 };
    return {
      group: C.group, ground: ground, colliders: C.colliders, interactables: C.interactables,
      spawn: spawn, dreamSpawn: { x: spawn.x, z: spawn.z, rotY: spawn.rotY },
      enemySpawns: enemySpawns, places: places, mapFeatures: C.mapFeatures, props: C.props, lights: C.lights,
      skyColor: D ? 0x0d0b17 : 0x9fc6e8,
    };
  }

  return { build: build };
})();
