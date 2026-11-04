// Sleep On It - the world: one block of Maple Street built from flat-shaded primitives.
// Classic script. SOI.world.build(scene, mode) -> handle (see CONTRACTS.md, "SOI.world").
//
// Layout (meters, +X east, -Z north, street along z = 0):
//   Maple Street   paved, z -3.5..3.5, x -70..60, painted center line, curbs, sidewalks to |z| 5.5, dusty verge to 7
//   Kid's house    (-35,-14) 12 x 8, porch + door on the south face, path to the sidewalk, mailbox (-35,-4.5), driveway + hoop east
//   Yard           x -46..-24, z -38..-19, fenced; big tree + tree house (-40,-31), sandbox (-32,-27), side gate (-24,-21)
//   Neighbors      north (-5,-16) (25,-16); south (-50,16) (-20,16) (10,16) (40,16); picket fences, mailboxes, bushes
//   Dirt lane      x = 5, z -4..-46, crosses the creek (z = -40, all x) on a footbridge at (5,-40)
//   Bus stop       sign + bench at (20,-5); school bus (30,-4) along x, headlights facing west
//   School gate    pillars (60,+-3.5), iron bars between, wall x = 60 out to z = +-14 (then a plain fence to the world edge)
//   School         (78,-4) 24 x 14, faces west toward the gate, bell tower
//   Street life    power poles + sagging wires on the north verge, street lamps on the south verge, trash cans, bikes, toys
//   World edge     four invisible collider walls just inside the bounds
// Day and dream share every position and collider; only colors, lights, proportions and a few props differ.
// Look references: art/concept/world-var-a-real-ironGiant-morning*.{jpg,png} (day), r2-d2b-low-angle-school-gate.jpg and
// art/mockup/night-memory-fog-street.png (dream).
window.SOI = window.SOI || {};

