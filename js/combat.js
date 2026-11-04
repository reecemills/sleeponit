// Dream combat (implementation plan 3.10 proposal): the chalk heart, the dream weapon, the shoelace demons.
window.SOI = window.SOI || {};

SOI.combat = {
  create(scene, player, weaponDef, opts) {
    const T = SOI.data.tunables;
    const demons = [];
    let heartThirds = T.heartThirds;
    let invuln = 0, swing = null, comboIndex = 0, comboTimer = 0, killed = 0, biteTimer = 0, grabHold = 0;
    const weapon = weaponDef || SOI.data.dreamItems.fists;
    // a tool (the lantern) still lets the kid swing his free hand
    const atk = weapon.kind === 'weapon' ? weapon : SOI.data.dreamItems.fists;

    // ---- weapon mesh in the kid's hand
    const wgroup = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0x8c8ea0 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a3650 });
    const chainLinks = [];
    if (weapon.icon === 'chain' || weapon.icon === 'flail') {
      const n = weapon.icon === 'chain' ? 9 : 6;
      for (let i = 0; i < n; i++) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 10), steel);
        link.rotation.y = i % 2 ? Math.PI / 2 : 0;
        wgroup.add(link); chainLinks.push(link);
      }
      if (weapon.icon === 'flail') { const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), dark); ball.position.y = -n * 0.12 - 0.1; wgroup.add(ball); chainLinks.push(ball); }
    } else if (weapon.icon === 'sword' || weapon.icon === 'spear' || weapon.icon === 'mace' || weapon.icon === 'lump') {
      const len = weapon.icon === 'spear' ? 1.8 : weapon.icon === 'sword' ? 0.9 : 0.6;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(weapon.icon === 'lump' ? 0.3 : 0.07, len, weapon.icon === 'lump' ? 0.3 : 0.03), weapon.icon === 'lump' ? dark : steel);
      blade.position.y = -len / 2 + 0.05; wgroup.add(blade);
      if (weapon.icon === 'mace') { const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), steel); head.position.y = -len; wgroup.add(head); }
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), dark); wgroup.add(grip);
    } else if (weapon.icon === 'bow' || weapon.icon === 'sling') {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 6, 14, Math.PI), dark); bow.rotation.z = Math.PI / 2; wgroup.add(bow);
    } else if (weapon.icon === 'torch') {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.22, 8), dark); lamp.position.y = -0.3; wgroup.add(lamp);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb347 })); glow.position.y = -0.3; wgroup.add(glow);
      const light = new THREE.PointLight(0xffb347, 1.2, 14); light.position.y = -0.3; wgroup.add(light);
    }
    if (weapon.icon !== 'fist') player.hand.add(wgroup);

    // ---- demons
    const laceMat = new THREE.MeshLambertMaterial({ color: 0xece9f5 });
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x15121f });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd36b });
    function makeDemon(x, z) {
      const g = new THREE.Group();
      // low dark hunched body (squash baked into the geometry so children are not distorted)
      const bgeo = new THREE.SphereGeometry(0.23, 10, 8); bgeo.scale(1.1, 0.85, 1);
      const body = new THREE.Mesh(bgeo, bodyMat); body.position.y = 0.36; g.add(body);
      const dark = (geo, px, py, pz) => { const m = new THREE.Mesh(geo, bodyMat); m.position.set(px, py, pz); body.add(m); return m; };
      for (const sx of [-1, 1]) {
        // tall pointed cat ears
        const ear = dark(new THREE.ConeGeometry(0.06, 0.15, 4), sx * 0.13, 0.2, 0.0); ear.rotation.z = -sx * 0.25;
        // glowing oval eyes
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat); e.position.set(sx * 0.1, 0.05, 0.19); e.scale.set(0.8, 1.3, 0.5); body.add(e);
        // spindly arms with claws, reaching forward
        const arm = dark(new THREE.CylinderGeometry(0.014, 0.02, 0.26, 5), sx * 0.24, -0.02, 0.12); arm.rotation.set(1.1, 0, -sx * 0.5);
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), laceMat); claw.position.set(sx * 0.31, -0.08, 0.26); claw.rotation.set(1.6, 0, -sx * 0.4); body.add(claw);
        // bent legs
        const leg = dark(new THREE.CylinderGeometry(0.018, 0.024, 0.3, 5), sx * 0.13, -0.2, 0.02); leg.rotation.z = sx * 0.3;
      }
      // grin of tiny teeth
      for (let i = -2; i <= 2; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.045, 4), laceMat); t.position.set(i * 0.04, -0.07, 0.205); t.rotation.x = Math.PI; body.add(t); }
      // a cap of knotted lace between the ears
      const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.06, 0.014, 24, 5), laceMat); knot.position.set(0, 0.2, 0.03); knot.rotation.x = 1.2; body.add(knot);
      // flailing lace tendrils, pivoting at their roots
      const laces = [];
      for (let i = 0; i < 5; i++) {
        const lg = new THREE.BoxGeometry(0.04, 0.62, 0.012); lg.translate(0, 0.31, 0);
        const l = new THREE.Mesh(lg, laceMat);
        const a = i * Math.PI * 2 / 5 + 0.4;
        l.position.set(Math.cos(a) * 0.17, 0.3, Math.sin(a) * 0.17); l.rotation.y = -a;
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.02), bodyMat); tip.position.y = 0.62; l.add(tip);
        g.add(l); laces.push(l);
      }
      g.position.set(x, 0, z);
      scene.add(g);
      return { mesh: g, body, laces, x, z, hp: T.demonHp, state: 'wander', t: Math.random() * 10, wx: x, wz: z, hitFlash: 0, dying: 0, grabbing: false, knock: null };
    }

    const c = {
      weapon, demons, get killed() { return killed; },
      spawnDemons(points) { for (const p of points) demons.push(makeDemon(p.x, p.z)); },
      heart() { return heartThirds / T.heartThirds; },
      update(dt, input, colliders) {
        const pp = player.position;
        let hitThisFrame = false;
        invuln = Math.max(0, invuln - dt);
        comboTimer = Math.max(0, comboTimer - dt);
        if (comboTimer === 0) comboIndex = 0;

        // dodge
        if (!player.dash && (input.take('Shift') || input.take(' '))) {
          const v = player.velocity;
          let dx, dz;
          if (Math.hypot(v.x, v.z) > 0.2) { const l = Math.hypot(v.x, v.z); dx = v.x / l; dz = v.z / l; }
          else { const f = player.forward(); dx = -f.x; dz = -f.z; }
          player.startDash(dx, dz); invuln = Math.max(invuln, T.dodgeInvuln);
        }
        // attack: three-swing combo, the third is heavy
        if (!swing && input.takeAttack()) {
          const heavy = comboIndex === 2;
          swing = { t: 0, dur: atk.swingTime * (heavy ? 1.6 : 1), heavy, hit: new Set(), applied: false };
          comboIndex = (comboIndex + 1) % 3; comboTimer = 1.2;
          player.attackPose = swing.dur;
          // slow, deliberate combat is forgiving: face the nearest demon in reach as the swing starts
          let nearest = null, nd = atk.reach + 0.6;
          for (const d of demons) {
            if (d.dying) continue;
            const dist = Math.hypot(d.mesh.position.x - pp.x, d.mesh.position.z - pp.z);
            if (dist < nd) { nd = dist; nearest = d; }
          }
          if (nearest) { player.rotY = Math.atan2(nearest.mesh.position.x - pp.x, nearest.mesh.position.z - pp.z); player.mesh.rotation.y = player.rotY; }
        }
        if (swing) {
          swing.t += dt;
          const k = Math.min(1, swing.t / swing.dur);
          // wind up, then sweep across the front
          const ang = k < 0.3 ? -1.2 * (k / 0.3) : -1.2 + (k - 0.3) / 0.7 * 2.6;
          player.armR.rotation.x = -1.4 + Math.sin(k * Math.PI) * 0.4;
          player.armR.rotation.y = ang * (swing.heavy ? 1.2 : 1);
          if (k > 0.35 && !swing.applied) {
            swing.applied = true;
            const f = player.forward();
            for (const d of demons) {
              if (d.dying) continue;
              const dx = d.mesh.position.x - pp.x, dz = d.mesh.position.z - pp.z;
              const dist = Math.hypot(dx, dz);
              if (dist > atk.reach + 0.4) continue;
              const dot = (dx * f.x + dz * f.z) / (dist || 1);
              if (dot < Math.cos(atk.arc / 2) && dist > 0.8) continue;
              d.hp -= atk.damage + (swing.heavy ? 1 : 0);
              d.hitFlash = 0.15;
              const kb = swing.heavy ? 5 : 2.5;
              d.knock = { vx: dx / (dist || 1) * kb, vz: dz / (dist || 1) * kb, t: 0.2 };
              d.grabbing = false;
              if (d.hp <= 0) { d.dying = 0.001; killed++; }
            }
          }
          if (k >= 1) { swing = null; player.armR.rotation.y = 0; }
        }

        // demons
        let grabbers = 0;
        for (const d of demons) {
          const m = d.mesh;
          d.t += dt;
          if (d.dying) {
            d.dying += dt;
            const s = Math.max(0, 1 - d.dying / 0.4);
            m.scale.set(s, s * 0.6, s); m.position.y = (1 - s) * 0.3;
            continue;
          }
          const dx = pp.x - m.position.x, dz = pp.z - m.position.z;
          const dist = Math.hypot(dx, dz);
          let vx = 0, vz = 0;
          if (d.knock && d.knock.t > 0) {
            d.knock.t -= dt; vx = d.knock.vx; vz = d.knock.vz;
          } else if (dist < 22) {
            d.state = 'chase';
            if (dist > 0.95) { vx = dx / dist * T.demonSpeed; vz = dz / dist * T.demonSpeed; d.grabbing = false; }
            else { d.grabbing = true; grabbers++; }
          } else {
            d.state = 'wander';
            if (d.t > 2.5) { d.t = 0; d.wx = d.x + (Math.random() - 0.5) * 8; d.wz = d.z + (Math.random() - 0.5) * 8; }
            const wx = d.wx - m.position.x, wz = d.wz - m.position.z, wl = Math.hypot(wx, wz);
            if (wl > 0.3) { vx = wx / wl * T.demonSpeed * 0.4; vz = wz / wl * T.demonSpeed * 0.4; }
          }
          // separation from other demons
          for (const o of demons) {
            if (o === d || o.dying) continue;
            const ox = m.position.x - o.mesh.position.x, oz = m.position.z - o.mesh.position.z, ol = Math.hypot(ox, oz);
            if (ol < 0.7 && ol > 0.001) { vx += ox / ol * 1.5; vz += oz / ol * 1.5; }
          }
          let nx = m.position.x + vx * dt, nz = m.position.z + vz * dt;
          if (player.collides(nx, m.position.z, 0.3, colliders)) nx = m.position.x;
          if (player.collides(nx, nz, 0.3, colliders)) nz = m.position.z;
          m.position.x = nx; m.position.z = nz;
          if (Math.hypot(vx, vz) > 0.05) m.rotation.y = Math.atan2(vx, vz);
          // lace flail
          for (let i = 0; i < d.laces.length; i++) {
            const l = d.laces[i];
            l.rotation.x = Math.sin(d.t * 6 + i) * 0.9 + (d.grabbing ? 1.1 : 0.4);
            l.rotation.z = Math.cos(d.t * 5 + i * 1.3) * 0.7;
          }
          d.body.position.y = 0.36 + Math.abs(Math.sin(d.t * 7)) * (d.state === 'chase' ? 0.12 : 0.04);
          if (d.hitFlash > 0) { d.hitFlash -= dt; d.body.material = new THREE.MeshBasicMaterial({ color: 0xece9f5 }); }
          else if (d.body.material !== bodyMat) d.body.material = bodyMat;
        }
        // grabbing slows the kid; several together bite on a cooldown
        player.speedMult = grabbers > 0 ? T.demonGrabSlow : 1;
        biteTimer = Math.max(0, biteTimer - dt);
        if (grabbers === 0) grabHold = 0; else grabHold += dt;
        // the first grab only slows you; they need a moment hanging on (or two of them) before they can trip you
        if (grabbers > 0 && biteTimer === 0 && invuln === 0 && (grabHold > 1.2 || grabbers >= 2)) {
          biteTimer = T.demonBiteCooldown;
          heartThirds = Math.max(0, heartThirds - 1);
          invuln = 0.4; hitThisFrame = true;
        }
        // cleanup
        for (let i = demons.length - 1; i >= 0; i--) if (demons[i].dying > 0.45) { scene.remove(demons[i].mesh); demons.splice(i, 1); }

        // chain sway
        if (chainLinks.length) {
          for (let i = 0; i < chainLinks.length; i++) {
            const l = chainLinks[i];
            if (l.geometry.type === 'SphereGeometry') continue;
            const sw = swing ? Math.sin(swing.t * 18 + i * 0.4) * 0.12 : Math.sin(performance.now() * 0.003 + i * 0.5) * 0.03;
            l.position.set(sw, -i * 0.12, 0);
          }
        }
        return { heart: heartThirds / T.heartThirds, hitThisFrame, killed, grabbers, alive: demons.filter(d => !d.dying).length };
      },
      dispose() {
        for (const d of demons) scene.remove(d.mesh);
        demons.length = 0;
        if (wgroup.parent) wgroup.parent.remove(wgroup);
        player.speedMult = 1; player.armR.rotation.set(0, 0, 0);
      },
    };
    return c;
  },
};
