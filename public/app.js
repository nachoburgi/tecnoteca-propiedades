// Tecnoteca Propiedades · cliente (chat + voz + "lo que Lola está haciendo")
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sid = (() => {
  try { const k = 'lp_sid'; let v = sessionStorage.getItem(k); if (!v) { v = crypto.randomUUID(); sessionStorage.setItem(k, v); } return v; }
  catch { return crypto.randomUUID ? crypto.randomUUID() : 'sid-' + Date.now() + Math.random().toString(16).slice(2); }
})();

const msgs = $('#msgs'), brain = $('#brain'), cards = $('#cards');
let busy = false, hayTarjetas = false, visitaHecha = false;
const tarjetas = new Map(), datosProp = new Map();
const ICON = { buscar_propiedades: '🔎', crear_lead: '📝', agendar_visita: '📅' };

// Respuestas rápidas: para que cualquiera pueda usarlo sin escribir
const QUICK_INICIO = ['🏠 Quiero alquilar', '🔑 Quiero comprar', '🌊 Algo cerca del río', '🐶 Tengo mascota', '🎓 Algo económico para estudiar'];
const QUICK_RESULTADOS = ['📅 Quiero visitar la primera', '💸 ¿Algo más barato?', '📍 Mostrame otra zona', '👤 Prefiero que me llame un asesor'];
function setQuick(lista) {
  $('#quick').innerHTML = lista.map(t => `<button type="button" class="chip"${/WhatsApp/.test(t) ? ' data-wa="1"' : ''}>${esc(t)}</button>`).join('');
}
$('#quick').addEventListener('click', e => { if (e.target.classList.contains('chip')) enviar(e.target.textContent.replace(/^\S+\s/, '')); });

function addMsg(texto, quien, meta) {
  const d = document.createElement('div');
  d.className = 'msg ' + quien;
  d.innerHTML = esc(texto) + (meta ? `<span class="meta">${esc(meta)}</span>` : '');
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function brainStep(icon, label, detail, cls = 'run') {
  if (brain.querySelector('.brain-empty')) brain.innerHTML = '';
  const s = document.createElement('div');
  s.className = 'step ' + cls;
  s.innerHTML = `<div class="dot">${icon}</div><div><b>${esc(label)}</b><small>${esc(detail)}</small><div class="res"></div></div>`;
  brain.appendChild(s);
  brain.scrollTop = brain.scrollHeight;
  return s;
}

function renderCards(resultados) {
  if (cards.querySelector('.brain-empty')) cards.innerHTML = '';
  hayTarjetas = true;
  resultados.slice().reverse().forEach(p => {
    tarjetas.get(p.id)?.remove();
    const match = (p.coincide_con || []).filter(Boolean);
    const c = document.createElement('article');
    c.className = 'card';
    c.innerHTML = `
      <div class="card-img" style="background-image:url('${esc(p.foto)}')">
        <span class="op">${p.operacion === 'venta' ? 'En venta' : 'En alquiler'}</span>
        <span class="zona">📍 ${esc(p.zona)}</span>
      </div>
      <div class="card-body">
        <div class="precio">${esc(p.precio)}</div>
        <h3>${esc(p.titulo)}</h3>
        <div class="datos"><span>🛏 ${esc(p.ambientes)} amb.</span><span>📐 ${esc(p.m2)} m²</span>${p.mascotas ? '<span>🐾 Mascotas</span>' : ''}${p.cochera ? '<span>🚗 Cochera</span>' : ''}</div>
        <p>${esc(p.descripcion)}</p>
        ${match.length ? `<div class="porque"><b>Te queda bien porque:</b> ${esc(match.join(' · '))}</div>` : ''}
        <div class="card-actions">
          <button class="ver3d" data-id="${esc(p.id)}">🧊 Entrar en 3D</button>
          <button class="visitar" data-id="${esc(p.id)}" data-titulo="${esc(p.titulo)}">📅 Quiero visitarla</button>
          <button class="imagine" data-id="${esc(p.id)}">✨ Imaginá tu vida acá</button>
        </div>
      </div>`;
    tarjetas.set(p.id, c);
    datosProp.set(p.id, p);
    cards.prepend(c);
  });
}

cards.addEventListener('click', async e => {
  const t3 = e.target.closest('.ver3d');
  if (t3) return window.abrir3D ? window.abrir3D(datosProp.get(t3.dataset.id)) : alert('Cargando el recorrido 3D, probá en un segundo.');
  const v = e.target.closest('.visitar');
  if (v) return enviar(`Quiero visitar "${v.dataset.titulo}" (${v.dataset.id}). ¿Qué días hay?`);
  const b = e.target.closest('.imagine');
  if (!b) return;
  const body = b.closest('.card-body');
  body.querySelector('.escena')?.remove();
  b.disabled = true; b.textContent = '✨ Imaginando…';
  try {
    const r = await fetch('/api/escena', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, propiedad_id: b.dataset.id }) });
    const j = await r.json();
    const d = document.createElement('div');
    d.className = 'escena';
    d.textContent = j.texto || j.error || 'No pude imaginarlo ahora, probá de nuevo.';
    body.appendChild(d);
    d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch { alert('No pude conectar, probá de nuevo.'); }
  b.disabled = false; b.textContent = '✨ Imaginá tu vida acá';
});

