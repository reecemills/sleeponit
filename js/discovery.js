// Discovery: what the kid has actually seen. One bit per 2 m cell. Everything else (fog, map, dream gating) reads this mask.
window.SOI = window.SOI || {};

SOI.discovery = {
  create(grid, mask) {
    const cols = Math.round((grid.maxX - grid.minX) / grid.cell);
    const rows = Math.round((grid.maxZ - grid.minZ) / grid.cell);
    const d = {
      grid, cols, rows,
      mask: mask && mask.length === cols * rows ? mask : new Uint8Array(cols * rows),
      _dist: null, _distDirty: true, _count: -1,

      cellOf(x, z) {
        const ix = Math.floor((x - grid.minX) / grid.cell);
        const iz = Math.floor((z - grid.minZ) / grid.cell);
        if (ix < 0 || iz < 0 || ix >= cols || iz >= rows) return -1;
        return iz * cols + ix;
      },
      cellCenter(index) {
        const ix = index % cols, iz = Math.floor(index / cols);
        return { x: grid.minX + (ix + 0.5) * grid.cell, z: grid.minZ + (iz + 0.5) * grid.cell };
      },
      isDiscovered(x, z) {
        const c = this.cellOf(x, z);
        return c >= 0 && this.mask[c] === 1;
      },
      // camPos: {x,z}; forward: {x,z} unit vector the camera looks along; opts: { sightRadius, closeRing, coneDot }
      reveal(camPos, forward, opts) {
        const R = opts.sightRadius, ring = opts.closeRing, coneDot = opts.coneDot;
        const r = Math.ceil(R / grid.cell) + 1;
        const cx = Math.floor((camPos.x - grid.minX) / grid.cell);
        const cz = Math.floor((camPos.z - grid.minZ) / grid.cell);
        let added = 0;
        for (let iz = cz - r; iz <= cz + r; iz++) {
          if (iz < 0 || iz >= rows) continue;
          for (let ix = cx - r; ix <= cx + r; ix++) {
            if (ix < 0 || ix >= cols) continue;
            const i = iz * cols + ix;
            if (this.mask[i]) continue;
            const wx = grid.minX + (ix + 0.5) * grid.cell - camPos.x;
            const wz = grid.minZ + (iz + 0.5) * grid.cell - camPos.z;
            const dist = Math.hypot(wx, wz);
            if (dist > R) continue;
            let seen = dist <= ring;
            if (!seen) {
              const dot = (wx * forward.x + wz * forward.z) / (dist || 1);
              seen = dot > coneDot;
            }
            if (seen) { this.mask[i] = 1; added++; }
          }
        }
        if (added) { this._distDirty = true; this._count = -1; }
        return added;
      },
      count() {
        if (this._count < 0) { let n = 0; for (let i = 0; i < this.mask.length; i++) n += this.mask[i]; this._count = n; }
        return this._count;
      },
      percent() { return Math.round(100 * this.count() / this.mask.length); },
      // Distance in meters from each cell center to the nearest discovered cell center (0 inside discovered cells).
      distanceField() {
        if (this._dist && !this._distDirty) return this._dist;
        const n = cols * rows;
        const out = new Float32Array(n);
        const disc = [];
        for (let i = 0; i < n; i++) if (this.mask[i]) disc.push(i);
        if (disc.length === 0) { out.fill(1e3); this._dist = out; this._distDirty = false; return out; }
        const dx = new Int16Array(disc.length), dz = new Int16Array(disc.length);
        for (let k = 0; k < disc.length; k++) { dx[k] = disc[k] % cols; dz[k] = Math.floor(disc[k] / cols); }
        for (let i = 0; i < n; i++) {
          if (this.mask[i]) { out[i] = 0; continue; }
          const ix = i % cols, iz = Math.floor(i / cols);
          let best = 1e9;
          for (let k = 0; k < disc.length; k++) {
            const ddx = ix - dx[k], ddz = iz - dz[k];
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 < best) best = d2;
          }
          out[i] = Math.sqrt(best) * grid.cell;
        }
        this._dist = out; this._distDirty = false;
        return out;
      },
      serialize() {
        const bytes = new Uint8Array(Math.ceil(this.mask.length / 8));
        for (let i = 0; i < this.mask.length; i++) if (this.mask[i]) bytes[i >> 3] |= 1 << (i & 7);
        let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s);
      },
    };
    return d;
  },
  deserialize(str, grid) {
    const d = SOI.discovery.create(grid);
    try {
      const s = atob(str);
      for (let i = 0; i < d.mask.length; i++) {
        const b = s.charCodeAt(i >> 3);
        if (b & (1 << (i & 7))) d.mask[i] = 1;
      }
    } catch (e) { /* corrupt save: start undiscovered */ }
    d._distDirty = true;
    return d;
  },
};
