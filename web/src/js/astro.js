// Astro star map (§5.6) — a fixed planetarium. A Three.js perspective camera
// sits at the origin and rotates in place (pan/tilt = orientation, zoom = FOV).
// Stars are a sprite point cloud on a surrounding sphere (see starfield.js) — so
// there's no pole cutoff. Photographs are pinned at their plate-solved RA/Dec and
// drawn as crisp DOM markers, projected through the same camera each frame.

import * as THREE from 'three';
import { loadManifest, worksIn, displaySrc } from './manifest.js';
import { buildDetail } from './detail.js';
import { initCategoryPage } from './grid.js';
import { StarField, loadRealCatalog } from './starfield.js';

const FOV_BASE = 75;   // vertical FOV in degrees at zoom 1 (wide)
const FOV_MIN = 11;
const FOV_MAX = 85;
const R = 800;         // sphere radius for stars + pinned photos
const PHOTO_ANG = 0.17; // default angular width of photo marker (radians) ≈ 9.7°
const DEC_LIMIT = 88;  // avoid the exact pole (camera up would be singular)
const CLUSTER_PX = 55; // screen-space distance threshold to merge markers (px)
const FAN_R = 90;      // fan-out radius when cluster is expanded (px)

init();

async function init() {
  const manifest = await loadManifest();
  // skyMapPin:false excludes a work from the sky view (landscape star trails etc.)
  const works = worksIn(manifest, 'Astro').filter(w => w.skyMapPin !== false);
  const sky = document.querySelector('[data-sky]');
  const layer = document.querySelector('[data-layer]');
  const canvas = document.querySelector('[data-starcanvas]');
  const countEl = document.querySelector('[data-skyview] [data-count]');
  if (countEl) countEl.textContent = `( ${works.length} )`;

  const lead = new URLSearchParams(window.location.search).get('lead');
  const leadIdx = lead ? works.findIndex((w) => w.slug === lead) : -1;
  const entry = leadIdx >= 0 ? works[leadIdx] : pickEntry(works);

  const cam = { ra: entry ? entry.raCenter ?? 180 : 180, dec: entry ? entry.decCenter ?? 0 : 0, zoom: 1 };
  let selectedIndex = null;

  // ── Three.js scene: camera at the origin, stars on the surrounding sphere ──
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0); // transparent → the CSS gradient shows through
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV_BASE, 1, 0.1, R * 4);
  const starField = new StarField(await loadRealCatalog(R), () => render());
  scene.add(starField.points);
  buildMilkyWay(scene, R);
  addCelestialGrid(scene, R);
  const ncpEl = buildNcpMarker(layer);

  // SVG overlay for fan-out connector lines
  const skyLines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  skyLines.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible';
  skyLines.setAttribute('aria-hidden', 'true');
  layer.appendChild(skyLines);

  const _tmpFwd = new THREE.Vector3();
  const _tmpP = new THREE.Vector3();

  function fovV() { return clamp(FOV_BASE / cam.zoom, FOV_MIN, FOV_MAX); }
  function dirFromRaDec(raDeg, decDeg) {
    const ra = raDeg * Math.PI / 180, dec = decDeg * Math.PI / 180, cd = Math.cos(dec);
    return new THREE.Vector3(cd * Math.cos(ra), Math.sin(dec), cd * Math.sin(ra));
  }

  function resize() {
    const w = sky.clientWidth, h = sky.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    starField.setResolution(w, h);
  }

  // photo markers — built once, repositioned every render
  const nodes = works.map((wk, i) => {
    const node = document.createElement('div');
    node.className = 'astro__img';
    node.dataset.idx = i;
    node.dataset.slug = wk.slug;
    const src = displaySrc(wk);
    if (src) {
      const img = document.createElement('img');
      img.src = src; img.alt = wk.title || 'astrophotograph';
      node.appendChild(img);
    } else {
      node.style.background = wk.accent || 'var(--elevated)';
    }
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', wk.title || 'Open astrophotograph');
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openImage(i); }
    });
    node.style.display = 'none';
    layer.appendChild(node);
    return { node, dir: dirFromRaDec(wk.raCenter ?? 180, wk.decCenter ?? 0), work: wk };
  });

  let expandedCluster = null; // key of the currently fanned cluster, or null
  const STACK_PX = 6; // vertical offset per layer in collapsed stack

  const _ncpDir = new THREE.Vector3(0, 1, 0);

  function positionPhotos() {
    const W = sky.clientWidth, H = sky.clientHeight;
    camera.getWorldDirection(_tmpFwd);

    // NCP marker
    if (_ncpDir.dot(_tmpFwd) > 0.05) {
      _tmpP.copy(_ncpDir).multiplyScalar(R).project(camera);
      if (_tmpP.z <= 1) {
        const x = (_tmpP.x * 0.5 + 0.5) * W, y = (-_tmpP.y * 0.5 + 0.5) * H;
        ncpEl.style.display = '';
        ncpEl.style.left = `${x}px`;
        ncpEl.style.top  = `${y}px`;
      } else { ncpEl.style.display = 'none'; }
    } else { ncpEl.style.display = 'none'; }

    const halfFov = camera.fov * Math.PI / 360;

    // Step 1: project all nodes, collect visible entries with screen coords + sizes
    const visible = [];
    nodes.forEach(({ node, dir, work }, i) => {
      node.style.display = 'none';
      if (dir.dot(_tmpFwd) <= 0.05) return;
      _tmpP.copy(dir).multiplyScalar(R).project(camera);
      if (_tmpP.z > 1) return;
      const x = (_tmpP.x * 0.5 + 0.5) * W;
      const y = (-_tmpP.y * 0.5 + 0.5) * H;
      if (x < -300 || x > W + 300 || y < -300 || y > H + 300) return;
      // Per-image FOV overrides the constant default angular size
      const ang = (work.fovDeg != null) ? work.fovDeg * Math.PI / 180 : PHOTO_ANG;
      const wPx = ang * (H / 2) / Math.tan(halfFov);
      const hPx = wPx / (work.nativeAspect ?? 1.4);
      visible.push({ node, work, i, x, y, wPx, hPx });
    });

    // Step 2: greedy single-linkage clustering by screen distance
    const assigned = new Uint8Array(visible.length);
    const groups = [];
    for (let a = 0; a < visible.length; a++) {
      if (assigned[a]) continue;
      assigned[a] = 1;
      const g = [a];
      for (let b = a + 1; b < visible.length; b++) {
        if (assigned[b]) continue;
        const dx = visible[a].x - visible[b].x;
        const dy = visible[a].y - visible[b].y;
        if (dx * dx + dy * dy < CLUSTER_PX * CLUSTER_PX) { g.push(b); assigned[b] = 1; }
      }
      groups.push(g.map(idx => visible[idx]));
    }

    // Clear fan-out connector lines
    while (skyLines.firstChild) skyLines.removeChild(skyLines.firstChild);

    // Step 3: render each group; track whether the expanded cluster is still visible
    let sawExpanded = false;

    for (const group of groups) {
      if (group.length === 1) {
        // Solo marker
        const { node, work, i, x, y, wPx, hPx } = group[0];
        node.dataset.clusterKey = '';
        node.style.display = '';
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        node.style.width = `${wPx}px`;
        node.style.height = `${hPx}px`;
        node.style.zIndex = '';
        node.style.setProperty('--pa', `${work.posAngle ?? 0}deg`);
        node.classList.toggle('selected', i === selectedIndex);
      } else {
        // Cluster group — centroid of true projected positions
        const key = group.map(g => g.work.slug).sort().join('\0');
        const cx = group.reduce((s, g) => s + g.x, 0) / group.length;
        const cy = group.reduce((s, g) => s + g.y, 0) / group.length;

        if (expandedCluster === key) {
          // Fanned out: each node placed at its radial position
          sawExpanded = true;
          const n = group.length;
          group.forEach(({ node, work, i, wPx, hPx }, fi) => {
            const angle = (2 * Math.PI * fi / n) - Math.PI / 2;
            const fx = cx + Math.cos(angle) * FAN_R;
            const fy = cy + Math.sin(angle) * FAN_R;
            node.dataset.clusterKey = key;
            node.style.display = '';
            node.style.left = `${fx}px`;
            node.style.top = `${fy}px`;
            node.style.width = `${wPx}px`;
            node.style.height = `${hPx}px`;
            node.style.zIndex = '';
            node.style.setProperty('--pa', `${work.posAngle ?? 0}deg`);
            node.classList.toggle('selected', i === selectedIndex);

            // Dashed line from centroid to fan node
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', cx); line.setAttribute('y1', cy);
            line.setAttribute('x2', fx); line.setAttribute('y2', fy);
            line.setAttribute('stroke', 'rgba(160,185,255,0.28)');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '3 4');
            skyLines.appendChild(line);
          });
        } else {
          // Collapsed: render images as a stacked deck at the centroid
          // Back cards peek below the front card via increasing Y offset + lower z-index
          group.forEach(({ node, work, i, wPx, hPx }, fi) => {
            const stackY = Math.min(fi, 3) * STACK_PX;
            node.dataset.clusterKey = key;
            node.style.display = '';
            node.style.left = `${cx}px`;
            node.style.top = `${cy + stackY}px`;
            node.style.width = `${wPx}px`;
            node.style.height = `${hPx}px`;
            node.style.zIndex = String(group.length - fi);
            node.style.setProperty('--pa', `${work.posAngle ?? 0}deg`);
            node.classList.remove('selected');
          });
        }
      }
    }

    // Collapse if the expanded cluster scrolled out of view
    if (!sawExpanded && expandedCluster !== null) expandedCluster = null;
  }

  function render() {
    camera.fov = fovV();
    camera.updateProjectionMatrix();
    const fwd = dirFromRaDec(cam.ra, clamp(cam.dec, -DEC_LIMIT, DEC_LIMIT));
    camera.lookAt(fwd.x, fwd.y, fwd.z);
    starField.setFov(camera.fov);
    starField.updateMotion(camera);
    renderer.render(scene, camera);
    positionPhotos();
  }

  // ── pan/tilt by drag; a no-move pointerup is a SELECT ──
  let dragging = false, moved = false, lastX = 0, lastY = 0, downX = 0, downY = 0;
  sky.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false;
    lastX = downX = e.clientX; lastY = downY = e.clientY;
    sky.classList.add('grabbing');
    sky.setPointerCapture(e.pointerId);
  });
  sky.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) moved = true;
    const dpp = fovV() / sky.clientHeight; // degrees per pixel ≈ vertical FOV / height
    cam.ra = wrap(cam.ra - (e.clientX - lastX) * dpp);
    cam.dec = clamp(cam.dec + (e.clientY - lastY) * dpp, -DEC_LIMIT, DEC_LIMIT);
    lastX = e.clientX; lastY = e.clientY;
    render();
  });
  sky.addEventListener('pointerup', (e) => {
    const wasClick = dragging && !moved;
    dragging = false; sky.classList.remove('grabbing');
    if (!wasClick) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const photoNode = el?.closest?.('.astro__img');

    if (photoNode && photoNode.dataset.idx != null) {
      const key = photoNode.dataset.clusterKey;
      if (key && expandedCluster !== key) {
        // Collapsed cluster — fan it out
        expandedCluster = key;
        render();
      } else {
        // Solo image or already-expanded cluster member — open the image
        openImage(+photoNode.dataset.idx);
      }
    } else {
      // Tap on open sky: collapse any fan
      if (expandedCluster !== null) { expandedCluster = null; render(); }
    }
  });
  sky.addEventListener('pointercancel', () => { dragging = false; sky.classList.remove('grabbing'); });
  sky.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.zoom = clamp(cam.zoom * (e.deltaY < 0 ? 1.12 : 0.89), 1, 8);
    starField.resetMotion();
    render();
  }, { passive: false });

  document.querySelector('[data-reset]')?.addEventListener('click', () => { cam.zoom = 1; render(); });

  // grid toggle (§5.6)
  const skyView = document.querySelector('[data-skyview]');
  const gridView = document.querySelector('[data-gridview]');
  async function setMode(mode) {
    skyView.hidden = mode !== 'sky';
    gridView.hidden = mode !== 'grid';
    window.scrollTo(0, 0);
    if (mode === 'grid') {
      if (!gridView.dataset.built) {
        gridView.dataset.built = '1';
        await initCategoryPage('Astro');
      } else {
        window.dispatchEvent(new Event('resize'));
      }
    } else {
      resize(); render();
    }
  }
  document.querySelector('[data-toggle]')?.addEventListener('click', () => setMode('grid'));
  document.querySelector('[data-to-sky]')?.addEventListener('click', () => setMode('sky'));

  function openImage(index) {
    expandedCluster = null;
    const wk = works[index];
    selectedIndex = index;
    render(); // immediate hairline on the selected marker
    slew(cam, wk.raCenter ?? cam.ra, wk.decCenter ?? cam.dec, render, () => {
      const host = document.querySelector('[data-astro-detail]');
      host.innerHTML = '';
      const band = buildDetail(wk, {
        onPrev: () => openImage((index - 1 + works.length) % works.length),
        onNext: () => openImage((index + 1) % works.length),
        onClose: () => { host.innerHTML = ''; selectedIndex = null; render(); },
      });
      host.appendChild(band);
    });
  }
  document.querySelector('[data-astro-detail]')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) { e.currentTarget.innerHTML = ''; selectedIndex = null; render(); }
  });

  const initMode = new URLSearchParams(window.location.search).get('view') === 'grid' ? 'grid' : 'sky';
  await setMode(initMode);
  window.addEventListener('resize', () => { resize(); render(); });
}

