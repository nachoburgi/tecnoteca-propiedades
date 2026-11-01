// Litoral Propiedades · Lola, agente de IA inmobiliario
// Node + Express, datos en memoria. La clave de la IA vive solo en .env (servidor).
const fs = require('fs');
const path = require('path');
const express = require('express');

// --- .env mínimo (sin dependencias) ---
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const AI = {
  provider: (process.env.AI_PROVIDER || 'mock').toLowerCase(),
  base: (process.env.AI_BASE_URL || '').replace(/\/+$/, ''),
  key: process.env.AI_API_KEY || '',
  model: process.env.AI_MODEL || '',
  timeoutMs: Number(process.env.AI_TIMEOUT_MS || 30000),
};
if (!AI.key && AI.provider !== 'mock') AI.provider = 'mock';
const PORT = Number(process.env.PORT || 3000);
const WHATSAPP = (process.env.WHATSAPP_NUMERO || '').replace(/\D/g, '');

// --- Datos ---
const PROPIEDADES = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'propiedades.json'), 'utf8'));
const ZONAS = {
  Centro: [-32.9468, -60.6393], Pichincha: [-32.9395, -60.6505], Echesortu: [-32.9550, -60.6650],
  Fisherton: [-32.9300, -60.7300], Alberdi: [-32.8880, -60.6930], Abasto: [-32.9590, -60.6440],
};
const ESTILOS = ['home office', 'familia', 'mascotas', 'vida nocturna', 'silencioso', 'verde', 'running', 'río', 'transporte', 'luminoso', 'patio', 'balcón', 'diseño', 'moderno', 'estudiante', 'económico', 'inversión', 'escuelas', 'gastronomía', 'centro'];

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const zonaCanon = z => Object.keys(ZONAS).find(k => norm(k) === norm(z)) || null;
const hace = min => new Date(Date.now() - min * 60000).toISOString();

// Datos precargados de ejemplo (se marcan como "ejemplo" en el panel)
const leads = [
  { id: 'L-E1', nombre: 'Martina G.', telefono: '341 555-0101', operacion: 'alquiler', zona: 'Alberdi', presupuesto: 'ARS 700.000', ambientes: 2, urgencia: 'este mes', temperatura: 'caliente', resumen: 'Pareja con perro, quiere estar cerca de la costa.', estado: 'esperando', creado: hace(190), ejemplo: true },
  { id: 'L-E2', nombre: 'Diego R.', telefono: '341 555-0102', operacion: 'venta', zona: 'Fisherton', presupuesto: 'USD 250.000', ambientes: 4, urgencia: '3 meses', temperatura: 'tibio', resumen: 'Familia con dos hijos, busca casa con patio y escuelas cerca.', estado: 'esperando', creado: hace(240), ejemplo: true },
  { id: 'L-E3', nombre: 'Sofía L.', telefono: '', operacion: 'alquiler', zona: 'Pichincha', presupuesto: 'ARS 600.000', ambientes: 1, urgencia: '', temperatura: 'frio', resumen: 'Estudiante, consulta general de precios.', estado: 'respondido', creado: hace(60), ejemplo: true },
  { id: 'L-E4', nombre: 'Hernán P.', telefono: '341 555-0104', operacion: 'venta', zona: 'Centro', presupuesto: 'USD 150.000', ambientes: 3, urgencia: 'ya', temperatura: 'caliente', resumen: 'Quiere vista al río y cochera. Pidió visita.', estado: 'respondido', creado: hace(35), ejemplo: true },
];
const visitas = [
  { id: 'V-E1', propiedad_id: 'LP-10', lead: 'Hernán P.', fecha_hora: new Date(Date.now() + 26 * 3600e3).toISOString(), ejemplo: true },
];
// Demanda por zona: base de ejemplo + lo que entra en vivo por el chat
const demanda = {
  Centro: { ejemplo: 14, vivo: 0, insatisfecha: 0 }, Pichincha: { ejemplo: 18, vivo: 0, insatisfecha: 0 },
  Echesortu: { ejemplo: 6, vivo: 0, insatisfecha: 0 }, Fisherton: { ejemplo: 11, vivo: 0, insatisfecha: 0 },
  Alberdi: { ejemplo: 16, vivo: 0, insatisfecha: 0 }, Abasto: { ejemplo: 5, vivo: 0, insatisfecha: 0 },
};
const stats = { consultas: 0, tiempos: [] };
const sesiones = new Map();

function getSesion(id) {
  if (!sesiones.has(id)) {
    sesiones.set(id, { history: [], leadId: null, userTexts: [], vistos: new Set(), creado: Date.now() });
    stats.consultas++;
  }
  return sesiones.get(id);
}

