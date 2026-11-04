// The state machine: title → day → bedroom → dream → wake → next day. Owns the renderer, the save, and the HUD data.
window.SOI = window.SOI || {};

SOI.game = (() => {
  const D = SOI.data, T = D.tunables;
  const SAVE_KEY = 'sleeponit-save-v1';

  let renderer, scene, camera, clock;
  let world = null, player = null, discovery = null, fog = null, combat = null;
  let state = null;
  let phase = 'title';            // 'title' | 'day' | 'dream'
  let inHouse = false;
  let voiceTimer = 0, subtitle = null, subtitleUntil = 0;
  let dreamLeft = 0, lostNow = false, fogDepth = 0;
  let trail = [], trailTimer = 0;
  let minimapTimer = 0, revealTimer = 0, saveTimer = 0;
  let nearest = null, transitionBusy = false;
  let dreamResult = null;
  let fadeEl = null;
  let liveInteractables = [];

  // ---------- state and save
  function freshState() {
    const places = {};
    for (const k of Object.keys(D.places)) places[k] = { mood: 0, events: [] };
    return {
      version: 1, started: false, calendarIndex: 0, phase: 'day', clockMinutes: T.dayStartMinutes, dinnerCalled: false,
      dreamPos: null, discovery: null, ownership: { ...D.startOwnership }, tonight: null, knownRecipes: [], places,
      marks: [], settings: { subtitles: true, reducedMotion: false }, stats: { demons: 0, nights: 0 }, foundToday: [],
    };
  }
  function save() {
    try {
      state.discovery = discovery ? discovery.serialize() : state.discovery;
      if (phase === 'dream' && player) state.dreamPos = { x: player.position.x, z: player.position.z, rotY: player.rotY };
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) { /* storage unavailable: play on */ }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && s.version === 1 && s.ownership && s.places) {
        const f = freshState();
        for (const k of Object.keys(f)) if (s[k] === undefined) s[k] = f[k];
        for (const id of Object.keys(D.startOwnership)) if (!(id in s.ownership)) s.ownership[id] = D.startOwnership[id];
        for (const k of Object.keys(D.places)) if (!s.places[k]) s.places[k] = { mood: 0, events: [] };
        return s;
      }
    } catch (e) { /* fall through */ }
    return freshState();
  }
  function calendar() {
    const c = D.calendar;
    if (state.calendarIndex < c.length) return c[state.calendarIndex];
    const last = c[c.length - 1];
    const week = last.week + (state.calendarIndex - c.length + 1);
    return { week, label: `Week ${week}`, date: '', season: 'Winter' };
  }
  function item(id) { const it = D.items[id]; return it ? { id, name: it.name, icon: it.icon, desc: it.desc } : null; }
  function itemsOwned(owner) { return Object.keys(state.ownership).filter(id => state.ownership[id] === owner && !inTonight(id)).map(item); }
  function inTonight(id) { return state.tonight && (state.tonight.a === id || state.tonight.b === id); }
  function reduced() { return !!state.settings.reducedMotion; }

  // ---------- renderer
  function boot() {
    const canvas = document.getElementById('gl');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    clock = new THREE.Clock();
    resize(); window.addEventListener('resize', resize);
    fadeEl = document.createElement('div');
    fadeEl.id = 'fogFade';
    Object.assign(fadeEl.style, { position: 'fixed', inset: '0', background: '#2b2946', opacity: '0', pointerEvents: 'none', zIndex: '5', transition: 'opacity .3s' });
    document.body.appendChild(fadeEl);

    state = load();
    discovery = state.discovery ? SOI.discovery.deserialize(state.discovery, D.world) : SOI.discovery.create(D.world);
    SOI.input.init(canvas);
    SOI.ui.init(handlers);
    applySettings();
    showTitle();
    requestAnimationFrame(loop);
  }
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  function applySettings() {
    document.body.classList.toggle('reduced', reduced());
    if (SOI.ui.applySettings) SOI.ui.applySettings({ ...state.settings });
  }
  function showTitle() {
    phase = 'title';
    SOI.input.release();
    const cal = calendar();
    const caption = state.started
      ? `${cal.label} · ${state.phase === 'dream' ? 'Dreaming' : 'The real world'} · Saved on this device`
      : `${cal.label} · An autumn afternoon. Your day begins just outside home.`;
    SOI.ui.showScreen('title', { hasSave: state.started, caption });
    if (!world) { // a quiet backdrop behind the title
      world = SOI.world.build(scene, state.phase === 'dream' ? 'dream' : 'day');
      scene.background = new THREE.Color(world.skyColor);
      camera.position.set(-52, 7, 6); camera.lookAt(-33, 3, -14);
    }
  }

  // ---------- world lifecycle
  function clearWorld() {
    if (combat) { combat.dispose(); combat = null; }
    if (fog) { fog.dispose(); fog = null; }
    if (player) { player.dispose(); player = null; }
    if (world) { scene.remove(world.group); world = null; }
    scene.fog = null;
    fadeEl.style.opacity = '0';
    subtitle = null; nearest = null; liveInteractables = [];
  }
  function enterWorld() {
    clearWorld();
    if (state.phase === 'dream') startDream(); else startDay();
  }
  function startDay() {
    phase = 'day'; inHouse = false;
    world = SOI.world.build(scene, 'day');
    scene.background = new THREE.Color(world.skyColor);
    scene.fog = new THREE.Fog(world.skyColor, 90, 260);
    player = SOI.player.create(scene, camera, { mode: 'day' });
    player.colliders = world.colliders;
    player.setPosition(world.spawn.x, world.spawn.z, world.spawn.rotY);
    liveInteractables = world.interactables.filter(i => i.type !== 'item' || state.ownership[i.itemId] === 'world');
    for (const i of world.interactables) if (i.type === 'item' && i.mesh && state.ownership[i.itemId] !== 'world') i.mesh.visible = false;
    SOI.ui.setMode('day');
    SOI.ui.showScreen('game', {});
    voiceTimer = 5;
    if (state.started === false) { state.started = true; save(); SOI.ui.toast('Look around. Everything you find today could become something tonight.'); }
    minimapTimer = 0;
  }
  function startDream() {
    phase = 'dream'; inHouse = false;
    world = SOI.world.build(scene, 'dream');
    scene.background = new THREE.Color(world.skyColor);
    scene.fog = new THREE.FogExp2(0x2b2946, 0.028);
    fog = SOI.fog.apply(world, discovery, T);
    player = SOI.player.create(scene, camera, { mode: 'dream' });
    player.colliders = world.colliders;
    const sp = state.dreamPos || world.dreamSpawn;
    player.setPosition(sp.x, sp.z, sp.rotY || 0);
    liveInteractables = world.interactables.filter(i => i.type === 'look');
    // what the kid brought
    dreamResult = state.tonight ? D.dreamItems[state.tonight.result] : D.dreamItems.fists;
    if (dreamResult.kind === 'tool' && dreamResult.fogBonus) fog.setBonus(dreamResult.fogBonus);
    combat = SOI.combat.create(scene, player, dreamResult, {});
    spawnDemons();
    dreamLeft = T.dreamSeconds; voiceTimer = 8; trail = []; trailTimer = 0; lostNow = false;
    SOI.ui.setMode('dream');
    SOI.ui.showScreen('game', {});
    setTimeout(() => {
      if (phase !== 'dream') return;
      SOI.ui.reveal({ name: dreamResult.name, icon: dreamResult.icon, reveal: dreamResult.reveal });
      if (state.tonight && !state.knownRecipes.some(r => r.result === state.tonight.result && ((r.a === state.tonight.a && r.b === state.tonight.b) || (r.a === state.tonight.b && r.b === state.tonight.a)))) {
        state.knownRecipes.push({ ...state.tonight });
        save();
      }
    }, 1200);
  }
  function spawnDemons() {
    const street = world.enemySpawns.filter(s => s.placeId === 'street');
    const bus = world.enemySpawns.filter(s => s.placeId === 'busstop');
    const streetMood = state.places.street.mood, busMood = state.places.busstop.mood;
    const tripped = state.places.busstop.events.includes('tripped');
    const baseN = Math.round(T.baseEncounterBudget * (1 - streetMood * 0.5));
    const busN = tripped ? Math.round(T.tripEncounterBonus * (1 - busMood * 0.5)) : 0;
    const pts = [];
    const take = (list, n) => { for (let i = 0; i < n && list.length; i++) { const s = list[i % list.length]; pts.push({ x: s.x + (Math.random() - 0.5) * 2, z: s.z + (Math.random() - 0.5) * 2 }); } };
    take(street, baseN); take(bus, busN);
    const ok = pts.filter(p => discovery.isDiscovered(p.x, p.z) && !player.collides(p.x, p.z, 0.4, world.colliders)
      && Math.hypot(p.x - player.position.x, p.z - player.position.z) > 7);
    combat.spawnDemons(ok);
  }

  // ---------- flows
  function openBedroom() {
    inHouse = true; SOI.input.release();
    SOI.ui.openPanel('bedroom', bedroomData());
  }
  function bedroomData() {
    const canSleep = state.clockMinutes >= T.dinnerMinutes;
    return {
      chest: itemsOwned('chest'), backpack: itemsOwned('backpack'), roomFinds: itemsOwned('bedroom'),
      combined: state.tonight ? { a: item(state.tonight.a), b: item(state.tonight.b) } : null,
      canSleep, clock: SOI.time.clock(state.clockMinutes),
      note: canSleep ? 'Your things are packed. Who knows what they\'ll become tonight?' : 'Dinner first. Then bed.',
    };
  }
  function goToSleep() {
    if (transitionBusy) return;
    transitionBusy = true; inHouse = false;
    SOI.ui.closePanel();
    state.phase = 'dream'; save();
    const ms = reduced() ? 400 : 2200;
    SOI.ui.showScreen('transition', { toNight: true, title: 'A head full of possibilities.', text: 'The ordinary starts to become extraordinary.', ms });
    setTimeout(() => { clearWorld(); startDream(); transitionBusy = false; }, ms * 0.55);
  }
  function wake(reason) {
    if (transitionBusy || phase !== 'dream') return;
    transitionBusy = true;
    SOI.ui.closePanel(); SOI.input.release();
    state.dreamPos = { x: player.position.x, z: player.position.z, rotY: player.rotY };
    const demonsTonight = combat ? combat.killed : 0;
    state.stats.demons += demonsTonight; state.stats.nights++;
    state.phase = 'day'; phase = 'summary'; // waking means the next day
    const titles = { called: 'Your parents are calling.', damage: 'Too much. You jolt awake.', choice: 'You decide to wake up.' };
    const ms = reduced() ? 400 : 2000;
    const cal = calendar();
    const found = state.foundToday.map(id => D.items[id]?.name).filter(Boolean);
    save();
    SOI.ui.showScreen('transition', { toNight: false, title: titles[reason] || titles.called, text: 'Your dream will wait where you left it.', ms });
    setTimeout(() => {
      clearWorld();
      SOI.ui.showScreen('summary', {
        week: cal.week, date: cal.date, found, made: state.tonight ? D.dreamItems[state.tonight.result].name : null,
        demons: demonsTonight, discoveredPct: discovery.percent(), onContinue: nextDay,
      });
      transitionBusy = false;
    }, ms + 150);
  }
  function nextDay() {
    state.calendarIndex++;
    state.clockMinutes = T.dayStartMinutes; state.dinnerCalled = false; state.foundToday = [];
    state.phase = 'day'; save();
    enterWorld();
    SOI.ui.toast(`${calendar().label}. The map shows what you drew.`);
  }
  function fireEvent(eventId) {
    const ev = D.events[eventId]; if (!ev) return;
    const rec = state.places[ev.place];
    if (rec.events.includes(eventId)) return;
    rec.events.push(eventId); rec.mood = Math.max(-1, Math.min(1, rec.mood + ev.mood));
    SOI.ui.toast(ev.text);
    if (ev.subtitle) say(ev.subtitle.speaker, ev.subtitle.text, 0.2, 4);
    const f = player.forward(); player.startDash(f.x, f.z); player.dash.dist = 1.2; // the stumble
    save();
  }
  function interact(i) {
    if (!i) return;
    if (i.type === 'item') {
      state.ownership[i.itemId] = 'backpack';
      if (!state.foundToday.includes(i.itemId)) state.foundToday.push(i.itemId);
      liveInteractables = liveInteractables.filter(x => x !== i);
      if (i.mesh) i.mesh.visible = false;
      SOI.ui.pickup(D.items[i.itemId].name);
      save();
    } else if (i.type === 'door') {
      openBedroom();
    } else if (i.type === 'look') {
      SOI.ui.toast(i.text || i.label);
      if (i.id === 'gate' && phase === 'day') {
        // seen but unreachable: looking through the gate puts the school on the map
        const school = world.mapFeatures.find(f => f.kind === 'school');
        if (school) discovery.reveal({ x: school.x, z: school.z }, { x: 0, z: 0 }, { sightRadius: 15, closeRing: 15, coneDot: -2 });
      }
    } else if (i.type === 'event') {
      fireEvent(i.eventId);
    }
  }
  function say(speaker, text, loud, seconds) {
    if (!state.settings.subtitles) return;
    subtitle = { speaker, text, loud: loud || 0 };
    subtitleUntil = performance.now() + (seconds || 4) * 1000;
  }
  function voices(dt) {
    voiceTimer -= dt;
    if (phase === 'day') {
      if (voiceTimer <= 0) {
        const pool = state.clockMinutes >= T.dinnerMinutes ? D.voices.afterDinner : D.voices.day;
        say(D.voices.daySpeaker, pool[Math.floor(Math.random() * pool.length)], 0, 4);
        voiceTimer = T.voiceMinInterval + Math.random() * 12;
      }
    } else if (phase === 'dream') {
      const ramp = dreamLeft < T.voiceRampSeconds ? 1 - dreamLeft / T.voiceRampSeconds : 0;
      if (voiceTimer <= 0) {
        if (ramp > 0) {
          const idx = Math.min(D.voices.wakeRamp.length - 1, Math.floor(ramp * D.voices.wakeRamp.length));
          say(D.voices.dreamSpeaker, D.voices.wakeRamp[idx], ramp, 3);
          voiceTimer = Math.max(3, 10 - ramp * 7);
        } else {
          say(D.voices.dreamSpeaker, D.voices.dream[Math.floor(Math.random() * D.voices.dream.length)], 0, 4);
          voiceTimer = T.voiceMinInterval + Math.random() * 10;
        }
      }
    }
  }
  function locationLabel() {
    if (phase === 'dream' && (lostNow || fogDepth > T.fogHaze * 0.5)) return D.places.fog.name;
    const p = player.position;
    const order = ['home', 'yard', 'busstop', 'gate'];
    for (const id of order) {
      const pl = world.places.find(x => x.id === id);
      if (pl && Math.hypot(p.x - pl.x, p.z - pl.z) <= pl.radius) return pl.name;
    }
    return D.places.street.name;
  }
  function minimapData() {
    return { mode: phase, features: world.mapFeatures, grid: D.world, mask: discovery.mask, player: { x: player.position.x, z: player.position.z, rotY: player.rotY }, marks: state.marks, trail, lost: lostNow };
  }
  function mapPanelData() {
    const places = world.places.map(pl => ({ id: pl.id, name: pl.name, x: pl.x, z: pl.z, discovered: discovery.isDiscovered(pl.x, pl.z) }));
    const school = world.mapFeatures.find(f => f.kind === 'school');
    if (school) places.push({ id: 'school', name: 'School', x: school.x, z: school.z, discovered: discovery.isDiscovered(school.x, school.z) });
    return { ...minimapData(), places, caption: phase === 'dream' ? 'The same streets. A different kind of dark.' : 'I\'ll draw the rest when I get there.' };
  }

  // ---------- UI handlers
  const handlers = {
    onStart() { if (phase !== 'title') return; clearWorld(); enterWorld(); },
    onNewGame() {
      state = freshState(); discovery = SOI.discovery.create(D.world); state.started = true; save(); applySettings();
      SOI.ui.closePanel(); clearWorld(); enterWorld();
    },
    onRequestPanel(type) {
      if (phase === 'title' || transitionBusy) return;
      if (SOI.ui.isPanelOpen() && type !== 'pause') { SOI.ui.closePanel(); return; }
      SOI.input.release();
      if (type === 'pause') SOI.ui.openPanel('pause', { mode: phase, canSleep: state.clockMinutes >= T.dinnerMinutes, inHouse });
      else if (type === 'backpack') SOI.ui.openPanel('backpack', {
        mode: phase, items: itemsOwned('backpack'), loaned: [],
        tonight: state.tonight ? { name: D.dreamItems[state.tonight.result].name, icon: D.dreamItems[state.tonight.result].icon } : null,
      });
      else if (type === 'map') SOI.ui.openPanel('map', mapPanelData());
      else if (type === 'notebook') SOI.ui.openPanel('notebook', {
        recipes: state.knownRecipes.map(r => ({ a: item(r.a), b: item(r.b), result: { name: D.dreamItems[r.result].name, icon: D.dreamItems[r.result].icon }, reveal: D.dreamItems[r.result].reveal })),
      });
      else if (type === 'settings') SOI.ui.openPanel('settings', { ...state.settings });
      else if (type === 'help') SOI.ui.openPanel('help', {});
    },
    onResume() { if (inHouse && phase === 'day') { SOI.ui.openPanel('bedroom', bedroomData()); } },
    onSleep() { if (state.clockMinutes >= T.dinnerMinutes) goToSleep(); else SOI.ui.toast('Not until after dinner.'); },
    onLeaveHouse() { inHouse = false; SOI.ui.closePanel(); },
    onTake(id) { if (state.ownership[id] === 'bedroom') { state.ownership[id] = 'backpack'; if (!state.foundToday.includes(id)) state.foundToday.push(id); save(); } SOI.ui.openPanel('bedroom', bedroomData()); },
    onMove(id, to) { if (['chest', 'backpack'].includes(to) && state.ownership[id] && !inTonight(id)) { state.ownership[id] = to; save(); } SOI.ui.openPanel('bedroom', bedroomData()); },
    onCombine(a, b) {
      if (a && b && a !== b && D.items[a] && D.items[b]) { state.tonight = { a, b, result: SOI.craft.resolve(a, b) }; save(); }
      SOI.ui.openPanel('bedroom', bedroomData());
    },
    onUncombine() { state.tonight = null; save(); SOI.ui.openPanel('bedroom', bedroomData()); },
    onWake() { wake('choice'); },
    onToggleMark() {
      const p = player.position;
      const i = state.marks.findIndex(m => Math.hypot(m.x - p.x, m.z - p.z) < 4);
      if (i >= 0) state.marks.splice(i, 1); else state.marks.push({ x: p.x, z: p.z });
      save(); SOI.ui.openPanel('map', mapPanelData());
    },
    onSetting(key, value) { state.settings[key] = !!value; applySettings(); save(); },
    onMainMenu() { save(); SOI.ui.closePanel(); clearWorld(); showTitle(); },
  };

  // ---------- main loop
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    const paused = SOI.ui.isPanelOpen() || transitionBusy;
    if ((phase === 'day' || phase === 'dream') && player && world) {
      if (!paused) update(dt);
      else { SOI.input.endFrame(); }
    } else if (phase === 'title' && world) {
      // slow drift behind the title
      const t = performance.now() * 0.00005;
      camera.position.set(-52 + Math.sin(t) * 4, 7, 6 + Math.cos(t) * 3); camera.lookAt(-33, 3, -14);
    }
    renderer.render(scene, camera);
  }
  function update(dt) {
    const input = SOI.input;
    player.update(dt, input, world.colliders, false);

    // nearest interactable
    nearest = null; let best = 1e9;
    for (const i of liveInteractables) {
      const d = Math.hypot(i.x - player.position.x, i.z - player.position.z);
      if (i.type === 'event') { if (d <= i.radius) fireEvent(i.eventId); continue; }
      if (d <= (i.radius || 2.2) && d < best) { best = d; nearest = i; }
    }
    if (nearest && input.take('e')) interact(nearest);

    if (phase === 'day') {
      state.clockMinutes += dt * T.gameMinutesPerSecond;
      if (!state.dinnerCalled && state.clockMinutes >= T.dinnerMinutes) {
        state.dinnerCalled = true;
        say(D.voices.daySpeaker, D.voices.dinner, 0.5, 5);
        SOI.ui.toast('Dinner. You can go to bed whenever you like now.');
        voiceTimer = 20; save();
      }
      if (state.clockMinutes >= T.forcedBedMinutes) {
        SOI.ui.toast('Past midnight. Bed. Now.');
        goToSleep();
      }
      revealTimer -= dt;
      if (revealTimer <= 0) {
        revealTimer = 0.1;
        const f = player.cameraForward();
        discovery.reveal({ x: player.position.x, z: player.position.z }, { x: f.x, z: f.z }, { sightRadius: T.sightRadius, closeRing: T.closeRing, coneDot: T.sightConeDot });
      }
    } else if (phase === 'dream') {
      const r = combat.update(dt, input, world.colliders);
      const fr = fog.update(player.position, scene.fog);
      fogDepth = fr.depth; lostNow = fr.lost;
      fadeEl.style.opacity = String(fr.fade * 0.6);
      if (r.hitThisFrame) { SOI.ui.toast(r.heart > 0 ? 'They have your laces.' : ''); }
      dreamLeft -= dt;
      trailTimer -= dt;
      if (trailTimer <= 0) { trailTimer = 0.5; trail.push({ x: player.position.x, z: player.position.z }); const max = Math.ceil(T.trailSeconds / 0.5); if (trail.length > max) trail.shift(); }
      if (r.heart <= 0) { wake('damage'); return; }
      if (dreamLeft <= 0) { wake('called'); return; }
    }

    voices(dt);
    if (subtitle && performance.now() > subtitleUntil) subtitle = null;

    // HUD
    const cal = calendar();
    const dinner = state.clockMinutes >= T.dinnerMinutes;
    SOI.ui.setHud({
      clock: SOI.time.clock(state.clockMinutes), dateLabel: cal.label, date: cal.date,
      phase: phase === 'dream' ? 'Dreaming' : dinner ? 'After dinner' : 'After school',
      location: locationLabel(), world: phase === 'dream' ? 'The dream world' : 'The real world',
      packCount: itemsOwned('backpack').length,
      prompt: nearest ? { key: 'E', label: nearest.label } : null,
      heart: combat ? combat.heart() : 1,
      weapon: phase === 'dream' && dreamResult ? { name: dreamResult.name, icon: dreamResult.icon } : null,
      subtitle, lost: lostNow,
    });
    minimapTimer -= dt;
    if (minimapTimer <= 0) { minimapTimer = 0.1; SOI.ui.drawMinimap(minimapData()); }
    saveTimer -= dt; if (saveTimer <= 0) { saveTimer = 15; save(); }
    input.endFrame();
  }

  document.addEventListener('DOMContentLoaded', boot);
  return { get state() { return state; }, get phase() { return phase; }, save, wake, goToSleep, nextDay, debug: { get world() { return world; }, get player() { return player; }, get discovery() { return discovery; } } };
})();
