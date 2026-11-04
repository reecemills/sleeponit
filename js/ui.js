// Sleep On It: HUD, minimap, panels. Classic script. See CONTRACTS.md (SOI.ui).
(function () {
  'use strict';
  window.SOI = window.SOI || {};

  var NS = 'http://www.w3.org/2000/svg';
  var HAND = "Schoolbell, 'Patrick Hand', 'Segoe Print', 'Comic Sans MS', cursive";
  var handlers = {};
  var el = {};
  var mode = 'day';
  var baseScreen = null;      // 'title' | 'game' | 'summary' | null
  var transitionActive = false;
  var transTimer = 0, transTimer2 = 0;
  var current = null;         // { type, data } of the open panel
  var returnTo = null;        // { type, data } to go back to from settings/help/wake/newgame
  var lastEsc = 0;
  var settings = { subtitles: true, reducedMotion: false };

  function call(name) {
    var f = handlers[name];
    if (typeof f !== 'function') return;
    try { return f.apply(handlers, Array.prototype.slice.call(arguments, 1)); } catch (e) { if (window.console) console.error(e); }
  }

  // ---------- DOM helpers ----------
  function $(id) { return document.getElementById(id); }
  function h(tag, a, kids) {
    var e = document.createElement(tag);
    if (a) for (var k in a) {
      var v = a[k];
      if (v === false || v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    if (kids) kids.forEach(function (c) { if (c != null && c !== false) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function icon(name, cls) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS(NS, 'use');
    u.setAttribute('href', '#i-' + (name || 'star'));
    s.appendChild(u);
    return s;
  }
  function setText(node, v) { if (node.textContent !== v) node.textContent = v; }
  function setHidden(node, hide) { if (node.hidden !== hide) node.hidden = hide; }

  // ---------- Screens ----------
  function refreshScreens() {
    setHidden(el.title, baseScreen !== 'title');
    setHidden(el.hud, baseScreen !== 'game');
    setHidden(el.summary, baseScreen !== 'summary');
  }

  function showScreen(name, data) {
    data = data || {};
    if (name === 'transition') { showTransition(data); return; }
    baseScreen = name;
    if (name === 'title') buildTitle(data);
    if (name === 'summary') buildSummary(data);
    refreshScreens();
  }

  function buildTitle(d) {
    var m = el.titleMenu;
    m.textContent = '';
    m.appendChild(h('button', { class: 'nav-btn primary', type: 'button', onclick: function () { call('onStart'); } },
      [d.hasSave ? 'Continue' : 'Step outside']));
    m.appendChild(h('button', { class: 'nav-btn', type: 'button', onclick: function () {
      if (d.hasSave) openPanel('newgame', {}); else call('onNewGame');
    } }, ['Start a new day']));
    m.appendChild(h('button', { class: 'nav-btn', type: 'button', onclick: function () { openPanel('settings', settings); } }, ['Settings']));
    m.appendChild(h('button', { class: 'nav-btn', type: 'button', onclick: function () { openPanel('help', {}); } }, ['How to play']));
    setText(el.titleCaption, d.caption || '');
  }

  function showTransition(d) {
    clearTimeout(transTimer); clearTimeout(transTimer2);
    transitionActive = true;
    var t = el.transition;
    t.classList.remove('fade');
    t.hidden = false;
    var u = $('transition-icon').firstChild;
    u.setAttribute('href', d.toNight ? '#i-bed' : '#i-sun');
    setText($('transition-title'), d.title || '');
    setText($('transition-text'), d.text || '');
    var ms = d.ms == null ? 2000 : d.ms;
    transTimer = setTimeout(function () {
      t.classList.add('fade');
      transTimer2 = setTimeout(function () { t.hidden = true; t.classList.remove('fade'); transitionActive = false; }, 650);
    }, ms);
  }

  function buildSummary(d) {
    var s = el.summary;
    s.textContent = '';
    var found = d.found && d.found.length ? d.found.join(', ') : 'Nothing this time';
    var card = h('div', { class: 'summary-card' }, [
      h('span', { class: 'eyebrow', text: [d.week != null ? 'Week ' + d.week : '', d.date || ''].filter(Boolean).join(' · ') || 'Morning' }),
      h('h2', { text: 'You woke up.' }),
      h('dl', null, [
        h('dt', { text: 'Things I found' }), h('dd', { text: found }),
        h('dt', { text: 'Something I made' }), h('dd', { text: d.made || 'Nothing' }),
        h('dt', { text: 'Demons beaten' }), h('dd', { text: String(d.demons || 0) }),
        h('dt', { text: 'Block discovered' }), h('dd', { text: Math.round(d.discoveredPct || 0) + '%' })
      ]),
      h('div', { class: 'buttons' }, [h('button', { class: 'btn primary', type: 'button', text: 'Next day', onclick: function () {
        if (typeof d.onContinue === 'function') d.onContinue();
      } })])
    ]);
    s.appendChild(card);
  }

  function setMode(m) {
    mode = m === 'dream' ? 'dream' : 'day';
    document.body.classList.toggle('night', mode === 'dream');
    var c = el.minimap;
    var w = mode === 'dream' ? 360 : 480, hh = mode === 'dream' ? 360 : 300;
    if (c.width !== w) c.width = w;
    if (c.height !== hh) c.height = hh;
    layerCache = {};
    hudLast.mode = null;
  }

  // ---------- HUD ----------
  var hudLast = {};
  function setHud(hd) {
    hd = hd || {};
    var L = hudLast;
    if (L.clock !== hd.clock) { L.clock = hd.clock; setClock(hd.clock); }
    if (L.dateLabel !== hd.dateLabel) { L.dateLabel = hd.dateLabel; setText($('h-datelabel'), hd.dateLabel || ''); }
    if (L.date !== hd.date) { L.date = hd.date; setText($('h-date'), hd.date || ''); }
    if (L.phase !== hd.phase) { L.phase = hd.phase; setText($('h-phase'), hd.phase || ''); }
    if (L.location !== hd.location) { L.location = hd.location; setText($('h-loc'), hd.location || ''); }
    if (L.world !== hd.world) { L.world = hd.world; setText($('h-world'), hd.world || ''); }
    if (L.packCount !== hd.packCount) { L.packCount = hd.packCount; setText($('h-pack'), String(hd.packCount || 0)); }
    var pk = hd.prompt ? hd.prompt.key + '|' + hd.prompt.label : '';
    if (L.prompt !== pk) {
      L.prompt = pk;
      setHidden(el.prompt, !hd.prompt);
      if (hd.prompt) { setText($('prompt-key'), hd.prompt.key || 'E'); setText($('prompt-label'), hd.prompt.label || ''); }
    }
    if (hd.heart != null && L.heart !== hd.heart) {
      L.heart = hd.heart;
      var f = Math.max(0, Math.min(1, hd.heart));
      var r = $('heart-rect');
      r.setAttribute('y', (6 + 38 * (1 - f)).toFixed(2));
    }
    var wk = hd.weapon ? hd.weapon.name + '|' + hd.weapon.icon : '';
    if (L.weapon !== wk) {
      L.weapon = wk;
      setHidden(el.weapon, !hd.weapon);
      if (hd.weapon) { $('weapon-use').setAttribute('href', '#i-' + (hd.weapon.icon || 'fist')); setText($('weapon-name'), hd.weapon.name || ''); }
    }
    var sub = hd.subtitle;
    var sk = sub ? (sub.speaker || '') + '|' + sub.text + '|' + (sub.loud || 0) : '';
    var show = !!sub && settings.subtitles;
    if (L.sub !== sk || L.subShow !== show) {
      L.sub = sk; L.subShow = show;
      setHidden(el.subtitle, !show);
      if (sub) {
        setText($('sub-speaker'), sub.speaker || '');
        $('sub-speaker').hidden = !sub.speaker;
        setText($('sub-text'), sub.text || '');
        var loud = Math.max(0, Math.min(1, sub.loud || 0));
        el.subtitle.style.setProperty('--loud', loud.toFixed(2));
        el.subtitle.classList.toggle('shake', loud > 0.7);
      }
    }
    var lost = !!hd.lost;
    if (L.lost !== lost) { L.lost = lost; el.hud.classList.toggle('lost', lost); }
  }

  function setClock(str) {
    var m = /(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(str || '');
    if (!m) return;
    var hr = parseInt(m[1], 10) % 12, mn = parseInt(m[2], 10);
    $('clock-h').setAttribute('transform', 'rotate(' + ((hr + mn / 60) * 30).toFixed(1) + ' 50 50)');
    $('clock-m').setAttribute('transform', 'rotate(' + (mn * 6) + ' 50 50)');
  }

  // ---------- Toasts ----------
  var toastTimer = 0, pickTimer = 0, revealTimer = 0;
  function toast(text) {
    setText(el.toast, text || '');
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 3000);
  }
  function pickup(name) {
    var p = el.pickup;
    p.textContent = 'Got ' + (name || 'something');
    p.hidden = false;
    p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';
    clearTimeout(pickTimer);
    pickTimer = setTimeout(function () { p.hidden = true; }, 2000);
  }
  function reveal(r) {
    r = r || {};
    var d = el.reveal;
    d.textContent = '';
    d.appendChild(icon(r.icon || 'star'));
    d.appendChild(h('h3', { text: r.name || '' }));
    d.appendChild(h('p', { text: r.reveal || '' }));
    d.hidden = false;
    clearTimeout(revealTimer);
    revealTimer = setTimeout(function () { d.hidden = true; }, 4000);
  }

  // ---------- Minimap drawing ----------
  var layerCache = {};
  var hatchCache = {};
  function hatch(color) {
    if (hatchCache[color]) return hatchCache[color];
    var c = document.createElement('canvas'); c.width = c.height = 6;
    var x = c.getContext('2d');
    x.strokeStyle = color; x.lineWidth = 1.3; x.lineCap = 'round';
    x.beginPath(); x.moveTo(0, 6); x.lineTo(6, 0); x.moveTo(-1, 1); x.lineTo(1, -1); x.moveTo(5, 7); x.lineTo(7, 5); x.stroke();
    return (hatchCache[color] = c.getContext('2d').createPattern(c, 'repeat'));
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function maskCount(mask) { var n = 0; if (mask) for (var i = 0; i < mask.length; i++) n += mask[i]; return n; }

  function view(W, H, g, round) {
    var gw = g.maxX - g.minX, gh = g.maxZ - g.minZ;
    var pad = round ? W * 0.03 : W * 0.03;
    var s = Math.min((W - 2 * pad) / gw, (H - 2 * pad) / gh);
    return { s: s, ox: (W - gw * s) / 2 - g.minX * s, oy: (H - gh * s) / 2 - g.minZ * s };
  }

  function drawPoly(c, pts, v, rand, jitter) {
    c.beginPath();
    var first = true;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      var n = Math.max(1, Math.ceil(len / 6));
      for (var k = (i === 0 ? 0 : 1); k <= n; k++) {
        var t = k / n;
        var x = a[0] + (b[0] - a[0]) * t + (rand() - 0.5) * jitter;
        var z = a[1] + (b[1] - a[1]) * t + (rand() - 0.5) * jitter;
        if (first) { c.moveTo(v.ox + x * v.s, v.oy + z * v.s); first = false; }
        else c.lineTo(v.ox + x * v.s, v.oy + z * v.s);
      }
    }
  }

  function starPath(c, x, y, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 ? r * 0.45 : r, an = -Math.PI / 2 + i * Math.PI / 5;
      c[i ? 'lineTo' : 'moveTo'](x + Math.cos(an) * rr, y + Math.sin(an) * rr);
    }
    c.closePath();
  }

  function drawFeatures(c, feats, v, dream) {
    var P = dream
      ? { line: '#ece9f5', road: '#ece9f5', lane: '#b9b4cf', creek: '#bfc8ff', fill: '#16132a', creekFill: '#16132a', hatches: ['#ece9f5'], bus: '#ece9f5', tree: '#ece9f5', cy: '#ece9f5' }
      : { line: '#35333d', road: '#35333d', lane: '#a47a3c', creek: '#3f6fb5', fill: '#f6efdc', creekFill: '#d9e6f2', hatches: ['#d9503f', '#3f6fb5', '#e6a93c', '#6c9a4a'], bus: '#e6a93c', tree: '#6c9a4a', cy: '#e6a93c' };
    var s = v.s;
    c.lineCap = 'round'; c.lineJoin = 'round';
    var hi = 0;
    // pass 1: ground strips
    feats.forEach(function (f, i) {
      if (f.kind !== 'road' && f.kind !== 'lane' && f.kind !== 'creek') return;
      var col = P[f.kind];
      var w = Math.max(3, f.width * s);
      var j = f.kind === 'creek' ? 1.4 : 0.6;
      var r1 = rng(i * 7919 + 13), r2 = rng(i * 7919 + 13);
      c.strokeStyle = col; c.globalAlpha = dream ? 0.9 : 0.85;
      c.lineWidth = w + 3.2; drawPoly(c, f.points, v, r1, j); c.stroke();
      c.strokeStyle = f.kind === 'creek' ? P.creekFill : P.fill; c.globalAlpha = 1;
      c.lineWidth = Math.max(1, w - 1.2); drawPoly(c, f.points, v, r2, j); c.stroke();
      if (f.kind === 'road') {
        c.strokeStyle = dream ? '#ece9f5' : '#e6a93c'; c.globalAlpha = 0.8; c.lineWidth = 1.4; c.setLineDash([5, 5]);
        drawPoly(c, f.points, v, rng(i * 7919 + 13), j); c.stroke(); c.setLineDash([]);
      }
      c.globalAlpha = 1;
    });
    // pass 2: things
    c.lineWidth = 1.7;
    feats.forEach(function (f, i) {
      var x = v.ox + (f.x || 0) * s, y = v.oy + (f.z || 0) * s;
      var rand = rng(i * 104729 + 7);
      switch (f.kind) {
        case 'house': case 'school': {
          var w = Math.max(9, f.w * s), d = Math.max(8, f.d * s);
          var col = f.kind === 'school' ? P.hatches[2 % P.hatches.length] : P.hatches[(hi++) % P.hatches.length];
          if (f.label === 'Home' && !dream) col = '#d9503f';
          c.fillStyle = hatch(col); c.strokeStyle = P.line;
          var jx = (rand() - 0.5) * 1.5;
          c.beginPath(); c.rect(x - w / 2 + jx, y - d / 2, w, d); c.fill(); c.stroke();
          c.beginPath(); c.moveTo(x - w / 2 - 2, y - d / 2); c.lineTo(x, y - d / 2 - Math.min(9, d * 0.45)); c.lineTo(x + w / 2 + 2, y - d / 2); c.stroke();
          break;
        }
        case 'treehouse':
          c.strokeStyle = P.tree; c.beginPath(); c.arc(x, y, 6, 0, 6.3); c.stroke();
          c.strokeStyle = P.line; c.strokeRect(x - 3, y - 3, 6, 6);
          break;
        case 'bus': {
          c.save(); c.translate(x, y); c.rotate(f.rot || 0);
          var bw = Math.max(10, f.w * s), bd = Math.max(5, f.d * s), rr = 2.5;
          c.fillStyle = P.bus; c.globalAlpha = dream ? 0.25 : 0.85; c.strokeStyle = P.line;
          c.beginPath();
          if (c.roundRect) c.roundRect(-bw / 2, -bd / 2, bw, bd, rr); else c.rect(-bw / 2, -bd / 2, bw, bd);
          c.fill(); c.globalAlpha = 1; c.stroke(); c.restore();
          break;
        }
        case 'busstop':
          c.strokeStyle = P.creek === '#3f6fb5' ? '#3f6fb5' : '#bfc8ff';
          c.beginPath(); c.moveTo(x, y + 4); c.lineTo(x, y - 5); c.stroke();
          c.beginPath(); c.arc(x, y - 6, 2.6, 0, 6.3); c.stroke();
          break;
        case 'mailbox':
          c.fillStyle = dream ? '#ece9f5' : '#d9503f'; c.beginPath(); c.arc(x, y, 2.4, 0, 6.3); c.fill();
          break;
        case 'gate': {
          var gw = Math.max(8, (f.w || 7) * s);
          c.strokeStyle = P.line; c.fillStyle = P.line;
          c.beginPath(); c.moveTo(x, y - gw / 2); c.lineTo(x, y + gw / 2); c.stroke();
          c.beginPath(); c.arc(x, y - gw / 2, 2.3, 0, 6.3); c.fill(); c.beginPath(); c.arc(x, y + gw / 2, 2.3, 0, 6.3); c.fill();
          break;
        }
        case 'tree':
          c.strokeStyle = P.tree; c.lineWidth = 1.4;
          c.beginPath(); c.arc(x + (rand() - 0.5), y + (rand() - 0.5), Math.max(2.6, 1.6 * s), 0, 6.3); c.stroke(); c.lineWidth = 1.7;
          break;
        case 'bridge':
          c.save(); c.translate(x, y); c.rotate(f.rot || 0); c.strokeStyle = P.line;
          c.strokeRect(-4, -7, 8, 14); c.beginPath(); c.moveTo(-4, -2); c.lineTo(4, -2); c.moveTo(-4, 3); c.lineTo(4, 3); c.stroke();
          c.restore();
          break;
      }
    });
  }

  function makeLayer(m, W, H, dream, v) {
    var g = m.grid || SOI.data.world;
    var cols = Math.round((g.maxX - g.minX) / g.cell), rows = Math.round((g.maxZ - g.minZ) / g.cell);
    var cw = g.cell * v.s;
    function newC() { var c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
    var content = newC(), cx = content.getContext('2d');
    drawFeatures(cx, m.features || [], v, dream);
    var maskC = newC(), mx = maskC.getContext('2d');
    mx.fillStyle = dream ? '#16132a' : '#000';
    var mk = m.mask;
    if (mk) for (var iz = 0; iz < rows; iz++) for (var ix = 0; ix < cols; ix++) {
      if (mk[iz * cols + ix]) mx.fillRect(Math.floor(v.ox + (g.minX + ix * g.cell) * v.s), Math.floor(v.oy + (g.minZ + iz * g.cell) * v.s), Math.ceil(cw) + 1, Math.ceil(cw) + 1);
    }
    var maskUse = maskC;
    if (!dream) {
      var soft = newC(), sx = soft.getContext('2d');
      if ('filter' in sx) { sx.filter = 'blur(' + Math.max(1, cw * 0.7).toFixed(1) + 'px)'; }
      sx.drawImage(maskC, 0, 0); sx.filter = 'none';
      // boost so the blurred centre stays opaque
      sx.globalCompositeOperation = 'lighter'; sx.drawImage(maskC, 0, 0); sx.globalCompositeOperation = 'source-over';
      maskUse = soft;
    }
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(maskUse, 0, 0);
    cx.globalCompositeOperation = 'source-over';
    if (!dream) return content;
    var out = newC(), ox = out.getContext('2d');
    ox.drawImage(maskC, 0, 0); ox.drawImage(content, 0, 0);
    return out;
  }

  function cellDiscovered(m, g, x, z, adj) {
    var cols = Math.round((g.maxX - g.minX) / g.cell), rows = Math.round((g.maxZ - g.minZ) / g.cell);
    var ix = Math.floor((x - g.minX) / g.cell), iz = Math.floor((z - g.minZ) / g.cell);
    if (!m.mask) return false;
    for (var dz = -adj; dz <= adj; dz++) for (var dx = -adj; dx <= adj; dx++) {
      var a = ix + dx, b = iz + dz;
      if (a >= 0 && b >= 0 && a < cols && b < rows && m.mask[b * cols + a]) return true;
    }
    return false;
  }

  // o: { key, round, labels, places }
  function drawMap(canvas, m, o) {
    var W = canvas.width, H = canvas.height, c = canvas.getContext('2d');
    var dream = m.mode === 'dream';
    var g = m.grid || SOI.data.world;
    var v, lv, LW = W, LH = H;
    if (o.round && m.player) {
      // dream minimap: zoomed, centred on the kid (about 100 m across)
      var zs = W / 100;
      v = { s: zs, ox: W / 2 - m.player.x * zs, oy: H / 2 - m.player.z * zs };
      LW = Math.round((g.maxX - g.minX) * zs); LH = Math.round((g.maxZ - g.minZ) * zs);
      lv = { s: zs, ox: -g.minX * zs, oy: -g.minZ * zs };
    } else { v = view(W, H, g, o.round); lv = v; }
    var lost = !!m.lost;
    c.clearRect(0, 0, W, H);
    c.save();
    if (o.round) { c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 3, 0, 6.3); c.clip(); }
    c.fillStyle = dream ? '#000' : '#f6efdc';
    c.fillRect(0, 0, W, H);
    if (!lost) {
      var ck = [m.mode, LW, LH, maskCount(m.mask)].join('|');
      var cached = layerCache[o.key];
      if (!cached || cached.key !== ck || cached.feats !== m.features) {
        cached = layerCache[o.key] = { key: ck, feats: m.features, canvas: makeLayer(m, LW, LH, dream, lv) };
      }
      c.drawImage(cached.canvas, Math.round(v.ox - lv.ox), Math.round(v.oy - lv.oy));
    }
    var s = v.s;
    // trail
    var tr = m.trail || [];
    if (tr.length) {
      c.fillStyle = '#ffb347';
      for (var i = 0; i < tr.length; i++) {
        c.globalAlpha = 0.25 + 0.75 * (i + 1) / tr.length;
        c.beginPath(); c.arc(v.ox + tr[i].x * s, v.oy + tr[i].z * s, Math.max(1.6, o.round ? 2.2 : 2.6), 0, 6.3); c.fill();
      }
      c.globalAlpha = 1;
    }
    if (!lost) {
      // marks
      (m.marks || []).forEach(function (mk) {
        starPath(c, v.ox + mk.x * s, v.oy + mk.z * s, o.labels ? 9 : 6);
        c.fillStyle = dream ? '#ff8a7a' : '#d9503f'; c.strokeStyle = dream ? '#16132a' : '#f6efdc'; c.lineWidth = 1.5; c.fill(); c.stroke();
      });
      // labels (full map only)
      if (o.labels) drawLabels(c, m, g, v, dream, W, H);
    }
    // kid
    var p = m.player;
    if (p) {
      var k = o.labels ? 1.5 : 1;
      c.save(); c.translate(v.ox + p.x * s, v.oy + p.z * s); c.rotate(Math.PI - (p.rotY || 0)); c.scale(k, k);
      c.beginPath(); c.moveTo(0, -8); c.lineTo(6, 6); c.lineTo(0, 3); c.lineTo(-6, 6); c.closePath();
      c.fillStyle = dream ? '#ffb347' : '#d9503f'; c.strokeStyle = dream ? '#ffb347' : '#d9503f'; c.lineWidth = 2; c.lineJoin = 'round';
      c.fill(); c.stroke(); c.restore();
    }
    c.restore();
    // border
    if (o.round) {
      c.strokeStyle = '#ece9f5'; c.lineWidth = 4; c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 3, 0, 6.3); c.stroke();
      c.strokeStyle = '#ece9f555'; c.lineWidth = 1; c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 8, 0, 6.3); c.stroke();
    } else {
      c.strokeStyle = dream ? '#ece9f5' : '#35333d'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, W - 3, H - 3);
    }
  }

  function drawLabels(c, m, g, v, dream, W, H) {
    var fs = Math.round(H * 0.04);
    c.font = fs + 'px ' + HAND; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    var ink = dream ? '#ece9f5' : '#35333d', halo = dream ? '#16132a' : '#f6efdc';
    function txt(t, x, y, col, size) {
      c.font = (size || fs) + 'px ' + HAND;
      c.lineWidth = 5; c.strokeStyle = halo; c.strokeText(t, x, y); c.fillStyle = col; c.fillText(t, x, y);
    }
    var named = {};
    (m.places || []).forEach(function (pl) {
      var x = v.ox + pl.x * v.s, y = v.oy + pl.z * v.s;
      if (pl.discovered) { named[pl.name] = 1; txt(pl.name, x, y, ink); }
      else if (cellDiscovered(m, g, pl.x, pl.z, 1)) txt('?', x, y, dream ? '#ffb347' : '#d9503f', Math.round(fs * 1.5));
    });
    (m.features || []).forEach(function (f) {
      if (!f.label || named[f.label]) return;
      if (!cellDiscovered(m, g, f.x, f.z, 0)) return;
      txt(f.label, v.ox + f.x * v.s, v.oy + (f.z + (f.d || 6) / 2 + 3) * v.s, ink);
    });
  }

  function drawMinimap(m) {
    if (!m || !el.minimap) return;
    drawMap(el.minimap, m, { key: 'mini', round: m.mode === 'dream', labels: false });
  }

  // ---------- Panels ----------
  function panelHead(eyebrow, title, onClose) {
    return h('div', { class: 'panel-head' }, [
      h('div', null, [h('span', { class: 'eyebrow', text: eyebrow || '' }), h('h2', { text: title })]),
      onClose === false ? null : h('button', { class: 'close', type: 'button', 'aria-label': 'Close', text: '×', onclick: onClose || dismiss })
    ]);
  }

  function mount(type, data, node, wide) {
    var body = el.panelBody;
    body.className = 'panel' + (wide ? ' wide' : ''); body.style.width = '';
    body.textContent = '';
    body.appendChild(node);
    current = { type: type, data: data };
    if (!el.panel.open) {
      el.panel.showModal();
    }
    body.scrollTop = 0;
  }

  function openPanel(type, data) {
    data = data || {};
    if (type === 'settings' && data.subtitles != null) applySettings(data);
    var from = null;
    if (current && el.panel.open && (current.type === 'pause') && /^(settings|help|wake|newgame)$/.test(type)) from = current;
    else if (/^(settings|help|newgame)$/.test(type) && baseScreen === 'title') from = null;
    if (/^(settings|help|wake|newgame)$/.test(type)) returnTo = from; else returnTo = null;
    var b = BUILD[type];
    if (!b) return;
    b(data);
  }

  function back() {
    if (returnTo) { var r = returnTo; returnTo = null; openPanel(r.type, r.data); }
    else closePanel();
  }

  function closePanel() {
    returnTo = null;
    if (el.panel.open) el.panel.close();
    current = null;
  }
  function dismiss() {
    var wasGame = baseScreen === 'game';
    closePanel();
    if (wasGame) call('onResume');
  }
  function isPanelOpen() {
    return !!el.panel.open || transitionActive || baseScreen !== 'game';
  }

  function itemCell(it, opts) {
    var b = h('button', { class: 'slot', type: 'button', title: it.name, 'aria-pressed': opts.pressed ? 'true' : 'false', disabled: !!opts.disabled, onclick: opts.onclick }, [
      icon(it.icon), h('em', { text: it.name })]);
    return b;
  }
  function emptySlot() { return h('div', { class: 'slot empty' }); }
  function padTo(arr, n) { while (arr.length % 5 || arr.length < n) arr.push(emptySlot()); return arr; }

  var BUILD = {};

  BUILD.pause = function (d) {
    var dream = d.mode === 'dream' || mode === 'dream';
    var list = h('div', { class: 'menu-list' }, [
      h('button', { class: 'nav-btn', type: 'button', text: dream ? 'Keep dreaming' : 'Keep exploring', onclick: dismiss }),
      h('button', { class: 'nav-btn', type: 'button', text: 'Backpack', onclick: function () { call('onRequestPanel', 'backpack'); } }),
      h('button', { class: 'nav-btn', type: 'button', text: 'Map', onclick: function () { call('onRequestPanel', 'map'); } }),
      h('button', { class: 'nav-btn', type: 'button', text: 'Notebook', onclick: function () { call('onRequestPanel', 'notebook'); } }),
      h('button', { class: 'nav-btn', type: 'button', text: 'Settings', onclick: function () { openPanel('settings', settings); } }),
      dream ? h('button', { class: 'nav-btn', type: 'button', text: 'Wake up', onclick: function () { openPanel('wake', {}); } }) : null,
      h('button', { class: 'nav-btn', type: 'button', text: 'Main menu', onclick: function () { closePanel(); call('onMainMenu'); } })
    ]);
    mount('pause', d, h('div', null, [panelHead(dream ? 'Dreaming' : 'Paused', 'Hold on', dismiss), list]));
  };

  BUILD.wake = function (d) {
    mount('wake', d, h('div', null, [
      panelHead('Wake up?', 'Leave the dream', back),
      h('p', { class: 'note', text: d.place ? 'You will wake up in ' + d.place + '. What you found stays found.' : 'What you found stays found.' }),
      h('div', { class: 'buttons' }, [
        h('button', { class: 'btn primary', type: 'button', text: 'Wake up', onclick: function () { closePanel(); call('onWake'); } }),
        h('button', { class: 'btn', type: 'button', text: 'Keep dreaming', onclick: dismiss })
      ])
    ]));
  };

  BUILD.newgame = function (d) {
    mount('newgame', d, h('div', null, [
      panelHead('Start a new day', 'Start again?', back),
      h('p', { class: 'note', text: 'Your saved progress on this device will be erased.' }),
      h('div', { class: 'buttons' }, [
        h('button', { class: 'btn primary', type: 'button', text: 'Start again', onclick: function () { closePanel(); call('onNewGame'); } }),
        h('button', { class: 'btn', type: 'button', text: 'Keep my progress', onclick: back })
      ])
    ]));
  };

  function applySettings(s) {
    if (s.subtitles != null) settings.subtitles = !!s.subtitles;
    if (s.reducedMotion != null) settings.reducedMotion = !!s.reducedMotion;
    document.body.classList.toggle('reduced', settings.reducedMotion);
    hudLast.subShow = null;
  }

  BUILD.settings = function (d) {
    var rows = [['subtitles', 'Subtitles', 'Show what people say, with who is speaking.'], ['reducedMotion', 'Reduced motion', 'Stop screen shake and small animations.']].map(function (r) {
      var inp = h('input', { type: 'checkbox', id: 'set-' + r[0] });
      inp.checked = !!settings[r[0]];
      inp.addEventListener('change', function () {
        settings[r[0]] = inp.checked; applySettings(settings);
        call('onSetting', r[0], inp.checked);
      });
      return h('label', { class: 'setting', for: 'set-' + r[0] }, [h('span', null, [r[1], h('small', { text: r[2] })]), inp]);
    });
    mount('settings', d, h('div', null, [panelHead('Settings', 'Settings', back)].concat(rows, [
      h('div', { class: 'buttons' }, [h('button', { class: 'btn', type: 'button', text: 'Back', onclick: back })])])));
  };

  BUILD.help = function (d) {
    var keys = [['W A S D / arrows', 'Walk'], ['Mouse', 'Turn the camera (hold right button or click the scene)'], ['E', 'Interact: pick up, look, go to bed'],
      ['Left click / J', 'Attack (dream only)'], ['Shift / Space', 'Dodge step (dream only)'], ['B / I', 'Backpack'], ['M', 'Map'],
      ['F', 'Add or erase a map mark (while the map is open)'], ['N', 'Notebook (recipes you have discovered)'], ['Esc', 'Pause / close']];
    var t = h('div', { class: 'help-keys' });
    keys.forEach(function (k) { t.appendChild(h('span', { class: 'key', text: k[0] })); t.appendChild(h('span', { text: k[1] })); });
    mount('help', d, h('div', null, [panelHead('How to play', 'Controls', back), t,
      h('div', { class: 'buttons' }, [h('button', { class: 'btn', type: 'button', text: 'Back', onclick: back })])]), true);
    el.panelBody.style.width = '640px';
  };

  BUILD.backpack = function (d) {
    var items = d.items || [];
    var dream = d.mode === 'dream';
    var sel = items.length ? items[0] : null;
    var wrap = h('div', null);
    function render() {
      wrap.textContent = '';
      var slots = items.map(function (it) { return itemCell(it, { pressed: it === sel, onclick: function () { sel = it; render(); } }); });
      var info = h('div', { class: 'item-info' }, sel
        ? [icon(sel.icon), h('h3', { text: sel.name }), h('p', { text: sel.desc || '' })]
        : [h('p', { class: 'note', text: 'Nothing in your pockets yet.' })]);
      var left = h('div', null, [h('div', { class: 'grid5' }, padTo(slots, 10))]);
      var loaned = d.loaned || [];
      var extra = [];
      if (loaned.length) extra.push(h('div', { class: 'sect' }, [h('span', { class: 'eyebrow', text: 'Out with other people' }),
        h('ul', null, loaned.map(function (l) { return h('li', { text: l.name + ' · ' + l.who }); }))]));
      if (dream && d.tonight) extra.push(h('div', { class: 'sect' }, [h('span', { class: 'eyebrow', text: 'Things I brought' }),
        h('div', { class: 'row' }, [icon(d.tonight.icon), h('span', { text: d.tonight.name })])]));
      info.appendChild(h('div', null, extra));
      wrap.appendChild(h('div', { class: 'inventory' }, [left, info]));
    }
    render();
    mount('backpack', d, h('div', null, [panelHead(dream ? 'In the dream' : 'Pockets', 'Backpack', dismiss), wrap]), true);
  };

  BUILD.notebook = function (d) {
    var rec = d.recipes || [];
    var page = h('div', { class: 'paper-lines' });
    if (!rec.length) page.appendChild(h('p', { class: 'recipe', text: 'Nothing yet. Tie two things together before bed.' }));
    rec.forEach(function (r) {
      page.appendChild(h('div', { class: 'recipe' }, [
        h('div', { class: 'eq' }, [icon(r.a.icon), h('span', { text: r.a.name + ' + ' + r.b.name + ' =' }), icon(r.result.icon, 'res'), h('span', { class: 'res', text: r.result.name })]),
        h('small', { text: r.reveal || '' })
      ]));
    });
    mount('notebook', d, h('div', null, [panelHead('Notebook', 'Things I made', dismiss), page,
      h('div', { class: 'buttons' }, [h('button', { class: 'btn', type: 'button', text: 'Close · N', onclick: dismiss })])]));
    el.panelBody.style.width = '620px';
  };

  BUILD.map = function (d) {
    var canvas = h('canvas', { width: 1120, height: 700 });
    var m = { mode: d.mode, features: d.features, grid: d.grid, mask: d.mask, player: d.player, marks: d.marks || [], trail: d.trail || [], places: d.places || [] };
    var near = (d.marks || []).some(function (mk) { return d.player && Math.hypot(mk.x - d.player.x, mk.z - d.player.z) < 3; });
    var markBtn = h('button', { class: 'btn', type: 'button', text: near ? 'Erase my mark · F' : 'Add a mark · F', onclick: function () { call('onToggleMark'); } });
    mount('map', d, h('div', null, [
      panelHead(d.mode === 'dream' ? 'What you remember' : 'The block', 'Map', dismiss),
      h('div', { class: 'map-wrap' }, [canvas]),
      d.caption ? h('p', { class: 'note', text: d.caption, style: 'margin-top:10px' }) : null,
      h('div', { class: 'buttons' }, [markBtn, h('button', { class: 'btn primary', type: 'button', text: 'Fold away · M', onclick: dismiss })])
    ]), true);
    el.panelBody.style.width = 'min(960px, calc(100vw - 24px))';
    drawMap(canvas, m, { key: 'panel', round: false, labels: true });
  };

  BUILD.bedroom = function (d) {
    var combined = d.combined || null;
    var sel = [null, null];
    var box = h('div', null);
    function find(id) {
      var all = (d.chest || []).concat(d.backpack || []);
      for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
      return null;
    }
    function toggle(it) {
      var i = sel.indexOf(it.id);
      if (i >= 0) sel[i] = null;
      else { var e = sel.indexOf(null); if (e >= 0) sel[e] = it.id; else toast('Two things at a time.'); }
      render();
    }
    function grid(list, to, label) {
      var cells = (list || []).map(function (it) {
        return h('div', { class: 'cell' }, [
          itemCell(it, { pressed: sel.indexOf(it.id) >= 0, disabled: !!combined, onclick: function () { toggle(it); } }),
          h('button', { class: 'mini', type: 'button', text: label, disabled: !!combined, onclick: function () {
            var k = sel.indexOf(it.id); if (k >= 0) sel[k] = null; call('onMove', it.id, to); } })
        ]);
      });
      var out = [];
      cells.forEach(function (c) { out.push(c); });
      while (out.length % 5 || out.length < 5) out.push(h('div', { class: 'cell' }, [emptySlot()]));
      return h('div', { class: 'grid5' }, out);
    }
    function render() {
      var top = box.scrollTop;
      box.textContent = '';
      // combine zone
      var cz;
      if (combined) {
        cz = h('div', { class: 'combine' }, [
          h('div', { class: 'combine-row' }, [h('div', { class: 'cslot' }, [itemCell(combined.a, { disabled: true })]), h('span', { class: 'plus', text: '+' }), h('div', { class: 'cslot' }, [itemCell(combined.b, { disabled: true })])]),
          h('div', { class: 'mystery' }, [icon('star'), h('div', { text: "You made something. You'll find out tonight." })]),
          h('button', { class: 'btn', type: 'button', text: 'Untie', onclick: function () { call('onUncombine'); } })
        ]);
      } else {
        var a = find(sel[0]), b = find(sel[1]);
        var cs = function (it, i) { return h('div', { class: 'cslot' }, [it ? itemCell(it, { pressed: true, onclick: function () { sel[i] = null; render(); } }) : emptySlot()]); };
        cz = h('div', { class: 'combine' }, [
          h('div', { class: 'combine-row' }, [cs(a, 0), h('span', { class: 'plus', text: '+' }), cs(b, 1)]),
          h('button', { class: 'btn primary', type: 'button', text: 'Tie them together', disabled: !(a && b), onclick: function () { call('onCombine', a.id, b.id); } }),
          h('span', { class: 'hint', text: 'Pick two things from the chest or your backpack.' })
        ]);
      }
      var finds = d.roomFinds || [];
      var desk = h('section', null, [h('span', { class: 'eyebrow', text: 'On your desk' }),
        finds.length ? h('div', { class: 'desk' }, finds.map(function (it) {
          return h('div', { class: 'find' }, [icon(it.icon), h('span', { text: it.name }), h('button', { class: 'btn', type: 'button', text: 'Take', onclick: function () { call('onTake', it.id); } })]);
        })) : h('p', { class: 'note', text: 'Nothing new on the desk.' })]);
      var cols = h('div', { class: 'bed-grid' }, [
        h('div', { class: 'bed-col' }, [
          h('section', null, [h('h3', { text: 'The chest' }), grid(d.chest, 'backpack', 'to backpack')]),
          h('section', null, [h('h3', { text: 'My backpack' }), grid(d.backpack, 'chest', 'to chest')])
        ]),
        h('div', { class: 'bed-col' }, [desk, h('section', null, [h('h3', { text: 'Tie two things together' }), cz])])
      ]);
      var foot = h('div', { class: 'bed-foot' }, [
        h('div', null, [h('button', { class: 'btn', type: 'button', text: 'Step outside', onclick: function () { call('onLeaveHouse'); } })]),
        h('div', { class: 'buttons', style: 'margin:0' }, [
          !d.canSleep ? h('span', { class: 'hint', text: 'Not until after dinner' }) : null,
          h('button', { class: 'btn primary', type: 'button', text: 'Go to sleep', disabled: !d.canSleep, onclick: function () { call('onSleep'); } })
        ])
      ]);
      box.appendChild(cols); box.appendChild(foot);
      box.scrollTop = top;
    }
    render();
    mount('bedroom', d, h('div', null, [
      h('div', { class: 'panel-head' }, [h('div', null, [h('span', { class: 'eyebrow', text: d.clock || '' }), h('h2', { text: 'Your room' }), d.note ? h('p', { class: 'note', text: d.note }) : null])]),
      box]), true);
  };

  // ---------- Keyboard ----------
  function escape() {
    var now = Date.now();
    if (now - lastEsc < 60) return;
    lastEsc = now;
    if (el.panel.open) { dismiss(); return; }
    if (baseScreen === 'game' && !transitionActive) call('onRequestPanel', 'pause');
  }

  function onKey(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && t.tagName) {
      var tn = t.tagName;
      if (tn === 'TEXTAREA' || tn === 'SELECT' || (tn === 'INPUT' && !/^(checkbox|radio|button)$/.test(t.type))) return;
    }
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); escape(); return; }
    if (baseScreen !== 'game' || transitionActive) return;
    var type = current && el.panel.open ? current.type : null;
    var key = k.length === 1 ? k.toLowerCase() : k;
    if (key === 'f') { if (type === 'map') call('onToggleMark'); return; }
    if (type && !/^(backpack|map|notebook|pause)$/.test(type)) return;
    var want = key === 'b' || key === 'i' ? 'backpack' : key === 'm' ? 'map' : key === 'n' ? 'notebook' : null;
    if (!want) return;
    if (type === want) dismiss(); else call('onRequestPanel', want);
  }

  // ---------- init ----------
  function init(hs) {
    handlers = hs || {};
    el.canvas = $('gl'); el.hud = $('hud'); el.title = $('title'); el.titleMenu = $('title-menu'); el.titleCaption = $('title-caption');
    el.transition = $('transition'); el.summary = $('summary'); el.panel = $('panel'); el.panelBody = $('panel-body');
    el.minimap = $('minimap'); el.prompt = $('prompt'); el.subtitle = $('subtitle'); el.weapon = $('weapon'); el.pickup = $('pickup');
    el.toast = $('toast'); el.reveal = $('reveal');
    if (init.done) return;
    init.done = true;
    SOI.ui.el = el;
    $('btn-menu').addEventListener('click', function () { call('onRequestPanel', 'pause'); });
    $('btn-pack').addEventListener('click', function () { call('onRequestPanel', 'backpack'); });
    $('btn-map').addEventListener('click', function () { call('onRequestPanel', 'map'); });
    $('btn-minimap').addEventListener('click', function () { call('onRequestPanel', 'map'); });
    $('btn-notebook').addEventListener('click', function () { call('onRequestPanel', 'notebook'); });
    el.panel.addEventListener('cancel', function (e) { e.preventDefault(); escape(); });
    el.panel.addEventListener('close', function () { current = null; });
    document.addEventListener('keydown', onKey);
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { settings.reducedMotion = true; document.body.classList.add('reduced'); }
    setMode('day');
    refreshScreens();
  }

  // Elements exist as soon as the script runs (it is at the end of body), so debugging works before init.
  el.canvas = $('gl'); el.hud = $('hud'); el.title = $('title'); el.panel = $('panel'); el.minimap = $('minimap');

  SOI.ui = {
    init: init, showScreen: showScreen, setMode: setMode, setHud: setHud, drawMinimap: drawMinimap,
    openPanel: openPanel, closePanel: closePanel, isPanelOpen: isPanelOpen,
    toast: toast, pickup: pickup, reveal: reveal,
    applySettings: applySettings,   // extra: game.js may call this with the saved settings
    el: el
  };
})();
