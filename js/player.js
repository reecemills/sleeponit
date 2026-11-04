// Input and the kid: third-person control, camera, a simple articulated figure in a day or dream palette.
window.SOI = window.SOI || {};

SOI.input = {
  keys: new Set(), pressed: new Set(), mouseDX: 0, mouseDY: 0, locked: false, clickAttack: false,
  init(canvas) {
    window.addEventListener('keydown', e => {
      if (e.target && e.target.matches && e.target.matches('input,textarea,select')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!e.repeat) this.pressed.add(k);
      this.keys.add(k);
      if (['w', 'a', 's', 'd', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && !SOI.ui?.isPanelOpen?.()) e.preventDefault();
    });
    window.addEventListener('keyup', e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; this.keys.delete(k); });
    window.addEventListener('blur', () => this.keys.clear());
    // Pointer lock when the browser allows it; otherwise drag to look. A plain left click (no drag) attacks in the dream.
    const lock = () => { try { const r = canvas.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* not allowed here */ } };
    canvas.addEventListener('mousedown', e => {
      if (SOI.ui?.isPanelOpen?.()) return;
      this.drag = { button: e.button, x: e.clientX, y: e.clientY, moved: 0 };
      if (e.button === 0 && this.locked) this.clickAttack = true;
      if (e.button === 2 && !this.locked) lock();
    });
    window.addEventListener('mouseup', e => {
      const d = this.drag; this.drag = null;
      if (!d || SOI.ui?.isPanelOpen?.()) return;
      if (d.button === 0 && !this.locked) {
        if (d.moved < 6) { this.clickAttack = true; if (!this.lockTried) { this.lockTried = true; lock(); } }
      }
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    document.addEventListener('mousemove', e => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; return; }
      if (this.drag) { this.drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY); this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    this.canvas = canvas;
  },
  down(k) { return this.keys.has(k); },
  // one-shot press, consumed on read
  take(k) { const had = this.pressed.has(k); if (had) this.pressed.delete(k); return had; },
  takeAttack() { const a = this.clickAttack || this.take('j'); this.clickAttack = false; return a; },
  endFrame() { this.pressed.clear(); this.clickAttack = false; this.mouseDX = 0; this.mouseDY = 0; },
  release() { if (this.locked) document.exitPointerLock?.(); },
};

SOI.player = {
  create(scene, camera, opts) {
    const T = SOI.data.tunables;
    const palettes = {
      day:   { skin: 0xf0c4a0, shirt: 0xe9dfc4, stripe: 0xdca835, stripeR: 0xc4553f, stripeB: 0x5d84ac, pants: 0x3f6a9a, cuff: 0x5f88b2, shoe: 0x6a8fb8, sole: 0xece6d4, lace: 0xf8f4e8, hair: 0x5a3a22, cap: 0x5a3a22, pack: 0x8b7b4a, packDark: 0x6b5d36, strap: 0x7d6e42, eye: 0xffffff, pupil: 0x3a2616, brow: 0x3a2616, mouth: 0xa5503f },
      dream: { skin: 0xbab8cc, shirt: 0x6a6880, stripe: 0x6e6842, stripeR: 0x6a4450, stripeB: 0x3c4a6a, pants: 0x1c2240, cuff: 0x2c3454, shoe: 0x2e3450, sole: 0x8e8c9e, lace: 0xbab8cc, hair: 0x120e1c, cap: 0x120e1c, pack: 0x1f2a1a, packDark: 0x161e14, strap: 0x1a2416, eye: 0xf2f2f8, pupil: 0x0c0a14, brow: 0x0c0a14, mouth: 0x4a3a4a },
    };
    const group = new THREE.Group();
    const parts = {};
    const M = {};
    for (const k in palettes.day) M[k] = new THREE.MeshLambertMaterial({ color: palettes.day[k] });
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    function add(parent, geo, key, x, y, z) { const m = new THREE.Mesh(geo, M[key]); m.position.set(x, y, z); parent.add(m); return m; }
    function part(name, geo, key, x, y, z) { const m = add(group, geo, key, x, y, z); parts[name] = m; return m; }
    // proportions of a ten-year-old: big head, long thin limbs. Total height ~1.35 m.
    part('torso', B(0.40, 0.46, 0.25), 'shirt', 0, 0.76, 0);
    part('stripe', B(0.415, 0.1, 0.265), 'stripe', 0, 0.81, 0);
    part('stripeR', B(0.415, 0.1, 0.265), 'stripeR', 0, 0.91, 0);
    part('stripeB', B(0.415, 0.1, 0.265), 'stripeB', 0, 0.71, 0);
    part('neck', new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), 'skin', 0, 0.98, 0);
    const head = part('head', new THREE.SphereGeometry(0.19, 14, 12), 'skin', 0, 1.1, 0);
    for (const sx of [-1, 1]) {
      add(head, new THREE.SphereGeometry(0.04, 6, 6), 'skin', sx * 0.185, 0, 0);
      const e = add(head, new THREE.SphereGeometry(0.042, 8, 6), 'eye', sx * 0.075, 0.02, 0.165); e.scale.z = 0.6;
      add(head, new THREE.SphereGeometry(0.022, 6, 6), 'pupil', sx * 0.075, 0.02, 0.185);
      parts[sx < 0 ? 'browL' : 'browR'] = add(head, B(0.075, 0.016, 0.02), 'brow', sx * 0.075, 0.085, 0.165);
    }
    parts.mouth = add(head, new THREE.TorusGeometry(0.04, 0.008, 4, 8, Math.PI), 'mouth', 0, -0.06, 0.165);
    // tousled hair: a tilted cap of hair, a nape piece and spiky tufts
    const hair = part('hair', new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.36), 'hair', 0, 1.12, -0.01);
    hair.rotation.x = -0.3;
    const nape = add(head, new THREE.SphereGeometry(0.195, 10, 8), 'hair', 0, 0.03, -0.04); nape.scale.y = 0.8;
    const up = new THREE.Vector3(0, 1, 0);
    for (const t of [[0, .19, .02, 0, 1, .3, .045, .1], [.1, .16, 0, 1, 1, 0, .04, .09], [-.1, .16, 0, -1, 1, 0, .04, .09], [.05, .15, .12, .3, .5, 1, .04, .09], [-.05, .15, .12, -.3, .5, 1, .04, .09], [0, .14, -.12, 0, .7, -1, .045, .1], [.14, .1, -.06, 1, .6, -.3, .04, .08], [-.14, .1, -.06, -1, .6, -.3, .04, .08]]) {
      const m = add(hair, new THREE.ConeGeometry(t[6], t[7], 5), 'hair', 0, 0, 0);
      const d = new THREE.Vector3(t[3], t[4], t[5]).normalize();
      m.quaternion.setFromUnitVectors(up, d); m.position.set(t[0], t[1], t[2]).addScaledVector(d, t[7] * 0.4);
    }
    // the sheet has no cap: kept as hidden parts so the part keys stay valid
    part('cap', B(0.01, 0.01, 0.01), 'cap', 0, 1.3, 0).visible = false;
    part('brim', B(0.01, 0.01, 0.01), 'cap', 0, 1.3, 0.1).visible = false;
    // jeans with rolled cuffs, high-top sneakers with white laces
    const legL = part('legL', B(0.15, 0.5, 0.17), 'pants', -0.1, 0.28, 0);
    const legR = part('legR', B(0.15, 0.5, 0.17), 'pants', 0.1, 0.28, 0);
    add(legL, B(0.175, 0.08, 0.195), 'cuff', 0, -0.2, 0); add(legR, B(0.175, 0.08, 0.195), 'cuff', 0, -0.2, 0);
    for (const [n, sx] of [['shoeL', -1], ['shoeR', 1]]) {
      const s = part(n, B(0.17, 0.13, 0.27), 'shoe', sx * 0.1, 0.065, 0.03);
      add(s, B(0.19, 0.035, 0.3), 'sole', 0, -0.07, 0.005);
      add(s, B(0.16, 0.07, 0.08), 'sole', 0, -0.02, 0.1);
      for (let i = 0; i < 3; i++) add(s, B(0.12, 0.012, 0.02), 'lace', 0, 0.067, -0.04 + i * 0.045);
      const tail = add(s, B(0.012, 0.012, 0.14), 'lace', sx * 0.07, 0.07, 0.12); tail.rotation.y = sx * 0.5;
    }
    // arms pivot at the shoulder, short sleeves
    const armL = new THREE.Group(); armL.position.set(-0.27, 0.96, 0); group.add(armL);
    const armR = new THREE.Group(); armR.position.set(0.27, 0.96, 0); group.add(armR);
    const armGeo = B(0.1, 0.46, 0.1);
    const armLM = add(armL, armGeo, 'skin', 0, -0.2, 0); parts.armL = armLM;
    const armRM = add(armR, armGeo, 'skin', 0, -0.2, 0); parts.armR = armRM;
    for (const a of [armL, armR]) { add(a, B(0.15, 0.16, 0.15), 'shirt', 0, -0.06, 0); add(a, B(0.156, 0.04, 0.156), 'stripeR', 0, -0.1, 0); }
    // canvas backpack: flap, back pocket, shoulder straps (all children, so they hide together)
    const pack = part('pack', B(0.34, 0.4, 0.17), 'pack', 0, 0.8, -0.21);
    add(pack, B(0.35, 0.14, 0.19), 'packDark', 0, 0.15, -0.01);
    add(pack, B(0.28, 0.2, 0.07), 'packDark', 0, -0.08, -0.12);
    for (const sx of [-1, 1]) add(pack, B(0.05, 0.34, 0.285), 'strap', sx * 0.12, 0.06, 0.21);
    const hand = new THREE.Group(); hand.position.set(0, -0.44, 0); armR.add(hand);
    parts.fistR = add(hand, new THREE.SphereGeometry(0.06, 8, 6), 'skin', 0, -0.02, 0);
    scene.add(group);

    const p = {
      mesh: group, hand, armR, armL, parts,
      position: group.position, rotY: 0, mode: 'day',
      camYaw: Math.PI, camPitch: 0.36, camDist: 7.2,
      speedMult: 1, walkPhase: 0, moving: false, velocity: new THREE.Vector3(),
      dash: null, attackPose: 0, colliders: null,
      setMode(mode) {
        this.mode = mode;
        const c = palettes[mode], dream = mode === 'dream';
        for (const k in c) M[k].color.setHex(c[k]);
        parts.pack.visible = true; // the sheet and the combat mockup both show the pack in the dream
        parts.cap.visible = false; parts.brim.visible = false;
        // hopeful brows and a smile by day; a glare and a frown in the dream
        parts.browL.rotation.z = dream ? -0.5 : 0.12; parts.browR.rotation.z = dream ? 0.5 : -0.12;
        parts.mouth.rotation.z = dream ? 0 : Math.PI;
        parts.mouth.position.y = dream ? -0.115 : -0.06; parts.mouth.position.z = dream ? 0.155 : 0.165;
        parts.mouth.scale.setScalar(dream ? 0.7 : 1);
      },
      setPosition(x, z, rotY) {
        group.position.set(x, 0, z); this.rotY = rotY || 0; group.rotation.y = this.rotY;
        this.camYaw = this.rotY + Math.PI; // camera behind the kid, unless a wall is there
        if (this.colliders) {
          let bestYaw = this.camYaw, bestLen = -1;
          for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
            const yaw = this.rotY + Math.PI + off;
            const saved = this.camYaw; this.camYaw = yaw; const full = this.cameraTarget(); this.camYaw = saved;
            let len = 0;
            for (let st = 1; st <= 16; st++) {
              const t = st / 16, px = x + (full.x - x) * t, py = 1.3 + (full.y - 1.3) * t, pz = z + (full.z - z) * t;
              if (this.pointBlocked(px, py, pz, this.colliders)) break; len = t;
            }
            if (len > bestLen + 0.2) { bestLen = len; bestYaw = yaw; if (len >= 1) break; }
          }
          this.camYaw = bestYaw;
        }
        this.snapCamera();
      },
      forward() { return new THREE.Vector3(Math.sin(this.rotY), 0, Math.cos(this.rotY)); },
      cameraForward() { return new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw)); },
      snapCamera() {
        const target = this.cameraTarget();
        camera.position.copy(target);
        camera.lookAt(group.position.x, 1.1, group.position.z);
      },
      cameraTarget() {
        const d = this.camDist, pitch = this.camPitch;
        return new THREE.Vector3(
          group.position.x + Math.sin(this.camYaw) * d * Math.cos(pitch),
          1.1 + Math.sin(pitch) * d,
          group.position.z + Math.cos(this.camYaw) * d * Math.cos(pitch));
      },
      startDash(dirX, dirZ) {
        this.dash = { t: 0, dur: 0.25, dx: dirX, dz: dirZ, dist: T.dodgeDistance };
      },
      update(dt, input, colliders, frozen) {
        // camera orbit from the mouse (pointer lock) or Q / E
        const sens = 0.0022;
        this.camYaw -= input.mouseDX * sens;
        this.camPitch = Math.min(0.9, Math.max(-0.1, this.camPitch + input.mouseDY * sens * 0.7));

        let mx = 0, mz = 0;
        if (!frozen) {
          if (input.down('w') || input.down('ArrowUp')) mz += 1;
          if (input.down('s') || input.down('ArrowDown')) mz -= 1;
          if (input.down('a') || input.down('ArrowLeft')) mx -= 1;
          if (input.down('d') || input.down('ArrowRight')) mx += 1;
        }
        const len = Math.hypot(mx, mz);
        this.moving = len > 0;
        const base = this.mode === 'day' ? T.daySpeed : T.dreamSpeed;
        const fwd = this.cameraForward();
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        let vx = 0, vz = 0;
        if (this.moving) {
          mx /= len; mz /= len;
          vx = (fwd.x * mz + right.x * mx) * base * this.speedMult;
          vz = (fwd.z * mz + right.z * mx) * base * this.speedMult;
          const targetRot = Math.atan2(vx, vz);
          let diff = targetRot - this.rotY;
          while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
          this.rotY += diff * Math.min(1, dt * 14);
        }
        if (this.dash) {
          const d = this.dash; d.t += dt;
          const k = Math.min(1, d.t / d.dur);
          const speed = d.dist / d.dur * (1 - k) * 2; // ease out
          vx = d.dx * speed; vz = d.dz * speed;
          if (d.t >= d.dur) this.dash = null;
        }
        this.velocity.set(vx, 0, vz);
        // move with collision against XZ boxes (radius 0.5), axis by axis so we slide
        const r = 0.5;
        let nx = group.position.x + vx * dt, nz = group.position.z;
        if (this.collides(nx, nz, r, colliders)) nx = group.position.x;
        nz = group.position.z + vz * dt;
        if (this.collides(nx, nz, r, colliders)) nz = group.position.z;
        group.position.x = nx; group.position.z = nz;
        group.rotation.y = this.rotY;

        // animation: walk cycle and arm swing
        const speedNow = Math.hypot(vx, vz);
        this.walkPhase += dt * (speedNow > 0.1 ? speedNow * 2.4 : 0);
        const swing = speedNow > 0.1 ? Math.sin(this.walkPhase) * 0.6 : 0;
        parts.legL.rotation.x = swing; parts.legR.rotation.x = -swing;
        parts.shoeL.rotation.x = swing; parts.shoeR.rotation.x = -swing;
        parts.shoeL.position.z = 0.03 + Math.sin(this.walkPhase) * 0.12; parts.shoeR.position.z = 0.03 - Math.sin(this.walkPhase) * 0.12;
        this.armL.rotation.x = -swing * 0.8;
        if (this.attackPose <= 0) this.armR.rotation.x = swing * 0.8; else this.attackPose -= dt;
        group.position.y = speedNow > 0.1 ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : 0;

        // camera follow: walk the boom from the kid outward and stop before the first collider
        const eye = new THREE.Vector3(group.position.x, 1.3, group.position.z);
        const boom = (yaw) => {
          const saved = this.camYaw; this.camYaw = yaw;
          const full = this.cameraTarget(); this.camYaw = saved;
          const out = eye.clone(); let len = 0;
          const steps = 16;
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const px = eye.x + (full.x - eye.x) * t, py = eye.y + (full.y - eye.y) * t, pz = eye.z + (full.z - eye.z) * t;
            if (this.pointBlocked(px, py, pz, colliders)) break;
            out.set(px, py, pz); len = t;
          }
          return { pos: out, len };
        };
        let b = boom(this.camYaw);
        if (b.len < 0.35 && !input.locked) {
          // the wall is right behind the kid: swing the camera around to the nearest open side
          let bestYaw = this.camYaw, bestLen = b.len;
          for (const off of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
            const r = boom(this.camYaw + off);
            if (r.len > bestLen + 0.15) { bestLen = r.len; bestYaw = this.camYaw + off; if (r.len > 0.7) break; }
          }
          let diff = bestYaw - this.camYaw;
          while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
          this.camYaw += diff * Math.min(1, dt * 3);
          b = boom(this.camYaw);
        }
        const target = b.pos;
        if (b.len < 0.3) target.y = Math.max(target.y, 2.6); // still boxed in: look down over the kid's head
        const k = 1 - Math.pow(0.0001, dt);
        camera.position.lerp(target, k);
        if (camera.position.y < 0.6) camera.position.y = 0.6;
        camera.lookAt(group.position.x, 1.1, group.position.z);
      },
      pointBlocked(x, y, z, colliders) {
        for (const c of colliders) {
          if (y > (c.h || 7)) continue;
          if (Math.abs(x - c.x) < c.w / 2 + 0.35 && Math.abs(z - c.z) < c.d / 2 + 0.35) return true;
        }
        return false;
      },
      collides(x, z, r, colliders) {
        for (const c of colliders) {
          const hw = c.w / 2 + r, hd = c.d / 2 + r;
          if (x > c.x - hw && x < c.x + hw && z > c.z - hd && z < c.z + hd) return true;
        }
        return false;
      },
      dispose() { scene.remove(group); },
    };
    p.setMode(opts?.mode || 'day');
    return p;
  },
};
