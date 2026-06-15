// Trimmed port of Skyspace's StarField — the exact star-sprite shaders and the
// tuned uniform values, but ONLY the point cloud (no rings/lines/selection/pick,
// no distance simulation). Stars sit on a sphere around the origin; a perspective
// camera at the centre rotates to look around — so there is no pole cutoff.

import * as THREE from 'three';

const VERT = `
attribute float aMagnitude;
attribute float aDistance;
attribute float aVisible;

uniform float uMinMag;
uniform float uMaxDist;
uniform float uSizeScale;
uniform float uSizeMin;
uniform float uSizeMax;
uniform float uTightBaseSize;
uniform float uWideBaseSize;
uniform float uFov;
uniform vec2  uViewport;
uniform mat4  uPrevViewProj;
uniform float uMotionBlur;

varying vec3  vColor;
varying float vAlpha;
varying float vBodyBlend;
varying float vLuminance;
varying vec2  vStreakUV;
varying float vCoreRatio;
varying float vStreakMag;

uniform float uBodyMagMin;
uniform float uBodyMagMax;

void main() {
  vColor = color;

  float magOk  = step(aMagnitude, uMinMag);
  float distOk = step(aDistance, uMaxDist);

  float flux = exp(-0.92103 * aMagnitude);
  vLuminance = clamp(pow(flux * 4.0, 0.45), 0.0, 1.0);

  vBodyBlend = smoothstep(uBodyMagMin, uBodyMagMax, aMagnitude);

  float visWeight = clamp((uMinMag - aMagnitude) * 1.5 + 1.0, 0.0, 1.0);
  vAlpha = magOk * distOk * aVisible * visWeight;

  float baseSize  = mix(uTightBaseSize, uWideBaseSize, vLuminance);
  float rawSize   = clamp(baseSize, uSizeMin, uSizeMax);
  float fovFactor = 15.0 / clamp(uFov, 5.0, 15.0);

  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPos;

  float physSize = max(rawSize * fovFactor * uSizeScale, 1.8);

  vec4  prevClip  = uPrevViewProj * vec4(position, 1.0);
  vec2  curNDC    = gl_Position.xy / max(gl_Position.w,  1e-4);
  vec2  prevNDC   = prevClip.xy    / max(prevClip.w,     1e-4);
  vec2  velPx     = (curNDC - prevNDC) * 0.5 * uViewport * uMotionBlur;
  float streakLen = length(velPx);
  float maxStreak = 48.0;
  if (streakLen > maxStreak) { velPx *= maxStreak / streakLen; streakLen = maxStreak; }

  float enlarged = physSize + streakLen;
  gl_PointSize = enlarged;
  vCoreRatio   = enlarged / max(physSize, 0.001);
  vStreakUV    = vec2(velPx.x, -velPx.y) / max(physSize, 1.0);
  vStreakMag   = streakLen;

  vec2 marginNDC = vec2(gl_PointSize * 1.5) / uViewport;
  vec2 edge      = vec2(1.0) - smoothstep(vec2(1.0) - marginNDC, vec2(1.0), abs(curNDC));
  vAlpha        *= edge.x * edge.y;
}
`;

const FRAG = `
varying vec3  vColor;
varying float vAlpha;
varying float vBodyBlend;
varying float vLuminance;
varying vec2  vStreakUV;
varying float vCoreRatio;
varying float vStreakMag;

uniform float uExposure;
uniform sampler2D uStarTex;
uniform sampler2D uStarTexWide;
uniform float uTexGamma;
uniform float uBloomScale;
uniform float uBloomFadeBase;
uniform float uBloomLumMin;
uniform float uBloomLumMax;
uniform float uBloomGamma;
uniform float uTightCrop;

void main() {
  if (vAlpha < 0.01) discard;

  vec2  coreUV  = (gl_PointCoord - 0.5) * vCoreRatio + 0.5;
  vec2  tightUV = (coreUV - 0.5) * uTightCrop + 0.5;
  float jit     = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  bool  moving  = vStreakMag >= 0.75;

  float tight;
  if (!moving) {
    tight = pow(texture2D(uStarTex, tightUV).r, uTexGamma);
  } else {
    float acc = 0.0;
    for (int i = 0; i < 11; i++) {
      float t   = (float(i) + jit) / 11.0 - 0.5;
      vec2  suv = tightUV - vStreakUV * t;
      vec2  inb = step(vec2(0.0), suv) * step(suv, vec2(1.0));
      acc += pow(texture2D(uStarTex, suv).r, uTexGamma) * inb.x * inb.y;
    }
    tight = acc / 11.0;
  }

  float wide;
  if (!moving) {
    wide = pow(texture2D(uStarTexWide, coreUV).r, uTexGamma);
  } else {
    float acc = 0.0;
    for (int i = 0; i < 11; i++) {
      float t   = (float(i) + jit) / 11.0 - 0.5;
      vec2  suv = coreUV - vStreakUV * t;
      vec2  inb = step(vec2(0.0), suv) * step(suv, vec2(1.0));
      acc += pow(texture2D(uStarTexWide, suv).r, uTexGamma) * inb.x * inb.y;
    }
    wide = acc / 11.0;
  }

  float tightW = tight * vBodyBlend;
  float wideW  = wide  * (1.0 - vBodyBlend);
  float body   = 1.0 - (1.0 - tightW) * (1.0 - wideW);

  float bloomAmt  = smoothstep(uBloomLumMin, uBloomLumMax, vLuminance) * uBloomFadeBase;
  vec2  bloomUV   = (coreUV - 0.5) / max(uBloomScale, 0.001) + 0.5;
  float bloomTex  = pow(texture2D(uStarTexWide, bloomUV).r, uBloomGamma);
  float bloomDist = length(gl_PointCoord - vec2(0.5));
  float bloom     = bloomTex * bloomAmt * (1.0 - smoothstep(0.48, 0.5, bloomDist));

  float luma = clamp(1.0 - (1.0 - body) * (1.0 - bloom), 0.0, 1.0);
  if (luma < 0.002) discard;

  float core = pow(luma, 1.4);
  vec3 dodged  = vColor / max(1.0 - core * 0.75, 0.04);
  float maxChan = max(dodged.r, max(dodged.g, dodged.b));
  vec3 col = maxChan > 1.0 ? dodged / maxChan : dodged;

  float mean = (col.r + col.g + col.b) / 3.0;
  col = mean + (col - mean) * mix(0.5, 1.4, vLuminance);
  col = max(col, vec3(0.0));

  gl_FragColor = vec4(col, luma * vAlpha * uExposure);
}
`;