SOI.world = (function () {
  'use strict';

  const W = SOI.data.world;
  let C = null;       // current build context
  let D = false;      // dream mode?
  const matCache = {};
  const geoCache = {};

  // ---------- small utilities ----------
  function hash(a, b) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }
  function rng(seed) { let t = seed >>> 0; return function () { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  // Dream tone: desaturate and darken toward violet-blue.
  function dim(hex) { const c = new THREE.Color(hex), h = {}; c.getHSL(h); c.setHSL(0.71, 0.14 + h.s * 0.18, Math.max(0.09, h.l * 0.56)); return c.getHex(); }
  function T(day, dream) { return D ? (dream !== undefined ? dream : dim(day)) : day; }
  function mat(color) {
    const k = 'l' + color;
    return matCache[k] || (matCache[k] = new THREE.MeshLambertMaterial({ color: color, flatShading: true }));
  }
  function basic(color) {
    const k = 'b' + color;
    return matCache[k] || (matCache[k] = new THREE.MeshBasicMaterial({ color: color }));
  }
  function inkMat() { return matCache.ink || (matCache.ink = new THREE.MeshBasicMaterial({ color: 0x05040a, side: THREE.BackSide })); }
  function G(key, make) { return geoCache[key] || (geoCache[key] = make()); }
  function boxGeo(w, h, d) { return G('b' + w + '_' + h + '_' + d, () => new THREE.BoxGeometry(w, h, d)); }
  function cylGeo(rt, rb, h, seg) { return G('c' + rt + '_' + rb + '_' + h + '_' + seg, () => new THREE.CylinderGeometry(rt, rb, h, seg)); }
  function blobGeo() { return G('blob', () => new THREE.IcosahedronGeometry(1, 1)); }
  function stickGeo(taper) { return G('stick' + taper, () => new THREE.CylinderGeometry(taper ? 0.45 : 1, 1, 1, 5)); }

  // box with its BASE at y (not center). Added to parent when given.
  function box(parent, w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(boxGeo(w, h, d), mat(color));
    m.position.set(x || 0, (y || 0) + h / 2, z || 0);
    if (parent) parent.add(m);
    return m;
  }
  function cyl(parent, rt, rb, h, color, x, y, z, seg) {
    const m = new THREE.Mesh(cylGeo(rt, rb, h, seg || 7), mat(color));
    m.position.set(x || 0, (y || 0) + h / 2, z || 0);
    if (parent) parent.add(m);
    return m;
  }
  function ball(parent, r, color, x, y, z, ws, hs) {
    const m = new THREE.Mesh(G('s' + (ws || 7) + '_' + (hs || 5), () => new THREE.SphereGeometry(1, ws || 7, hs || 5)), mat(color));
    m.scale.setScalar(r);
    m.position.set(x || 0, y || 0, z || 0);
    if (parent) parent.add(m);
    return m;
  }
  function blob(parent, r, color, x, y, z, sy) {
    if (parent instanceof Batch) { parent.add(blobGeo(), mat(0xffffff), { x: x, y: y, z: z, rx: x * 1.7, ry: z * 2.3, rz: y, sx: r, sy: r * (sy || 1), sz: r, c: color }); return null; }
    const m = new THREE.Mesh(blobGeo(), mat(color));
    m.scale.set(r, r * (sy || 1), r); m.position.set(x, y, z);
    m.rotation.set(x * 1.7, z * 2.3, y);
    parent.add(m); return m;
  }
  // thin cylinder from point a to point b (arrays [x,y,z] in parent space)
  const UP = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();
  function stick(parent, a, b, r, color, taper) {
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const L = _v.length();
    if (parent instanceof Batch) {
      const q = new THREE.Quaternion().setFromUnitVectors(UP, _v.normalize());
      parent.add(stickGeo(taper), mat(color), { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2, q: q, sx: r, sy: L, sz: r });
      return null;
    }
    const m = new THREE.Mesh(stickGeo(taper), mat(color));
    m.scale.set(r, L, r);
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    m.quaternion.setFromUnitVectors(UP, _v.normalize());
    parent.add(m); return m;
  }
  // dark back-face hull: the dream's ink lines around big shapes
  function ink(parent, mesh, s) {
    if (!D) return;
    const o = new THREE.Mesh(mesh.geometry, inkMat());
    o.position.copy(mesh.position); o.rotation.copy(mesh.rotation);
    o.scale.copy(mesh.scale).multiplyScalar(s || 1.03);
    parent.add(o);
  }
  // many copies of one small piece in one draw. items: { x, y, z, rx, ry, rz, sx, sy, sz, c }
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  function instanced(parent, geo, material, items) {
    const im = new THREE.InstancedMesh(geo, material, items.length);
    items.forEach((it, i) => {
      if (it.q) _q.copy(it.q); else { _e.set(it.rx || 0, it.ry || 0, it.rz || 0); _q.setFromEuler(_e); }
      _p.set(it.x, it.y, it.z); _s.set(it.sx || 1, it.sy || 1, it.sz || 1);
      _m4.compose(_p, _q, _s); im.setMatrixAt(i, _m4);
      if (it.c !== undefined) im.setColorAt(i, _c.setHex(it.c));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    parent.add(im); return im;
  }

  // Collects repeated pieces (same geometry + material) and emits one InstancedMesh per pair.
  function Batch() { this.m = {}; }
  Batch.prototype.add = function (geo, material, it) { const k = geo.uuid + material.uuid; (this.m[k] || (this.m[k] = { geo: geo, material: material, items: [] })).items.push(it); };
  Batch.prototype.flush = function (parent) { for (const k in this.m) { const b = this.m[k]; instanced(parent, b.geo, b.material, b.items); } this.m = {}; };

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
  function grp(x, z, ry) { const g = new THREE.Group(); g.position.set(x, 0, z); if (ry) g.rotation.y = ry; return g; }

  // Unit gable roof: ridge along local X at y = 1, eaves at z = +-0.5, y = 0. Scale it to fit.
  function gableGeometry() {
    return G('gable', () => {
      const A = [-0.5, 0, 0.5], B = [0.5, 0, 0.5], Cc = [0.5, 0, -0.5], Dd = [-0.5, 0, -0.5], E = [-0.5, 1, 0], F = [0.5, 1, 0];
      const tris = [A, B, F, A, F, E, Cc, Dd, E, Cc, E, F, B, Cc, F, Dd, A, E, A, Dd, Cc, A, Cc, B];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([].concat.apply([], tris), 3));
      g.computeVertexNormals();
      return g;
    });
  }
  // Unit hip/pyramid roof: base 1 x 1 at y = 0, apex at y = 1 (towers, spires).
  function pyramidGeometry() {
    return G('pyr', () => { const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); return g; });
  }
  function gable(parent, w, h, d, color, y, z) {
    const r = new THREE.Mesh(gableGeometry(), mat(color));
    r.scale.set(w, h, d); r.position.set(0, y, z || 0); parent.add(r); return r;
  }

  // ---------- ground ----------
  const POTHOLES = [[-20, 2], [10, -2], [38, 2], [-56, -2], [-6, 0], [50, -2], [-40, 2], [26, 0]];
  // a few long meandering fissures across the dream road
  function fissure(x, z) {
    const a = 1.7 * Math.sin(x * 0.19 + 0.7) + 0.6 * Math.sin(x * 0.53);
    const b = -1.2 + 1.5 * Math.sin(x * 0.27 + 2.1);
    return (Math.abs(z - a) < 0.8 && hash(Math.floor(x / 8), 3) > 0.35) || (Math.abs(z - b) < 0.6 && hash(Math.floor(x / 6), 9) > 0.55);
  }

  function groundColor(x, z, out) {
    const ix = Math.round((x - W.minX) / W.cell), iz = Math.round((z - W.minZ) / W.cell);
    const n = hash(ix, iz), n2 = hash(ix * 7 + 3, iz * 13 + 1);
    const az = Math.abs(z);
    let c = D ? (n2 < 0.3 ? 0x24304a : 0x28284a) : (n2 < 0.18 ? 0xa3a44c : 0x8aa64e);   // grass (patchy olive by day, teal-violet by night)
    let j = (n - 0.5) * 0.12;
    if (x >= -46 && x <= -24 && z >= -38 && z <= -19) c = D ? 0x2c2c4c : (n2 < 0.2 ? 0x9aa850 : 0x8fae55);   // the yard
    // fallen leaves on the lawns by day
    if (!D && az > 7 && n2 > 0.9) c = 0xc98a3c;
    // sidewalk and dusty verge
    if (x <= 60 && az > 3.5 && az <= 7) {
      if (az <= 5.5) { c = D ? 0x55506e : 0xe2dccd; j = (n - 0.5) * 0.04; if (D && n2 < 0.12) c = 0x1a1826; }
      else c = D ? 0x37324e : (n2 < 0.3 ? 0xc49a5e : 0xbfa877);
    }
    // driveway beside the kid's house
    if ((x === -26 || x === -24) && z >= -18 && z <= -6) c = D ? 0x423e58 : 0xc4beb0;
    // path from the front door
    if ((x === -36 || x === -34) && z >= -8 && z <= -4) c = D ? 0x463c55 : 0xd2c3a2;
    // school forecourt
    if (x > 60 && x <= 66 && az <= 6) c = D ? 0x46425e : 0xcfc9ba;
    // dirt lane
    if (Math.abs(x - 5) <= 2 && z >= -46 && z <= -4) c = D ? 0x463c55 : (n2 < 0.3 ? 0xc9a26c : 0xd1ae78);
    // creek and banks
    const dz = Math.abs(z + 40);
    if (dz <= 4) c = D ? 0x2a2840 : 0x8c8650;
    if (dz <= 2) { c = D ? 0x1f3058 : 0x5f8fa6; j = (n - 0.5) * 0.06; }
    // paved road: clean light grey with a dusty edge by day; cracked and pitted by night
    if (x <= 60 && az <= 3.5) {
      j = (n - 0.5) * 0.04;
      if (!D) {
        c = az >= 2 ? (n2 < 0.4 ? 0xb3ab9c : 0xadaaa4) : 0xa7a8aa;
      } else {
        c = n2 < 0.3 ? 0x36334c : 0x423f5c;
        if (fissure(x, z)) { c = 0x07060b; j = 0; }
        else if (z === 0 && n2 > 0.45) c = 0x6a6450;          // ghost of the center line
      }
      if (D) for (let p = 0; p < POTHOLES.length; p++) { if (Math.abs(x - POTHOLES[p][0]) <= 1 && Math.abs(z - POTHOLES[p][1]) <= 1) { c = 0x040307; j = 0; } }
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

  // Curbs both sides, the painted center line (day), and leaf litter along the gutters (day). In 10 m pieces so the fog
  // module can hide them cell by cell.
  function streetEdges() {
    const curb = T(0xdcd7cb, 0x4e4a64), r = rng(11);
    for (let x0 = -70; x0 < 60; x0 += 10) {
      const mx = x0 + 5;
      [-1, 1].forEach(s => { const g = grp(mx, s * 3.6); box(g, 10, 0.16, 0.25, curb, 0, 0, 0); addProp(g, mx, s * 3.6); });
      if (!D) {
        const g = grp(mx, 0);
        const ln = new THREE.Mesh(G('line', () => new THREE.PlaneGeometry(10, 0.16)), mat(0xf4f1e8));
        ln.rotation.x = -Math.PI / 2; ln.position.y = 0.03; g.add(ln);
        const leaves = [], cols = [0xd8742a, 0xe8a23a, 0xc4472a, 0xb8862e, 0xe0c050];
        for (let i = 0; i < 46; i++) {
          const side = r() < 0.5 ? -1 : 1, gutter = r() < 0.7;
          leaves.push({ x: (r() - 0.5) * 10, y: 0.035, z: side * (gutter ? 2.6 + r() * 0.85 : 5.6 + r() * 1.4), rx: -Math.PI / 2, rz: r() * 6.28, sx: 0.8 + r() * 0.6, sy: 0.8 + r() * 0.6, c: cols[Math.floor(r() * cols.length)] });
        }
        instanced(g, G('leaf', () => new THREE.PlaneGeometry(0.22, 0.16)), mat(0xffffff), leaves);
        addProp(g, mx, 0);
      }
    }
  }

  // ---------- sky ----------
  // A gradient dome (not a prop: it has no footprint, and it does not take scene fog).
  function sky() {
    const geo = new THREE.SphereGeometry(280, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2 + 0.15);
    const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), a = new THREE.Color(), b = new THREE.Color(), cl = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = Math.max(0, y / 280), az = Math.atan2(z, x);
      if (!D) {
        a.setHex(0xf2e6c8); b.setHex(0x7fb2e2);                       // warm cream horizon -> clear blue
        a.lerp(b, Math.min(1, Math.pow(t, 0.6) * 1.1));
        const sun = Math.max(0, (-x + z) / (280 * 1.41));             // warmer toward the southwest sun
        a.lerp(cl.setHex(0xffe2b0), sun * (1 - t) * 0.5);
      } else {
        a.setHex(0x2e2850); b.setHex(0x0b0916);                       // violet horizon -> near-black zenith
        a.lerp(b, Math.min(1, Math.pow(t, 0.7) * 1.15));
        const cloud = Math.max(0, Math.sin(az * 5 + 1) * Math.sin(t * 9 + az * 2)) * (t > 0.08 && t < 0.6 ? 1 : 0);
        a.lerp(cl.setHex(0x4b3f86), cloud * 0.45);
      }
      cols[i * 3] = a.r; cols[i * 3 + 1] = a.g; cols[i * 3 + 2] = a.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.position.set(10, -10, 0); dome.renderOrder = -10; dome.frustumCulled = false;
    const g = new THREE.Group(); g.add(dome);
    if (!D) {                                                           // a few soft cumulus heaps
      const cm = new THREE.MeshBasicMaterial({ color: 0xfbf6ea, fog: false }), r = rng(5);
      for (let k = 0; k < 9; k++) {
        const ang = r() * Math.PI * 2, dist = 210 + r() * 40, cy = 60 + r() * 50;
        const cx = 10 + Math.cos(ang) * dist, cz = Math.sin(ang) * dist;
        for (let i = 0; i < 4; i++) {
          const m = new THREE.Mesh(blobGeo(), cm), s = 9 + r() * 9;
          m.scale.set(s * 1.6, s * 0.7, s); m.position.set(cx + (r() - 0.5) * 30, cy + r() * 6, cz + (r() - 0.5) * 30);
          g.add(m);
        }
      }
    } else {                                                            // crescent moon in the east
      const mm = new THREE.MeshBasicMaterial({ color: 0xf2eed8, fog: false }), sm = new THREE.MeshBasicMaterial({ color: 0x15122a, fog: false });
      const disc = G('moon', () => new THREE.CircleGeometry(1, 24));
      const m1 = new THREE.Mesh(disc, mm); m1.scale.setScalar(11); m1.position.set(250, 110, -60); m1.lookAt(10, 0, 0);
      const m2 = new THREE.Mesh(disc, sm); m2.scale.setScalar(10); m2.position.set(247, 113.5, -55); m2.lookAt(10, 0, 0);
      g.add(m1, m2);
    }
    g.children.forEach(o => { o.renderOrder = -10; o.frustumCulled = false; });
    C.group.add(g);
  }

  // ---------- objects ----------
  const TRIM = 0xf6f2e6;
  // Windows go into the current batch (C.wb); the caller flushes it into its group.
  function win(g, x, y, z, rotY, lit, frame, shutter) {
    const B = C.wb, nx = Math.sin(rotY), nz = Math.cos(rotY), ax = Math.cos(rotY), az = -Math.sin(rotY);
    const put = (geo, m, ox, on) => B.add(geo, m, { x: x + ax * ox + nx * on, y: y, z: z + az * ox + nz * on, ry: rotY });
    put(G('win', () => new THREE.PlaneGeometry(1.1, 1.3)), lit ? basic(0xffb347) : mat(D ? 0x15121f : 0x8fb4c8), 0, 0);
    if (frame) {                                                         // white trim box behind the pane, mullion when lit
      put(boxGeo(1.4, 1.6, 0.08), mat(T(TRIM)), 0, -0.07);
      if (lit) put(boxGeo(0.06, 1.3, 0.04), basic(0xc8731f), 0, 0.01);
    }
    if (shutter) [-1, 1].forEach(s => put(boxGeo(0.45, 1.55, 0.08), mat(T(shutter)), s * 0.95, 0));
  }

  // o: { x, z, w, d, h, wall, roof, roofH, door, rot, lit:[front window indices], lights:n, porch, shutters, label }
  function house(o) {
    const rot = o.rot || 0;
    const g = grp(o.x, o.z, rot);
    C.wb = new Batch();
    if (D) { g.rotation.order = 'YXZ'; g.rotation.z = (hash(o.x, o.z) - 0.5) * 0.05; }     // the dream leans a little
    const w = o.w, d = o.d, h = o.h || 6.4, roofH = (o.roofH || d * 0.42) * (D ? 1.5 : 1);
    const body = box(g, w, h, d, T(o.wall), 0, 0, 0); ink(g, body);
    const trim = T(TRIM);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(p => box(g, 0.28, h, 0.28, trim, p[0] * w / 2, 0, p[1] * d / 2));   // corner boards
    box(g, w + 0.3, 0.3, d + 0.3, trim, 0, h - 0.3, 0);                         // eave band
    box(g, w + 0.15, 0.45, d + 0.15, T(0xcfc6b2), 0, 0, 0);                    // foundation band
    const roof = gable(g, w + 1.0, roofH, d + 1.5, T(o.roof), h); ink(g, roof);
    box(g, 0.9, roofH * 0.8 + 1.0, 0.9, T(0xa0503c), w * 0.3, h, -d * 0.12);    // brick chimney
    box(g, 1.15, 0.22, 1.15, T(0x5a4a44), w * 0.3, h + roofH * 0.8 + 1.0, -d * 0.12);
    const dx = o.porch ? 0 : w * 0.05;
    box(g, 1.6, 2.6, 0.12, trim, dx, 0.1, d / 2 + 0.02);                         // door frame
    box(g, 1.2, 2.3, 0.2, T(o.door || 0x7a4a2f), dx, 0.15, d / 2 + 0.05);       // door
    // windows: front (lower row leaves the door clear), back, sides
    const fx = w * 0.32, low = [-fx, fx], up = [-fx, 0, fx], front = [];
    low.forEach(x => front.push([x, 1.9])); up.forEach(x => front.push([x, 5.1]));
    const lit = o.lit || [];
    let lightsLeft = D ? (o.lights || 1) : 0;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    front.forEach((p, i) => {
      const isLit = D && (lit.indexOf(i) >= 0 || hash(o.x + i, o.z) > 0.72);
      win(g, p[0], p[1], d / 2 + 0.06, 0, isLit, true, o.shutters);
      if (D && lit.indexOf(i) >= 0 && lightsLeft > 0) {
        lightsLeft--;
        const lx = p[0], lz = d / 2 + 1.5;
        addLight(o.x + lx * cs + lz * sn, p[1], o.z - lx * sn + lz * cs);
      }
    });
    low.concat(up).forEach((x, i) => win(g, x, i < 2 ? 1.9 : 5.1, -d / 2 - 0.04, Math.PI, D && hash(o.x, i) > 0.8, false));
    [1.9, 5.1].forEach((y, i) => { win(g, w / 2 + 0.06, y, 0, Math.PI / 2, D && hash(o.z, i) > 0.75, true); win(g, -w / 2 - 0.06, y, 0, -Math.PI / 2, false, true); });
    if (o.porch) {
      const wood = T(0xb89a6a), pz = d / 2 + 1.5;
      box(g, 7, 0.4, 3, wood, 0, 0, pz);                                         // porch deck
      box(g, 7.4, 0.22, 3.4, T(o.roof), 0, 3.1, pz);                             // porch roof
      const cg = gable(g, 3.6, 1.5, 7.6, T(o.roof), 3.3, pz); cg.rotation.y = Math.PI / 2;   // front cross gable
      box(g, 0.1, 1.4, 0.1, trim, 0, 3.4, pz + 1.75);                             // gable trim post
      [-3.2, 3.2].forEach(xx => { box(g, 0.26, 3.1, 0.26, trim, xx, 0, d / 2 + 2.8); box(g, 0.22, 3.1, 0.22, trim, xx, 0, d / 2 + 0.3); });
      [-1, 1].forEach(s => {                                                     // railings either side of the steps
        box(g, 2.2, 0.1, 0.1, trim, s * 2.1, 1.25, d / 2 + 2.85);
        box(g, 2.2, 0.1, 0.1, trim, s * 2.1, 0.55, d / 2 + 2.85);
        for (let k = 0; k < 5; k++) box(g, 0.07, 0.75, 0.07, trim, s * (1.1 + k * 0.45), 0.45, d / 2 + 2.85);
        box(g, 0.1, 0.1, 2.6, trim, s * 3.2, 1.25, pz);
      });
      box(g, 2.0, 0.27, 0.6, wood, 0, 0, d / 2 + 3.25);                          // two steps
      box(g, 2.0, 0.14, 0.6, wood, 0, 0, d / 2 + 3.8);
      [-1, 1].forEach(s => { stick(g, [s * 1.05, 1.1, d / 2 + 3.0], [s * 1.05, 0.8, d / 2 + 4.0], 0.04, trim); box(g, 0.08, 1.1, 0.08, trim, s * 1.05, 0, d / 2 + 4.0); });
    } else {
      box(g, 2.4, 0.3, 1.3, T(0xc9c3b4), dx, 0, d / 2 + 0.65);                   // stoop
      box(g, 2.0, 0.15, 0.5, T(0xc9c3b4), dx, 0, d / 2 + 1.5);                   // step
      [-1, 1].forEach(s => { box(g, 0.08, 1.0, 0.08, trim, dx + s * 1.1, 0.3, d / 2 + 1.2); box(g, 0.08, 0.08, 1.2, trim, dx + s * 1.1, 1.3, d / 2 + 0.7); });
      const hd = gable(g, 2.4, 0.7, 1.3, T(o.roof), 2.85, d / 2 + 0.6); hd.position.x = dx;   // little door hood
    }
    C.wb.flush(g);
    addProp(g, o.x, o.z);
    collide(o.x, o.z, w, d);
    C.mapFeatures.push({ kind: 'house', x: o.x, z: o.z, w: w, d: d, label: o.label });
    return g;
  }

  const CANOPY = [0xe0862c, 0xe9a93a, 0xa3a23c, 0xc9562e, 0xe6c04a, 0x8e9a3c, 0xd9702a];
  // o: { x, z, h, r, big, k, open (keep the south side clear for the tree house), bg (no collider, background) }
  function tree(o) {
    const g = grp(o.x, o.z);
    const th = (o.h || 3.2) * (D ? 1.35 : 1), tr = o.big ? 0.6 : 0.3, cr = o.r || 2.4, k = o.k || 0;
    const bark = T(0x6b4a2f, 0x221e2c), B = new Batch();
    cyl(g, tr * 0.7, tr, th, bark, 0, 0, 0, 6);
    if (o.big) cyl(g, tr, tr * 1.7, 0.7, bark, 0, 0, 0, 6);                       // root flare
    if (!D) {
      const top = o.open ? th + 3.6 : th + cr * 0.35, n = o.big ? 7 : 3 + (k % 3);
      stick(B, [0, th * 0.8, 0], [cr * 0.5, top, -cr * 0.2], tr * 0.35, bark, true);
      stick(B, [0, th * 0.85, 0], [-cr * 0.45, top + 0.2, cr * 0.1], tr * 0.35, bark, true);
      for (let i = 0; i < n; i++) {
        const a = i * 2.4 + k, rr = i === 0 ? 0 : cr * (o.big ? 0.75 : 0.6);
        let bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
        if (o.open) { bz = Math.min(bz, 0) * 0.8 - 2.2; bx *= 1.25; }
        const s = cr * (i === 0 ? 0.95 : 0.6 + hash(k, i) * 0.25);
        blob(B, s, CANOPY[(k + i) % CANOPY.length], bx, top + (i === 0 ? cr * 0.35 : (hash(i, k) - 0.3) * cr * 0.6), bz, 0.82);
      }
    } else {
      // bare and spindly: 3 to 5 tilted limbs, each with a twig
      const n = o.big ? 6 : 3 + (k % 3), r = rng(k * 31 + 7);
      for (let i = 0; i < n; i++) {
        const yaw = i * (Math.PI * 2 / n) + r(), tilt = (o.big ? 0.6 : 0.35) + r() * 0.5, len = cr * ((o.big ? 1.2 : 0.9) + r() * 0.5);
        const y0 = th * (0.7 + r() * 0.28), base = [0, y0, 0];
        const end = [Math.sin(tilt) * Math.cos(yaw) * len, y0 + Math.cos(tilt) * len, Math.sin(tilt) * Math.sin(yaw) * len];
        stick(B, base, end, tr * 0.32, bark, true);
        const t2 = tilt + 0.5, l2 = len * 0.55, yaw2 = yaw + (r() - 0.5) * 1.2;
        stick(B, end, [end[0] + Math.sin(t2) * Math.cos(yaw2) * l2, end[1] + Math.cos(t2) * l2, end[2] + Math.sin(t2) * Math.sin(yaw2) * l2], tr * 0.15, bark, true);
      }
      stick(B, [0, th * 0.9, 0], [0.3, th + cr * 0.9, -0.2], tr * 0.3, bark, true);   // leader
    }
    B.flush(g);
    addProp(g, o.x, o.z);
    if (!o.bg) { const s = o.big ? 1.5 : 1.0; collide(o.x, o.z, s, s); }
    C.mapFeatures.push({ kind: 'tree', x: o.x, z: o.z });
    return g;
  }

  // Straight axis-aligned board fence from (x1,z1) to (x2,z2). Thin collider box. style 'iron' = spiked bars.
  function fence(x1, z1, x2, z2, color, h, style) {
    const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    const g = grp(mx, mz, Math.atan2(-dz, dx));
    h = h || 1.2;
    const n = Math.max(1, Math.round(L / 2));
    if (style === 'iron') {
      const col = color;
      box(g, L, 0.08, 0.08, col, 0, h * 0.85, 0); box(g, L, 0.08, 0.08, col, 0, 0.3, 0);
      const bars = [], tips = [], nb = Math.max(2, Math.round(L / 0.6));
      for (let i = 0; i <= nb; i++) { const x = -L / 2 + (L * i) / nb; bars.push({ x: x, y: h / 2, z: 0, sy: h }); tips.push({ x: x, y: h + 0.1, z: 0 }); }
      instanced(g, boxGeo(0.06, 1, 0.06), mat(col), bars);
      instanced(g, cylGeo(0, 0.07, 0.22, 4), mat(col), tips);
      const ps = [];
      for (let i = 0; i <= n; i++) ps.push({ x: -L / 2 + (L * i) / n, y: (h + 0.2) / 2, z: 0, sy: h + 0.2 });
      instanced(g, boxGeo(0.14, 1, 0.14), mat(col), ps);
    } else {
      const wood = color ? color : T(0x8d6b48), post = color ? color : T(0x6e5235);
      box(g, L, h * 0.95, 0.06, wood, 0, 0.08, 0);                              // board panel
      box(g, L, 0.1, 0.14, post, 0, h * 0.82, 0);                                // top rail
      const ps = [];
      for (let i = 0; i <= n; i++) ps.push({ x: -L / 2 + (L * i) / n, y: (h + 0.1) / 2, z: 0, sy: h + 0.1 });
      instanced(g, boxGeo(0.16, 1, 0.16), mat(post), ps);
    }
    addProp(g, mx, mz);
    if (Math.abs(dx) >= Math.abs(dz)) collide(mx, mz, L, 0.3, h); else collide(mx, mz, 0.3, L, h);
    return g;
  }

  // White picket fence along x at z, from x1 to x2 (front yards). Collider is thin and low.
  function picket(x1, x2, z) {
    const L = x2 - x1, mx = (x1 + x2) / 2, g = grp(mx, z), col = T(0xf4f0e6);
    box(g, L, 0.08, 0.05, col, 0, 0.3, -0.05); box(g, L, 0.08, 0.05, col, 0, 0.75, -0.05);
    const ps = [], tips = [], np = Math.round(L / 0.3);
    for (let i = 0; i <= np; i++) { const x = -L / 2 + (L * i) / np; ps.push({ x: x, y: 0.47, z: 0, sy: 0.94 }); tips.push({ x: x, y: 1.0, z: 0, ry: Math.PI / 4 }); }
    instanced(g, boxGeo(0.11, 1, 0.04), mat(col), ps);
    instanced(g, cylGeo(0, 0.08, 0.14, 4), mat(col), tips);
    addProp(g, mx, z); collide(mx, z, L, 0.25, 1.0);
  }

  function mailbox(x, z, color, feature) {
    const g = grp(x, z);
    box(g, 0.14, 1.05, 0.14, T(0x6b4a2f), 0, 0, 0);
    const c = T(color || 0x3a3d44);
    box(g, 0.48, 0.3, 0.8, c, 0, 1.05, 0);
    const lid = cyl(g, 0.24, 0.24, 0.8, c, 0, 1.35, 0, 8); lid.rotation.x = Math.PI / 2; lid.position.y = 1.35;
    box(g, 0.04, 0.5, 0.06, T(0xd9503f), 0.27, 1.25, 0.15); box(g, 0.04, 0.16, 0.26, T(0xd9503f), 0.27, 1.6, 0.25);   // flag, up
    addProp(g, x, z);
    if (feature) C.mapFeatures.push({ kind: 'mailbox', x: x, z: z });
  }

  function treeHouse(x, z) {
    const g = grp(x, z), py = 4.2, wood = T(0x8a6a45), plank = T(0xa58257), dark = T(0x5e4630);
    box(g, 3.8, 0.22, 3.8, wood, 0, py, 0.3);                                    // platform
    [[-1.6, 1.9], [1.6, 1.9]].forEach(p => stick(g, [p[0] * 0.2, py - 1.6, 0.2], [p[0], py, p[1]], 0.07, dark));   // braces
    const fort = new THREE.Group(); fort.position.set(0, py + 0.22, 0.3); fort.rotation.z = D ? 0.07 : 0.02;
    const walls = box(fort, 2.8, 2.1, 2.6, plank, 0, 0, 0); ink(fort, walls);
    for (let i = 1; i < 5; i++) box(fort, 2.84, 0.04, 2.64, dark, 0, i * 0.42, 0);   // plank seams all round
    const roof = gable(fort, 3.4, 1.3, 3.3, T(0x6e5a48), 2.1); roof.rotation.z = 0.06; ink(fort, roof);
    const holeLit = D ? basic(0xffb347) : mat(0x2a2620);
    const wnd = new THREE.Mesh(boxGeo(0.7, 0.7, 0.05), holeLit); wnd.position.set(-0.5, 1.2, 1.32); fort.add(wnd);
    box(fort, 0.86, 0.08, 0.1, wood, -0.5, 0.8, 1.33);                            // sill
    const door = new THREE.Mesh(boxGeo(0.8, 1.35, 0.05), holeLit); door.position.set(0.5, 0.7, -1.32); fort.add(door);
    // flag on the ridge
    stick(fort, [-1.3, 3.3, 0], [-1.3, 4.5, 0], 0.03, dark);
    box(fort, 0.6, 0.36, 0.03, T(0xd9503f, 0x6a2a3a), -1.0, 4.08, 0);
    g.add(fort);
    // railing on the open south edge of the platform
    box(g, 3.8, 0.08, 0.08, wood, 0, py + 0.9, 2.15);
    for (let i = 0; i < 5; i++) box(g, 0.07, 0.7, 0.07, wood, -1.8 + i * 0.9, py + 0.2, 2.15);
    // rope ladder from the platform down to the foot near (-39,-33)
    const rope = T(0xc2a46e), top = [1.0, py, -1.6], foot = [1.0, 0.05, -2.1], B = new Batch();
    [-0.28, 0.28].forEach(o => stick(B, [top[0] + o, top[1], top[2]], [foot[0] + o, foot[1], foot[2]], 0.03, rope));
    for (let i = 1; i < 10; i++) { const t = i / 10, y = py * (1 - t), zz = top[2] + (foot[2] - top[2]) * t; stick(B, [0.72, y, zz], [1.28, y, zz], 0.035, rope); }
    B.flush(g);
    addProp(g, x, z);
    if (D) addLight(x - 0.5, py + 1.6, z + 2.6);
    C.mapFeatures.push({ kind: 'treehouse', x: x, z: z });
  }

  function sandbox(x, z) {
    const g = grp(x, z);
    box(g, 3, 0.18, 3, T(0xe3cf9a), 0, 0, 0);
    const wood = T(0x8a6a45);
    box(g, 3.3, 0.35, 0.15, wood, 0, 0, 1.58); box(g, 3.3, 0.35, 0.15, wood, 0, 0, -1.58);
    box(g, 0.15, 0.35, 3, wood, 1.58, 0, 0); box(g, 0.15, 0.35, 3, wood, -1.58, 0, 0);
    box(g, 0.5, 0.4, 0.4, T(0xd9503f), -0.8, 0.18, -0.6);                       // bucket block
    box(g, 0.08, 0.05, 0.6, T(0x3f6fb5), 0.6, 0.2, 0.5);                         // spade
    addProp(g, x, z);
  }

  function wheel(g, r, x, y, z, color, rotY) {
    const m = new THREE.Mesh(G('tor' + r, () => new THREE.TorusGeometry(r, r * 0.11, 5, 14)), mat(color));
    m.position.set(x, y, z); if (rotY) m.rotation.y = rotY; g.add(m); return m;
  }
  function toyTruck(x, z) {
    const g = grp(x, z, 0.5);
    box(g, 1.1, 0.4, 0.6, T(0xd9503f), 0, 0.2, 0); box(g, 0.4, 0.4, 0.6, T(0xe6a93c), 0.4, 0.5, 0);
    [[-0.35, 0.3], [0.35, 0.3], [-0.35, -0.3], [0.35, -0.3]].forEach(p => {
      const wh = cyl(g, 0.12, 0.12, 0.1, T(0x222222), p[0], 0, p[1], 6); wh.rotation.x = Math.PI / 2; wh.position.y = 0.14;
    });
    addProp(g, x, z);
  }

  function toy(x, z, kind, color) {
    const g = grp(x, z, x);
    if (kind === 'ball') ball(g, 0.28, T(color), 0, 0.28, 0, 6, 4); else box(g, 0.5, 0.5, 0.5, T(color), 0, 0, 0);
    addProp(g, x, z);
  }

  // A kid's bike, leaning. ry = heading of the bike's length axis.
  function bike(x, z, ry, color, lean) {
    const g = grp(x, z, ry), f = T(color), tire = T(0x1e1e22), steel = T(0xb8b8bc);
    const lg = new THREE.Group(); lg.rotation.x = lean || 0.22; g.add(lg);
    wheel(lg, 0.34, -0.55, 0.37, 0, tire); wheel(lg, 0.34, 0.55, 0.37, 0, tire);
    const bb = [-0.05, 0.38, 0], seat = [-0.25, 0.85, 0], head = [0.4, 0.85, 0];
    stick(lg, bb, seat, 0.03, f); stick(lg, bb, head, 0.03, f); stick(lg, seat, head, 0.028, f);
    stick(lg, bb, [-0.55, 0.37, 0], 0.025, f); stick(lg, seat, [-0.55, 0.37, 0], 0.022, f);
    stick(lg, head, [0.55, 0.37, 0], 0.028, steel);
    stick(lg, head, [0.36, 1.08, 0], 0.025, steel); stick(lg, [0.36, 1.08, -0.25], [0.36, 1.08, 0.25], 0.025, steel);
    box(lg, 0.3, 0.06, 0.14, T(0xe8e0d0, 0x2a2733), -0.28, 0.9, 0);              // seat
    addProp(g, x, z); collide(x, z, Math.abs(Math.cos(ry)) > 0.5 ? 1.5 : 0.5, Math.abs(Math.cos(ry)) > 0.5 ? 0.5 : 1.5);
  }

  function tricycle(x, z, ry) {
    const g = grp(x, z, ry), f = T(0xc8342c), tire = T(0x1e1e22);
    wheel(g, 0.3, 0.45, 0.31, 0, tire);
    wheel(g, 0.17, -0.35, 0.18, 0.3, tire); wheel(g, 0.17, -0.35, 0.18, -0.3, tire);
    stick(g, [-0.35, 0.18, -0.3], [-0.35, 0.18, 0.3], 0.03, f);
    stick(g, [-0.35, 0.2, 0], [0.42, 0.6, 0], 0.04, f); stick(g, [0.45, 0.31, 0], [0.42, 0.85, 0], 0.03, f);
    stick(g, [0.42, 0.85, -0.22], [0.42, 0.85, 0.22], 0.025, T(0xd8d8d8));
    box(g, 0.28, 0.07, 0.22, T(0x2a2a2e), -0.1, 0.45, 0);
    addProp(g, x, z); collide(x, z, 1.0, 0.8);
  }

  function wagon(x, z, ry) {
    const g = grp(x, z, ry), red = T(0xc0332a), tire = T(0x1e1e22);
    box(g, 1.3, 0.32, 0.72, red, 0, 0.28, 0); box(g, 1.18, 0.05, 0.6, T(0x7a2018), 0, 0.56, 0);
    [[-0.45, 0.4], [0.45, 0.4], [-0.45, -0.4], [0.45, -0.4]].forEach(p => {
      const wh = cyl(g, 0.16, 0.16, 0.08, tire, p[0], 0, p[1], 8); wh.rotation.x = Math.PI / 2; wh.position.y = 0.16;
    });
    stick(g, [0.65, 0.3, 0], [1.2, 0.95, 0], 0.03, T(0x2a2a2e)); stick(g, [1.2, 0.95, -0.15], [1.2, 0.95, 0.15], 0.04, T(0x2a2a2e));
    addProp(g, x, z); collide(x, z, 1.5, 0.9);
  }

  function hoop(x, z, ry) {
    const g = grp(x, z, ry), pole = T(0x8a8d92);
    cyl(g, 0.07, 0.09, 3.1, pole, 0, 0, 0, 6);
    stick(g, [0, 3.0, 0], [0, 3.15, 0.55], 0.05, pole);
    box(g, 1.3, 0.85, 0.06, T(0xf2efe6), 0, 2.85, 0.6);
    box(g, 0.5, 0.36, 0.07, T(0xc8452c), 0, 2.95, 0.6);
    const rim = wheel(g, 0.24, 0, 3.0, 0.9, T(0xe0662a)); rim.rotation.x = Math.PI / 2;
    const net = new THREE.Mesh(cylGeo(0.24, 0.15, 0.42, 8), new THREE.MeshBasicMaterial({ color: D ? 0x4a4660 : 0xf6f4ee, wireframe: true }));
    net.position.set(0, 2.78, 0.9); g.add(net);
    addProp(g, x, z); collide(x, z, 0.4, 0.4);
  }

  function bush(x, z, s, flowers) {
    const g = grp(x, z);
    const leaf = T(0x56743a);
    blob(g, 0.8 * s, leaf, 0, 0.55 * s, 0, 0.8); blob(g, 0.6 * s, T(0x66843f), 0.55 * s, 0.4 * s, 0.15, 0.8); blob(g, 0.55 * s, leaf, -0.5 * s, 0.38 * s, -0.1, 0.8);
    if (flowers) for (let i = 0; i < 6; i++) ball(g, 0.1, T(flowers), Math.cos(i * 2.1) * 0.65 * s, 0.6 * s + (i % 3) * 0.15, Math.sin(i * 2.1) * 0.5 * s + 0.2, 4, 3);
    addProp(g, x, z);
  }

  function gardenBed(x, z, ry) {
    const g = grp(x, z, ry), wood = T(0x7a5a38);
    box(g, 4.4, 0.32, 1.3, wood, 0, 0, 0); box(g, 4.2, 0.06, 1.1, T(0x4a3426), 0, 0.3, 0);
    const cols = [0xd9503f, 0xe8a23a, 0xe6c84a, 0xc84a7a];
    for (let i = 0; i < 7; i++) {
      blob(g, 0.26, T(0x5f8a3e), -1.8 + i * 0.6, 0.5, 0, 0.9);
      ball(g, 0.1, T(cols[i % cols.length]), -1.8 + i * 0.6, 0.74, 0.08, 4, 3);
    }
    addProp(g, x, z); collide(x, z, Math.abs(Math.cos(ry || 0)) > 0.5 ? 4.4 : 1.3, Math.abs(Math.cos(ry || 0)) > 0.5 ? 1.3 : 4.4, 0.4);
  }

  function trashCan(x, z, lidOff) {
    const g = grp(x, z), metal = T(0x9aa0a6);
    cyl(g, 0.33, 0.28, 0.9, metal, 0, 0, 0, 9);
    [0.25, 0.6].forEach(y => cyl(g, 0.335, 0.335, 0.04, T(0x7e848a), 0, y, 0, 9));
    const lid = cyl(g, 0.37, 0.37, 0.06, metal, lidOff ? 0.25 : 0, 0.9, 0, 9); if (lidOff) lid.rotation.z = 0.3;
    box(g, 0.2, 0.06, 0.06, T(0x6e747a), lidOff ? 0.25 : 0, 0.98, 0);
    addProp(g, x, z); collide(x, z, 0.7, 0.7);
  }

  function powerPole(x, z) {
    const g = grp(x, z), wood = T(0x6e5438, 0x2a2430);
    if (D) g.rotation.z = (hash(x, 4) - 0.5) * 0.07;
    cyl(g, 0.13, 0.17, 8.6, wood, 0, 0, 0, 6);
    box(g, 0.14, 0.14, 2.4, wood, 0, 7.6, 0); box(g, 0.12, 0.12, 1.4, wood, 0, 6.9, 0);
    [-1.05, 0, 1.05].forEach(zz => cyl(g, 0.05, 0.05, 0.18, T(0x8aa0a8, 0x3a3a50), 0, 7.74, zz, 5));
    cyl(g, 0.28, 0.28, 0.6, T(0x8a8d92), 0.25, 6.0, 0, 7);                       // transformer can
    addProp(g, x, z); collide(x, z, 0.4, 0.4);
  }
  // two sagging wires between poles at (x1, z) and (x2, z), each a short chain of thin sticks
  function wires(x1, x2, z, extra) {
    const mx = (x1 + x2) / 2, g = grp(mx, z), col = T(0x26262a, 0x0c0b12), L = x2 - x1, sag = 0.9, N = 5, B = new Batch();
    [-1.05, 1.05].forEach(zz => {
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const t = i / N, p = [-L / 2 + L * t, 7.82 - sag * 4 * t * (1 - t), zz];
        if (prev) stick(B, prev, p, 0.022, col);
        prev = p;
      }
    });
    if (extra) { let prev = null; extra.forEach(p => { const q = [p[0] - mx, p[1], p[2] - z]; if (prev) stick(B, prev, q, 0.02, col); prev = q; }); }
    B.flush(g);
    addProp(g, mx, z);
  }

  function streetLamp(x, z) {
    const g = grp(x, z), iron = T(0x2e3a34, 0x14121c);
    cyl(g, 0.07, 0.11, 4.2, iron, 0, 0, 0, 6);
    cyl(g, 0.18, 0.22, 0.25, iron, 0, 0, 0, 6);
    box(g, 0.42, 0.08, 0.42, iron, 0, 4.2, 0);
    const glass = D ? basic(0xffd08a) : mat(0xe8e2c8);
    const lamp = new THREE.Mesh(boxGeo(0.32, 0.5, 0.32), glass); lamp.position.set(0, 4.55, 0); g.add(lamp);
    const cap = new THREE.Mesh(pyramidGeometry(), mat(iron)); cap.scale.set(0.55, 0.35, 0.55); cap.position.y = 4.8; g.add(cap);
    addProp(g, x, z); collide(x, z, 0.35, 0.35);
  }

  function stopSign(x, z, ry) {
    const g = grp(x, z, ry);
    cyl(g, 0.05, 0.05, 2.5, T(0x8a8d92), 0, 0, 0, 6);
    const o1 = cyl(g, 0.4, 0.4, 0.04, T(0xf4f0e6), 0, 2.2, 0.06, 8); o1.rotation.set(Math.PI / 2, 0, Math.PI / 8); o1.position.y = 2.2;
    const o2 = cyl(g, 0.35, 0.35, 0.05, T(0xc8302a), 0, 2.2, 0.08, 8); o2.rotation.set(Math.PI / 2, 0, Math.PI / 8); o2.position.y = 2.2;
    addProp(g, x, z); collide(x, z, 0.3, 0.3);
  }

  // Pickup visuals (day only).
  function pickupVisual(id, x, z) {
    const g = grp(x, z);
    if (id === 'rope') { cyl(g, 0.3, 0.3, 0.14, 0xb59a6a, 0, 0, 0, 8); box(g, 0.1, 0.08, 0.7, 0xb59a6a, 0.3, 0, 0.5); }
    else if (id === 'padlock') { box(g, 0.28, 0.3, 0.12, 0x4a4a52, 0, 0.9, 0); box(g, 0.16, 0.16, 0.1, 0x8a8a92, 0, 1.2, 0); }
    else if (id === 'ball') ball(g, 0.3, 0xd9503f, 0, 0.3, 0, 7, 5);
    else if (id === 'marbles') [[0, 0.2, 0xd9503f], [0.2, -0.1, 0x3f6fb5], [-0.15, -0.2, 0x6c9a4a]].forEach(p => ball(g, 0.1, p[2], p[0], 0.28, p[1], 5, 4));
    else if (id === 'tape') cyl(g, 0.22, 0.22, 0.14, 0x9a9aa0, 0, 0.35, 0, 8);
    else if (id === 'torch') { const m = cyl(g, 0.07, 0.07, 0.4, 0xe6a93c, 0, 0.35, 0, 6); m.rotation.z = Math.PI / 2; }
    return addProp(g, x, z);
  }

  // School bus: conventional nose (hood) at the west end, 11 m overall, headlights facing west.
  function bus(x, z) {
    const g = grp(x, z);
    const body = T(0xf2b51e, 0x86672a), dark = T(0x1c1a20, 0x0a090f), chrome = T(0xcfcfcc, 0x3a3848), glass = T(0x3a4656, 0x0f0e16);
    const shell = box(g, 9.4, 2.4, 2.6, body, 0.8, 0.55, 0); ink(g, shell);
    const roof = box(g, 9.2, 0.25, 2.4, T(0xf6c64a, 0x5a4519), 0.8, 2.95, 0);
    const hood = box(g, 1.6, 1.3, 2.3, body, -4.7, 0.55, 0); ink(g, hood);
    box(g, 0.08, 0.9, 1.4, T(0xb8b8b4, 0x2a2834), -5.52, 0.6, 0);               // grille
    box(g, 9.44, 0.12, 2.64, dark, 0.8, 1.35, 0); box(g, 9.44, 0.12, 2.64, dark, 0.8, 1.05, 0);   // black rub stripes
    box(g, 0.3, 0.3, 2.7, chrome, -5.45, 0.35, 0); box(g, 0.3, 0.3, 2.7, chrome, 5.4, 0.35, 0);   // bumpers
    box(g, 9.4, 0.25, 2.62, dark, 0.8, 0.4, 0);                                  // skirt
    for (let i = 0; i < 6; i++) {
      const wx = -2.6 + i * 1.45, lit = D && (i === 1 || i === 2 || i === 4);
      const wm = lit ? basic(0xff9f3a) : mat(glass);
      [1.32, -1.32].forEach(zz => { const p = new THREE.Mesh(boxGeo(1.1, 0.85, 0.05), wm); p.position.set(wx, 2.05, zz); g.add(p); });
    }
    box(g, 0.05, 1.0, 2.2, glass, -3.92, 1.85, 0);                               // windshield
    [0.9, -0.9].forEach(zz => box(g, 0.1, 0.2, 0.25, T(0xd9402a, 0x5a2020), -3.95, 2.85, zz));   // warning lamps
    const arm = cyl(g, 0.3, 0.3, 0.04, T(0xc8302a, 0x4a2028), -3.2, 1.6, 1.38, 8); arm.rotation.x = Math.PI / 2; arm.position.y = 1.6;
    [[-3.6, 1.3], [-3.6, -1.3], [3.4, 1.3], [3.4, -1.3]].forEach(p => {
      const wh = cyl(g, 0.5, 0.5, 0.3, 0x111111, p[0], 0, p[1], 8); wh.rotation.x = Math.PI / 2; wh.position.y = 0.5;
      const hub = cyl(g, 0.22, 0.22, 0.32, chrome, p[0], 0, p[1], 6); hub.rotation.x = Math.PI / 2; hub.position.y = 0.5;
    });
    [0.75, -0.75].forEach(zz => {                                                // headlights face west
      const hl = new THREE.Mesh(cylGeo(0.2, 0.2, 0.06, 10), D ? basic(0xfff0a0) : mat(0xe8e4d0));
      hl.rotation.z = Math.PI / 2; hl.position.set(-5.53, 1.15, zz); g.add(hl);
      if (D) {                                                                   // soft beams in the haze
        const beam = new THREE.Mesh(G('beam', () => { const c = new THREE.ConeGeometry(1.4, 9, 10, 1, true); c.translate(0, -4.5, 0); return c; }),
          matCache.beam || (matCache.beam = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.03, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
        beam.position.set(-5.6, 1.15, zz); beam.rotation.z = -Math.PI / 2 - 0.06; g.add(beam);
      }
    });
    if (D) {                                                                      // rust streaks
      box(g, 0.6, 1.4, 0.03, 0x3a2216, 1, 0.8, 1.33); box(g, 0.5, 1.0, 0.03, 0x3a2216, -2.5, 0.9, 1.33); box(g, 0.7, 1.2, 0.03, 0x3a2216, 3.5, 0.8, -1.33);
    }
    void roof;
    addProp(g, x, z);
    collide(x, z, 11, 2.6);
    C.mapFeatures.push({ kind: 'bus', x: x, z: z, w: 11, d: 2.6, rot: 0 });
    if (D) {                                                                      // the headlights actually throw light (a spot, not a point light)
      const sp = new THREE.SpotLight(0xffe6a0, 2.2, 32, 0.5, 0.6, 1.2);
      sp.position.set(x - 5.6, 1.2, z); sp.target.position.set(x - 25, 0, z + 0.5);
      C.group.add(sp, sp.target); C.lights.push(sp);
    }
  }

  function busStop(x, z) {
    const s = grp(x - 1, z);
    cyl(s, 0.06, 0.06, 2.7, T(0x8a8d92), 0, 0, 0, 6);
    box(s, 0.7, 0.9, 0.06, T(0xf4f0e6), 0, 1.9, 0);
    box(s, 0.7, 0.3, 0.07, T(0x2f5fa8), 0, 2.45, 0);
    box(s, 0.4, 0.22, 0.08, T(0xf2b51e), 0, 2.05, 0);                            // little bus icon
    addProp(s, x - 1, z); collide(x - 1, z, 0.4, 0.4);
    const b = grp(x + 1.5, z - 0.2);
    const slat = T(0x3f6a4a);
    box(b, 2, 0.08, 0.6, slat, 0, 0.5, 0); box(b, 2, 0.08, 0.6, slat, 0, 0.5, 0); box(b, 2, 0.12, 0.06, slat, 0, 0.75, -0.28); box(b, 2, 0.12, 0.06, slat, 0, 0.95, -0.28);
    box(b, 0.1, 0.5, 0.5, T(0x35333d), -0.9, 0, 0); box(b, 0.1, 0.5, 0.5, T(0x35333d), 0.9, 0, 0);
    box(b, 0.08, 1.0, 0.08, T(0x35333d), -0.9, 0, -0.3); box(b, 0.08, 1.0, 0.08, T(0x35333d), 0.9, 0, -0.3);
    addProp(b, x + 1.5, z - 0.2); collide(x + 1.5, z - 0.2, 2, 0.7, 1.2);
    C.mapFeatures.push({ kind: 'busstop', x: x, z: z });
  }

  function bridge(x, z) {
    const g = grp(x, z);
    const wood = T(0x9a7448), dk = T(0x6b4a2f);
    box(g, 3.6, 0.2, 6, wood, 0, 0.1, 0);
    for (let i = 0; i < 6; i++) box(g, 3.7, 0.04, 0.12, dk, 0, 0.3, -2.5 + i);
    [-1.75, 1.75].forEach(xx => { box(g, 0.1, 0.9, 6, wood, xx, 0.3, 0); [-2.8, 0, 2.8].forEach(zz => box(g, 0.2, 1.1, 0.2, dk, xx, 0, zz)); });
    addProp(g, x, z);
    C.mapFeatures.push({ kind: 'bridge', x: x, z: z, rot: 0 });
  }

  function schoolGate(x) {
    const ph = D ? 6.5 : 4, stone = T(0xb0654a, 0x4e4a62), cap = T(0xd9d0bd, 0x625d76), iron = D ? 0x100e18 : 0x2a2a32;
    [-3.5, 3.5].forEach(zz => {
      const g = grp(x, zz);
      const p = box(g, 1, ph, 1, stone, 0, 0, 0); ink(g, p, 1.05);
      box(g, 1.35, 0.3, 1.35, cap, 0, ph, 0); box(g, 1.2, 0.4, 1.2, stone, 0, 0, 0);
      if (D) blob(g, 0.5, cap, 0, ph + 0.75, 0, 0.9);                          // the stone fists on top
      else { const k = new THREE.Mesh(pyramidGeometry(), mat(cap)); k.scale.set(0.9, 0.5, 0.9); k.position.y = ph + 0.3; g.add(k); }
      addProp(g, x, zz); collide(x, zz, 1, 1);
    });
    const bars = grp(x, 0);
    const bh = D ? 5.4 : 3.2, bl = [], tips = [];
    for (let i = 0; i <= 14; i++) { const zz = -3 + i * (6 / 14); bl.push({ x: 0, y: bh / 2, z: zz, sy: bh }); tips.push({ x: 0, y: bh + 0.15, z: zz }); }
    instanced(bars, boxGeo(0.08, 1, 0.08), mat(iron), bl);
    instanced(bars, cylGeo(0, 0.09, 0.32, 4), mat(iron), tips);
    box(bars, 0.1, 0.12, 6, iron, 0, bh * 0.85, 0); box(bars, 0.1, 0.12, 6, iron, 0, 0.5, 0);
    addProp(bars, x, 0); collide(x, 0, 0.4, 6);
    [-1, 1].forEach(s => {                                                       // low wall out to z = +-14, iron bars on top
      const g = grp(x, s * 9);
      box(g, 0.6, 1.8, 10, stone, 0, 0, 0); box(g, 0.8, 0.15, 10, cap, 0, 1.8, 0);
      const wb = [], wt = [];
      for (let i = 0; i <= 16; i++) { const zz = -5 + i * (10 / 16); wb.push({ x: 0, y: 1.95 + (D ? 1.0 : 0.6), z: zz, sy: D ? 2 : 1.2 }); wt.push({ x: 0, y: D ? 4.05 : 3.25, z: zz }); }
      instanced(g, boxGeo(0.06, 1, 0.06), mat(iron), wb);
      instanced(g, cylGeo(0, 0.07, 0.25, 4), mat(iron), wt);
      box(g, 0.08, 0.08, 10, iron, 0, D ? 3.6 : 2.9, 0);
      addProp(g, x, s * 9); collide(x, s * 9, 0.6, 10);
    });
    // plain iron fence from the wall ends to the world edge so the school stays out of reach
    fence(x, 14, x, W.maxZ - 1, iron, 1.8, 'iron'); fence(x, -14, x, W.minZ + 1, iron, 1.8, 'iron');
    C.mapFeatures.push({ kind: 'gate', x: x, z: 0, w: 7 });
  }

  function school(x, z) {
    const g = grp(x, z, -Math.PI / 2);                                           // local +z faces west (toward the gate)
    C.wb = new Batch();
    const w = 14, d = 24, h = D ? 9.6 : 7.4, wall = T(0xa9563e, 0x3c3852), trim = T(TRIM, 0x58546e), slate = T(0x4a4f5a, 0x262338);
    const body = box(g, w, h, d, wall, 0, 0, 0); ink(g, body, 1.02);
    const roof = new THREE.Mesh(gableGeometry(), mat(slate)); roof.rotation.y = Math.PI / 2;
    roof.scale.set(d + 1, D ? 4.5 : 3, w + 1.2); roof.position.y = h; g.add(roof); ink(g, roof, 1.02);
    box(g, w + 0.3, 0.35, d + 0.3, trim, 0, h - 0.35, 0);
    box(g, w + 0.2, 0.5, d + 0.2, T(0xcfc6b2, 0x45415a), 0, 0, 0);
    const tower = new THREE.Group(); tower.position.set(0, h + (D ? 2 : 1.2), d / 2 - 4); tower.scale.y = D ? 1.5 : 1;
    box(tower, 3.6, 5, 3.6, trim, 0, 0, 0);
    box(tower, 3.0, 1.4, 3.0, D ? 0x1a1724 : 0x35333d, 0, 3.2, 0.31);             // belfry opening
    const clock = new THREE.Mesh(cylGeo(0.9, 0.9, 0.08, 16), D ? basic(0x8fdccc) : mat(0xf6f2e6));
    clock.rotation.x = Math.PI / 2; clock.position.set(0, 1.9, 1.85); tower.add(clock);
    box(tower, 0.06, 0.65, 0.04, 0x222222, 0, 1.9, 1.9); box(tower, 0.5, 0.06, 0.04, 0x222222, 0.22, 1.9, 1.9);
    const cap = new THREE.Mesh(pyramidGeometry(), mat(slate)); cap.scale.set(4.4, D ? 5 : 3, 4.4); cap.position.y = 5; tower.add(cap);
    g.add(tower);
    if (D) [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(p => {                    // corner turrets with spires
      const t = grp(p[0] * (w / 2 - 0.6), p[1] * (d / 2 - 0.6)); t.position.y = 0;
      box(t, 2, h + 2.5, 2, wall, 0, 0, 0);
      const sp = new THREE.Mesh(pyramidGeometry(), mat(slate)); sp.scale.set(2.6, 4.5, 2.6); sp.position.y = h + 2.5; t.add(sp);
      g.add(t);
    });
    box(g, 2.6, 2.8, 0.2, T(0x6b4a2f), 0, 0.1, d / 2 + 0.05);                      // double door
    box(g, 3.4, 0.4, 1.4, trim, 0, 3.0, d / 2 + 0.7);                              // door pediment
    [-1.4, 1.4].forEach(xx => box(g, 0.35, 3.0, 0.35, trim, xx, 0, d / 2 + 1.3));
    box(g, 4, 0.2, 1.8, T(0xcfc9ba), 0, 0, d / 2 + 0.9);
    const rows = D ? [2.0, 5.2, 8.0] : [2.0, 5.2];
    rows.forEach((y, row) => { for (let i = 0; i < 6; i++) {                       // long sides
      const wz = -d / 2 + 2 + i * ((d - 4) / 5);
      win(g, w / 2 + 0.06, y, wz, Math.PI / 2, D && hash(i, row) > 0.7, true); win(g, -w / 2 - 0.06, y, wz, -Math.PI / 2, D && hash(row, i) > 0.7, true);
    } });
    let litLeft = D ? 1 : 0;
    rows.forEach((y, row) => [-4.5, -2.4, 2.4, 4.5].forEach((xx, i) => {          // front end (faces the gate)
      const isLight = litLeft > 0 && row === 1 && i === 0, isLit = D && (isLight || hash(xx, row + 5) > 0.55);
      win(g, xx, y, d / 2 + 0.06, 0, isLit, true);
      if (isLight) { litLeft--; addLight(x - (d / 2 + 1.5), 5.2, z + xx); }
    }));
    C.wb.flush(g);
    addProp(g, x, z);
    collide(x, z, 24, 14);
    C.mapFeatures.push({ kind: 'school', x: x, z: z, w: 24, d: 14, label: 'School' });
  }

  function weeds() {
    const r = rng(7), geo = cylGeo(0, 0.09, 1, 4), m = mat(0x1d3a30), m2 = mat(0x2a2844);
    const spots = [];
    for (let i = 0; i < 44; i++) spots.push([-66 + r() * 124, (r() < 0.5 ? -1 : 1) * (2.8 + r() * 4.2)]);   // gutters and verges
    for (let i = 0; i < 16; i++) spots.push([-66 + r() * 124, (r() - 0.5) * 4]);                        // up through the cracks
    [[-46, -28], [-24, -30], [-35, -38], [10, -16], [-35, 16], [-5, 16], [25, 16], [59, 8], [59, -8], [5, -20], [5, -30]].forEach(p => spots.push([p[0] + (r() - 0.5), p[1] + (r() - 0.5) * 4]));
    spots.forEach(s => {
      const x = s[0], z = s[1];
      if (x > 23 && x < 37 && z < -1.5 && z > -6) return;
      const g = grp(x, z), blades = [], n = 3 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) { const hh = 0.5 + r() * 0.7; blades.push({ x: (r() - 0.5) * 0.5, y: hh / 2, z: (r() - 0.5) * 0.5, rz: (r() - 0.5) * 0.6, rx: (r() - 0.5) * 0.6, sy: hh }); }
      instanced(g, geo, r() < 0.6 ? m : m2, blades);
      addProp(g, x, z);
    });
  }

  // ---------- build ----------
  function build(scene, mode) {
    D = mode === 'dream';
    C = { group: new THREE.Group(), props: [], colliders: [], interactables: [], lights: [], mapFeatures: [], pointLights: 0 };
    scene.add(C.group);

    const ground = paintGround();
    sky();

    // Map features that are not objects
    C.mapFeatures.push({ kind: 'road', width: 7, points: [[-70, 0], [60, 0]] });
    C.mapFeatures.push({ kind: 'lane', width: 3.5, points: [[5, -3.5], [5, -45]] });
    C.mapFeatures.push({ kind: 'creek', width: 4, points: [[-70, -40], [90, -40]] });
    streetEdges();

    // Houses (colors from the morning painting: cream, butter, sage, pale blue, white trim; slate and red-brown roofs)
    house({ x: -35, z: -14, w: 12, d: 8, wall: 0xf1e4b6, roof: 0x474c58, door: 0x55785a, shutters: 0x5f7f5c, porch: true, lit: [1, 3], lights: 2, label: 'Home' });
    house({ x: -5, z: -16, w: 10, d: 9, wall: 0xdfe2d6, roof: 0x4f545e, door: 0x7a4a2f, shutters: 0x44505a, lit: [2] });
    house({ x: 25, z: -16, w: 10, d: 9, wall: 0xead48c, roof: 0x8a4a35, door: 0xf4f0e6, lit: [3] });
    house({ x: -50, z: 16, w: 10, d: 9, wall: 0xb6c49c, roof: 0x6e3b2e, door: 0x8a3a2e, shutters: 0xf4f0e6, lit: [0], rot: Math.PI });
    house({ x: -20, z: 16, w: 9, d: 8, wall: 0xbccdd6, roof: 0x474c58, door: 0xc8452c, lit: [2], rot: Math.PI });
    house({ x: 10, z: 16, w: 10, d: 9, wall: 0xefe5cb, roof: 0x8a4a35, door: 0x3f5f8a, shutters: 0x3f5f8a, lit: [3, 4], rot: Math.PI });
    house({ x: 40, z: 16, w: 10, d: 8, wall: 0xc98a68, roof: 0x4a4f5a, door: 0xf4f0e6, lit: [1], rot: Math.PI });

    // Yard fence: open at the house's back (house spans x -41..-29) and at the side gate (x -24, z -22..-20)
    fence(-46, -38, -24, -38); fence(-46, -38, -46, -19); fence(-24, -38, -24, -22); fence(-24, -20, -24, -19);
    fence(-46, -19, -41, -19); fence(-29, -19, -24, -19);
    [-22, -20].forEach(zz => { const p = grp(-24, zz); box(p, 0.25, 1.5, 0.25, T(0x6e5235), 0, 0, 0); addProp(p, -24, zz); });
    // fences between neighbors
    fence(10, -21, 10, -11); fence(-35, 11, -35, 21); fence(-5, 11, -5, 21); fence(25, 11, 25, 21);
    // white picket fences across the neighbors' front lawns, a gap at each front walk
    [[-5, -9.5], [25, -9.5], [-50, 10], [-20, 10], [10, 10], [40, 10]].forEach(p => { picket(p[0] - 4.8, p[0] - 1.5, p[1]); picket(p[0] + 1.5, p[0] + 4.8, p[1]); });

    // Yard contents
    tree({ x: -40, z: -31, h: 6.2, r: 3.6, big: true, k: 0, open: true });
    treeHouse(-40, -31);
    sandbox(-32, -27); toyTruck(-41, -29);
    toy(-44, -24, 'box', 0x3f6fb5); toy(-36, -33, 'ball', 0xe6a93c); toy(-28, -24, 'box', 0x6c9a4a);
    toy(-43, -35, 'ball', 0xd9503f); toy(-33, -36, 'box', 0xe6a93c); toy(-27, -31, 'box', 0xd9503f);
    tricycle(-44, -28.5, 0.6); wagon(-29.5, -21.4, -0.4);
    mailbox(-35, -4.5, 0x3a3d44, true);

    // The kid's front yard and driveway, the way the painting has it
    hoop(-25, -17.6, 0);
    wagon(-44, -7.8, 0.3);
    bike(-31.2, -6.3, 0.1, 0xc8342c, 0.24); bike(-38.8, -6.2, -0.15, 0x3a6fc0, -0.2);
    bush(-40, -9.4, 1.0, 0xd9503f); bush(-30.2, -9.4, 0.9, 0xe8a23a); bush(-42.2, -11, 0.8, 0xd9503f);
    gardenBed(-44, -14, Math.PI / 2);
    // neighbors' lawns
    mailbox(-2.5, -6.2, 0x2f5fa8); mailbox(27.5, -6.2, 0x3a3d44); mailbox(-47.5, 6.2, 0x8a3a2e); mailbox(-17.5, 6.2, 0x3a3d44); mailbox(12.5, 6.2, 0x2f5fa8); mailbox(42.5, 6.2, 0x3a3d44);
    [[-5, -1], [25, -1], [-50, 1], [-20, 1], [10, 1], [40, 1]].forEach((p, i) => {
      const fz = p[1] < 0 ? -16 + 5.3 : 16 - 5.3;
      bush(p[0] - 3.4, fz, 0.8, i % 2 ? 0xe8a23a : null); bush(p[0] + 3.4, fz, 0.75, i % 2 ? null : 0xc84a7a);
    });
    bike(22.2, -9.0, 0.05, 0x3f8a5a, 0.2);
    trashCan(0.8, -7.9); trashCan(1.6, -8.1, true); trashCan(46.3, 9.1); trashCan(47.1, 8.9);

    // Street furniture, creek crossing, school
    busStop(20, -5); bus(30, -4);
    stopSign(37.5, -6.2, 0);
    bridge(5, -40);
    schoolGate(60);
    school(78, -4);

    // Power poles along the north verge, wires sagging between them, one drop to the kid's house
    const poles = [-64, -46, -28, -10, 8, 26, 44];
    poles.forEach(px => powerPole(px, -6.7));
    for (let i = 0; i < poles.length - 1; i++) wires(poles[i], poles[i + 1], -6.7, poles[i] === -28 ? [[-28, 7.6, -6.7], [-29.5, 7.2, -8.6], [-30.5, 6.6, -10]] : null);
    // Street lamps along the south verge (they glow in the dream)
    [-52, -24, 0, 30, 50].forEach(lx => streetLamp(lx, 6.4));

    // Trees: street verges, house surrounds, yard, and a background skyline of canopies
    [[-60, -7], [-18, -8], [14, -9], [42, -8], [-62, 8], [-28, 8], [-6, 8], [24, 8], [52, -8], [52, 8], [-28, -34], [-10, -30],
      [-52, -8.5], [-13, -8.6], [34, -8.6], [-40, 8.5], [-14, 8.6], [3, 8.5], [34, 8.6], [57, 9]]
      .forEach((p, i) => tree({ x: p[0], z: p[1], h: 3 + (i % 3) * 0.4, r: 2.2 + (i % 4) * 0.25, k: i + 1 }));
    [[-64, -46], [-52, -46], [-30, -46], [-15, -46], [15, -46], [30, -46], [45, -45], [-60, -28], [-55, -20], [-18, -26], [15, -27], [35, -26], [45, -30], [52, -22],
      [-62, 26], [-42, 30], [-32, 24], [-10, 28], [0, 34], [22, 26], [30, 38], [50, 28], [55, 40], [-55, 40], [-25, 42], [15, 44],
      [70, -25], [84, -32], [72, 22], [86, 28]]
      .forEach((p, i) => tree({ x: p[0], z: p[1], h: 3.4 + (i % 4) * 0.5, r: 2.8 + (i % 3) * 0.5, k: i + 5, bg: Math.abs(p[0]) > 60 || Math.abs(p[1]) > 40 }));

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
      const sun = new THREE.DirectionalLight(0xffdcaa, 1.6); sun.position.set(-42, 26, 42);   // warm, low, from the southwest
      const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a6a3a, 1.0);
      C.group.add(sun, hemi); C.lights.unshift(sun, hemi);
    } else {
      const moon = new THREE.DirectionalLight(0x9c9cf4, 1.1); moon.position.set(60, 30, 0);   // from the east
      const hemi = new THREE.HemisphereLight(0x5c5498, 0x1a1630, 1.4);
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
