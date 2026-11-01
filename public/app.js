// Litoral Propiedades · cliente (chat + voz + cerebro visible)
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sid = (() => {
  try { const k = 'lp_sid'; let v = sessionStorage.getItem(k); if (!v) { v = crypto.randomUUID(); sessionStorage.setItem(k, v); } return v; }
  catch { return crypto.randomUUID ? crypto.randomUUID() : 'sid-' + Date.now() + Math.random().toString(16).slice(2); }
})();

const msgs = $('#msgs'), brain = $('#brain'), cards = $('#cards');
let busy = false;
const tarjetas = new Map();

const ICON = { buscar_propiedades: '🔎', crear_lead: '📝', agendar_visita: '📅' };
const GRAD = { Centro: '#ff2e93,#8b5cf6', Pichincha: '#f97316,#ff2e93', Echesortu: '#22d3ee,#6366f1', Fisherton: '#34d399,#0ea5e9', Alberdi: '#0ea5e9,#22d3ee', Abasto: '#a855f7,#ec4899' };

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
  resultados.slice().reverse().forEach(p => {
    if (tarjetas.has(p.id)) { cards.prepend(tarjetas.get(p.id)); return; }
    const match = new Set(p.coincide_con || []);
    const c = document.createElement('article');
    c.className = 'card';
    c.innerHTML = `
      <div class="card-img" style="background:linear-gradient(135deg,${GRAD[p.zona] || '#ff2e93,#22d3ee'})">
        <span class="zona">📍 ${esc(p.zona)} · ${esc(p.id)}</span><span class="precio">${esc(p.precio)}</span>
      </div>
      <div class="card-body">
        <h3>${esc(p.titulo)}</h3>
        <p>${esc(p.ambientes)} amb · ${esc(p.m2)} m² · ${p.mascotas ? 'acepta mascotas' : 'sin mascotas'}${p.cochera ? ' · cochera' : ''}<br>${esc(p.descripcion)}</p>
        <div class="tags">${p.estilo_vida.map(t => `<span class="tag ${match.has(t) ? 'match' : ''}">${esc(t)}</span>`).join('')}</div>
        <div class="card-actions"><button class="imagine" data-id="${esc(p.id)}">✨ Imaginá tu vida acá</button></div>
      </div>`;
    tarjetas.set(p.id, c);
    cards.prepend(c);
  });
  cards.scrollTop = 0;
}

cards.addEventListener('click', async e => {
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
  $('#sugs').style.display = 'none';
  addMsg(texto, 'user');
  const typing = addMsg('', 'bot');
  typing.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  $('#live').classList.add('on');
  if (brain.children.length && !brain.querySelector('.brain-empty')) brain.insertAdjacentHTML('beforeend', '<div class="turn-sep"></div>');
  const pensando = brainStep('🧠', 'Lola está pensando', `"${texto.slice(0, 60)}${texto.length > 60 ? '…' : ''}"`);
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
          if (ultimo) { ultimo.className = 'step ok'; ultimo.querySelector('.res').textContent = '→ ' + ev.summary; }
          if (ev.name === 'buscar_propiedades' && ev.data?.resultados?.length) renderCards(ev.data.resultados);
        } else if (ev.t === 'reply' || ev.t === 'error') respuesta = ev;
      }
    }
  } catch (e) {
    respuesta = { t: 'error', text: e.message && e.message !== 'error' ? e.message : 'Uy, no pude conectarme. ¿Probás de nuevo?' };
  }
  typing.remove();
  pensando.className = 'step ok';
  respuesta = respuesta || { t: 'error', text: 'Uy, no pude conectarme. ¿Probás de nuevo?' };
  const meta = respuesta.ms ? `Lola · ${(respuesta.ms / 1000).toFixed(1)} s` : 'Lola';
  addMsg(respuesta.text, respuesta.t === 'error' ? 'bot err' : 'bot', meta);
  brainStep('💬', 'Respuesta enviada', respuesta.ms ? `en ${(respuesta.ms / 1000).toFixed(1)} s` : '', 'ok');
  $('#live').classList.remove('on');
  busy = false; $('#send').disabled = false;
  if (llamada) hablar(respuesta.text);
  else $('#input').focus();
}

$('#form').addEventListener('submit', e => { e.preventDefault(); const v = $('#input').value; $('#input').value = ''; enviar(v); });
$('#sugs').addEventListener('click', e => { if (e.target.classList.contains('sug')) enviar(e.target.textContent); });

addMsg('¡Hola! Soy Lola, de Litoral Propiedades 👋 Contame qué estás buscando (y cómo es tu vida: si tenés mascotas, si trabajás desde casa…) y te muestro lo que mejor te queda.', 'bot', 'Lola');

// --- Voz: Web Speech API (es-AR) ---
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let llamada = false, rec = null, voz = null;
function elegirVoz() {
  const vs = speechSynthesis.getVoices();
  voz = vs.find(v => v.lang === 'es-AR') || vs.find(v => v.lang === 'es-US') || vs.find(v => /^es/.test(v.lang) && /female|mujer|helena|sabina|paulina|monica/i.test(v.name)) || vs.find(v => /^es/.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { elegirVoz(); speechSynthesis.onvoiceschanged = elegirVoz; }

function setCall(txt, activo) { $('#callText').textContent = txt; $('#wave').classList.toggle('idle', !activo); }

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
    if (final.trim()) { setCall('Lola está pensando…', false); enviar(final); }
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
  setCall('🔊 Lola está hablando…', true);
  speechSynthesis.speak(u);
}

function cortar() {
  llamada = false;
  try { rec && rec.abort(); } catch {}
  speechSynthesis?.cancel();
  $('#btnCall').classList.remove('on'); $('#btnCall span').textContent = 'Llamar';
  $('#callbar').classList.remove('on');
}

$('#btnCall').addEventListener('click', () => {
  if (llamada) return cortar();
  if (!SR || !('speechSynthesis' in window)) {
    alert('Tu navegador no soporta voz 😕 Probá desde Google Chrome (compu o Android). Mientras, podés escribirle a Lola.');
    return;
  }
  llamada = true;
  $('#btnCall').classList.add('on'); $('#btnCall span').textContent = 'Cortar';
  $('#callbar').classList.add('on');
  hablar('Hola, soy Lola de Litoral Propiedades. ¿Qué estás buscando?');
});
