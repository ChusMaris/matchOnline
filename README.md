# matchOnline

Extensión Firefox para mostrar el marcador de Basquet Catala e importar partidos mientras la URL de directo sigue disponible.

## Importar desde Firefox Nightly para Android

1. Abre una página `https://www.basquetcatala.cat/directe/<id>` y deja que cargue el partido.
2. Abre el menú de extensiones de Firefox y selecciona **Importar partido en directo**.
3. Completa temporada, categoría, competición y jornada. Las sugerencias se cargan desde la API; puedes escribir un valor si no aparece.
4. Elige un intervalo entero entre 5 y 60 segundos (5 por defecto) y pulsa **Iniciar importación**.
5. El popup conserva los metadatos y el intervalo para ese ID. Pulsa **Detener importación** para parar; también se detiene automáticamente si la pestaña sale de la URL directa.

La extensión captura el JSON completo de `/streaming/match-id/<id>` (incluye `header`, `boxscore`, `shotChart` y `playByPlay`). El SSE `/register/fcbq-<id>/...` sigue usándose solo para dibujar el marcador. Los snapshots distintos se envían en orden a `https://scrapertosupabase.onrender.com/api/federation/import` con `liveMatchId`, los metadatos y la URL de origen. Se conserva el último resultado correcto y se muestran errores de captura o de API en el popup.

Antes de habilitar esta versión con importación en directo, aplica la migración `Scraper/supabase/migrations/20261109_replace_live_match_snapshot.sql` y despliega la versión de la API que acepta `liveMatchId`.

La interfaz está diseñada para controles táctiles; la instalación, apertura del popup y navegación deben validarse en Firefox Nightly para Android en un dispositivo real. La verificación física está pendiente.