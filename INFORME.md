# Informe · Tecnoteca Propiedades

Hackatón DonWeb Day Rosario · 1/11/2026 · Ignacio Burgi

## El problema
Una inmobiliaria de barrio pierde clientes porque atiende las consultas a mano por WhatsApp o teléfono: contesta tarde o fuera de horario, pregunta lo mismo varias veces, no anota bien quién buscaba qué y no sabe a quién llamar primero.

## Qué hice
Una web donde **Lola**, una secretaria con IA, atiende a los clientes las 24 horas por chat, audio o llamada de voz. Entiende lo que la persona cuenta ("tengo un perro y trabajo desde casa"), busca en el catálogo real, explica por qué cada propiedad le sirve, agenda la visita y deja todo anotado para el dueño.

## Cómo funciona
1. **Lola, para el cliente.** El cliente habla como con una persona, por texto, nota de voz o llamada. Lola usa herramientas reales: busca propiedades, registra al cliente y agenda visitas. Nunca inventa propiedades. Habla con una voz natural de mujer.
2. **Lo que Lola hace por dentro, a la vista.** Un panel muestra en vivo cada paso: qué entendió, qué buscó y qué anotó.
3. **Recorrido 3D de cada propiedad.** Se arma solo desde la ficha y viene amueblado con lo que el cliente contó (escritorio, lugar para el perro, el río). Se puede entrar a cada ambiente a la altura de los ojos, preguntarle a Lola sobre ese ambiente y anotar recordatorios ("ver si hay humedad") que van al Google Calendar de la visita y al panel del dueño.
4. **Visita confirmada.** Llega una tarjeta con la ficha, el mapa, el link para agendarla en el calendario y el 3D.
5. **Seguir por WhatsApp.** El cliente pasa a un chat estilo WhatsApp donde el equipo comercial retoma la charla con todo el historial, sin que tenga que repetir nada. Es transparente: avisa que lo asiste una IA y que un asesor puede sumarse cuando quiera.
6. **Acceso del dueño.** El dueño entra por otro lado, `/panel`. Ve los clientes ordenados por prioridad (caliente, tibio, frío), las visitas con los recordatorios del cliente, el tiempo de respuesta y un mapa de demanda que le dice qué propiedades salir a conseguir. Desde ahí abre su **Copiloto comercial** (`/asesor`): le pregunta por voz "¿a quién llamo primero?" y la IA le responde con los datos reales de su cartera.

## Componentes
| Parte | Qué es |
|---|---|
| Web de clientes (`/`) | Chat con Lola, voz, tarjetas de propiedades, demo guiada |
| Agente de IA | Modelo de OpenAI con herramientas: buscar propiedades, registrar cliente, agendar visita |
| CRM | Clientes con temperatura, resumen y recordatorios; visitas con notas |
| Panel del dueño (`/panel`) | Indicadores, clientes, visitas, mapa de demanda y análisis con IA |
| Copiloto comercial (`/asesor`) | Asistente por voz para el dueño o asesor, con datos de la cartera |
| WhatsApp (`/whatsapp`) | Continuación de la charla con el historial completo |
| Recorrido 3D | three.js, generado desde la ficha de cada propiedad |
| Voz | Dictado del navegador y voz natural de OpenAI |

## Tecnología
Node.js + Express, HTML/JS sin frameworks, API de OpenAI (gpt-4.1-mini para Lola, gpt-4.1 para el copiloto, gpt-4o-mini-tts para la voz), three.js y Leaflet con OpenStreetMap. La clave de la IA vive solo en el servidor (`.env`) y nunca en el repo ni en el navegador.
