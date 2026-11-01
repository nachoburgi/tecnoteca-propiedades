// Recorrido 3D: genera la propiedad en 3D a partir de su ficha y la amuebla según lo que contó el cliente
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = s => document.querySelector(s);
let renderer, scene, camera, controls, raf, anim = null, noche = false, luces = {};
let AMB = [], paredes = [], propActual = null, ambActual = null;
const ALTO = 1.5;
// Animación de cámara (motion): posición y punto de mira, con easing
function animarA(pos, mira, ms = 1600, alTerminar) {
  anim = { p0: camera.position.clone(), p1: pos, t0v: controls.target.clone(), t1: mira, ini: performance.now(), ms, alTerminar };
}

function caja(w, h, d, color, x, y, z, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: opts.map ? 0xffffff : color, map: opts.map || null, roughness: opts.rough ?? .8, metalness: opts.metal || 0, transparent: !!opts.op, opacity: opts.op ?? 1, emissive: opts.emissive || 0x000000, emissiveIntensity: opts.ei || 0 });
  const esPared = h === ALTO && color === 0xf4efe9;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), esPared ? [mat, mat, new THREE.MeshStandardMaterial({ color: 0x2b2826 }), mat, mat, mat] : mat);
  m.userData.pared = esPared;
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true;
  scene.add(m); return m;
}
function cartel(texto, x, y, z, color = '#c8102e') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.roundRect(4, 14, 504, 100, 50); g.fill();
  g.strokeStyle = color; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#1f1d1b'; g.font = 'bold 46px DM Sans, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(texto, 256, 66);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(3.2, .8, 1); s.position.set(x, y, z); s.renderOrder = 10;
  scene.add(s); return s;
}
const anillos = [];
function destacar(x, z, r = .9) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r, r + .12, 48), new THREE.MeshBasicMaterial({ color: 0xc8102e, transparent: true, opacity: .9, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .03, z); scene.add(m); anillos.push(m);
}