// --- Herramientas del agente ---
const TOOLS = [
  {
    name: 'buscar_propiedades',
    description: 'Busca en el catálogo real de Litoral Propiedades. Usala SIEMPRE antes de recomendar. Si no hay en la zona pedida devuelve alternativas de otras zonas.',
    parameters: {
      type: 'object',
      properties: {
        operacion: { type: 'string', enum: ['venta', 'alquiler'] },
        tipo: { type: 'string', enum: ['departamento', 'casa', 'ph', 'monoambiente'] },
        zona: { type: 'string', enum: Object.keys(ZONAS) },
        ambientes_min: { type: 'integer' },
        precio_max: { type: 'number', description: 'Venta en USD; alquiler en ARS por mes' },
        mascotas: { type: 'boolean' },
        cochera: { type: 'boolean' },
        estilo_vida: { type: 'array', items: { type: 'string', enum: ESTILOS } },
      },
    },
  },
  {
    name: 'crear_lead',
    description: 'Registra o actualiza el lead de esta conversación (uno solo por conversación).',
    parameters: {
      type: 'object',
      properties: {
        nombre: { type: 'string' }, telefono: { type: 'string' },
        operacion: { type: 'string', enum: ['venta', 'alquiler'] }, zona: { type: 'string' },
        presupuesto: { type: 'string' }, ambientes: { type: 'integer' }, urgencia: { type: 'string' },
        temperatura: { type: 'string', enum: ['caliente', 'tibio', 'frio'] },
        resumen: { type: 'string', description: 'Una o dos frases para el asesor humano' },
      },
      required: ['temperatura', 'resumen'],
    },
  },
  {
    name: 'agendar_visita',
    description: 'Agenda una visita a una propiedad del catálogo.',
    parameters: {
      type: 'object',
      properties: {
        propiedad_id: { type: 'string', description: 'Ej: LP-04' },
        fecha_hora: { type: 'string', description: 'ISO 8601 con zona -03:00, ej 2026-11-02T18:00:00-03:00' },
      },
      required: ['propiedad_id', 'fecha_hora'],
    },
  },
];

const fmtPrecio = p => p.moneda === 'USD' ? `USD ${p.precio.toLocaleString('es-AR')}` : `$${p.precio.toLocaleString('es-AR')}/mes`;

function buscarPropiedades(a, ses, registrarDemanda = true) {
  const estilos = (Array.isArray(a.estilo_vida) ? a.estilo_vida : []).map(norm).filter(e => ESTILOS.map(norm).includes(e));
  const zona = a.zona ? zonaCanon(a.zona) : null;
  const filtrar = (conZona, precioExtra = 1) => PROPIEDADES.filter(p =>
    (!a.operacion || p.operacion === a.operacion) &&
    (!a.tipo || p.tipo === a.tipo) &&
    (!a.ambientes_min || p.ambientes >= Number(a.ambientes_min)) &&
    (!a.precio_max || p.precio <= Number(a.precio_max) * precioExtra) &&
    (a.mascotas !== true || p.mascotas) &&
    (a.cochera !== true || p.cochera) &&
    (!conZona || !zona || p.zona === zona));
  const puntuar = lista => lista.map(p => {
    const coinciden = p.estilo_vida.filter(e => estilos.includes(norm(e)));
    return { p, coinciden, score: coinciden.length };
  }).sort((x, y) => y.score - x.score || x.p.precio - y.p.precio);

  let res = puntuar(filtrar(true));
  let nota = '';
  let alternativas = false;
  if (zona && res.length === 0) {
    if (registrarDemanda) demanda[zona].insatisfecha++;
    res = puntuar(filtrar(false));
    alternativas = true;
    nota = `No hay propiedades en ${zona} con esos criterios. Estas son alternativas de otras zonas: avisale al cliente.`;
  }
  if (res.length === 0 && a.precio_max) {
    res = puntuar(filtrar(!alternativas, 1.2));
    if (res.length) nota = 'No hay dentro del presupuesto exacto; estas se pasan hasta un 20%. Avisale al cliente.';
  }
  res = res.slice(0, 3);
  // Demanda en vivo: zona pedida, o la de la mejor coincidencia
  const zonaDemanda = zona || (res[0] && res[0].p.zona);
  if (zonaDemanda && registrarDemanda) demanda[zonaDemanda].vivo++;
  res.forEach(r => ses.vistos.add(r.p.id));
  return {
    total: res.length, alternativas, nota,
    resultados: res.map(r => ({
      id: r.p.id, titulo: r.p.titulo, zona: r.p.zona, operacion: r.p.operacion, tipo: r.p.tipo, ambientes: r.p.ambientes,
      m2: r.p.m2, precio: fmtPrecio(r.p), mascotas: r.p.mascotas, cochera: r.p.cochera,
      estilo_vida: r.p.estilo_vida, coincide_con: r.coinciden, descripcion: r.p.descripcion, foto: r.p.foto, direccion: r.p.direccion,
    })),
  };
}

