import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG as C } from './config.js';

const W = C.stage.w, H = C.stage.h, P = C.player, S = C.score;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- Escena 3D ortográfica (vista cenital) ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, 2000);
cam.position.z = 500;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899bb, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(100, 300, 600); scene.add(sun);

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function loadTex(url, apply) {
  new THREE.TextureLoader().load(url, t => { t.colorSpace = THREE.SRGBColorSpace; apply(t); },
    undefined, () => console.warn('Sin imagen, uso placeholder:', url));
}

/* ---------- Fondo infinito: textura seamless + offset.y ---------- */
function drawSky(g, s) {
  g.fillStyle = '#9cc8ec'; g.fillRect(0, 0, s, s); g.fillStyle = '#ffffffaa';
  [[90, 80, 60], [380, 200, 80], [200, 400, 70], [460, 470, 50]].forEach(([x, y, r]) => {
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { g.beginPath(); g.arc(x + ox, y + oy, r, 0, 7); g.fill(); }
  });
}
function setupBg(t) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(W / 512, H / 512); return t;
}
const bg = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: setupBg(canvasTex(512, drawSky)) }));
bg.position.z = -50; scene.add(bg);

let currentBg = null, floorMode = false;
const bgCache = {}, fallbackBg = bg.material.map;   // nubes provisionales

/* Fondo en perspectiva (suelo) con su propia cámara */
const bgCam = new THREE.PerspectiveCamera(60, W / H, 1, 6000);
bgCam.position.set(0, 300, 0);
bgCam.rotation.x = -THREE.MathUtils.degToRad(40);   // inclinación: más grados = más "desde arriba"
const bgScene = new THREE.Scene();
const FLOOR_W = 6000, FLOOR_L = 12000, TILE = 300;   // TILE = tamaño de cada repetición de la textura
function setupFloor(t) {
  t = t.clone(); t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(FLOOR_W / TILE, FLOOR_L / TILE);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();   // evita que se vea borroso a lo lejos
  return t;
}
const fallbackFloor = setupFloor(fallbackBg);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_W, FLOOR_L), new THREE.MeshBasicMaterial({ map: fallbackFloor }));
floor.rotation.x = -Math.PI / 2; floor.position.z = -FLOOR_L / 2 + 1000; bgScene.add(floor);

function showBg(D) {   // D = la dificultad elegida
  currentBg = D; floorMode = !!D.perspective;
  const c = bgCache[D.background];
  bg.material.map = c ? c.flat : fallbackBg; bg.material.needsUpdate = true;
  floor.material.map = c ? c.floor : fallbackFloor; floor.material.needsUpdate = true;
  bg.visible = !floorMode;
  if (!c) loadTex(D.background, t => {
    bgCache[D.background] = { flat: setupBg(t), floor: setupFloor(t) };
    if (currentBg === D) showBg(D);
  });
}