// --- Texturas dibujadas (pisos de madera, cerámica, alfombras) ---
function textura(dibujar, rx = 1, ry = rx) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  dibujar(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const madera = (rx, ry) => textura(g => {
  const tonos = ['#b98a5e', '#a87b52', '#c69a6c', '#9d7149', '#b3845a', '#c08f60'];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = tonos[i % 6]; g.fillRect(0, i * 32, 256, 32);
    g.fillStyle = 'rgba(70,40,15,.10)'; for (let k = 0; k < 5; k++) g.fillRect(0, i * 32 + 5 + k * 6, 256, 1);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, i * 32, 256, 1.5); g.fillRect((i * 97) % 256, i * 32, 1.5, 32);
  }
}, rx, ry);
const ceramica = (rx, ry) => textura(g => {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#e9e6e1' : '#d8d4ce'; g.fillRect(i * 64, j * 64, 64, 64); }
  g.strokeStyle = '#b9b3ab'; g.lineWidth = 2; for (let k = 0; k <= 256; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.moveTo(0, k); g.lineTo(256, k); g.stroke(); }
}, rx, ry);
const alfombra = (fondo, linea) => textura(g => {
  g.fillStyle = fondo; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = linea; g.lineWidth = 10; g.strokeRect(12, 12, 232, 232);
  g.lineWidth = 3; for (let k = 40; k < 220; k += 24) { g.beginPath(); g.moveTo(k, 30); g.lineTo(256 - k, 226); g.stroke(); }
});
function plano(w, d, tex, x, z, y = .085) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: .9 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m;
}
function cilindro(r, h, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, opts.r2 ?? r, h, 28), new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? .7, metalness: opts.metal || 0, transparent: !!opts.op, opacity: opts.op ?? 1, emissive: opts.emissive || 0, emissiveIntensity: opts.ei || 0 }));
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
}
function planta(x, z, alto = 1) {
  cilindro(.2, .35, 0xc0663a, x, 0, z, { r2: .15 });
  [[0, .75, 0, .32], [.12, .95, .08, .24], [-.1, 1.05, -.06, .22]].forEach(([dx, y, dz, r]) => {
    const h = new THREE.Mesh(new THREE.SphereGeometry(r * alto, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3f7f3a, roughness: .9 }));
    h.position.set(x + dx, y * alto, z + dz); h.castShadow = true; scene.add(h);
  });
}
// Sillón de 3 cuerpos mirando hacia +z (hacia la tele)
function sillon(x, z, ancho = 2.4) {
  caja(ancho, .42, .95, 0xeeeae4, x, .05, z);
  caja(ancho, .55, .25, 0xe2ddd5, x, .4, z - .42);
  caja(.22, .62, .95, 0xe2ddd5, x - ancho / 2 + .11, .05, z); caja(.22, .62, .95, 0xe2ddd5, x + ancho / 2 - .11, .05, z);
  caja(.42, .38, .14, 0xc8102e, x - ancho / 4, .5, z - .25); caja(.42, .38, .14, 0xc8102e, x + ancho / 4, .5, z - .25);
  [-1, 1].forEach(i => [-1, 1].forEach(k => caja(.06, .05, .06, 0x2b2826, x + i * (ancho / 2 - .15), 0, z + k * .4)));
}
function cama(x, z, ancho) {
  caja(ancho + .1, .9, .1, 0x5a4636, x, 0, z - 1.05); // respaldo
  caja(ancho, .3, 2, 0x8a6a4a, x, 0, z); // base
  caja(ancho - .06, .18, 1.94, 0xfbfaf8, x, .3, z); // colchón
  caja(ancho - .02, .06, 1.2, 0xc8102e, x, .48, z + .38); // acolchado
  caja(ancho * .4, .14, .4, 0xffffff, x - ancho * .23, .48, z - .72); caja(ancho * .4, .14, .4, 0xffffff, x + ancho * .23, .48, z - .72);
  [-1, 1].forEach(i => {
    const nx = x + i * (ancho / 2 + .32);
    caja(.45, .5, .4, 0x8a6a4a, nx, 0, z - .8);
    cilindro(.12, .3, 0xfff4d6, nx, .5, z - .8, { r2: .16, emissive: 0xffd27a, ei: .5 });
  });
  plano(ancho + .8, 1.4, alfombra('#d9cfc2', '#b9a993'), x, z + 1.3, .09);
}
function cocina(x0, zPared, largo) {
  caja(largo, .88, .62, 0xf7f5f2, x0, 0, zPared + .31); // bajo mesada
  caja(largo, .05, .66, 0x2b2826, x0, .88, zPared + .33, { rough: .3 }); // mesada
  caja(largo, .6, .35, 0xf7f5f2, x0, 1.45, zPared + .18); // alacenas
  caja(.55, .02, .4, 0x9aa3a8, x0 + largo / 4, .93, zPared + .33, { metal: .6, rough: .3 }); // bacha
  [[-.15, 0], [.15, 0], [-.15, .25], [.15, .25]].forEach(([dx, dz]) => cilindro(.08, .01, 0x1f1d1b, x0 - largo / 4 + dx, .93, zPared + .2 + dz));
  caja(.65, 1.8, .62, 0xcfd3d6, x0 - largo / 2 - .36, 0, zPared + .31, { metal: .5, rough: .35 }); // heladera
}
function comedor(x, z) {
  cilindro(.6, .04, 0xf4efe9, x, .74, z); cilindro(.05, .74, 0x2b2826, x, 0, z);
  [[.85, 0], [-.85, 0], [0, .85], [0, -.85]].forEach(([dx, dz]) => { cilindro(.2, .05, 0xc8102e, x + dx, .45, z + dz); cilindro(.03, .45, 0x2b2826, x + dx, 0, z + dz); });
  cilindro(.25, .02, 0xffe7b0, x, 2.3, z, { emissive: 0xffd27a, ei: .4 });
}

