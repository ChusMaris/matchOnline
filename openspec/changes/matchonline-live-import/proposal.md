## Why

matchOnline recibe información del partido en directo, pero solo la muestra en el navegador; al acabar, la URL de directo redirige y los datos ya no se pueden capturar. La extensión debe permitir iniciar la importación desde Firefox Nightly en Android antes de esa redirección y enviar las actualizaciones disponibles a la API durante el partido.

## What Changes

- Añadir a la extensión móvil para Firefox Nightly en Android una interfaz de importación táctil con metadatos de temporada, categoría, competición y jornada, cargados desde los catálogos de la API.
- Guardar los metadatos, estado y frecuencia una sola vez por ID de URL directa y añadir acciones para iniciar o detener la importación.
- Enviar cada snapshot nuevo con el ID directo estable a `POST /api/federation/import`, con un intervalo configurable de 5 segundos por defecto.
- Detener automáticamente la importación al salir de la URL directa, mostrando estado y errores sin interrumpir el marcador en vivo existente.

## Capabilities

### New Capabilities

- `matchonline-live-import`: Configuración, inicio/detención y envío periódico de snapshots desde la extensión Firefox matchOnline.

### Modified Capabilities

Ninguna.

## Impact

- `manifest.json`: acción de extensión/popup compatible con Firefox Nightly Android, permisos de almacenamiento/pestañas y comunicación con el endpoint API.
- `src/content/data.js` y `src/content/index.js`: intervalo configurable y envío de snapshots sin alterar la visualización existente.
- Nuevos recursos adaptables a móvil para la acción de la extensión, popup/background y almacenamiento por partido.
- API `POST /api/federation/import` del proyecto Scraper, coordinada mediante `../Scraper/openspec/changes/import-live-direct-matches`.
- No se prevén cambios en la aplicación Stats.