/* ---------- Capas de sprites 2D (InstancedMesh: miles de balas baratas) ---------- */
function makeLayer(max, size, z, fallback, url) {
  const mat = new THREE.MeshBasicMaterial({ map: canvasTex(64, fallback), transparent: true, alphaTest: 0.02, depthWrite: false });
  const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(size, size), mat, max);
  m.frustumCulled = false; m.count = 0; m.position.z = z; scene.add(m);
  loadTex(url, t => { mat.map = t; mat.needsUpdate = true; });
  return m;
}
const bulletLayer = makeLayer(C.maxBullets, C.bulletSize, 100, (g) => {   // helado provisional (punta abajo)
  g.fillStyle = '#d9a35c'; g.beginPath(); g.moveTo(16, 34); g.lineTo(48, 34); g.lineTo(32, 62); g.fill();
  g.fillStyle = '#f4a6c8'; g.beginPath(); g.arc(32, 26, 17, 0, 7); g.fill();
}, C.images.bullet);
const shotLayer = makeLayer(300, 28, 10, (g) => {
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, '#fff'); r.addColorStop(1, '#ffd84000');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
}, C.images.shot);
const dummy = new THREE.Object3D();
function drawLayer(mesh, arr) {
  const n = Math.min(arr.length, mesh.instanceMatrix.count);
  for (let i = 0; i < n; i++) {
    dummy.position.set(arr[i].x, arr[i].y, 0); dummy.rotation.z = arr[i].rot || 0;
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
}

/* ---------- Modelos .glb (con muñeco provisional si no cargan) ---------- */
const mixers = [], gltfLoader = new GLTFLoader();
function loadModel(cfg, color) {
  const holder = new THREE.Group(), h = cfg.height;
  const mat = new THREE.MeshStandardMaterial({ color });
  const ph = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(h * 0.3, h * 0.6, 12), mat); body.position.y = -h * 0.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.2, 16, 12), mat); head.position.y = h * 0.25;
  ph.add(body, head); holder.add(ph);
  gltfLoader.load(cfg.url, gltf => {
    const m = gltf.scene, box = new THREE.Box3().setFromObject(m);
    m.scale.setScalar(h / box.getSize(new THREE.Vector3()).y);
    box.setFromObject(m); m.position.sub(box.getCenter(new THREE.Vector3()));
    holder.remove(ph); holder.add(m);
    if (gltf.animations.length) { const mx = new THREE.AnimationMixer(m); mx.clipAction(gltf.animations[0]).play(); mixers.push(mx); }
  }, undefined, () => console.warn('No se pudo cargar el modelo:', cfg.url));
  scene.add(holder); return holder;
}
const playerObj = loadModel(C.models.player, 0xc0405e);
const bossObj = loadModel(C.models.boss, 0x6a3fa0);
playerObj.rotation.order = bossObj.rotation.order = 'ZYX';   // evita que la inclinación se invierta al girar
const hitDot = new THREE.Mesh(new THREE.CircleGeometry(P.hitRadius * 1.5, 16), new THREE.MeshBasicMaterial({ color: 0xff3050 }));
hitDot.position.z = 150; hitDot.visible = false; scene.add(hitDot);

/* ---------- HUD ---------- */
function icon(src, emoji) {
  const i = new Image(); i.src = src;
  i.onerror = () => { const s = document.createElement('span'); s.className = 'emoji'; s.textContent = emoji; i.replaceWith(s); };
  return i;
}
function fillIcons(el, n, src, emoji) { el.replaceChildren(...Array.from({ length: Math.max(0, n) }, () => icon(src, emoji))); }
const ICE_EMOJI = ['🍦', '🍨', '🍧', '💧'];
$('vL').replaceChildren(icon(C.images.bossIconAngry, '🧙‍♀️')); $('vR').replaceChildren(icon(C.images.bossIcon, '🧙‍♀️'));
const hudCache = {};
function hud() {
  const g = G, ratio = Math.max(0, g.hp / g.D.bossHP), left = Math.max(0, g.D.time - g.time);
  $('score').textContent = String(g.score).padStart(7, '0');
  if (hudCache.l !== g.lives) { hudCache.l = g.lives; fillIcons($('lives'), g.lives, C.images.life, '👧'); }
  if (hudCache.b !== g.bombs) { hudCache.b = g.bombs; fillIcons($('bombs'), g.bombs, C.images.bomb, '🪄'); }
  const frac = g.time / g.D.time;
  const stage = C.iceStages.filter(t => frac >= t).length - 1;
  if (hudCache.s !== stage) { hudCache.s = stage; $('ice').replaceChildren(icon(C.images.ice[stage], ICE_EMOJI[stage])); }
  const m = Math.floor(left / 60), s = String(Math.floor(left % 60)).padStart(2, '0');
  $('meltTxt').textContent = `HELADO: ${Math.round(left / g.D.time * 100)}%  ${m}:${s}`;
  $('meltFill').style.width = left / g.D.time * 100 + '%';
  $('bossFill').style.width = ratio * 100 + '%';
  $('courage').style.width = (1 - ratio) * 100 + '%';
  $('phase').textContent = 'FASE ' + g.phase;
  $('noise').textContent = ['Tranquilo', 'Inquieto', '¡Frenético!'][g.phase - 1];
}