function construir(p, contado) {
  const tags = new Set([...(p.estilo_vida || [])]);
  const pidio = new Set(p.coincide_con || []);
  const amb = Math.max(1, p.ambientes);
  const esCasa = p.tipo === 'casa' || p.tipo === 'ph';
  const W = esCasa ? 12 : 9 + amb, D = esCasa ? 9 : 7;
  const H = ALTO, e = .15;
  const piso = 0xd9b98c, pared = 0xf4efe9;
  const items = [];

  // Terreno y piso
  const suelo = new THREE.Mesh(new THREE.CircleGeometry(80, 64), new THREE.MeshStandardMaterial({ color: esCasa || tags.has('verde') ? 0x9cc28a : 0xe6e1dc }));
  suelo.rotation.x = -Math.PI / 2; suelo.receiveShadow = true; scene.add(suelo);
  caja(W, .08, D, piso, 0, 0, 0, { rough: .6 });
  plano(W - .3, D - .3, madera(W / 2.5, D / 2.5), 0, 0);
  plano(3.2, 2.2, ceramica(2, 1.4), -W / 2 + 1.75, -D / 2 + 1.25, .088);

  // Paredes perimetrales (sin techo: vista "casa de muñecas")
  caja(W, H, e, pared, 0, 0, -D / 2); caja(e, H, D, pared, -W / 2, 0, 0); caja(e, H, D, pared, W / 2, 0, 0);
  caja(W * .35, H, e, pared, -W * .325, 0, D / 2); caja(W * .35, H, e, pared, W * .325, 0, D / 2);
  caja(W * .3, .4, e, 0xbfe3f5, 0, 1.1, D / 2, { op: .45 }); // ventanal

  // Distribución: living a la izquierda, dormitorios a la derecha
  const dorms = Math.max(0, amb - 1);
  const xDiv = dorms ? -W / 2 + W * .5 : W / 2;
  if (dorms) {
    caja(e, H, D * .6, pared, xDiv, 0, -D * .2);
    const anchoD = (W / 2 - xDiv) / dorms;
    for (let i = 0; i < dorms; i++) {
      const x0 = xDiv + anchoD * i + anchoD / 2;
      if (i > 0) caja(e, H, D * .6, pared, xDiv + anchoD * i, 0, -D * .2);
      const esOficina = i === dorms - 1 && dorms > 1 && (tags.has('home office') || pidio.has('home office'));
      if (esOficina) items.push(['home office', x0, -D * .25]);
      else {
        cama(x0, -D / 2 + 1.3, Math.min(1.6, anchoD * .55));
        planta(xDiv + anchoD * (i + 1) - .4, -D * .2 + D * .3 - .4, .8);
        cartel(i === 0 ? 'Dormitorio' : 'Dormitorio ' + (i + 1), x0, 2.3, -D * .25, '#6b6560');
        AMB.push({ nombre: i === 0 ? 'Dormitorio' : 'Dormitorio ' + (i + 1), icono: '🛏', x: x0, z: -D / 2 + 2.6, mira: [x0, .6, -D / 2 + .6] });
      }
    }
  }
  // Living-comedor
  const xl = (-W / 2 + xDiv) / 2;
  plano(3, 2.2, alfombra('#3a3633', '#c8102e'), xl, D / 2 - 1.9, .09);
  sillon(xl, D / 2 - 2.55);
  caja(1.1, .04, .6, 0xbfe3f5, xl, .38, D / 2 - 1.55, { op: .55, rough: .1 }); caja(1, .38, .5, 0x2b2826, xl, 0, D / 2 - 1.55, { op: .9 }); // mesa ratona
  caja(2, .45, .4, 0x5a4636, xl, 0, D / 2 - .35); caja(1.5, .85, .05, 0x111111, xl, .55, D / 2 - .3, { emissive: 0x1d4ed8, ei: .15, rough: .2 }); // rack y tele
  planta(xl + 1.5, D / 2 - .45, 1.2); planta(xl - 1.5, D / 2 - .45, .9);
  comedor(xl + (dorms ? .2 : .6), -D / 2 + 2.1);
  cocina(-W / 2 + 1.75, -D / 2 + .08, 2.2);
  cartel(amb === 1 ? 'Ambiente único' : 'Living · cocina', xl, 2.3, 0, '#6b6560');
  AMB.unshift({ nombre: amb === 1 ? 'Ambiente único' : 'Living', icono: '🛋', x: xl, z: -D / 2 + 2.4, mira: [xl, .6, D / 2 - 1.6] });
  AMB.splice(1, 0, { nombre: 'Cocina', icono: '🍳', x: -W / 2 + 2.2, z: -D / 2 + 2.6, mira: [-W / 2 + 1.1, .9, -D / 2 + .4] });

  // Personalización según lo que contó el cliente
  if (tags.has('home office') || pidio.has('home office')) {
    const [x, z] = items.find(i => i[0] === 'home office')?.slice(1) || [-W / 2 + .9, .3];
    caja(1.4, .75, .7, 0xf4efe9, x, 0, z); caja(.7, .45, .05, 0x1f1d1b, x, .75, z - .2, { emissive: 0x3b82f6, ei: .6 });
    caja(.5, .9, .5, 0xc8102e, x, 0, z + .7);
    cartel('💻 Tu home office', x, 2.6, z); AMB.push({ nombre: 'Home office', icono: '💻', x: x + .2, z: z + 2.2, mira: [x, .9, z - .2] }); if (pidio.has('home office')) destacar(x, z);
  }
  if (p.mascotas && (tags.has('mascotas') || pidio.has('mascotas'))) {
    const x = xl + 1.7, z = D / 2 - 2.6;
    const cama = new THREE.Mesh(new THREE.TorusGeometry(.38, .14, 12, 32), new THREE.MeshStandardMaterial({ color: 0xc8102e }));
    cama.rotation.x = -Math.PI / 2; cama.position.set(x, .14, z); cama.castShadow = true; scene.add(cama);
    caja(.5, .06, .5, 0xf3d9a4, x, .02, z);
    cartel('🐶 Lugar para tu perro', x, 2.2, z); if (pidio.has('mascotas')) destacar(x, z, .6);
  }
  if (tags.has('patio') || esCasa) {
    caja(W, .04, 5, 0x7fb36b, 0, 0, -D / 2 - 2.6);
    const tronco = caja(.25, 1.6, .25, 0x7a5a3a, -W / 2 + 1.5, 0, -D / 2 - 3);
    const copa = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), new THREE.MeshStandardMaterial({ color: 0x4f8f45 }));
    copa.position.set(tronco.position.x, 2.3, tronco.position.z); copa.castShadow = true; scene.add(copa);
    cartel('🌳 Patio', 0, 1.6, -D / 2 - 2.6, '#15803d'); AMB.push({ nombre: 'Patio', icono: '🌳', x: 2, z: -D / 2 - 1.2, mira: [-W / 2 + 1.5, 1.4, -D / 2 - 3] });
  }
  if (/pileta/i.test(p.descripcion)) {
    caja(3.5, .05, 1.8, 0x38bdf8, W / 2 - 2.4, .02, -D / 2 - 2.4, { op: .9, emissive: 0x0ea5e9, ei: .25 });
    cartel('🏊 Pileta', W / 2 - 2.4, 1.4, -D / 2 - 2.4, '#0ea5e9');
  }
  if (tags.has('balcón')) {
    caja(W * .5, .1, 1.4, 0xcfc8c1, 0, .4, D / 2 + .75); caja(W * .5, .9, .05, 0xbfe3f5, 0, .5, D / 2 + 1.45, { op: .5 });
    cartel('Balcón', 0, 2.2, D / 2 + .9, '#6b6560'); AMB.push({ nombre: 'Balcón', icono: '🌅', x: 0, z: D / 2 - .4, mira: [0, 1.2, D / 2 + 8] });
  }
  if (p.cochera) {
    caja(1.8, .7, 3.6, 0xc8102e, W / 2 + 2.2, .1, 1, { rough: .3 }); caja(1.6, .5, 1.8, 0x1f1d1b, W / 2 + 2.2, .8, 1.2, { rough: .2 });
    cartel('🚗 Cochera', W / 2 + 2.2, 2.4, 1);
  }
  if (tags.has('río')) {
    const rio = new THREE.Mesh(new THREE.PlaneGeometry(160, 12), new THREE.MeshStandardMaterial({ color: 0x5aa5c8, roughness: .2, metalness: .1 }));
    rio.rotation.x = -Math.PI / 2; rio.position.set(0, .01, D / 2 + 9); scene.add(rio); luces.rio = rio;
    cartel('🌊 El río a pasos', 0, 1.6, D / 2 + 7, '#0ea5e9');
  }
  // Plantas si le gusta lo verde o la luz
  if (tags.has('verde') || tags.has('luminoso')) [[W / 2 - .5, D / 2 - .5], [-W / 2 + .5, D / 2 - .5]].forEach(([x, z]) => {
    caja(.35, .4, .35, 0xa0522d, x, 0, z);
    const h = new THREE.Mesh(new THREE.SphereGeometry(.35, 12, 10), new THREE.MeshStandardMaterial({ color: 0x4f8f45 })); h.position.set(x, .75, z); scene.add(h);
  });
  // Paredes: se registran para "subirlas" cuando entrás a un ambiente
  scene.children.forEach(m => { if (m.userData.pared) paredes.push(m); });
  return { W, D };
}

