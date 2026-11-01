# Tecnoteca Propiedades · Lola 🏠🤖

> *"La inmobiliaria que nunca deja de atender el teléfono, y que además le dice al dueño qué propiedades conseguir."*

Proyecto para la **Hackatón DonWeb Day Rosario 2026**. Consigna: un negocio local pierde ventas porque atiende consultas y pedidos a mano (WhatsApp, teléfono): mensajes perdidos, pedidos mal anotados, clientes que esperan y se van.

**Deploy:** http://dwday-124839392.online _(Cloud Server de DonWeb)_

## Qué hace

| | |
|---|---|
| 💬 **Lola, agente con herramientas** | Atiende por chat (simula WhatsApp) con *tool use*: `buscar_propiedades`, `crear_lead`, `agendar_visita`. Nunca inventa propiedades: siempre busca en el catálogo. Traduce lo que cuenta el cliente ("tengo un perro y corro por la costa") a etiquetas de estilo de vida y explica por qué cada propiedad encaja. |
| 📞 **Voz** | Botón "Llamar": conversación por voz con la Web Speech API del navegador (reconocimiento es-AR + síntesis). Sin servicios extra. |
| 🧠 **Cerebro visible** | Panel que muestra en vivo (streaming NDJSON) qué hace el agente: busca → encuentra → registra lead → agenda visita. |
| ✨ **Imaginá tu vida acá** | En cada propiedad, la IA narra un día de *esa* persona en *esa* propiedad, usando solo datos de la ficha y lo que contó el cliente. |
| 📊 **Panel del dueño** (`/panel`) | Leads ordenados por temperatura (caliente / tibio / frío), visitas, KPIs (consultas, calientes, visitas, esperando > 2 h, tiempo de respuesta de Lola medido en vivo). |
| 🗺️ **Mapa de demanda insatisfecha** | Leaflet + OpenStreetMap: círculos por zona (tamaño = consultas, color = brecha demanda vs. oferta). Botón **"Análisis de la IA"**: qué conviene captar primero y una acción para esta semana. Cada búsqueda del chat suma demanda en vivo. |

Los datos marcados como **"ejemplo"** en el panel son precargados para la demo. WhatsApp real no está integrado: el chat web lo simula.

## Cómo correrlo

```bash
npm install
cp .env.example .env   # completar las variables
npm start              # http://localhost:3000
```

Sin `AI_API_KEY`, la app arranca en **modo demo** (reglas simples, sin IA) para poder probar la interfaz.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `AI_PROVIDER` | `openai` (formato `/chat/completions` con tools) · `anthropic` (formato `/v1/messages` con `tool_use`) · `mock` |
| `AI_BASE_URL` | URL base de la API (ej. `https://api.openai.com/v1` o `https://api.anthropic.com`) |
| `AI_API_KEY` | Clave de la API. **Solo vive en el servidor**, nunca en el frontend ni en el repo. |
| `AI_MODEL` | Modelo a usar |
| `PORT` | Puerto HTTP (default 3000) |

## Stack y decisiones

- Node.js + Express, frontend HTML/CSS/JS plano (sin build). Una sola dependencia.
- Datos en memoria (catálogo de 14 propiedades de Rosario en `data/propiedades.json`).
- Adaptador de IA propio para formatos OpenAI y Anthropic, con timeout y mensajes amables si la IA falla.
- Validación de entradas en el servidor y escape de todo texto que se inserta en el HTML.

## Estructura

```
server.js              API, agente y adaptador de IA
data/propiedades.json  catálogo
public/                index (cliente) · panel (dueño) · estilos
```