function crearLead(a, ses) {
  const temperatura = ['caliente', 'tibio', 'frio'].includes(a.temperatura) ? a.temperatura : 'tibio';
  const datos = {
    nombre: String(a.nombre || '').slice(0, 80), telefono: String(a.telefono || '').slice(0, 40),
    operacion: a.operacion === 'venta' || a.operacion === 'alquiler' ? a.operacion : '',
    zona: String(a.zona || '').slice(0, 40), presupuesto: String(a.presupuesto || '').slice(0, 60),
    ambientes: Number(a.ambientes) || null, urgencia: String(a.urgencia || '').slice(0, 60),
    temperatura, resumen: String(a.resumen || '').slice(0, 400),
  };
  let lead = ses.leadId && leads.find(l => l.id === ses.leadId);
  if (lead) {
    for (const [k, v] of Object.entries(datos)) if (v) lead[k] = v;
    lead.actualizado = new Date().toISOString();
    return { ok: true, actualizado: true, id: lead.id, temperatura: lead.temperatura };
  }
  lead = { id: 'L-' + (leads.length + 1), ...datos, nombre: datos.nombre || 'Cliente web', estado: 'respondido', creado: new Date().toISOString(), ejemplo: false };
  leads.push(lead);
  ses.leadId = lead.id;
  return { ok: true, actualizado: false, id: lead.id, temperatura };
}

function agendarVisita(a, ses) {
  const prop = PROPIEDADES.find(p => p.id === String(a.propiedad_id || '').toUpperCase());
  if (!prop) return { ok: false, error: 'No existe esa propiedad en el catálogo.' };
  const fecha = new Date(a.fecha_hora);
  if (isNaN(fecha)) return { ok: false, error: 'Fecha inválida, pedile al cliente día y hora.' };
  const lead = ses.leadId && leads.find(l => l.id === ses.leadId);
  const v = { id: 'V-' + (visitas.length + 1), propiedad_id: prop.id, lead: lead ? lead.nombre : 'Cliente web', fecha_hora: fecha.toISOString(), ejemplo: false };
  visitas.push(v);
  if (lead) lead.temperatura = 'caliente';
  return { ok: true, visita: v.id, propiedad: prop.titulo, direccion: prop.direccion, cuando: fechaLinda(fecha) };
}

const fechaLinda = d => d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

function ejecutarTool(nombre, args, ses) {
  if (nombre === 'buscar_propiedades') return buscarPropiedades(args, ses);
  if (nombre === 'crear_lead') return crearLead(args, ses);
  if (nombre === 'agendar_visita') return agendarVisita(args, ses);
  return { error: 'Herramienta desconocida' };
}

// Texto para el "cerebro visible"
function describirTool(nombre, a) {
  if (nombre === 'buscar_propiedades') {
    const partes = [];
    if (a.operacion) partes.push(a.operacion);
    if (a.tipo) partes.push(a.tipo);
    if (a.zona) partes.push('zona: ' + a.zona);
    if (a.ambientes_min) partes.push(a.ambientes_min + '+ amb');
    if (a.precio_max) partes.push('hasta ' + Number(a.precio_max).toLocaleString('es-AR'));
    if (a.mascotas) partes.push('mascotas: sí');
    if (a.cochera) partes.push('cochera: sí');
    if (a.estilo_vida && a.estilo_vida.length) partes.push('estilo: ' + a.estilo_vida.join(', '));
    return { label: 'Buscando propiedades en el catálogo', detail: partes.join(' · ') || 'todas las opciones' };
  }
  if (nombre === 'crear_lead') return { label: 'Anotando tu consulta para un asesor', detail: `${a.nombre || 'Cliente web'} · interés ${a.temperatura || ''}` };
  if (nombre === 'agendar_visita') return { label: 'Reservando tu visita', detail: `${a.propiedad_id} · ${fechaLinda(new Date(a.fecha_hora))}` };
  return { label: nombre, detail: '' };
}
function resumirResultado(nombre, r) {
  if (nombre === 'buscar_propiedades') return r.alternativas ? `No hay en esa zona → encontró ${r.total} parecidas cerca` : `Encontró ${r.total} que te quedan bien`;
  if (nombre === 'crear_lead') return r.actualizado ? `Consulta actualizada · interés ${r.temperatura}` : `Consulta anotada · interés ${r.temperatura}`;
  if (nombre === 'agendar_visita') return r.ok ? `Visita confirmada: ${r.cuando}` : r.error;
  return '';
}

