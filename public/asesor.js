// Copiloto Comercial: el asesor pregunta (voz o texto) y la IA responde con datos reales
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sid = 'asesor-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(16));
const msgs = $('#msgs'), brain = $('#brain');
let busy = false;
const ICON = { ver_leads: '👥', buscar_propiedades: '🏠', ver_visitas: '📅', ver_demanda: '🗺️', ver_metricas: '📊' };
const PREGUNTAS = [
  '¿A quién tengo que llamar primero hoy y por qué?',
  'Martina busca en Alberdi con perro, ¿qué le ofrezco?',
  '¿Qué zona tiene más demanda que oferta?',
  'Armame un WhatsApp para Diego que lo haga avanzar',
];

// Formato profesional: viñetas, negritas, "Próximo paso" y mensaje sugerido destacado
function formatear(texto) {
  const lineas = esc(texto).split('\n');
  let html = '', enLista = false;
  for (let l of lineas) {
    l = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const item = l.match(/^\s*[-•*]\s+(.*)/);
    if (item) { if (!enLista) { html += '<ul>'; enLista = true; } html += `<li>${item[1]}</li>`; continue; }
    if (enLista) { html += '</ul>'; enLista = false; }
    if (/^\s*(<b>)?Pr[oó]ximo paso/i.test(l)) html += `<span class="next">${l}</span>`;
    else if (/^\s*(&quot;|“).+(&quot;|”)\s*$/.test(l)) html += `<q>💬 ${l.trim()}</q>`;
    else if (l.trim()) html += l + '<br>';
  }
  if (enLista) html += '</ul>';
  return html;
}

function addMsg(html, quien, meta) {
  const d = document.createElement('div');
  d.className = 'msg ' + quien;
  d.style.whiteSpace = quien.includes('ans') ? 'normal' : 'pre-wrap';
  d.innerHTML = html + (meta ? `<span class="meta">${esc(meta)}</span>` : '');
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
function setQuick(lista) { $('#quick').innerHTML = lista.map(t => `<button type="button" class="chip">${esc(t)}</button>`).join(''); }
$('#quick').addEventListener('click', e => { if (e.target.classList.contains('chip')) preguntar(e.target.textContent); });

async function preguntar(texto) {
  texto = texto.trim();
  if (!texto || busy) return;
  busy = true; $('#send').disabled = true; $('#btnMic').disabled = true;
  setQuick([]);
  speechSynthesis?.cancel(); audioA?.pause();
  addMsg(esc(texto), 'user');
  const typing = addMsg('<span class="typing"><i></i><i></i><i></i></span> <small style="color:var(--muted)">analizando…</small>', 'bot');
  $('#live').classList.add('on');
  if (!brain.querySelector('.brain-empty') && brain.children.length) brain.insertAdjacentHTML('beforeend', '<div class="turn-sep"></div>');
  const p0 = brainStep('🧭', 'Entendiendo la pregunta', `"${texto.slice(0, 80)}"`);
  let ultimo = null, resp = null;
  try {
    const r = await fetch('/api/asesor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, mensaje: texto }) });
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
        p0.className = 'step ok';
        if (ev.t === 'tool') ultimo = brainStep(ICON[ev.name] || '⚙️', ev.label, ev.detail);
        else if (ev.t === 'tool_result') { if (ultimo) { ultimo.className = 'step ok'; ultimo.querySelector('.res').textContent = '✓ ' + ev.summary; } }
        else resp = ev;
      }
    }
  } catch (e) { resp = { t: 'error', text: e.message !== 'error' ? e.message : 'No pude conectar. Probá de nuevo.' }; }
  typing.remove(); p0.className = 'step ok';
  resp = resp || { t: 'error', text: 'No pude conectar. Probá de nuevo.' };
  brainStep('✍️', 'Redactando la recomendación', resp.ms ? `listo en ${(resp.ms / 1000).toFixed(1)} s` : '', 'ok');
  addMsg(formatear(resp.text), 'bot ans' + (resp.t === 'error' ? ' err' : ''), resp.ms ? `Copiloto · ${(resp.ms / 1000).toFixed(1)} s` : 'Copiloto');
  $('#live').classList.remove('on');
  busy = false; $('#send').disabled = false; $('#btnMic').disabled = false;
  setQuick(PREGUNTAS.filter(q => q !== texto).slice(0, 3));
  if ($('#leer').checked && resp.t !== 'error') leer(resp.text);
}

$('#form').addEventListener('submit', e => { e.preventDefault(); const v = $('#input').value; $('#input').value = ''; preguntar(v); });

// Voz: dictado es-AR y lectura de la respuesta
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let voz = null;
function elegirVoz() { const vs = speechSynthesis.getVoices(); voz = vs.find(v => v.lang === 'es-AR') || vs.find(v => v.lang === 'es-US') || vs.find(v => /^es/.test(v.lang)) || null; }
if ('speechSynthesis' in window) { elegirVoz(); speechSynthesis.onvoiceschanged = elegirVoz; }
let audioA = null;
async function leer(texto) {
  try {
    const r = await fetch('/api/voz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: texto.replace(/[*_#•]/g, '').replace(/^s*-s*/gm, ''), quien: 'asesor' }) });
    if (r.ok) { audioA?.pause(); audioA = new Audio(URL.createObjectURL(await r.blob())); return audioA.play(); }
  } catch {}
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(texto.replace(/[*_#•"“”]/g, '').replace(/^\s*-\s*/gm, ''));
  u.lang = voz?.lang || 'es-AR'; if (voz) u.voice = voz; u.rate = 1.05;
  speechSynthesis.speak(u);
}
$('#btnMic').addEventListener('click', () => {
  if (!SR) return alert('Tu navegador no permite dictar. Usá Google Chrome o escribí la pregunta.');
  if (busy) return;
  speechSynthesis?.cancel(); audioA?.pause();
  const r = new SR(), b = $('#btnMic'), input = $('#input');
  r.lang = 'es-AR'; r.interimResults = true;
  let final = '';
  b.classList.add('on'); b.textContent = '⏺ Escuchando… hablá tranquilo';
  r.onresult = e => { let t = ''; for (const x of e.results) { t += x[0].transcript; if (x.isFinal) final = t; } input.value = t; };
  r.onend = () => { b.classList.remove('on'); b.textContent = '🎤 Tocá y hacé tu pregunta'; if (final.trim()) { input.value = ''; preguntar(final); } };
  r.onerror = e => { if (e.error === 'not-allowed') alert('Necesito permiso para usar el micrófono.'); };
  try { r.start(); } catch {}
});

addMsg('Hola, soy el Copiloto Comercial. Tengo acceso en vivo a la cartera de clientes, el catálogo, la agenda de visitas y la demanda por zona.\nPreguntame lo que necesites para cerrar más operaciones: a quién llamar, qué ofrecerle a un cliente, cómo responder una objeción o dónde salir a captar.', 'bot', 'Copiloto');
setQuick(PREGUNTAS);
