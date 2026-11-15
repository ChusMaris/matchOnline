## Context

matchOnline es una extensión Firefox Manifest V2 y su destino de ejecución es Firefox Nightly en Android. `src/content/data.js` conecta con el stream SSE, muestra el marcador/jugadores y permite configurar la frecuencia de actualización. La importación se configura ahora dentro de la propia página del partido, encima del marcador inyectado; no debe depender del popup.

La API ya dispone de `GET /api/federation/options` y `POST /api/federation/import`. El proyecto Scraper implementa el cambio complementario para que la API use un ID directo estable y reemplace los datos del mismo partido. La importación cliente debe coordinar su campo `liveMatchId` y sus payloads con ese contrato.

## Goals / Non-Goals

**Goals:**
- Permitir iniciar y cancelar manualmente la importación desde Firefox Nightly en Android, con controles y formulario utilizables en una pantalla táctil e integrados encima del marcador.
- Bloquear metadatos y frecuencia mientras la importación esté activa; volver a habilitarlos al cancelar.
- Permitir importaciones simultáneas desde distintas pestañas, con el estado asociado a la combinación de pestaña e ID directo.
- Enviar snapshots nuevos con un intervalo por defecto de 5 segundos configurable.
- Detener automáticamente el envío cuando la pestaña abandone la URL directa.
- Mantener sin cambios la actualización visual del marcador y los jugadores.

**Non-Goals:**
- Cambiar la API o base de datos de Scraper desde este repositorio; su contrato y migración son parte del cambio coordinado en `../Scraper/openspec/changes/import-live-direct-matches`.
- Cambiar el proceso de importación final o la aplicación Stats.
- Crear una segunda captura de red independiente si el stream actual ya aporta los datos requeridos; la estructura real del payload se debe verificar antes de elegir un adaptador.

## Decisions

1. **Integrar el formulario en la página del partido.** El content script crea un panel móvil independiente inmediatamente antes del contenedor del marcador, para que las actualizaciones del marcador no borren el formulario. Carga catálogos mediante el background, restaura la configuración de esa pestaña y admite `/directe/<id>` y `/estadistica/directe/<id>`. Al iniciar, deshabilita todos los campos; al cancelar, detiene nuevos envíos y vuelve a habilitarlos.

2. **Mantener el render SSE y usar el snapshot completo como respaldo visual.** El stream `/register/fcbq-<id>/...` usado por el marcador es distinto de la respuesta JSON `/streaming/match-id/<id>`. Esta última contiene `header`, `boxscore`, `shotChart` y `playByPlay` juntos. El page hook solicita un snapshot completo sin caché al cargar la página para mostrar marcador y jugadores aunque todavía no haya llegado un evento SSE; después, el SSE continúa actualizando el marcador y, si la importación está activa, solicita snapshots frescos. Los snapshots completos cuyo contenido cambie se envían a la API; las peticiones de actualización se serializan para evitar carreras. También se mantienen las rutas `/matches/.../stats` y `/matches/.../pbp` como alternativa compatible con otros formatos observados. Parametrizar el intervalo de actualización del SSE sin cambiar el render.

3. **Usar el background para vigilar la navegación y serializar envíos.** Añadir un script de background persistente compatible con Manifest V2 que observe cambios de URL de cada pestaña, desactive solo la sesión asociada a la pestaña que abandona la ruta de directo y procese en orden las colas. Cada sesión se identifica por `tabId` e ID directo; los envíos del mismo ID directo se serializan entre pestañas para evitar escrituras concurrentes del mismo partido. La solicitud en curso puede terminar tras cancelar o navegar, pero se descartan los snapshots pendientes de esa sesión.

4. **Hacer el formulario accesible y usable en móvil.** Renderizarlo sobre el marcador en el documento de directo con viewport adaptable, controles táctiles y contenido que no dependa de hover ni de una ventana ancha. Confirmar en el dispositivo que la inserción no interfiere con el marcador ni con el scroll de la página.

5. **Guardar intervalo por partido y limitar su rango.** Usar 5 segundos como valor inicial y aceptar enteros de 5 a 60 segundos. El intervalo controla la reconexión del SSE; los envíos se disparan al recibir nuevos payloads completos de stats/PBP de la página, se deduplican por contenido y se serializan en el background. Validar el intervalo al leer almacenamiento, no solo al editar el formulario.

6. **Exponer una vista compacta activa y los fallos.** Al iniciar, ocultar los campos editables y mostrar dos líneas de metadatos, el estado, los últimos cuatro eventos de actividad y el botón para cancelar. Al cancelar, restaurar el formulario con sus valores. Conservar el último resultado correcto; fallos de catálogo, captura, validación o API se mostrarán explícitamente y el marcador seguirá actualizándose.

## Risks / Trade-offs

- [La página puede cambiar la ruta o la forma de `/streaming/match-id/<id>`] → Validar las respuestas completas antes de encolar y mostrar explícitamente errores de captura o estructura.
- [Las escrituras pueden durar más que el intervalo de 5 segundos] → Serializar solicitudes del partido y encolar snapshots distintos en orden; medir el crecimiento de la cola si la API sigue ocupada.
- [La página puede redirigir antes de completar una importación] → Cortar nuevos envíos al cambiar la URL, esperar la solicitud ya iniciada y reflejar su resultado/error.
- [Las APIs de extensión o la inserción del formulario pueden diferir en Firefox Nightly Android] → Probar instalación, controles integrados, storage y monitor de navegación en el dispositivo objetivo; no dar por válida una comprobación solo en escritorio.
- [El formulario puede resultar incómodo en una pantalla pequeña] → Usar diseño adaptable y probar selección de catálogos, jornada, intervalo e inicio/parada mediante interacción táctil.

## Migration Plan

1. Verificar soporte del manifiesto, storage y monitor de pestañas en Firefox Nightly Android.
2. Añadir el formulario móvil sobre el marcador y quitar la dependencia del popup sin retirar el render actual.
3. Añadir estado por pestaña/partido, bloqueo de campos y controles táctiles para iniciar/cancelar y configurar el intervalo.
4. Enviar snapshots al endpoint cuando la API coordinada esté desplegada.
5. Probar en Firefox Nightly Android en URLs de directo y redirección; si se revierte, quitar el formulario integrado y conservar el content script actual.

## Open Questions

- Verificar si el JSON SSE de directo incluye la información de estadísticas y play-by-play necesaria para la API o si la página expone además los payloads completos del importador. El formato de origen define el adaptador y debe resolverse con los ejemplos adjuntos antes de implementar el envío real.
- Verificar en la versión actual de Firefox Nightly Android que el content script puede insertar y operar el formulario integrado, y que el manifiesto MV2 y las APIs requeridas están disponibles.