function systemPrompt() {
  const ahora = new Date();
  return `Sos Lola, la secretaria de Litoral Propiedades, una inmobiliaria familiar de Rosario, Santa Fe. Atendés por chat, por audio y por teléfono a cualquier hora.
Personalidad: una secretaria rosarina con años en la inmobiliaria, muy amable, paciente y cercana; se nota que le importa la persona. Hablás como una persona real, no como un sistema: nada de "como asistente virtual", "procesando", "según mi base de datos" ni frases de manual. Usá expresiones naturales ("¡Qué lindo!", "Quedate tranquilo/a", "Te entiendo", "Mirá, tengo justo algo que te puede gustar"). Si sabés el nombre de la persona, usalo. Si cuenta algo personal (se muda por trabajo, se separa, viene un bebé), reconocelo con empatía en media frase antes de seguir. Tratá con el mismo respeto y paciencia a un chico de 15 que a alguien de 70.
Estilo: español rioplatense (vos), cálido y claro. MÁXIMO 3 oraciones cortas por respuesta, porque muchas veces te escuchan en audio: sin listas, sin markdown, sin emojis.
Reglas:
1) Nunca inventes propiedades, precios ni características: usá siempre buscar_propiedades antes de recomendar. Las tarjetas con el detalle aparecen solas en la pantalla, así que nombrá como mucho 2 propiedades y explicá en una frase por qué encajan con lo que te contó.
2) Traducí lo que cuenta el cliente a etiquetas de estilo_vida (ej.: "tengo un perro" → mascotas y mascotas=true; "corro por la costa" o "cerca del río" → río, running; "trabajo desde casa" → home office; "tengo hijos" → familia, escuelas).
3) Preguntá de a una cosa por vez.
4) Registrá el lead con crear_lead apenas sepas qué busca (aunque falte el nombre) y volvé a llamarla para actualizarlo cuando te dé nombre, teléfono o cambie algo. Temperatura: caliente = presupuesto claro y urgencia, o quiere visitar; tibio = explora pero da datos; frio = consulta vaga.
5) Si quiere visitar, pedí día y hora (y su nombre si no lo tenés) y usá agendar_visita con fecha ISO en hora de Argentina (-03:00).
6) Honorarios, comisiones, temas legales, garantías o financiación: decí que eso lo confirma un asesor humano.
Zonas que trabajamos: ${Object.keys(ZONAS).join(', ')}. Venta en USD, alquiler en pesos por mes.
Ahora es ${fechaLinda(ahora)} (${ahora.toISOString()}).`;
}

