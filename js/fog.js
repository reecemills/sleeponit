// Memory fog (implementation plan 3.4). Driven by distance to the nearest discovered cell, never by hand-placed volumes.
// Three bands: haze (0..A), thick (A..B), solid (beyond B). Past depth C the discovered world fades too and the minimap goes black.
window.SOI = window.SOI || {};

SOI.fog = {
  apply(handle, discovery, tunables) {
    const grid = discovery.grid;
    const field = discovery.distanceField();
    const tex = new THREE.DataTexture(field, discovery.cols, discovery.rows, THREE.RedFormat, THREE.FloatType);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;

    const uniforms = {
      distTex: { value: tex },
      bounds: { value: new THREE.Vector4(grid.minX, grid.minZ, grid.maxX - grid.minX, grid.maxZ - grid.minZ) },
      haze: { value: tunables.fogHaze }, thick: { value: tunables.fogThick }, bonus: { value: 1.0 },
      fade: { value: 0.0 },
      moonDir: { value: new THREE.Vector3(0.6, 0.5, -0.2).normalize() },
      moonColor: { value: new THREE.Color(0x9a9ff0) },
      skyColor: { value: new THREE.Color(0x6a64a8) }, groundColor: { value: new THREE.Color(0x1a1630) },
      fogColor: { value: new THREE.Color(0x2b2946) }, fogDensity: { value: 0.028 },
      playerPos: { value: new THREE.Vector3() },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexColors: true,
      vertexShader: `
        varying vec3 vWorld; varying vec3 vColor; varying vec3 vNormalW; varying float vDepthCam;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz; vColor = color; vNormalW = normalize(mat3(modelMatrix) * normal);
          vec4 mv = viewMatrix * w; vDepthCam = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D distTex; uniform vec4 bounds; uniform float haze, thick, bonus, fade;
        uniform vec3 moonDir, moonColor, skyColor, groundColor, fogColor; uniform float fogDensity; uniform vec3 playerPos;
        varying vec3 vWorld; varying vec3 vColor; varying vec3 vNormalW; varying float vDepthCam;
        void main() {
          vec2 uv = vec2((vWorld.x - bounds.x) / bounds.z, (vWorld.z - bounds.y) / bounds.w);
          float d = texture2D(distTex, uv).r;
          float A = haze * bonus, B = thick * bonus;
          float vis = d <= 0.001 ? 1.0 : (d < A ? mix(1.0, 0.45, d / A) : (d < B ? mix(0.45, 0.0, (d - A) / (B - A)) : 0.0));
          // simple hemisphere + moon lambert
          float up = vNormalW.y * 0.5 + 0.5;
          vec3 hemi = mix(groundColor, skyColor, up);
          float ndl = max(dot(vNormalW, moonDir), 0.0);
          vec3 lit = vColor * (hemi * 2.0 + moonColor * ndl * 1.4) + vec3(0.02, 0.015, 0.04);
          // flat ground inside the fog: no props render there, and the ground reads as a bare, near-black plane
          vec3 bare = vec3(0.14, 0.13, 0.23);
          vec3 col = mix(bare, lit, vis);
          // distance fog toward the camera
          float f = 1.0 - exp(-fogDensity * fogDensity * vDepthCam * vDepthCam);
          col = mix(col, fogColor, clamp(f, 0.0, 1.0));
          col = mix(col, fogColor, fade * 0.8);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });

    const oldMat = handle.ground.material;
    handle.ground.material = mat;

    // Nothing undiscovered renders at all. Props are gated by their footprint cell.
    const propState = [];
    for (const p of handle.props) {
      const c = discovery.cellOf(p.x, p.z);
      const vis = c >= 0 && discovery.mask[c] === 1;
      propState.push({ mesh: p.mesh, was: p.mesh.visible });
      p.mesh.visible = vis;
    }

    const f = {
      material: mat, texture: tex, bonus: 1.0,
      sample(x, z) {
        const c = discovery.cellOf(x, z);
        if (c < 0) return 1e3;
        return field[c];
      },
      update(playerPos, sceneFog) {
        const depth = this.sample(playerPos.x, playerPos.z);
        const C = tunables.fogDeep * this.bonus;
        // the discovered world fades once you are past 60% of C, fully gone at C
        const fade = Math.min(1, Math.max(0, (depth - C * 0.6) / (C * 0.4)));
        uniforms.fade.value = fade;
        uniforms.playerPos.value.set(playerPos.x, playerPos.y, playerPos.z);
        // thicker scene fog the deeper you are (lose vision slowly)
        const B = tunables.fogThick * this.bonus;
        const dens = 0.028 + Math.min(depth / B, 1.0) * 0.07;
        uniforms.fogDensity.value = dens;
        if (sceneFog) sceneFog.density = dens;
        return { depth, fade, lost: depth > C };
      },
      setBonus(mult) { this.bonus = mult; uniforms.bonus.value = mult; },
      dispose() {
        handle.ground.material = oldMat;
        mat.dispose(); tex.dispose();
        for (const s of propState) s.mesh.visible = s.was;
      },
    };
    return f;
  },
};
