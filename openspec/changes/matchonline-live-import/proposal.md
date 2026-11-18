## Why

matchOnline recibe información del partido en directo, pero solo la muestra en el navegador; al acabar, la URL de directo redirige y los datos ya no se pueden capturar. La extensión debe permitir iniciar la importación desde Firefox Nightly en Android antes de esa redirección y enviar las actualizaciones disponibles a la API durante el partido.

## What Changes

- Integrar sobre el marcador y las estadísticas en vivo un formulario táctil de importación con metadatos de temporada, categoría, competición y jornada, cargados desde los catálogos de la API.
- Guardar los metadatos y el estado por partido y pestaña; bloquear los campos durante la importación y permitir editarlos de nuevo al cancelarla.
- Permitir importar partidos simultáneamente desde varias pestañas, serializando entre sí los envíos del mismo ID de partido.
- Observar el SSE y las respuestas XHR/fetch nativas de la página, y enviar snapshots completos distintos a `POST /api/federation/live-import`.
- Detener automáticamente la importación al salir de la URL directa, mostrando estado y errores sin interrumpir el marcador en vivo existente.

## Capabilities

### New Capabilities

- `matchonline-live-import`: Configuración, inicio/detención y envío periódico de snapshots desde la extensión Firefox matchOnline.

### Modified Capabilities

Ninguna.

## Impact

- `manifest.json`: permisos de almacenamiento/pestañas y comunicación con el endpoint API.
- `src/content/data.js` y `src/content/page-hook.js`: captura de los eventos SSE de la página, actualización del marcador y envío de snapshots sin abrir una segunda conexión SSE.
- `src/content/live-import.js`: formulario integrado sin intervalo de reconexión configurable.
- `src/background.js`: ciclo de vida por pestaña y colas de envío serializadas por partido.
- API `POST /api/federation/live-import` dedicada del proyecto Scraper, coordinada mediante `../Scraper/openspec/changes/import-live-direct-matches`; conservar intacta la importación original en `/api/federation/import`.
- No se prevén cambios en la aplicación Stats.
