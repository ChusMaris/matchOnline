# matchOnline

Extensión Firefox para mostrar el marcador de Basquet Catala e importar partidos mientras la URL de directo sigue disponible.

La captura del stream en el contexto de la página requiere Firefox 128 o posterior; está destinada a Firefox Nightly para Android.

## Importar desde Firefox Nightly para Android

1. Abre una página `https://www.basquetcatala.cat/directe/<id>` o `https://www.basquetcatala.cat/estadistica/directe/<id>` y deja que cargue el partido.
2. Encima del marcador y las estadísticas aparecerá el formulario **Importar partido en directo**.
3. Rellena temporada, categoría, competición y jornada. Las sugerencias de catálogo se cargan desde la API y puedes escribir un valor si no aparece.
4. Pulsa **Iniciar importación**. El formulario se reduce a un resumen de dos líneas con el estado, los últimos logs y el botón **Cancelar importación**.
5. Pulsa **Cancelar importación** para detener los envíos y volver a ver el formulario completo con los valores anteriores para editarlos. También se detiene automáticamente si esa pestaña sale de la URL directa.

La configuración y el estado son independientes por pestaña, por lo que se pueden importar partidos desde varias pestañas a la vez. Si dos pestañas muestran el mismo partido, sus envíos se procesan en serie para evitar escrituras concurrentes.

La extensión observa el SSE de la página (`/register/fcbq-<id>/...` y `/streaming/register/fcbq-<id>/...`) para actualizar el marcador y captura la XHR/fetch que la propia web usa para refrescar el partido. No lanza una segunda petición a `/streaming/match-id/<id>`: esa petición adicional fallaba por CORS (`Access-Control-Allow-Credentials`) y podía quedar desfasada respecto al marcador web. Al recibir la respuesta completa de la petición nativa (estadísticas y jugadas), la extensión actualiza el marcador si esa respuesta es más reciente que el último SSE y encola el snapshot para la API. El formulario registra el inicio y la respuesta de cada refresco nativo, además de los eventos SSE y los envíos API, para poder comparar sus tiempos. La importación espera los datos completos de la propia página; no fabrica snapshots parciales. Los snapshots distintos se envían en orden a `https://scrapertosupabase.onrender.com/api/federation/live-import` con `liveMatchId`, los metadatos y la URL de origen. Esta ruta es exclusiva del importador en directo; la extensión original de Scraper conserva `/api/federation/import`. Se conserva el último resultado correcto y se muestran errores de captura o de API en el formulario integrado.

Antes de habilitar esta versión con importación en directo, aplica las migraciones `20261109_replace_live_match_snapshot.sql`, `20261114_fix_live_match_snapshot_rls.sql` y `20261115_restrict_live_match_snapshot_rpc.sql` del proyecto Scraper, configura `SUPABASE_SERVICE_ROLE_KEY` como secreto del servicio de API y despliega la versión de la API que ofrece `/api/federation/live-import`. La clave service-role solo debe estar en el servidor, nunca en la extensión.

El formulario está diseñado para controles táctiles; la instalación, interacción con el formulario y navegación deben validarse en Firefox Nightly para Android en un dispositivo real. La verificación física está pendiente.