async function enviar(texto, opts = {}) {
  texto = texto.trim();
  if (!texto || busy) return;
  busy = true; $('#send').disabled = true;
  setQuick([]);
  if (opts.audio) burbujaAudio(texto, 'user', opts.dur, 'Audio');
  else addMsg(texto, 'user');
  const typing = addMsg('', 'bot');
  typing.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  $('#live').classList.add('on');
  if (brain.children.length && !brain.querySelector('.brain-empty')) brain.insertAdjacentHTML('beforeend', '<div class="turn-sep"></div>');
  const pensando = brainStep('💭', 'Lola está leyendo tu mensaje', `"${texto.slice(0, 70)}${texto.length > 70 ? '…' : ''}"`);
  let ultimo = null, respuesta = null;
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, mensaje: texto }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'error'); }
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.t === 'thinking') continue;
        pensando.className = 'step ok';
        if (ev.t === 'tool') { ultimo = brainStep(ICON[ev.name] || '⚙️', ev.label, ev.detail); }
        else if (ev.t === 'tool_result') {
          if (ultimo) { ultimo.className = 'step ok'; ultimo.querySelector('.res').textContent = '✓ ' + ev.summary; }
          if (ev.name === 'buscar_propiedades' && ev.data?.resultados?.length) renderCards(ev.data.resultados);
          if (ev.name === 'agendar_visita' && ev.data?.ok) visitaHecha = true;
        } else if (ev.t === 'reply' || ev.t === 'error') respuesta = ev;
      }
    }
  } catch (e) {
    respuesta = { t: 'error', text: e.message && e.message !== 'error' ? e.message : 'Uy, no pude conectarme. ¿Probás de nuevo?' };
  }
  typing.remove();
  pensando.className = 'step ok';
  respuesta = respuesta || { t: 'error', text: 'Uy, no pude conectarme. ¿Probás de nuevo?' };
  const meta = respuesta.ms ? `Lola · respondió en ${(respuesta.ms / 1000).toFixed(1)} s` : 'Lola';
  // Si el cliente mandó audio, Lola contesta con audio (y la transcripción a mano)
  let burbuja;
  if (opts.audio && respuesta.t !== 'error') burbuja = burbujaAudio(respuesta.text, 'bot', Math.max(2, Math.round(respuesta.text.split(/\s+/).length / 2.6)), meta);
  else burbuja = addMsg(respuesta.text, respuesta.t === 'error' ? 'bot err' : 'bot', meta);
  brainStep('💬', 'Te respondió', respuesta.ms ? `en ${(respuesta.ms / 1000).toFixed(1)} segundos` : '', 'ok');
  $('#live').classList.remove('on');
  busy = false; $('#send').disabled = false;
  setQuick(visitaHecha ? ['💬 Pasar a WhatsApp', '🏠 Quiero ver otras opciones'] : hayTarjetas ? QUICK_RESULTADOS : QUICK_INICIO);
  if (llamada || (opts.audio && respuesta.t !== 'error')) hablar(respuesta.text, burbuja);
}

window.enviarMensaje = enviar;
$('#form').addEventListener('submit', e => { e.preventDefault(); const v = $('#input').value; $('#input').value = ''; enviar(v); });

addMsg('¡Hola! Soy Lola, de Tecnoteca Propiedades 👋\nContame qué estás buscando y cómo es tu día a día (si tenés mascota, si trabajás desde casa, si tenés chicos…) y te muestro lo que mejor te queda.\nPodés escribirme, tocar un botón de abajo o tocar 🎤 y hablarme.', 'bot', 'Lola');
setQuick(QUICK_INICIO);