/* ---------- Música ---------- */
const music = new Audio(); music.loop = true; music.volume = C.audio.volume;
let currentTrack = '';
function playMusic(url) {
  if (currentTrack === url) return;
  currentTrack = url; music.src = url; music.play().catch(() => {});
}
// Los navegadores bloquean el audio hasta que el jugador hace clic o presiona una tecla
const unlockAudio = () => { if (music.paused && currentTrack) music.play().catch(() => {}); };
addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);

/* ---------- Efectos de sonido ---------- */
const sfxLast = {}, sfxBase = {};
function sfx(name, minGap = 0.05) {   // minGap = segundos mínimos entre dos reproducciones
  const url = C.sfx[name]; if (!url) return;
  const now = performance.now() / 1000;
  if (now - (sfxLast[name] || 0) < minGap) return;
  sfxLast[name] = now;
  const a = (sfxBase[name] ||= new Audio(url)).cloneNode();   // clon: permite que se solapen
  a.volume = C.sfx.volume; a.play().catch(() => {});
}

/* ---------- Estado de la partida ---------- */
let G = null, paused = false;
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (G && G.state === 'play') { if (e.code === 'KeyX') bomb(); if (e.code === 'KeyP') paused = !paused; }
});
addEventListener('keyup', e => keys[e.code] = false);

function start(key) {
  const D = C.difficulties[key];
  G = { D, state: 'play', t: 0, time: 0, score: 0, lives: D.lives, bombs: D.bombs, px: 0, py: -420, invul: 1.5,
        shotT: 0, bx: 0, by: 380, hp: D.bossHP, phase: 1, pause: 1.5, pat: {}, spiral: 0,
        flash: 0, bullets: [], shots: [], tilt: 0, focus: false };
  Object.keys(hudCache).forEach(k => delete hudCache[k]);
  showBg(D);
  playMusic(D.music);
  paused = false; $('overlay').classList.add('hidden');
}
function menu(title, text, showLogo) {
  const o = $('overlay'); o.classList.remove('hidden');
  o.replaceChildren();
  playMusic(C.audio.menu);
  const h = document.createElement('h1'); h.textContent = title;
  if (showLogo) {
    const img = new Image(); img.src = C.images.logo; img.className = 'logo'; img.alt = title;
    img.onerror = () => img.replaceWith(h);   // si falta el PNG, muestra el título en texto
    o.append(img);
  } else o.append(h);
  const p = document.createElement('p'); p.textContent = text; o.append(p);
  Object.entries(C.difficulties).forEach(([k, d]) => {
    const b = document.createElement('button'); b.textContent = d.name; b.onclick = () => start(k); o.append(b);
  });
}
function end(win, msg) {
  if (win) G.score += S.win + Math.floor(Math.max(0, G.D.time - G.time)) * S.perSecondLeft;
  G.state = 'end'; hud();
  menu(win ? '¡Ganaste el helado!' : 'Fin del juego', `${msg}  Puntaje: ${G.score}. Elige dificultad para reintentar.`);
}
function bomb() {
  if (G.bombs <= 0 || G.flash > 0) return;
  G.bombs--; G.flash = P.bombFlashFrames; G.bullets.length = 0;
  G.invul = Math.max(G.invul, P.bombInvul); G.score += S.bomb;
  sfx('bomb', 0);
}

