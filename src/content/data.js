// --- src/content/data.js (EVENTSOURCE / REAL-TIME UPDATE) ---
// Depende de injectScoreboard y triggerScoreBlink (de dom.js)

// La URL de streaming, sin la query string variable al final
const API_BASE_URL = "https://streaming.optimalwayconsulting.com/register/fcbq-"; 

let previousScores = { local: null, visit: null };
let eventSource = null; 
let intervalId = null; // New variable to store the interval ID

function extractMatchId() {
    // La URL de ejemplo es: https://streaming.optimalwayconsulting.com/register/fcbq-247415/...
    // La URL de la página es: https://www.basquetcatala.cat/directe/247415
    const url = window.location.href;
    const parts = url.split('/');
    const matchId = parts[parts.length - 1]; 
    
    if (isNaN(parseInt(matchId))) {
        // En caso de que haya una query string después del ID.
        return matchId.split('?')[0]; 
    }
    return matchId;
}

// --- src/content/data.js (Solo Snippet de la función processMatchData) ---

function processMatchData(data) {
    const rawJson = data;
    // console.log("Raw JSON data received:", rawJson); // Removed after user provided structure info

    if (!rawJson || !rawJson.teams || rawJson.teams.length < 2) {
        console.error("Error: Datos de equipos no encontrados en el JSON del stream.");
        return;
    }

    const localTeam = rawJson.teams[0];
    const visitTeam = rawJson.teams[1]; 
    
    // --- EXTRACCIÓN DEL MARCADOR TOTAL (Suma de periodos) ---
    let totalLocalScore = 0;
    let totalVisitScore = 0;

    // Sumar puntos de todos los periodos
    if (localTeam.periods && Array.isArray(localTeam.periods)) {
        localTeam.periods.forEach(period => {
            if (period.score !== undefined) {
                totalLocalScore += period.score;
            }
        });
    }
    if (visitTeam.periods && Array.isArray(visitTeam.periods)) {
        visitTeam.periods.forEach(period => {
            if (period.score !== undefined) {
                totalVisitScore += period.score;
            }
        });
    }

    // Según la confirmación del usuario, el total es la suma de los periodos.
    // Asumimos que no es necesario añadir 'localTeam.data.score' por separado
    // si 'periods' ya contiene todos los scores acumulados (incluyendo el actual).
    const finalLocalScore = totalLocalScore;
    const finalVisitScore = totalVisitScore;

    const localName = localTeam.name;         
    const visitName = visitTeam.name;         
    
    // --- EXTRACCIÓN DE DATOS DE JUGADORES ---
    
    // Función auxiliar para mapear datos del jugador (los puntos están en 'score', las faltas en 'personal')
    const mapPlayerData = (player) => ({
        dorsal: player.dorsal || '',
        name: player.name || 'Desconocido',
        points: player.data ? (player.data.score || 0) : 0, // Puntos
        fouls: player.data ? (player.data.personal || 0) : 0, // Faltas Personales
        timePlayed: player.timePlayed // Minutos jugados
    });

    const localPlayers = localTeam.players ? localTeam.players.map(mapPlayerData) : [];
    const visitPlayers = visitTeam.players ? visitTeam.players.map(mapPlayerData) : [];
    
    // --- LÓGICA DE PARPADEO CONDICIONAL ---
    // (Esta lógica queda igual)
    let teamToBlink = { local: false, visit: false };

    if (previousScores.local === null) {
        teamToBlink.local = true;
        teamToBlink.visit = true;
    } else {
        if (localScore > previousScores.local) {
            teamToBlink.local = true;
        }
        if (visitScore > previousScores.visit) {
            teamToBlink.visit = true;
        }
    }

    // 1. LLAMADA A LA FUNCIÓN DE INYECCIÓN (NUEVOS 6 ARGUMENTOS)
    injectScoreboard(
        localName, 
        finalLocalScore, 
        visitName, 
        finalVisitScore,
        localPlayers,   // <-- NUEVO
        visitPlayers    // <-- NUEVO
    );
    
    // 2. LLAMADA CONDICIONAL AL PARPADEO
    triggerScoreBlink(teamToBlink); 

    // 3. ACTUALIZA EL ESTADO PREVIO
    previousScores.local = localScore;
    previousScores.visit = visitScore;
    
    console.log(`[STREAM] Nuevo marcador: ${localScore} - ${visitScore} (Jugadores actualizados)`);
}

// ... (El resto de data.js queda igual) ...

function startLiveUpdate() {
    // Clear any existing interval to prevent multiple refreshes
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log("Previous refresh interval cleared.");
    }

    // 1. Limpiar cualquier EventSource o Intervalo anterior
    if (eventSource) {
        eventSource.close();
        eventSource = null;
        console.log("Previous EventSource connection closed.");
    }

    // El matchId en la URL de la página es el mismo que en la URL de streaming
    const matchId = extractMatchId();
    if (!matchId || matchId.length < 5) {
        console.error("Content Script: ID de partido inválido o no encontrado.");
        return;
    }
    
    // Construir la URL completa para el EventSource
    // Añadimos una query string aleatoria para evitar caché, aunque no debería ser necesaria.
    const apiUrl = `${API_BASE_URL}${matchId}/${Math.random()}`; 

    console.log(`Intentando conectar a EventSource: ${apiUrl}`);

    try {
        eventSource = new EventSource(apiUrl);
    } catch (e) {
        console.error("Error al crear EventSource. ¿Dominio permitido?", e);
        return;
    }
    
    // 2. Manejar la recepción de datos
    eventSource.addEventListener('fcbq-' + matchId, (event) => {
        try {
            // El campo 'data' del evento SSE contiene el JSON
            const rawData = JSON.parse(event.data);
            processMatchData(rawData);
        } catch (e) {
            console.error("Error al parsear o procesar datos del stream:", e);
        }
    });

    // 3. Manejar errores de conexión (opcional, pero recomendado)
    eventSource.onerror = (error) => {
        console.warn("EventSource error (conexión perdida o fallida).", error);
        // Aquí podríamos añadir lógica para reintentar la conexión si fuera necesario.
    };

    console.log("Conexión a Live Stream (SSE) establecida.");

    // Set a new interval to refresh every 10 seconds
    intervalId = setInterval(() => {
        console.log("Refreshing data due to 15-second interval...");
        startLiveUpdate();
    }, 10000);
    console.log("Data refresh interval set to 15 seconds.");
}