// --- Voz: Web Speech API (es-AR) ---
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let llamada = false, rec = null, voz = null;
function elegirVoz() {
  const vs = speechSynthesis.getVoices();
  // Voz de secretaria: primero voces femeninas naturales (neurales), argentinas si hay
  const es = vs.filter(v => /^es/i.test(v.lang));
  const fem = /elena|paloma|dalia|elvira|ximena|larissa|salome|catalina|camila|valentina|female|mujer/i;
  const natural = /natural|online|neural/i;
  // 1) Edge: voces neurales femeninas (Elena es argentina)  2) Chrome: Google español (EE.UU.)  3) lo que haya
  voz = es.find(v => v.lang === 'es-AR' && natural.test(v.name) && fem.test(v.name))
    || es.find(v => natural.test(v.name) && fem.test(v.name) && /es-(MX|US|419|CO|CL|UY)/i.test(v.lang))
    || es.find(v => natural.test(v.name) && fem.test(v.name))
    || es.find(v => /google/i.test(v.name) && /es-(US|419)/i.test(v.lang))
    || es.find(v => /google/i.test(v.name))
    || es.find(v => /helena|sabina|laura|paulina|monica/i.test(v.name)) || es[0] || null;
  vozNatural = !!voz && natural.test(voz.name);
}
let vozNatural = false;
if ('speechSynthesis' in window) { elegirVoz(); speechSynthesis.onvoiceschanged = elegirVoz; }
const sinVoz = () => alert('Tu navegador no permite hablar 😕 Probá desde Google Chrome. Mientras tanto, podés escribirle a Lola o tocar los botones.');

function setCall(txt, activo) { $('#callText').textContent = txt; $('#wave').classList.toggle('idle', !activo); }

// Nota de voz estilo WhatsApp: tocás 🎤, contás tu situación, tocás ➤ y se manda como audio
let grab = null;
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function iniciarAudio() {
  if (!SR) return sinVoz();
  if (busy || llamada) return;
  speechSynthesis?.cancel();
  const r = new SR();
  r.lang = 'es-AR'; r.interimResults = true; r.continuous = true;
  grab = { r, texto: '', parcial: '', t0: Date.now(), activo: true, cancelado: false };
  const bar = $('#recbar');
  bar.hidden = false; $('#form').hidden = true;
  grab.timer = setInterval(() => { $('#recTime').textContent = mmss(Math.round((Date.now() - grab.t0) / 1000)); }, 250);
  r.onresult = e => {
    let fin = '', par = '';
    for (const x of e.results) { if (x.isFinal) fin += x[0].transcript + ' '; else par += x[0].transcript; }
    grab.texto = fin; grab.parcial = par;
    $('#recTxt').textContent = (fin + par).trim() || 'Te escucho…';
  };
  // Chrome corta la escucha tras un silencio: si seguimos grabando, se reanuda sola
  r.onend = () => { if (grab && grab.activo) { try { r.start(); } catch {} } };
  r.onerror = e => { if (e.error === 'not-allowed') { cerrarAudio(true); alert('Necesito permiso para usar el micrófono.'); } };
  try { r.start(); } catch {}
}
function cerrarAudio(cancelar) {
  if (!grab) return;
  const g = grab; grab = null;
  g.activo = false; clearInterval(g.timer);
  try { g.r.stop(); } catch {}
  $('#recbar').hidden = true; $('#form').hidden = false;
  $('#recTxt').textContent = 'Te escucho…'; $('#recTime').textContent = '0:00';
  if (cancelar) return;
  const dur = Math.max(1, Math.round((Date.now() - g.t0) / 1000));
  // Pequeña espera para que llegue el último fragmento reconocido
  setTimeout(() => {
    const texto = (g.texto + g.parcial).trim();
    if (!texto) return addMsg('No llegué a escuchar el audio 🙈 ¿Probás de nuevo, un poquito más cerca del micrófono?', 'bot', 'Lola');
    enviar(texto, { audio: true, dur });
  }, 350);
}
$('#btnMic').addEventListener('click', iniciarAudio);
$('#recSend').addEventListener('click', () => cerrarAudio(false));
$('#recCancel').addEventListener('click', () => cerrarAudio(true));