export class StarField {
  constructor(catalog) {
    this.catalog = catalog;
    this._visible = new Float32Array(catalog.starCount).fill(1);
    this._textures = this._loadStarTextures();
    this._build();
  }

  _makeProceduralTex(sigma) {
    const S = 64, c = (S - 1) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const r = Math.sqrt((x - c) ** 2 + (y - c) ** 2) / (S * 0.5);
        const a = Math.exp(-r * r * sigma);
        const i = (y * S + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  _loadStarTextures() {
    const tight = this._makeProceduralTex(7.0); // fallback until PNGs load
    const wide = this._makeProceduralTex(2.5);
    const loader = new THREE.TextureLoader();
    const base = import.meta.env.BASE_URL;
    const apply = (uniform) => (tex) => {
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      if (this.material) this.material.uniforms[uniform].value = tex;
    };
    loader.load(`${base}star_2d_tight.png`, apply('uStarTex'));
    loader.load(`${base}star_2d_wide.png`, apply('uStarTexWide'));
    return { tight, wide };
  }

  _build() {
    const { positions, colors, magnitudes, distances } = this.catalog;
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('aMagnitude', new THREE.BufferAttribute(magnitudes, 1));
    this.geometry.setAttribute('aDistance', new THREE.BufferAttribute(distances, 1));
    this.geometry.setAttribute('aVisible', new THREE.BufferAttribute(this._visible, 1));

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        // Skyspace's tuned values
        uMinMag:        { value: 7.0 },
        uMaxDist:       { value: 1e9 },        // distances disabled (all 0)
        uSizeScale:     { value: 1.0 },
        uSizeMin:       { value: 2.6 },
        uSizeMax:       { value: 110.0 },
        uTightBaseSize: { value: 2.0 },
        uWideBaseSize:  { value: 21.0 },
        uBodyMagMin:    { value: 2.0 },
        uBodyMagMax:    { value: 7.1 },
        uTexGamma:      { value: 2.2 },
        uExposure:      { value: 0.4 },
        uFov:           { value: 70.0 },
        uViewport:      { value: new THREE.Vector2(window.innerWidth, window.innerHeight).multiplyScalar(dpr) },
        uPrevViewProj:  { value: new THREE.Matrix4() },
        uMotionBlur:    { value: 0.6 },
        uStarTex:       { value: this._textures.tight },
        uStarTexWide:   { value: this._textures.wide },
        uBloomScale:    { value: 6.0 },
        uBloomFadeBase: { value: 0.05 },
        uBloomLumMin:   { value: 0.0 },
        uBloomLumMax:   { value: 0.35 },
        uBloomGamma:    { value: 12.0 },
        uTightCrop:     { value: 0.40 },
      },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  setFov(fov) { this.material.uniforms.uFov.value = fov; }
  setExposure(v) { this.material.uniforms.uExposure.value = v; }
  setResolution(w, h) {
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    this.material.uniforms.uViewport.value.set(w * pr, h * pr);
  }

  // per-frame camera motion for the motion-blur shader
  updateMotion(camera) {
    if (!this._cur) { this._cur = new THREE.Matrix4(); this._tmp = new THREE.Matrix4(); }
    camera.updateMatrixWorld();
    this._tmp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (this._motionCam !== camera) { this._motionCam = camera; this._cur.copy(this._tmp); }
    this.material.uniforms.uPrevViewProj.value.copy(this._cur);
    this._cur.copy(this._tmp);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this._textures.tight.dispose();
    this._textures.wide.dispose();
  }
}

// Synthetic catalog on a sphere (radius R). No real distances — every star sits
// on the shell, so the camera at the centre always sees a full sky.
export function makeSyntheticCatalog(n, radius = 800) {
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const magnitudes = new Float32Array(n);
  const distances = new Float32Array(n); // all 0

  let seed = 987654321;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  for (let i = 0; i < n; i++) {
    // uniform direction on the sphere
    const u = rnd() * 2 - 1;
    const theta = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    positions[i * 3] = r * Math.cos(theta) * radius;
    positions[i * 3 + 1] = u * radius;
    positions[i * 3 + 2] = r * Math.sin(theta) * radius;

    // magnitude skewed toward dim (few bright stars)
    magnitudes[i] = -1 + Math.pow(rnd(), 0.55) * 8.2;

    // spectral-ish colour, mostly blue-white/white with a few warm
    const t = rnd();
    let c;
    if (t < 0.55) c = [0.78, 0.85, 1.0];
    else if (t < 0.82) c = [0.96, 0.97, 1.0];
    else if (t < 0.94) c = [1.0, 0.94, 0.8];
    else c = [1.0, 0.83, 0.68];
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
  }

  return { starCount: n, positions, colors, magnitudes, distances };
}