// --- Adaptador de IA (openai | anthropic | mock) ---
async function postJSON(url, headers, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(AI.timeoutMs) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`IA ${r.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}
const endpoint = suf => AI.base.endsWith(suf) ? AI.base : AI.base + suf;

const providers = {
  openai: {
    async call(history, { system, tools, maxTokens = 600 }) {
      const body = { model: AI.model, messages: [{ role: 'system', content: system }, ...history], max_tokens: maxTokens };
      if (tools) { body.tools = tools.map(t => ({ type: 'function', function: t })); body.tool_choice = 'auto'; }
      const j = await postJSON(endpoint('/chat/completions'), { Authorization: `Bearer ${AI.key}` }, body);
      const m = j.choices[0].message;
      const toolCalls = (m.tool_calls || []).map(tc => {
        let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
        return { id: tc.id, name: tc.function.name, args };
      });
      const msg = { role: 'assistant', content: m.content || '' };
      if (m.tool_calls && m.tool_calls.length) msg.tool_calls = m.tool_calls;
      return { text: m.content || '', toolCalls, assistantMsg: msg };
    },
    user: text => ({ role: 'user', content: text }),
    toolResults: results => results.map(r => ({ role: 'tool', tool_call_id: r.id, content: JSON.stringify(r.result) })),
  },
  anthropic: {
    async call(history, { system, tools, maxTokens = 600 }) {
      const body = { model: AI.model, max_tokens: maxTokens, system, messages: history };
      if (tools) body.tools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
      const j = await postJSON(endpoint('/v1/messages'), { 'x-api-key': AI.key, 'anthropic-version': '2023-06-01' }, body);
      const text = j.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      const toolCalls = j.content.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, args: b.input || {} }));
      return { text, toolCalls, assistantMsg: { role: 'assistant', content: j.content } };
    },
    user: text => ({ role: 'user', content: text }),
    toolResults: results => [{ role: 'user', content: results.map(r => ({ type: 'tool_result', tool_use_id: r.id, content: JSON.stringify(r.result) })) }],
  },
};

async function textoIA(system, prompt, maxTokens = 500) {
  if (AI.provider === 'mock') return null;
  const p = providers[AI.provider];
  const r = await p.call([p.user(prompt)], { system, maxTokens });
  return r.text.trim();
}

// Modo mock: reglas simples para probar la interfaz sin clave
function mockAgente(texto, ses, emit) {
  const t = norm(texto);
  const a = { estilo_vida: [] };
  if (/alquil/.test(t)) a.operacion = 'alquiler'; else if (/compr|venta/.test(t)) a.operacion = 'venta';
  for (const z of Object.keys(ZONAS)) if (t.includes(norm(z))) a.zona = z;
  if (/perro|gato|mascota/.test(t)) { a.mascotas = true; a.estilo_vida.push('mascotas'); }
  if (/rio|costa/.test(t)) a.estilo_vida.push('río', 'running');
  if (/desde casa|home office|remoto/.test(t)) a.estilo_vida.push('home office');
  const d = describirTool('buscar_propiedades', a);
  emit({ t: 'tool', name: 'buscar_propiedades', ...d });
  const r = buscarPropiedades(a, ses);
  emit({ t: 'tool_result', name: 'buscar_propiedades', summary: resumirResultado('buscar_propiedades', r), data: r });
  if (!r.total) return 'Mirá, con eso justo no tengo nada ahora, pero no te preocupes. ¿Me contás un poquito más qué necesitás así te busco la mejor opción?';
  return `¡Qué lindo lo que me contás! Mirá, tengo justo algo que te puede gustar: ${r.resultados[0].titulo}, a ${r.resultados[0].precio}. Te dejé las fotos al lado; ¿querés que te reserve una visita para conocerla?`;
}

// Bucle de agente genérico: sirve para Lola (clientes) y para el Copiloto (asesores)
const LOLA = { system: () => systemPrompt(), tools: TOOLS, ejecutar: ejecutarTool, describir: describirTool, resumir: resumirResultado, mock: mockAgente, maxTokens: 600, fallback: 'Dame un segundito que lo reviso con un asesor y te confirmo.' };

async function correrAgente(ses, texto, emit, cfg = LOLA) {
  if (AI.provider === 'mock') return cfg.mock(texto, ses, emit);
  const p = providers[AI.provider];
  ses.histLen = ses.history.length;
  ses.history.push(p.user(texto));
  for (let i = 0; i < 7; i++) {
    const r = await p.call(ses.history, { system: cfg.system(), tools: cfg.tools, maxTokens: cfg.maxTokens });
    ses.history.push(r.assistantMsg);
    if (!r.toolCalls.length) return r.text.trim();
    const results = [];
    for (const tc of r.toolCalls) {
      emit({ t: 'tool', name: tc.name, ...cfg.describir(tc.name, tc.args) });
      let result;
      try { result = cfg.ejecutar(tc.name, tc.args, ses); } catch (e) { result = { error: 'Falló la herramienta' }; }
      emit({ t: 'tool_result', name: tc.name, summary: cfg.resumir(tc.name, result), data: result });
      results.push({ id: tc.id, result });
    }
    ses.history.push(...p.toolResults(results));
  }
  return cfg.fallback;
}

// --- Copiloto comercial para asesores ---
const TOOLS_ASESOR = [
  { name: 'ver_leads', description: 'Lista los leads (clientes interesados) con temperatura, zona, presupuesto, resumen, teléfono y minutos esperando respuesta humana.', parameters: { type: 'object', properties: { temperatura: { type: 'string', enum: ['caliente', 'tibio', 'frio'] }, zona: { type: 'string' }, operacion: { type: 'string', enum: ['venta', 'alquiler'] }, nombre: { type: 'string', description: 'Filtra por nombre (parcial)' } } } },
  { name: 'buscar_propiedades', description: 'Busca en el catálogo de la inmobiliaria con los mismos filtros que usa Lola.', parameters: TOOLS[0].parameters },
  { name: 'ver_visitas', description: 'Visitas agendadas con fecha, propiedad y cliente.', parameters: { type: 'object', properties: {} } },
  { name: 'ver_demanda', description: 'Demanda (consultas) vs oferta del catálogo por zona, y búsquedas sin resultado.', parameters: { type: 'object', properties: {} } },
  { name: 'ver_metricas', description: 'KPIs del día: consultas, leads calientes, visitas, esperando más de 2 h, tiempo de respuesta.', parameters: { type: 'object', properties: {} } },
];

function ejecutarAsesor(nombre, a) {
  if (nombre === 'ver_leads') {
    return leadsOrdenados().filter(l =>
      (!a.temperatura || l.temperatura === a.temperatura) && (!a.operacion || l.operacion === a.operacion) &&
      (!a.zona || norm(l.zona) === norm(a.zona)) && (!a.nombre || norm(l.nombre).includes(norm(a.nombre))))
      .map(({ ejemplo, ...l }) => l);
  }
  if (nombre === 'buscar_propiedades') return buscarPropiedades(a, { vistos: new Set() }, false);
  if (nombre === 'ver_visitas') return visitas.map(v => ({ ...v, propiedad: (PROPIEDADES.find(p => p.id === v.propiedad_id) || {}).titulo, cuando: fechaLinda(new Date(v.fecha_hora)) }));
  if (nombre === 'ver_demanda') return mapaDemanda().map(({ lat, lng, ...z }) => z);
  if (nombre === 'ver_metricas') return kpis();
  return { error: 'Herramienta desconocida' };
}
const LABEL_ASESOR = { ver_leads: 'Revisando la cartera de clientes', buscar_propiedades: 'Cruzando con el catálogo', ver_visitas: 'Mirando la agenda de visitas', ver_demanda: 'Analizando demanda vs. oferta por zona', ver_metricas: 'Leyendo las métricas del día' };
const COPILOTO = {
  system: () => `Sos el Copiloto Comercial de Litoral Propiedades (Rosario): pensás como un gerente comercial senior con 20 años en el mercado inmobiliario rosarino. Le respondés a un asesor del equipo, de colega a colega.
Cómo trabajás:
- Antes de responder, consultá SIEMPRE los datos reales con las herramientas (leads, catálogo, visitas, demanda, métricas). Nunca respondas genérico ni de memoria, y nunca inventes datos.
- Razoná como un profesional: priorizá por temperatura, urgencia y tiempo de espera; cruzá lo que pide cada cliente con lo que hay en el catálogo (citá propiedades por ID y precio); detectá riesgos (clientes esperando, falta de oferta).
- Formato: primera frase = la conclusión. Después 2 a 4 viñetas cortas con el porqué, apoyado en datos concretos (nombres, números). Cerrá con una línea "Próximo paso:" con una acción concreta. Si sirve, sumá un mensaje listo para mandarle al cliente por WhatsApp entre comillas.
- Tono: español rioplatense profesional, seguro y humano. Sin muletillas, sin emojis, sin frases de manual. Máximo ~170 palabras salvo que te pidan detalle.
- Temas legales, impositivos o de crédito: orientá en términos generales y recomendá validarlo con escribano o contador.
Ahora es ${fechaLinda(new Date())}.`,
  tools: TOOLS_ASESOR, ejecutar: ejecutarAsesor,
  describir: (n, a) => ({ label: LABEL_ASESOR[n] || n, detail: Object.entries(a || {}).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ') || 'todo' }),
  resumir: (n, r) => Array.isArray(r) ? `${r.length} registro${r.length === 1 ? '' : 's'}` : n === 'buscar_propiedades' ? `${r.total} propiedades` : 'listo',
  mock: (texto, ses, emit) => {
    emit({ t: 'tool', name: 'ver_leads', label: LABEL_ASESOR.ver_leads, detail: 'temperatura: caliente' });
    const r = ejecutarAsesor('ver_leads', { temperatura: 'caliente' });
    emit({ t: 'tool_result', name: 'ver_leads', summary: `${r.length} registros`, data: r });
    return `(modo demo sin IA) Tenés ${r.length} leads calientes. Empezá por ${r[0] ? r[0].nombre : '—'}.\nPróximo paso: llamalo hoy.`;
  },
  maxTokens: 900,
  fallback: 'No llegué a cerrar el análisis; reformulame la pregunta más acotada y lo vemos.',
};

// --- App ---
const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'panel.html')));
app.get('/asesor', (req, res) => res.sendFile(path.join(__dirname, 'public', 'asesor.html')));

const validSid = s => typeof s === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(s);

app.get('/api/salud', (req, res) => res.json({ ok: true, ia: AI.provider, modelo: AI.model || null }));

app.post('/api/chat', async (req, res) => {
  const { sessionId, mensaje } = req.body || {};
  if (!validSid(sessionId) || typeof mensaje !== 'string' || !mensaje.trim() || mensaje.length > 1000) {
    return res.status(400).json({ error: 'Mensaje inválido' });
  }
  const ses = getSesion(sessionId);
  if (ses.busy) return res.status(429).json({ error: 'Esperá que Lola termine de responder 🙂' });
  ses.busy = true;
  ses.userTexts.push(mensaje.trim());
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  const emit = e => res.write(JSON.stringify(e) + '\n');
  const t0 = Date.now();
  emit({ t: 'thinking' });
  try {
    const texto = await correrAgente(ses, mensaje.trim(), emit);
    const ms = Date.now() - t0;
    stats.tiempos.push(ms);
    emit({ t: 'reply', text: texto || '¿Me lo repetís?', ms });
  } catch (e) {
    console.error('[chat]', e.message);
    // Si la IA falla, se descarta el último turno para no romper el historial
    ses.history.length = ses.histLen || 0;
    emit({ t: 'error', text: 'Uy, se me cortó la conexión un segundo. ¿Me lo repetís?' });
  } finally {
    ses.busy = false;
    res.end();
  }
});

// Copiloto de asesores: mismo streaming, otras herramientas y otra personalidad
const sesionesAsesor = new Map();
app.post('/api/asesor', async (req, res) => {
  const { sessionId, mensaje } = req.body || {};
  if (!validSid(sessionId) || typeof mensaje !== 'string' || !mensaje.trim() || mensaje.length > 1500) {
    return res.status(400).json({ error: 'Mensaje inválido' });
  }
  if (!sesionesAsesor.has(sessionId)) sesionesAsesor.set(sessionId, { history: [] });
  const ses = sesionesAsesor.get(sessionId);
  if (ses.busy) return res.status(429).json({ error: 'Todavía estoy analizando la pregunta anterior.' });
  ses.busy = true;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  const emit = e => res.write(JSON.stringify(e) + '\n');
  const t0 = Date.now();
  emit({ t: 'thinking' });
  try {
    const texto = await correrAgente(ses, mensaje.trim(), emit, COPILOTO);
    emit({ t: 'reply', text: texto || 'No tengo una respuesta clara con estos datos.', ms: Date.now() - t0 });
  } catch (e) {
    console.error('[asesor]', e.message);
    ses.history.length = ses.histLen || 0;
    emit({ t: 'error', text: 'Se cortó la conexión con la IA. Probá de nuevo en un momento.' });
  } finally {
    ses.busy = false;
    res.end();
  }
});

// Resumen de la conversación para seguir por WhatsApp
app.get('/api/resumen/:sid', (req, res) => {
  if (!validSid(req.params.sid) || !sesiones.has(req.params.sid)) return res.json({ texto: '', numero: WHATSAPP });
  const ses = sesiones.get(req.params.sid);
  const lead = ses.leadId && leads.find(l => l.id === ses.leadId);
  const props = [...ses.vistos].map(id => PROPIEDADES.find(p => p.id === id)).filter(Boolean).slice(0, 3);
  const vis = visitas.filter(v => lead && !v.ejemplo && v.lead === lead.nombre);
  const lineas = ['Hola Litoral Propiedades! Vengo de hablar con Lola en la web 🏠'];
  if (lead) lineas.push('Busco: ' + lead.resumen);
  if (props.length) lineas.push('Me interesaron: ' + props.map(p => p.id + ' ' + p.titulo).join(' / '));
  vis.forEach(v => lineas.push('Visita agendada: ' + v.propiedad_id + ', ' + fechaLinda(new Date(v.fecha_hora))));
  res.json({ texto: lineas.join('\n'), numero: WHATSAPP });
});

app.post('/api/escena', async (req, res) => {
  const { sessionId, propiedad_id } = req.body || {};
  const prop = PROPIEDADES.find(p => p.id === propiedad_id);
  if (!prop || !validSid(sessionId)) return res.status(400).json({ error: 'Datos inválidos' });
  const ses = getSesion(sessionId);
  const contado = ses.userTexts.slice(-6).join(' / ') || 'No contó detalles personales.';
  const ficha = { titulo: prop.titulo, zona: prop.zona, direccion: prop.direccion, tipo: prop.tipo, ambientes: prop.ambientes, m2: prop.m2, mascotas: prop.mascotas, cochera: prop.cochera, estilo_vida: prop.estilo_vida, descripcion: prop.descripcion };
  try {
    const texto = await textoIA(
      'Sos una narradora cálida en español rioplatense. Escribís en segunda persona (vos) una escena de unas 110 palabras: un día de esta persona viviendo en esta propiedad, de la mañana a la noche. Usá SOLO características que estén en la ficha y lo que contó el cliente; no inventes ambientes, vistas ni amenities que no figuren. Un solo párrafo, sin título ni emojis.',
      `FICHA: ${JSON.stringify(ficha)}\nLO QUE CONTÓ EL CLIENTE: ${contado}`, 400);
    res.json({ texto: texto || `Imaginate arrancando el día en ${prop.titulo.toLowerCase()}: ${prop.descripcion} (modo demo sin IA)` });
  } catch (e) {
    console.error('[escena]', e.message);
    res.status(502).json({ error: 'La IA no respondió a tiempo, probá de nuevo.' });
  }
});

function ofertaPorZona() {
  const o = {};
  for (const z of Object.keys(ZONAS)) o[z] = { alquiler: 0, venta: 0 };
  for (const p of PROPIEDADES) o[p.zona][p.operacion]++;
  return o;
}
function mapaDemanda() {
  const oferta = ofertaPorZona();
  return Object.entries(ZONAS).map(([zona, [lat, lng]]) => {
    const d = demanda[zona];
    const consultas = d.ejemplo + d.vivo;
    const of = oferta[zona].alquiler + oferta[zona].venta;
    const brecha = Math.max(0, Math.min(1, (consultas + d.insatisfecha * 3) / (of * 6 + 1) - 0.4));
    return { zona, lat, lng, consultas, vivo: d.vivo, insatisfecha: d.insatisfecha, oferta: oferta[zona], brecha: Math.round(brecha * 100) / 100 };
  });
}

function leadsOrdenados() {
  const orden = { caliente: 0, tibio: 1, frio: 2 };
  const ahora = Date.now();
  return [...leads].sort((a, b) => orden[a.temperatura] - orden[b.temperatura] || new Date(b.creado) - new Date(a.creado))
    .map(l => ({ ...l, esperandoMin: l.estado === 'esperando' ? Math.round((ahora - new Date(l.creado)) / 60000) : 0 }));
}
function kpis() {
  const prom = stats.tiempos.length ? Math.round(stats.tiempos.reduce((a, b) => a + b, 0) / stats.tiempos.length) : null;
  return {
    consultas: stats.consultas + leads.filter(l => l.ejemplo).length,
    consultasVivo: stats.consultas,
    calientes: leads.filter(l => l.temperatura === 'caliente').length,
    visitas: visitas.length,
    esperando2h: leadsOrdenados().filter(l => l.esperandoMin > 120).length,
    tiempoRespuestaMs: prom,
    respuestasMedidas: stats.tiempos.length,
  };
}

app.get('/api/panel', (req, res) => {
  res.json({
    kpis: kpis(),
    leads: leadsOrdenados(),
    visitas: visitas.map(v => ({ ...v, propiedad: (PROPIEDADES.find(p => p.id === v.propiedad_id) || {}).titulo, cuando: fechaLinda(new Date(v.fecha_hora)) }))
      .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora)),
    mapa: mapaDemanda(),
  });
});

app.post('/api/analisis', async (req, res) => {
  const datos = mapaDemanda().map(z => ({ zona: z.zona, consultas: z.consultas, busquedas_sin_resultado: z.insatisfecha, oferta_alquiler: z.oferta.alquiler, oferta_venta: z.oferta.venta }));
  const pedidos = leads.slice(-12).map(l => `${l.operacion || '?'} en ${l.zona || '?'} (${l.presupuesto || 's/presupuesto'}): ${l.resumen}`);
  try {
    const texto = await textoIA(
      'Sos analista comercial de una inmobiliaria de Rosario. Hablás en español rioplatense, directo al dueño. Respondé en 3 partes cortas con estos títulos exactos en negrita: **Qué captar primero**, **Por qué**, **Acción para esta semana**. Máximo 110 palabras en total. Basate solo en los datos.',
      `DEMANDA vs OFERTA POR ZONA: ${JSON.stringify(datos)}\nÚLTIMOS PEDIDOS DE CLIENTES:\n${pedidos.join('\n')}`, 500);
    if (texto) return res.json({ texto });
    const top = [...datos].sort((a, b) => (b.consultas / (b.oferta_alquiler + b.oferta_venta + 1)) - (a.consultas / (a.oferta_alquiler + a.oferta_venta + 1)))[0];
    res.json({ texto: `**Qué captar primero**\nPropiedades en ${top.zona}.\n**Por qué**\nTiene ${top.consultas} consultas y poca oferta.\n**Acción para esta semana**\nSalir a captar en ${top.zona}. (modo demo sin IA)` });
  } catch (e) {
    console.error('[analisis]', e.message);
    res.status(502).json({ error: 'La IA no respondió a tiempo, probá de nuevo.' });
  }
});

app.listen(PORT, () => console.log(`Litoral Propiedades escuchando en :${PORT} · IA: ${AI.provider} ${AI.model}`));
