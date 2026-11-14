const TARGET_URL = "https://msstats.optimalwayconsulting.com/v1/fcbq/getJsonWithMatchStats/";

// 1. Escuchamos las peticiones que están a punto de completarse
browser.webRequest.onCompleted.addListener(
    (details) => {
        // Comprobamos si la URL de la petición coincide con la API que buscamos.
        if (details.url.startsWith(TARGET_URL)) {
            console.log("¡[Background] Petición a la API detectada:", details.url);
            
            // Aquí puedes ejecutar un fetch a la misma URL para obtener el JSON del cuerpo
            // o (más simple) pedir al content script que haga la petición si tienes problemas
            // con las cabeceras de webRequest.

            // 2. Extraer el ID del partido de la URL (ej: 693d2ac49e24f90001bb7efa)
            const urlParts = details.url.split('/');
            const matchIdWithParams = urlParts[urlParts.length - 1];
            const matchId = matchIdWithParams.split('?')[0];

            console.log(`[Background] ID del Partido Extraído: ${matchId}`);

            // En un escenario normal, podrías hacer un fetch aquí.
            // PERO: Capturar el cuerpo de una petición con webRequest es complicado. 
            // La forma más fácil es hacer que el content.js se encargue de la comunicación 
            // después de que el background.js haya validado que la página es la correcta.
        }
    },
    { urls: ["<all_urls>"] }
);