// Burbuja de audio (del cliente o de Lola) con onda, duración y transcripción
const ONDA = Array.from({ length: 28 }, (_, i) => 6 + Math.round(Math.abs(Math.sin(i * 1.7) * 14 + Math.sin(i * .6) * 6)));
function burbujaAudio(texto, quien, dur, meta) {
  const d = document.createElement('div');
  d.className = 'msg audio ' + quien;
  d.innerHTML = `<div class="audio-row"><button class="play" aria-label="Escuchar">▶</button><div class="onda">${ONDA.map(h => `<i style="height:${h}px"></i>`).join('')}</div><span class="dur">${mmss(dur)}</span></div>
    <details><summary>Ver transcripción</summary><div class="transcripcion">${esc(texto)}</div></details>${meta ? `<span class="meta">${esc(meta)}</span>` : ''}`;
  d.querySelector('.play').addEventListener('click', () => hablar(texto, d));
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

// Llamada: Lola escucha, responde hablando y vuelve a escuchar
let escuchando = false, silencios = 0;
function escuchar() {
  if (!llamada || busy || escuchando) return;
  speechSynthesis.cancel();
  escuchando = true;
  rec = new SR();
  rec.lang = 'es-AR'; rec.interimResults = true; rec.continuous = false;
  let final = '';
  rec.onresult = e => {
    let interim = '';
    for (const r of e.results) { if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript; }
    setCall('🎙️ ' + (final || interim), true);
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { cortar(); alert('Necesito permiso para usar el micrófono: tocá el candado al lado de la dirección y permitilo.'); }
    else if (e.error === 'audio-capture') { cortar(); alert('No encuentro un micrófono conectado.'); }
  };
  rec.onend = () => {
    escuchando = false;
    if (!llamada) return;
    if (final.trim()) { silencios = 0; setCall('Lola está buscando…', false); enviar(final); }
    else if (++silencios > 6) { silencios = 0; setCall('¿Seguís ahí? Tocá "Hablar ahora" cuando quieras', false); }
    else setTimeout(escuchar, 200);
  };
  setCall('Te escucho… hablá tranquilo', true);
  try { rec.start(); } catch { escuchando = false; }
}

// Lola habla frase por frase (más natural, y evita que Chrome corte audios largos)
let hablaId = 0;
window._frases = [];
function hablar(texto, burbuja) {
  if (!('speechSynthesis' in window)) return escuchar();
  const id = ++hablaId;
  speechSynthesis.cancel(); speechSynthesis.resume();
  try { rec && escuchando && rec.abort(); } catch {}
  document.querySelectorAll('.msg.audio.sonando').forEach(b => b.classList.remove('sonando'));
  // Sin emojis ni símbolos, para que suene como una persona
  const limpio = texto.replace(/[*_#]/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\bLP-(\d+)/g, 'propiedad $1').replace(/\$\s?([\d.]+)\/mes/g, '$1 pesos por mes').replace(/USD\s?([\d.]+)/g, '$1 dólares');
  const frases = limpio.match(/[^.!?¿¡]*[¿¡]?[^.!?]*[.!?]+|\S[^.!?]*$/g)?.map(f => f.trim()).filter(Boolean) || [limpio];
  let terminado = false;
  const fin = () => { if (terminado || id !== hablaId) return; terminado = true; clearTimeout(respaldo); burbuja?.classList.remove('sonando'); if (llamada) setTimeout(escuchar, 300); };
  // Respaldo: si el navegador no avisa que terminó, abrimos el micrófono igual
  const respaldo = setTimeout(fin, 2000 + limpio.length * 90);
  window._frases = frases.map((f, i) => {
    const u = new SpeechSynthesisUtterance(f);
    u.lang = voz?.lang || 'es-AR'; if (voz) u.voice = voz;
    u.rate = vozNatural ? 1 : 0.94; u.pitch = vozNatural ? 1.05 : 1.15; u.volume = 1;
    if (i === frases.length - 1) { u.onend = fin; u.onerror = fin; }
    return u;
  });
  burbuja?.classList.add('sonando');
  setCall('🔊 Lola te está hablando…', true);
  window._frases.forEach(u => speechSynthesis.speak(u));
}

function cortar() {
  llamada = false; escuchando = false; hablaId++;
  try { rec && rec.abort(); } catch {}
  speechSynthesis?.cancel();
  $('#btnCall').classList.remove('on'); $('#btnCall span').textContent = 'Hablar con Lola';
  $('#callbar').classList.remove('on');
}

$('#btnCall').addEventListener('click', () => {
  if (llamada) return cortar();
  if (!SR || !('speechSynthesis' in window)) return sinVoz();
  llamada = true;
  $('#btnCall').classList.add('on'); $('#btnCall span').textContent = 'Cortar llamada';
  $('#callbar').classList.add('on');
  document.querySelector('.chat').scrollIntoView({ behavior: 'smooth' });
  silencios = 0;
  if (!vozNatural) $('#callTip').hidden = false;
  hablar('Hola, ¿cómo estás? Soy Lola, de Tecnoteca Propiedades. Contame tranquilo qué estás buscando.');
});
$('#callNow').addEventListener('click', () => { hablaId++; speechSynthesis.cancel(); silencios = 0; escuchar(); });

// --- Seguir por WhatsApp (link oficial wa.me con el resumen de la charla) ---
async function abrirWhatsApp() {
  let texto = 'Hola Tecnoteca Propiedades! Vengo de la web y quiero hacer una consulta 🏠', numero = '';
  try { const j = await (await fetch('/api/resumen/' + sid)).json(); if (j.texto) texto = j.texto; numero = j.numero || ''; } catch {}
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
}
$('#btnWa').addEventListener('click', abrirWhatsApp);
$('#quick').addEventListener('click', e => { if (e.target.dataset.wa) { e.stopImmediatePropagation(); abrirWhatsApp(); } }, true);

// --- Demo guiada: recorre la app paso a paso, el presentador toca "Siguiente" ---
const esperar = ms => new Promise(r => setTimeout(r, ms));
const hastaLibre = async () => { await esperar(300); while (busy) await esperar(200); };
async function tipear(texto) {
  const input = $('#input');
  input.value = ''; input.focus();
  for (const ch of texto) { input.value += ch; await esperar(28); }
  await esperar(250);
  input.value = '';
  await enviar(texto);
}
function spot(sel) {
  document.querySelectorAll('.spot').forEach(e => e.classList.remove('spot'));
  const el = sel && document.querySelector(sel);
  if (el) { el.classList.add('spot'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
const PASOS = [
  { txt: 'Un cliente entra a la web a cualquier hora (o le escribe por WhatsApp). En vez de esperar a que alguien conteste, le habla a <b>Lola</b>, como le hablaría a una persona.', run: async () => { spot('.chat'); await tipear('Busco alquilar cerca del río, tengo un perro y trabajo desde casa'); } },
  { txt: 'Lola <b>entendió</b> lo que contó: perro → acepta mascotas, río → cerca de la costa, trabaja desde casa → espacio para oficina. Buscó en el <b>catálogo real</b> (nunca inventa propiedades) y explica por qué cada una le queda bien.', run: async () => { spot('#cards'); } },
  { txt: 'Abajo se ve <b>lo que Lola hace por dentro</b>, en vivo: busca, anota la consulta y reserva visitas. Nada se pierde ni queda mal anotado.', run: async () => { spot('#brain'); } },
  { txt: '✨ <b>Imaginá tu vida acá</b>: la IA le cuenta al cliente cómo sería un día suyo en esa propiedad, con lo que él mismo contó. Emociona y vende.', run: async () => { const b = document.querySelector('.imagine'); if (b) { spot('.card'); b.click(); } } },
  { txt: 'El cliente quiere ir a verla. Lola le reserva la visita y lo anota como <b>cliente caliente</b> para que el asesor lo priorice.', run: async () => { spot('.chat'); await tipear('Me encanta la primera. ¿Puedo verla mañana a las 18? Soy Nacho, mi cel es 341 555 1234'); } },
  { txt: 'Con un toque, el cliente sigue la charla por <b>WhatsApp</b> con todo el resumen ya escrito: qué busca, qué le gustó y su visita.', run: async () => { spot('#btnWa'); } },
  { txt: 'Y el dueño ve todo en su <b>panel</b>: el cliente nuevo arriba de todo, las visitas, cuánto tarda Lola en responder y un <b>mapa</b> que le dice qué propiedades salir a conseguir. <br><br>Tocá Siguiente para abrirlo.', run: async () => { spot(null); } },
];
let paso = -1;
async function irPaso(n) {
  paso = n;
  if (paso >= PASOS.length) { window.open('/panel', '_blank'); return cerrarTour(); }
  $('#tourPaso').textContent = `Demo guiada · paso ${paso + 1} de ${PASOS.length}`;
  $('#tourTxt').innerHTML = PASOS[paso].txt;
  $('#tourSig').disabled = true;
  await PASOS[paso].run();
  await hastaLibre();
  $('#tourSig').disabled = false;
  $('#tourSig').textContent = paso === PASOS.length - 1 ? 'Abrir panel del dueño ▶' : 'Siguiente ▶';
}
function cerrarTour() { $('#tour').hidden = true; spot(null); paso = -1; }
$('#btnDemo').addEventListener('click', () => { $('#tour').hidden = false; irPaso(0); });
$('#tourSig').addEventListener('click', () => irPaso(paso + 1));
$('#tourSalir').addEventListener('click', cerrarTour);
