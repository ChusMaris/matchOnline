## Why

matchOnline recibe información del partido en directo, pero solo la muestra en el navegador; al acabar, la URL de directo redirige y los datos ya no se pueden capturar. La extensión debe permitir iniciar la importación desde Firefox Nightly en Android antes de esa redirección y enviar las actualizaciones disponibles a la API durante el partido.

## What Changes

- Integrar sobre el marcador y las estadísticas en vivo un formulario táctil de importación con metadatos de temporada, categoría, competición y jornada, cargados desde los catálogos de la API.
- Guardar los metadatos, estado y frecuencia por partido y pestaña; bloquear los campos durante la importación y permitir editarlos de nuevo al cancelarla.
- Permitir importar partidos simultáneamente desde varias pestañas, serializando entre sí los envíos del mismo ID de partido.
- Enviar cada snapshot nuevo con el ID directo estable a `POST /api/federation/import`, con un intervalo configurable de 5 segundos por defecto.
- Detener automáticamente la importación al salir de la URL directa, mostrando estado y errores sin interrumpir el marcador en vivo existente.

## Capabilities

### New Capabilities

- `matchonline-live-import`: Configuración, inicio/detención y envío periódico de snapshots desde la extensión Firefox matchOnline.

### Modified Capabilities

Ninguna.

## Impact

- `manifest.json`: permisos de almacenamiento/pestañas y comunicación con el endpoint API.
- `src/content/data.js`, `src/content/index.js` y una nueva interfaz de contenido: intervalo configurable y envío de snapshots sin alterar la visualización existente.
- `src/background.js`: ciclo de vida por pestaña y colas de envío serializadas por partido.
- API `POST /api/federation/import` del proyecto Scraper, coordinada mediante `../Scraper/openspec/changes/import-live-direct-matches`.
- No se prevén cambios en la aplicación Stats.
