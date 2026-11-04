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
      day:   { skin: 0xf3c9a4, shirt: 0xd9503f, stripe: 0xf3e9d0, pants: 0x3f6fb5, shoes: 0x35333d, cap: 0xe6a93c, hair: 0x5a3a22 },
      dream: { skin: 0xc9c4d6, shirt: 0x2a2440, stripe: 0x4a4466, pants: 0x1b1830, shoes: 0x0d0b17, cap: 0x3a2e55, hair: 0x1a1428 },
    };
    const group = new THREE.Group();
    const parts = {};
    function part(name, geo, color, x, y, z) {
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
      m.position.set(x, y, z); group.add(m); parts[name] = m; return m;
    }
    // proportions of a ten-year-old: big head, short legs. Total height ~1.35 m.
    part('torso', new THREE.BoxGeometry(0.42, 0.5, 0.26), 0xd9503f, 0, 0.78, 0);
    part('stripe', new THREE.BoxGeometry(0.44, 0.08, 0.28), 0xf3e9d0, 0, 0.86, 0);
    part('head', new THREE.SphereGeometry(0.21, 14, 12), 0xf3c9a4, 0, 1.2, 0);
    part('hair', new THREE.SphereGeometry(0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), 0x5a3a22, 0, 1.22, 0);
    part('cap', new THREE.CylinderGeometry(0.23, 0.23, 0.08, 14), 0xe6a93c, 0, 1.33, 0);
    part('brim', new THREE.BoxGeometry(0.2, 0.03, 0.22), 0xe6a93c, 0, 1.3, 0.22);
    const legL = part('legL', new THREE.BoxGeometry(0.16, 0.5, 0.18), 0x3f6fb5, -0.11, 0.28, 0);
    const legR = part('legR', new THREE.BoxGeometry(0.16, 0.5, 0.18), 0x3f6fb5, 0.11, 0.28, 0);
    part('shoeL', new THREE.BoxGeometry(0.17, 0.08, 0.26), 0x35333d, -0.11, 0.04, 0.03);
    part('shoeR', new THREE.BoxGeometry(0.17, 0.08, 0.26), 0x35333d, 0.11, 0.04, 0.03);
    // arms pivot at the shoulder
    const armL = new THREE.Group(); armL.position.set(-0.27, 1.0, 0); group.add(armL);
    const armR = new THREE.Group(); armR.position.set(0.27, 1.0, 0); group.add(armR);
    const armGeo = new THREE.BoxGeometry(0.12, 0.46, 0.12);
    const armLM = new THREE.Mesh(armGeo, new THREE.MeshLambertMaterial({ color: 0xf3c9a4 })); armLM.position.y = -0.2; armL.add(armLM); parts.armL = armLM;
    const armRM = new THREE.Mesh(armGeo, new THREE.MeshLambertMaterial({ color: 0xf3c9a4 })); armRM.position.y = -0.2; armR.add(armRM); parts.armR = armRM;
    // backpack
    part('pack', new THREE.BoxGeometry(0.34, 0.36, 0.16), 0x6c9a4a, 0, 0.82, -0.2);
    const hand = new THREE.Group(); hand.position.set(0, -0.44, 0); armR.add(hand);
    scene.add(group);

    const p = {
      mesh: group, hand, armR, armL, parts,
      position: group.position, rotY: 0, mode: 'day',
      camYaw: Math.PI, camPitch: 0.36, camDist: 7.2,
      speedMult: 1, walkPhase: 0, moving: false, velocity: new THREE.Vector3(),
      dash: null, attackPose: 0, colliders: null,
      setMode(mode) {
        this.mode = mode;
        const c = palettes[mode];
        parts.head.material.color.setHex(c.skin); parts.armL.material.color.setHex(c.skin); parts.armR.material.color.setHex(c.skin);
        parts.torso.material.color.setHex(c.shirt); parts.stripe.material.color.setHex(c.stripe);
        parts.legL.material.color.setHex(c.pants); parts.legR.material.color.setHex(c.pants);
        parts.shoeL.material.color.setHex(c.shoes); parts.shoeR.material.color.setHex(c.shoes);
        parts.cap.material.color.setHex(c.cap); parts.brim.material.color.setHex(c.cap); parts.hair.material.color.setHex(c.hair);
        parts.pack.material.color.setHex(mode === 'day' ? 0x6c9a4a : 0x1f2a1a);
        parts.pack.visible = mode === 'day';
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