function luz() {
  luces.hemi = new THREE.HemisphereLight(0xffffff, 0xb8a58c, 1.2); scene.add(luces.hemi);
  luces.sol = new THREE.DirectionalLight(0xfff4e0, 2.2);
  luces.sol.position.set(10, 16, 8); luces.sol.castShadow = true; luces.sol.shadow.mapSize.set(2048, 2048);
  Object.assign(luces.sol.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
  scene.add(luces.sol);
  luces.lampara = new THREE.PointLight(0xffc27a, 0, 14); luces.lampara.position.set(0, 2.2, 0); scene.add(luces.lampara);
}
function aplicarNoche() {
  scene.background = new THREE.Color(noche ? 0x141b2d : 0xf6f4f2);
  scene.fog = new THREE.Fog(noche ? 0x141b2d : 0xf6f4f2, 25, 60);
  luces.hemi.intensity = noche ? .25 : 1.2;
  luces.sol.intensity = noche ? .15 : 2.2;
  luces.lampara.intensity = noche ? 30 : 0;
  $('#t3dNoche').textContent = noche ? '☀️ Ver de día' : '🌙 Ver de noche';
}

window.abrir3D = (p, contado) => {
  const modal = $('#tour3d');
  modal.hidden = false;
  $('#t3dTitulo').textContent = p.titulo;
  $('#t3dSub').textContent = `${p.zona} · ${p.ambientes} amb · ${p.m2} m² · ${p.precio}`;
  const personal = [];
  if (p.coincide_con?.includes('home office') || p.estilo_vida.includes('home office')) personal.push('💻 escritorio para trabajar');
  if (p.mascotas && p.estilo_vida.includes('mascotas')) personal.push('🐶 lugar para tu perro');
  if (p.estilo_vida.includes('río')) personal.push('🌊 el río a pasos');
  if (p.cochera) personal.push('🚗 cochera');
  $('#t3dPersonal').textContent = personal.length ? 'Amueblada según lo que le contaste a Lola: ' + personal.join(' · ') : 'Recorrela: arrastrá para girar, ruedita para acercar.';

  const cont = $('#t3dCanvas');
  cont.innerHTML = '';
  scene = new THREE.Scene(); anillos.length = 0; luces = {}; AMB = []; paredes = []; propActual = p; ambActual = null; $('#t3dPanel').hidden = true;
  camera = new THREE.PerspectiveCamera(45, cont.clientWidth / cont.clientHeight, .1, 200);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(cont.clientWidth, cont.clientHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  cont.appendChild(renderer.domElement);
  luz(); noche = false; aplicarNoche();
  construir(p, contado);
  $('#t3dRooms').innerHTML = '<button class="chip on" data-i="-1">🏠 Vista general</button>' + AMB.map((a, i) => `<button class="chip" data-i="${i}">${a.icono} Entrar: ${a.nombre}</button>`).join('');
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2.15; controls.minDistance = 4; controls.maxDistance = 40;
  controls.autoRotate = false; controls.autoRotateSpeed = .8;

  // Motion: la cámara "vuela" desde el cielo hasta la propiedad
  const desde = new THREE.Vector3(0, 45, 40), hasta = new THREE.Vector3(5.5, 10.5, 8.5);
  camera.position.copy(desde); controls.target.set(0, 0, 0);
  const ease = t => 1 - Math.pow(1 - t, 3);
  animarA(hasta, new THREE.Vector3(0, 0, 0), 2600, () => { controls.autoRotate = true; });
  cancelAnimationFrame(raf);
  const loop = now => {
    raf = requestAnimationFrame(loop);
    if (anim) {
      const t = Math.min(1, (now - anim.ini) / anim.ms), k = ease(t);
      camera.position.lerpVectors(anim.p0, anim.p1, k);
      controls.target.lerpVectors(anim.t0v, anim.t1, k);
      if (t >= 1) { const f = anim.alTerminar; anim = null; f?.(); }
    }
    anillos.forEach(a => { const s = 1 + .15 * Math.sin(now / 300); a.scale.set(s, s, s); a.material.opacity = .5 + .4 * Math.sin(now / 300); });
    if (luces.rio) luces.rio.material.color.setHSL(.55, .45, .52 + .03 * Math.sin(now / 700));
    controls.update(); renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
  renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false; });
};

function cerrar() { $('#tour3d').hidden = true; cancelAnimationFrame(raf); renderer?.dispose(); }
$('#t3dCerrar').addEventListener('click', cerrar);
$('#t3dNoche').addEventListener('click', () => { noche = !noche; aplicarNoche(); });
$('#t3dVisitar').addEventListener('click', () => { const t = $('#t3dTitulo').textContent; cerrar(); window.enviarMensaje?.(`Me encantó "${t}" en 3D, ¿la puedo ir a ver?`); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#tour3d').hidden) cerrar(); });
addEventListener('resize', () => { if (!renderer || $('#tour3d').hidden) return; const c = $('#t3dCanvas'); camera.aspect = c.clientWidth / c.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(c.clientWidth, c.clientHeight); });

// --- Entrar a cada ambiente: cámara a la altura de los ojos, paredes a altura real ---
function alturaParedes(alto) {
  const k = alto / ALTO;
  paredes.forEach(m => { m.scale.y = k; m.position.y = alto / 2; });
  scene.children.forEach(o => { if (o.isSprite) o.visible = alto <= ALTO; });
}
function vistaGeneral() {
  ambActual = null; $('#t3dPanel').hidden = true;
  alturaParedes(ALTO);
  controls.minDistance = 4; controls.maxPolarAngle = Math.PI / 2.15;
  animarA(new THREE.Vector3(5.5, 10.5, 8.5), new THREE.Vector3(0, 0, 0), 1400, () => { controls.autoRotate = true; });
}
function entrar(a) {
  ambActual = a; controls.autoRotate = false;
  alturaParedes(2.6);
  controls.minDistance = .2; controls.maxPolarAngle = Math.PI * .62;
  animarA(new THREE.Vector3(a.x, 1.6, a.z), new THREE.Vector3(...a.mira), 1700);
  $('#t3dAmb').textContent = a.icono + ' Estás en: ' + a.nombre;
  $('#t3dResp').textContent = 'Arrastrá para mirar alrededor. Preguntale a Lola lo que quieras de este ambiente, o anotá algo para revisar en la visita.';
  $('#t3dPreg').value = '';
  $('#t3dPanel').hidden = false;
  renderNotas();
}
$('#t3dRooms').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  document.querySelectorAll('#t3dRooms .chip').forEach(c => c.classList.toggle('on', c === b));
  const i = Number(b.dataset.i);
  i < 0 ? vistaGeneral() : entrar(AMB[i]);
});
// Preguntarle a Lola sobre el ambiente (responde en el recorrido y en voz alta)
$('#t3dAsk').addEventListener('click', async () => {
  const q = $('#t3dPreg').value.trim(); if (!q || !ambActual || !window.enviarMensaje) return;
  const b = $('#t3dAsk'); b.disabled = true; $('#t3dResp').textContent = 'Lola está mirando la ficha…';
  await window.enviarMensaje(`Estoy recorriendo en 3D "${propActual.titulo}" (${propActual.id}), en el ambiente ${ambActual.nombre}: ${q}`);
  const ult = [...document.querySelectorAll('#msgs .msg.bot')].pop();
  const txt = ult ? (ult.querySelector('.transcripcion')?.textContent || ult.childNodes[0]?.textContent || '') : '';
  $('#t3dResp').textContent = txt || 'No pude responder ahora, probá de nuevo.';
  if (txt) window.hablarLola?.(txt);
  b.disabled = false; $('#t3dPreg').value = '';
});
$('#t3dPreg').addEventListener('keydown', e => { if (e.key === 'Enter') $('#t3dAsk').click(); });
// Notas para la visita: quedan en el calendario y en el panel del asesor
$('#t3dNota').addEventListener('click', () => {
  const q = $('#t3dPreg').value.trim(); if (!q || !ambActual) { $('#t3dResp').textContent = 'Escribí arriba qué querés que te recuerde (ej: "ver si hay humedad") y tocá 📌.'; return; }
  window.anotarVisita?.(propActual.id, ambActual.nombre, q);
  $('#t3dPreg').value = '';
  $('#t3dResp').textContent = '📌 Listo, lo anoté. Te lo recuerdo en la visita y el asesor también lo va a tener.';
  renderNotas();
});
function renderNotas() {
  const n = (window.notasVisita?.[propActual?.id] || []);
  $('#t3dNotas').innerHTML = n.map(x => `<li><b>${x.ambiente.replace(/[<>&]/g, '')}:</b> ${x.texto.replace(/[<>&]/g, '')}</li>`).join('');
}

// Link directo: /?ver3d=LP-04 abre el recorrido de esa propiedad
const ver3d = new URLSearchParams(location.search).get('ver3d');
if (ver3d) fetch('/api/propiedad/' + encodeURIComponent(ver3d)).then(r => r.ok ? r.json() : null).then(p => p && window.abrir3D(p));