function buildMilkyWay(scene, R) {
  const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}milkyway.jpg`);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;

  // ShaderMaterial computes UV from object-space position in the fragment shader,
  // bypassing Three.js sphere UV attributes which stretch/compress near the poles.
  // u = atan(z, -x)/(2π) + 0.5 replicates Three.js SphereGeometry's UV convention
  // (u=0.5 at +X, increasing counterclockwise when viewed from +Y).
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap:     { value: tex },
      uOpacity: { value: 0.5 },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uOpacity;
      varying vec3 vPos;
      const float PI = 3.141592653589793;
      void main() {
        vec3 d = normalize(vPos);
        float u = mod(1.0 - atan(d.z, -d.x) / (2.0 * PI), 1.0);
        float v = 1.0 - acos(clamp(d.y, -1.0, 1.0)) / PI;
        vec4 col = texture2D(uMap, vec2(u, v));
        float luma = dot(col.rgb, vec3(0.299, 0.587, 0.114));
        col.rgb = mix(vec3(luma), col.rgb, 0.72);
        gl_FragColor = vec4(col.rgb, uOpacity);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const geo = new THREE.SphereGeometry(R * 0.98, 64, 32);
  const mesh = new THREE.Mesh(geo, mat);

  // Rotate sphere so the galactic coordinate system aligns with our equatorial scene.
  // +Y → north galactic pole (NGP), +X → galactic centre (GC), both in equatorial J2000.
  const deg = v => v * Math.PI / 180;
  const ny = new THREE.Vector3(
    Math.cos(deg(27.12825)) * Math.cos(deg(192.85948)),
    Math.sin(deg(27.12825)),
    Math.cos(deg(27.12825)) * Math.sin(deg(192.85948))
  );
  const nx = new THREE.Vector3(
    Math.cos(deg(-28.93617)) * Math.cos(deg(266.40499)),
    Math.sin(deg(-28.93617)),
    Math.cos(deg(-28.93617)) * Math.sin(deg(266.40499))
  );
  const nz = new THREE.Vector3().crossVectors(nx, ny);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(
    nx.x, ny.x, nz.x, 0,
    nx.y, ny.y, nz.y, 0,
    nx.z, ny.z, nz.z, 0,
    0,    0,    0,    1
  ));

  scene.add(mesh);
}

function addCelestialGrid(scene, R) {
  const SEG = 96;
  const matGrid = new THREE.LineBasicMaterial({ color: 0x2a3f7a, transparent: true, opacity: 0.22, depthWrite: false });
  const matEq   = new THREE.LineBasicMaterial({ color: 0x3a55aa, transparent: true, opacity: 0.35, depthWrite: false });

  // Dec parallels at ±30° and ±60°
  for (const dec of [-60, -30, 30, 60]) {
    const d = dec * Math.PI / 180, cd = Math.cos(d), sd = Math.sin(d);
    const pts = [];
    for (let i = 0; i <= SEG; i++) {
      const ra = (i / SEG) * Math.PI * 2;
      pts.push(cd * Math.cos(ra) * R, sd * R, cd * Math.sin(ra) * R);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.Line(geo, matGrid));
  }

  // Celestial equator — slightly brighter
  {
    const pts = [];
    for (let i = 0; i <= SEG; i++) {
      const ra = (i / SEG) * Math.PI * 2;
      pts.push(Math.cos(ra) * R, 0, Math.sin(ra) * R);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.Line(geo, matEq));
  }

  // RA meridians every 30° (12 half-circles pole-to-pole)
  for (let i = 0; i < 12; i++) {
    const ra = i * 30 * Math.PI / 180;
    const pts = [];
    for (let j = 0; j <= SEG; j++) {
      const dec = -90 + (j / SEG) * 180;
      const d = dec * Math.PI / 180, cd = Math.cos(d), sd = Math.sin(d);
      pts.push(cd * Math.cos(ra) * R, sd * R, cd * Math.sin(ra) * R);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.Line(geo, matGrid));
  }
}

function buildNcpMarker(layer) {
  const el = document.createElement('div');
  el.className = 'astro__ncp';
  el.textContent = 'N';
  el.setAttribute('aria-hidden', 'true');
  el.style.display = 'none';
  layer.appendChild(el);
  return el;
}

function slew(cam, ra, dec, render, done) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cam.ra = ra; cam.dec = dec; render(); done(); return;
  }
  const fromRa = cam.ra, fromDec = cam.dec;
  let dRa = wrap(ra - fromRa); if (dRa > 180) dRa -= 360;
  const start = performance.now(), dur = 600;
  function tick(t) {
    const k = Math.min(1, (t - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    cam.ra = wrap(fromRa + dRa * e);
    cam.dec = fromDec + (dec - fromDec) * e;
    render();
    if (k < 1) requestAnimationFrame(tick); else done();
  }
  requestAnimationFrame(tick);
}

function pickEntry(works) {
  if (!works.length) return null;
  const weighted = works.flatMap((w) => (w.centerpieceEligible ? [w, w, w] : [w]));
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function wrap(deg) { return ((deg % 360) + 360) % 360; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
