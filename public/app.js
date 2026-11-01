// Litoral Propiedades · cliente (chat + voz + "lo que Lola está haciendo")
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sid = (() => {
  try { const k = 'lp_sid'; let v = sessionStorage.getItem(k); if (!v) { v = crypto.randomUUID(); sessionStorage.setItem(k, v); } return v; }
  catch { return crypto.randomUUID ? crypto.randomUUID() : 'sid-' + Date.now() + Math.random().toString(16).slice(2); }
})();

const msgs = $('#msgs'), brain = $('#brain'), cards = $('#cards');
let busy = false, hayTarjetas = false, visitaHecha = false;
const tarjetas = new Map();
const ICON = { buscar_propiedades: '🔎', crear_lead: '📝', agendar_visita: '📅' };

// Respuestas rápidas: para que cualquiera pueda usarlo sin escribir
const QUICK_INICIO = ['🏠 Quiero alquilar', '🔑 Quiero comprar', '🌊 Algo cerca del río', '🐶 Tengo mascota', '🎓 Algo económico para estudiar'];
const QUICK_RESULTADOS = ['📅 Quiero visitar la primera', '💸 ¿Algo más barato?', '📍 Mostrame otra zona', '👤 Prefiero que me llame un asesor'];
function setQuick(lista) {
  $('#quick').innerHTML = lista.map(t => `<button type="button" class="chip">${esc(t)}</button>`).join('');
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
          <button class="visitar" data-id="${esc(p.id)}" data-titulo="${esc(p.titulo)}">📅 Quiero visitarla</button>
          <button class="imagine" data-id="${esc(p.id)}">✨ Imaginá tu vida acá</button>
        </div>
      </div>`;
    tarjetas.set(p.id, c);
    cards.prepend(c);
  });
}

cards.addEventListener('click', async e => {
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

async function enviar(texto) {
  texto = texto.trim();
  if (!texto || busy) return;
  busy = true; $('#send').disabled = true;
  setQuick([]);
  addMsg(texto, 'user');
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
  addMsg(respuesta.text, respuesta.t === 'error' ? 'bot err' : 'bot', meta);
  brainStep('💬', 'Te respondió', respuesta.ms ? `en ${(respuesta.ms / 1000).toFixed(1)} segundos` : '', 'ok');
  $('#live').classList.remove('on');
  busy = false; $('#send').disabled = false;
  setQuick(visitaHecha ? ['🙌 ¡Gracias!', '🏠 Quiero ver otras opciones'] : hayTarjetas ? QUICK_RESULTADOS : QUICK_INICIO);
  if (llamada) hablar(respuesta.text);
}

$('#form').addEventListener('submit', e => { e.preventDefault(); const v = $('#input').value; $('#input').value = ''; enviar(v); });

addMsg('¡Hola! Soy Lola, de Litoral Propiedades 👋\nContame qué estás buscando y cómo es tu día a día (si tenés mascota, si trabajás desde casa, si tenés chicos…) y te muestro lo que mejor te queda.\nPodés escribirme, tocar un botón de abajo o tocar 🎤 y hablarme.', 'bot', 'Lola');
setQuick(QUICK_INICIO);

// --- Voz: Web Speech API (es-AR) ---
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let llamada = false, rec = null, voz = null;
function elegirVoz() {
  const vs = speechSynthesis.getVoices();
  voz = vs.find(v => v.lang === 'es-AR') || vs.find(v => v.lang === 'es-US') || vs.find(v => /^es/.test(v.lang) && /female|mujer|helena|sabina|paulina|monica|google/i.test(v.name)) || vs.find(v => /^es/.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { elegirVoz(); speechSynthesis.onvoiceschanged = elegirVoz; }
const sinVoz = () => alert('Tu navegador no permite hablar 😕 Probá desde Google Chrome. Mientras tanto, podés escribirle a Lola o tocar los botones.');

function setCall(txt, activo) { $('#callText').textContent = txt; $('#wave').classList.toggle('idle', !activo); }

// Micrófono del chat: dictar un mensaje (sin llamada)
$('#btnMic').addEventListener('click', () => {
  if (!SR) return sinVoz();
  if (busy || llamada) return;
  const r = new SR();
  r.lang = 'es-AR'; r.interimResults = true;
  const input = $('#input'), mic = $('#btnMic');
  let final = '';
  mic.textContent = '⏺'; input.placeholder = 'Te escucho… hablá tranquilo';
  r.onresult = e => { let t = ''; for (const x of e.results) { t += x[0].transcript; if (x.isFinal) final = t; } input.value = t; };
  r.onend = () => { mic.textContent = '🎤'; input.placeholder = 'Escribí tu consulta acá…'; if (final.trim()) { input.value = ''; enviar(final); } };
  r.onerror = e => { if (e.error === 'not-allowed') alert('Necesito permiso para usar el micrófono.'); };
  try { r.start(); } catch {}
});

// Llamada: Lola escucha, responde hablando y vuelve a escuchar
function escuchar() {
  if (!llamada || busy) return;
  rec = new SR();
  rec.lang = 'es-AR'; rec.interimResults = true; rec.continuous = false;
  let final = '';
  rec.onresult = e => {
    let interim = '';
    for (const r of e.results) { if (r.isFinal) final = r[0].transcript; else interim += r[0].transcript; }
    setCall('🎙️ ' + (final || interim), true);
  };
  rec.onerror = e => { if (e.error === 'not-allowed') { cortar(); alert('Necesito permiso para usar el micrófono.'); } };
  rec.onend = () => {
    if (!llamada) return;
    if (final.trim()) { setCall('Lola está buscando…', false); enviar(final); }
    else setTimeout(escuchar, 250);
  };
  setCall('Te escucho… hablá tranquilo', true);
  try { rec.start(); } catch {}
}

function hablar(texto) {
  if (!('speechSynthesis' in window)) return escuchar();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto.replace(/[*_#]/g, ''));
  u.lang = voz?.lang || 'es-AR'; if (voz) u.voice = voz; u.rate = 1.05;
  u.onend = () => { if (llamada) escuchar(); };
  u.onerror = () => { if (llamada) escuchar(); };
  setCall('🔊 Lola te está hablando…', true);
  speechSynthesis.speak(u);
}

function cortar() {
  llamada = false;
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
  hablar('Hola, soy Lola de Litoral Propiedades. Contame, ¿qué estás buscando?');
});
