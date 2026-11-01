// Panel del dueño: KPIs, leads, visitas, mapa de demanda y análisis de la IA
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vistos = new Set();
let primera = true;

let mapa = null, capa = null;
if (window.L) {
  mapa = L.map('mapa', { scrollWheelZoom: false, attributionControl: true }).setView([-32.935, -60.67], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap · © CARTO', maxZoom: 18 }).addTo(mapa);
  capa = L.layerGroup().addTo(mapa);
} else {
  $('#mapa').innerHTML = '<div class="ai-box" style="color:var(--muted)">No se pudo cargar el mapa (sin conexión al CDN).</div>';
}

const colorBrecha = b => b > 0.55 ? '#ff2e93' : b > 0.25 ? '#fbbf24' : '#34d399';
const hace = iso => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h ${m % 60} min`;
};

function render(d) {
  const k = d.kpis;
  $('#kConsultas').textContent = k.consultas;
  $('#kConsultasVivo').textContent = `${k.consultasVivo} en vivo hoy`;
  $('#kCalientes').textContent = k.calientes;
  $('#kVisitas').textContent = k.visitas;
  $('#kEspera').textContent = k.esperando2h;
  $('#kTiempo').textContent = k.tiempoRespuestaMs == null ? '–' : (k.tiempoRespuestaMs / 1000).toFixed(1) + ' s';
  $('#kTiempoN').textContent = k.respuestasMedidas ? `promedio de ${k.respuestasMedidas} respuestas en vivo` : 'se mide con cada respuesta';

  $('#leads').innerHTML = d.leads.map(l => {
    const nuevo = !primera && !vistos.has(l.id);
    vistos.add(l.id);
    return `<tr class="${nuevo ? 'new' : ''}">
      <td><span class="temp ${esc(l.temperatura)}">${l.temperatura === 'caliente' ? '🔥 ' : ''}${esc(l.temperatura)}</span></td>
      <td><b>${esc(l.nombre)}</b>${l.ejemplo ? '<span class="ej">ejemplo</span>' : ''}<br><small style="color:var(--muted)">${esc(l.telefono || 'sin teléfono')}</small></td>
      <td>${esc(l.operacion || '–')} · ${esc(l.zona || 'sin zona')}<br><small style="color:var(--muted)">${esc(l.presupuesto || '')}${l.ambientes ? ' · ' + esc(l.ambientes) + ' amb' : ''}${l.urgencia ? ' · ' + esc(l.urgencia) : ''}</small></td>
      <td>${esc(l.resumen)}</td>
      <td style="white-space:nowrap">${hace(l.creado)}${l.esperandoMin > 120 ? '<br><span class="wait">⚠ esperando</span>' : ''}</td></tr>`;
  }).join('');
  primera = false;

  $('#visitas').innerHTML = d.visitas.length ? d.visitas.map(v => `<div class="list-item"><b>${esc(v.cuando)}</b>${v.ejemplo ? '<span class="ej">ejemplo</span>' : ''}<small>${esc(v.propiedad_id)} · ${esc(v.propiedad)} — ${esc(v.lead)}</small></div>`).join('')
    : '<div class="list-item"><small>Todavía no hay visitas.</small></div>';

  if (capa) {
    capa.clearLayers();
    d.mapa.forEach(z => {
      const c = L.circleMarker([z.lat, z.lng], { radius: 10 + z.consultas * 1.3, color: colorBrecha(z.brecha), fillColor: colorBrecha(z.brecha), fillOpacity: .35, weight: 2 });
      c.bindTooltip(`<b>${esc(z.zona)}</b><br>${z.consultas} consultas (${z.vivo} en vivo)<br>Oferta: ${z.oferta.alquiler} alquiler · ${z.oferta.venta} venta${z.insatisfecha ? `<br>${z.insatisfecha} búsquedas sin resultado` : ''}`, { direction: 'top' });
      L.marker([z.lat, z.lng], { icon: L.divIcon({ className: '', html: `<div style="color:#fff;font:700 11px Inter,sans-serif;text-shadow:0 1px 3px #000;transform:translate(-50%,-50%);white-space:nowrap">${esc(z.zona)}</div>` }), interactive: false }).addTo(capa);
      c.addTo(capa);
    });
  }
}

async function cargar() {
  try { const r = await fetch('/api/panel'); render(await r.json()); } catch {}
}
cargar();
setInterval(cargar, 4000);

$('#btnAnalisis').addEventListener('click', async () => {
  const b = $('#btnAnalisis'), box = $('#analisis');
  b.disabled = true; b.textContent = '🧠 Analizando…';
  box.style.color = 'var(--muted)'; box.textContent = 'La IA está cruzando demanda contra oferta…';
  try {
    const r = await fetch('/api/analisis', { method: 'POST' });
    const j = await r.json();
    box.style.color = '';
    box.innerHTML = esc(j.texto || j.error).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  } catch { box.textContent = 'No pude conectar, probá de nuevo.'; }
  b.disabled = false; b.textContent = '🧠 Análisis de la IA';
});