/* ---------- Disparo de patrones ---------- */
function fire(a, speed, x = G.bx, y = G.by) {
  if (G.bullets.length >= C.maxBullets) return;
  const s = speed * G.D.bulletSpeed;
  G.bullets.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: a + Math.PI / 2, g: 0 });
}
function ready(name, iv, dt) {
  const t = (G.pat[name] ?? 0) - dt;
  if (t > 0) { G.pat[name] = t; return false; }
  G.pat[name] = iv; sfx('enemy', 0.15); return true;
}
const PATTERNS = {
  ring(dt) {   // anillo expansivo
    if (!ready('ring', 1.3, dt)) return;
    const n = Math.round(22 * G.D.density), off = Math.random() * 6.28;
    for (let i = 0; i < n; i++) fire(off + i / n * 6.2832, 150);
  },
  aimed(dt) {  // abanico dirigido a Stella
    if (!ready('aimed', 0.8, dt)) return;
    const n = Math.round(5 * G.D.density) | 1, base = Math.atan2(G.py - G.by, G.px - G.bx);
    for (let i = 0; i < n; i++) fire(base + (i - (n - 1) / 2) * 0.16, 230);
  },
  spiral(dt) { // espiral de varios brazos
    if (!ready('spiral', 0.07, dt)) return;
    G.spiral += 0.32;
    for (let k = 0; k < G.D.arms; k++) fire(G.spiral + k * 6.2832 / G.D.arms, 180);
  },
  rain(dt) {   // lluvia desde arriba
    if (!ready('rain', 0.12 / G.D.density, dt)) return;
    fire(-Math.PI / 2, 200 + Math.random() * 80, (Math.random() - 0.5) * (W - 40), H / 2 + 10);
  },
};

/* ---------- Actualización por fotograma ---------- */
function update(dt) {
  const g = G, D = g.D; g.time += dt; g.t += dt;
  // Stella
  const dx = ((keys.ArrowRight || keys.KeyD) ? 1 : 0) - ((keys.ArrowLeft || keys.KeyA) ? 1 : 0);
  const dy = ((keys.ArrowUp || keys.KeyW) ? 1 : 0) - ((keys.ArrowDown || keys.KeyS) ? 1 : 0);
  const k = (dx && dy) ? 0.7071 : 1;
  g.focus = !!(keys.ShiftLeft || keys.ShiftRight);
  const sp = g.focus ? P.focusSpeed : P.speed;
  g.px = clamp(g.px + dx * k * sp * dt, -W / 2 + 20, W / 2 - 20);
  g.py = clamp(g.py + dy * k * sp * dt, -H / 2 + 40, H / 2 - 40);
  g.tilt = dx; g.invul = Math.max(0, g.invul - dt);
  if (g.flash > 0) g.flash--;                       // contador de fotogramas del flash de bomba
  // disparos de Stella
  g.shotT -= dt;
  if ((keys.KeyZ || keys.Space) && g.shotT <= 0) {
    g.shotT = P.shotInterval; sfx('shot', 0.12);
    for (const o of [-12, 12]) g.shots.push({ x: g.px + o, y: g.py + 30 });
  }
  let j = 0;
  for (const s of g.shots) {
    s.y += P.shotSpeed * dt;
    if (s.y > H / 2 + 20) continue;
    const ddx = s.x - g.bx, ddy = s.y - g.by;
    if (ddx * ddx + ddy * ddy < C.boss.hitRadius ** 2) { g.hp -= P.shotDamage; g.score += S.hit; continue; }
    g.shots[j++] = s;
  }
  g.shots.length = j;
  // Vesper
  g.bx = Math.sin(g.t * 0.7) * 170; g.by = 370 + Math.sin(g.t * 1.3) * 30;
  const ratio = g.hp / D.bossHP, ph = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
  if (ph !== g.phase) { g.phase = ph; g.bullets.length = 0; g.pause = 1.2; g.pat = {}; }
  if (g.pause > 0) g.pause -= dt; else for (const n of D.phases[g.phase - 1]) PATTERNS[n](dt);
  // balas enemigas: movimiento, graze y colisión
  const hr = C.bulletRadius + P.hitRadius, gr = C.bulletRadius + P.grazeRadius;
  let hit = false; j = 0;
  for (const b of g.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.abs(b.x) > W / 2 + 30 || Math.abs(b.y) > H / 2 + 30) continue;
    const ex = b.x - g.px, ey = b.y - g.py, d2 = ex * ex + ey * ey;
    if (!g.invul && d2 < hr * hr) { hit = true; continue; }
    if (!b.g && d2 < gr * gr) { b.g = 1; g.score += S.graze; }
    g.bullets[j++] = b;
  }
  g.bullets.length = j;
  if (hit) {
    if (g.lives <= 0) return end(false, 'Vesper se quedó con el helado.');
    g.lives--; g.bullets.length = 0; g.invul = P.invul; g.px = 0; g.py = -420;
  }
  if (g.hp <= 0) return end(true, 'Vesper se rinde.');
  if (g.time >= D.time) return end(false, 'El helado se derritió por completo.');
}

