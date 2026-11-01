// Recorrido 3D: genera la propiedad en 3D a partir de su ficha y la amuebla según lo que contó el cliente
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = s => document.querySelector(s);
let renderer, scene, camera, controls, raf, vuelo, noche = false, luces = {};

function caja(w, h, d, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? .8, metalness: 0, transparent: !!opts.op, opacity: opts.op ?? 1, emissive: opts.emissive || 0x000000, emissiveIntensity: opts.ei || 0 }));
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

function construir(p, contado) {
  const tags = new Set([...(p.estilo_vida || [])]);
  const pidio = new Set(p.coincide_con || []);
  const amb = Math.max(1, p.ambientes);
  const esCasa = p.tipo === 'casa' || p.tipo === 'ph';
  const W = esCasa ? 12 : 9 + amb, D = esCasa ? 9 : 7;
  const H = 2.6, e = .15;
  const piso = 0xd9b98c, pared = 0xf4efe9;
  const items = [];

  // Terreno y piso
  const suelo = new THREE.Mesh(new THREE.CircleGeometry(80, 64), new THREE.MeshStandardMaterial({ color: esCasa || tags.has('verde') ? 0x9cc28a : 0xe6e1dc }));
  suelo.rotation.x = -Math.PI / 2; suelo.receiveShadow = true; scene.add(suelo);
  caja(W, .08, D, piso, 0, 0, 0, { rough: .6 });

  // Paredes perimetrales (sin techo: vista "casa de muñecas")
  caja(W, H, e, pared, 0, 0, -D / 2); caja(e, H, D, pared, -W / 2, 0, 0); caja(e, H, D, pared, W / 2, 0, 0);
  caja(W * .35, H, e, pared, -W * .325, 0, D / 2); caja(W * .35, H, e, pared, W * .325, 0, D / 2);
  caja(W * .3, .5, e, 0xbfe3f5, 0, 1.2, D / 2, { op: .45 }); // ventanal

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
        caja(Math.min(1.6, anchoD * .7), .5, 2, 0xffffff, x0, 0, -D / 2 + 1.2); // cama
        caja(Math.min(1.6, anchoD * .7), .25, .6, 0xc8102e, x0, .5, -D / 2 + .5); // almohadas
        cartel(i === 0 ? 'Dormitorio' : 'Dormitorio ' + (i + 1), x0, 3.3, -D * .25, '#6b6560');
      }
    }
  }
  // Living-comedor
  const xl = (-W / 2 + xDiv) / 2;
  caja(2.4, .45, .9, 0x6b6560, xl, 0, D / 2 - 1.4); caja(2.4, .8, .25, 0x5a5550, xl, 0, D / 2 - 1.85); // sillón
  caja(1.1, .4, .6, 0x8a6a4a, xl, 0, D / 2 - 2.6); // mesa ratona
  caja(1.6, .75, .9, 0x8a6a4a, xl, 0, -D / 2 + 1.3); // comedor
  caja(2, .9, .6, 0xffffff, -W / 2 + 1.1, 0, -D / 2 + .4); // cocina
  cartel(amb === 1 ? 'Ambiente único' : 'Living · cocina', xl, 3.3, 0, '#6b6560');

  // Personalización según lo que contó el cliente
  if (tags.has('home office') || pidio.has('home office')) {
    const [x, z] = items.find(i => i[0] === 'home office')?.slice(1) || [xl - 1.2, -.4];
    caja(1.4, .75, .7, 0xf4efe9, x, 0, z); caja(.7, .45, .05, 0x1f1d1b, x, .75, z - .2, { emissive: 0x3b82f6, ei: .6 });
    caja(.5, .9, .5, 0xc8102e, x, 0, z + .7);
    cartel('💻 Tu home office', x, 2.6, z); if (pidio.has('home office')) destacar(x, z);
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
    cartel('🌳 Patio', 0, 1.6, -D / 2 - 2.6, '#15803d');
  }
  if (/pileta/i.test(p.descripcion)) {
    caja(3.5, .05, 1.8, 0x38bdf8, W / 2 - 2.4, .02, -D / 2 - 2.4, { op: .9, emissive: 0x0ea5e9, ei: .25 });
    cartel('🏊 Pileta', W / 2 - 2.4, 1.4, -D / 2 - 2.4, '#0ea5e9');
  }
  if (tags.has('balcón')) {
    caja(W * .5, .1, 1.4, 0xcfc8c1, 0, .4, D / 2 + .75); caja(W * .5, .9, .05, 0xbfe3f5, 0, .5, D / 2 + 1.45, { op: .5 });
    cartel('Balcón', 0, 2.2, D / 2 + .9, '#6b6560');
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
  if (p.mascotas && (p.coincide_con?.includes('mascotas'))) personal.push('🐶 lugar para tu perro');
  if (p.estilo_vida.includes('río')) personal.push('🌊 el río a pasos');
  if (p.cochera) personal.push('🚗 cochera');
  $('#t3dPersonal').textContent = personal.length ? 'Amueblada según lo que le contaste a Lola: ' + personal.join(' · ') : 'Recorrela: arrastrá para girar, ruedita para acercar.';

  const cont = $('#t3dCanvas');
  cont.innerHTML = '';
  scene = new THREE.Scene(); anillos.length = 0; luces = {};
  camera = new THREE.PerspectiveCamera(45, cont.clientWidth / cont.clientHeight, .1, 200);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(cont.clientWidth, cont.clientHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  cont.appendChild(renderer.domElement);
  luz(); noche = false; aplicarNoche();
  construir(p, contado);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2.15; controls.minDistance = 5; controls.maxDistance = 40;
  controls.autoRotate = false; controls.autoRotateSpeed = .8;

  // Motion: la cámara "vuela" desde el cielo hasta la propiedad
  const desde = new THREE.Vector3(0, 45, 40), hasta = new THREE.Vector3(8.5, 8, 10), t0 = performance.now();
  camera.position.copy(desde); controls.target.set(0, 0, 0);
  vuelo = true;
  const ease = t => 1 - Math.pow(1 - t, 3);
  cancelAnimationFrame(raf);
  const loop = now => {
    raf = requestAnimationFrame(loop);
    if (vuelo) {
      const t = Math.min(1, (now - t0) / 2600);
      camera.position.lerpVectors(desde, hasta, ease(t));
      if (t >= 1) { vuelo = false; controls.autoRotate = true; }
    }
    anillos.forEach(a => { const s = 1 + .15 * Math.sin(now / 300); a.scale.set(s, s, s); a.material.opacity = .5 + .4 * Math.sin(now / 300); });
    if (luces.rio) luces.rio.material.color.setHSL(.55, .45, .52 + .03 * Math.sin(now / 700));
    controls.update(); renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
  renderer.domElement.addEventListener('pointerdown', () => { vuelo = false; controls.autoRotate = false; });
};

function cerrar() { $('#tour3d').hidden = true; cancelAnimationFrame(raf); renderer?.dispose(); }
$('#t3dCerrar').addEventListener('click', cerrar);
$('#t3dNoche').addEventListener('click', () => { noche = !noche; aplicarNoche(); });
$('#t3dVisitar').addEventListener('click', () => { const t = $('#t3dTitulo').textContent; cerrar(); window.enviarMensaje?.(`Me encantó "${t}" en 3D, ¿la puedo ir a ver?`); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#tour3d').hidden) cerrar(); });
addEventListener('resize', () => { if (!renderer || $('#tour3d').hidden) return; const c = $('#t3dCanvas'); camera.aspect = c.clientWidth / c.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(c.clientWidth, c.clientHeight); });
