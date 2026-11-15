# matchOnline

Extensión Firefox para mostrar el marcador de Basquet Catala e importar partidos mientras la URL de directo sigue disponible.

## Importar desde Firefox Nightly para Android

1. Abre una página `https://www.basquetcatala.cat/directe/<id>` o `https://www.basquetcatala.cat/estadistica/directe/<id>` y deja que cargue el partido.
2. Encima del marcador y las estadísticas aparecerá el formulario **Importar partido en directo**.
3. Rellena temporada, categoría, competición y jornada. Las sugerencias de catálogo se cargan desde la API y puedes escribir un valor si no aparece.
4. Elige un intervalo entero entre 5 y 60 segundos (5 por defecto) y pulsa **Iniciar importación**. El formulario se reduce a un resumen de dos líneas con el estado, los últimos logs y el botón **Cancelar importación**.
5. Pulsa **Cancelar importación** para detener los envíos y volver a ver el formulario completo con los valores anteriores para editarlos. También se detiene automáticamente si esa pestaña sale de la URL directa.

La configuración y el estado son independientes por pestaña, por lo que se pueden importar partidos desde varias pestañas a la vez. Si dos pestañas muestran el mismo partido, sus envíos se procesan en serie para evitar escrituras concurrentes.

La extensión captura el JSON completo de `/streaming/match-id/<id>` (incluye `header`, `boxscore`, `shotChart` y `playByPlay`). Al cargar, el snapshot permite mostrar el marcador y las estadísticas debajo del formulario aunque el primer evento SSE tarde en llegar; después, el SSE sigue actualizándolos y, cuando detecta cambios, solicita una copia fresca sin caché. Los snapshots distintos se envían en orden a `https://scrapertosupabase.onrender.com/api/federation/import` con `liveMatchId`, los metadatos y la URL de origen. Se conserva el último resultado correcto y se muestran errores de captura o de API en el formulario integrado.

Antes de habilitar esta versión con importación en directo, aplica las migraciones `20261109_replace_live_match_snapshot.sql`, `20261114_fix_live_match_snapshot_rls.sql` y `20261115_restrict_live_match_snapshot_rpc.sql` del proyecto Scraper, configura `SUPABASE_SERVICE_ROLE_KEY` como secreto del servicio de API y despliega la versión de la API que acepta `liveMatchId`. La clave service-role solo debe estar en el servidor, nunca en la extensión.

El formulario está diseñado para controles táctiles; la instalación, interacción con el formulario y navegación deben validarse en Firefox Nightly para Android en un dispositivo real. La verificación física está pendiente.