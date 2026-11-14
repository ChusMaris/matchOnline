## Context

matchOnline es una extensión Firefox Manifest V2 y su destino de ejecución es Firefox Nightly en Android. `src/content/data.js` conecta con el stream SSE, muestra el marcador/jugadores y reinicia la conexión cada 10 segundos; el mensaje de log está desfasado y menciona 15 segundos. El manifiesto no declara popup, almacenamiento ni background script. La experiencia y las APIs declaradas deben ser utilizables desde el navegador móvil, no solo desde Firefox de escritorio.

La API ya dispone de `GET /api/federation/options` y `POST /api/federation/import`. El proyecto Scraper implementa el cambio complementario para que la API use un ID directo estable y reemplace los datos del mismo partido. La importación cliente debe coordinar su campo `liveMatchId` y sus payloads con ese contrato.

## Goals / Non-Goals

**Goals:**
- Permitir iniciar y detener manualmente la importación desde Firefox Nightly en Android, con controles y formulario utilizables en una pantalla táctil.
- Guardar metadatos y frecuencia por ID directo, una sola vez por partido.
- Enviar snapshots nuevos con un intervalo por defecto de 5 segundos configurable.
- Detener automáticamente el envío cuando la pestaña abandone la URL directa.
- Mantener sin cambios la actualización visual del marcador y los jugadores.

**Non-Goals:**
- Cambiar la API o base de datos de Scraper desde este repositorio; su contrato y migración son parte del cambio coordinado en `../Scraper/openspec/changes/import-live-direct-matches`.
- Cambiar el proceso de importación final o la aplicación Stats.
- Crear una segunda captura de red independiente si el stream actual ya aporta los datos requeridos; la estructura real del payload se debe verificar antes de elegir un adaptador.

## Decisions

1. **Añadir un popup Firefox con ciclo de vida por partido.** Configurar `browser_action.default_popup`, `storage` y los permisos necesarios para consultar la pestaña activa y contactar con la API. El popup valida `/directe/<id>` y `/estadistica/directe/<id>`, carga catálogos y muestra los campos de temporada, categoría, competición y jornada. El usuario inicia explícitamente la importación; los datos se guardan en `browser.storage.local` bajo el ID numérico y se restauran al reabrir el popup.

2. **Mantener el render SSE y capturar la respuesta completa de directo.** El stream `/register/fcbq-<id>/...` usado por el marcador es distinto de la respuesta JSON `/streaming/match-id/<id>`. Esta última contiene `header`, `boxscore`, `shotChart` y `playByPlay` juntos. El page hook captura esa respuesta cuando el ID coincide con la ruta `/directe/<id>` y comparte el objeto tanto como payload de estadísticas como de PBP para que la API use cada sección. También se mantienen las rutas `/matches/.../stats` y `/matches/.../pbp` como alternativa compatible con otros formatos observados. Parametrizar el intervalo de actualización del SSE sin cambiar el render; enviar snapshots federativos distintos únicamente mientras el partido esté activo.

3. **Usar el background para vigilar la navegación y serializar envíos.** Añadir un script de background persistente compatible con Manifest V2 que observe cambios de URL de la pestaña, desactive el partido almacenado cuando su URL deje de ser una ruta de directo y procese en orden la cola de snapshots por partido. La solicitud en curso puede terminar después de una navegación, pero se descartan los snapshots pendientes y no se inician nuevos envíos.

4. **Hacer la acción accesible y usable en móvil.** Usar la acción/popup de WebExtensions solo de la forma que Firefox Nightly Android permita abrir desde su interfaz de extensiones. Diseñar la página del popup con viewport móvil, controles táctiles y contenido que no dependa de hover ni de una ventana ancha. Confirmar en el dispositivo cómo se abre el popup y que el manifiesto MV2 y las APIs necesarias siguen admitidos por la versión objetivo.

5. **Guardar intervalo por partido y limitar su rango.** Usar 5 segundos como valor inicial y aceptar enteros de 5 a 60 segundos. El intervalo controla la reconexión del SSE; los envíos se disparan al recibir nuevos payloads completos de stats/PBP de la página, se deduplican por contenido y se serializan en el background. Validar el intervalo al leer almacenamiento, no solo al editar el formulario.

6. **Exponer el estado y los fallos en la interfaz móvil.** Mostrar inactivo, activo, enviando o error y conservar el último resultado correcto. Fallos de catálogo, captura, validación o API se mostrarán explícitamente; el marcador seguirá actualizándose si falla la importación.

## Risks / Trade-offs

- [La página puede cambiar la ruta o la forma de `/streaming/match-id/<id>`] → Validar las respuestas completas antes de encolar y mostrar explícitamente errores de captura o estructura.
- [Las escrituras pueden durar más que el intervalo de 5 segundos] → Serializar solicitudes del partido y encolar snapshots distintos en orden; medir el crecimiento de la cola si la API sigue ocupada.
- [La página puede redirigir antes de completar una importación] → Cortar nuevos envíos al cambiar la URL, esperar la solicitud ya iniciada y reflejar su resultado/error.
- [Las APIs de extensión o la apertura de browser_action pueden diferir en Firefox Nightly Android] → Probar instalación, popup, storage, acceso a pestaña y monitor de navegación en el dispositivo objetivo; no dar por válida una comprobación solo en escritorio.
- [El formulario puede resultar incómodo en una pantalla pequeña] → Usar diseño adaptable y probar selección de catálogos, jornada, intervalo e inicio/parada mediante interacción táctil.

## Migration Plan

1. Verificar soporte del manifiesto y del mecanismo de apertura de la acción en Firefox Nightly Android.
2. Añadir permisos, popup móvil y background sin retirar el render actual.
3. Añadir estado por partido y controles táctiles para iniciar/detener y configurar el intervalo.
4. Enviar snapshots al endpoint cuando la API coordinada esté desplegada.
5. Probar en Firefox Nightly Android en URLs de directo y redirección; si se revierte, quitar la activación del popup y conservar el content script actual.

## Open Questions

- Verificar si el JSON SSE de directo incluye la información de estadísticas y play-by-play necesaria para la API o si la página expone además los payloads completos del importador. El formato de origen define el adaptador y debe resolverse con los ejemplos adjuntos antes de implementar el envío real.
- Verificar en la versión actual de Firefox Nightly Android que la acción/popup de la extensión puede abrirse desde el flujo de navegación móvil y que el manifiesto MV2 y las APIs requeridas están disponibles.