/* ---------- Bucle de render ---------- */
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  $('stage').style.transform = `translate(-50%,-50%) scale(${s})`;
  renderer.setPixelRatio(clamp(s * devicePixelRatio, 1, 2)); renderer.setSize(W, H, false);
}
addEventListener('resize', fit); fit();

function ease(o, ry, rz, dt, speed = 8) {   // gira suavemente hacia el ángulo objetivo
  const k = 1 - Math.exp(-dt * speed);
  o.rotation.y += (ry - o.rotation.y) * k;
  o.rotation.z += (rz - o.rotation.z) * k;
}
let bossLastX = 0;

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const running = G && G.state === 'play' && !paused;
  bg.material.map.offset.y += C.bgScroll * dt;                 // fondo infinito
  floor.material.map.offset.y += C.floorScroll * dt;           // suelo infinito
  if (running) update(dt);
  const t = now / 1000;
  if (G) {
    const playing = G.state === 'play', lost = G.state === 'end' && G.hp > 0;
    playerObj.position.set(G.px, G.py + (lost ? 0 : Math.sin(t * 4) * 3), 0);
    playerObj.visible = !(playing && G.invul > 0 && Math.floor(t * 20) % 2);
    if (playing) ease(playerObj, Math.PI, -G.tilt * 0.3, dt);      // de espaldas, mirando a Vesper
    else if (lost) ease(playerObj, 0, Math.PI / 2, dt, 5);          // perdió: queda acostada
    else ease(playerObj, 0, 0, dt);                                // ganó: vuelve a mirar al jugador
    hitDot.position.set(G.px, G.py, 150); hitDot.visible = playing && G.focus;
    bossObj.position.set(G.bx, G.by + Math.sin(t * 3) * 4, 0);
    drawLayer(bulletLayer, G.bullets); drawLayer(shotLayer, G.shots);
    $('flash').style.opacity = G.flash / P.bombFlashFrames;
    hud();
  } else {                                                          // menú
    playerObj.position.set(0, -420, 0); ease(playerObj, 0, 0, dt);  // Stella mira al jugador
    bossObj.position.set(Math.sin(t) * 170, 380, 0);
  }
  const bvx = (bossObj.position.x - bossLastX) / Math.max(dt, 0.001); bossLastX = bossObj.position.x;
  ease(bossObj, clamp(bvx / 120, -1, 1) * 0.6, clamp(-bvx / 120, -1, 1) * 0.15, dt);   // Vesper gira según hacia dónde va
  mixers.forEach(m => m.update(dt));
  renderer.autoClear = false; renderer.clear();
  if (floorMode) renderer.render(bgScene, bgCam);   // primero el suelo en perspectiva
  renderer.clearDepth();
  renderer.render(scene, cam);                      // encima, personajes y balas
}
menu('¡DUELO POR HELADO!', 'Stella y Vesper se pelean por el último helado de frambuesa celestial del Castillo Dulce. Esquiva los helados, derrota a Vesper antes de que se derrita. Mover: flechas/WASD · Disparar: Z · Shift: precisión · Bomba: X', true);
showBg(C.difficulties.normal);
requestAnimationFrame(loop);
