const STREAM_BASE_URL = "https://streaming.optimalwayconsulting.com/register/fcbq-";
const SETTINGS_KEY_PREFIX = "liveImport:";
const PAGE_CAPTURE_CHANNEL = "__matchonline_federation_capture__";
const DEFAULT_REFRESH_SECONDS = 5;

let previousScores = { local: null, visit: null };
let eventSource = null;
let intervalId = null;
let refreshIntervalSeconds = DEFAULT_REFRESH_SECONDS;
let importSettings = null;
let lastSnapshotSignature = null;

function extractMatchId() {
    const match = window.location.pathname.match(/\/(?:estadistica\/)?directe\/(\d+)(?:\/|$)/);
    return match?.[1] ?? null;
}

const liveMatchId = extractMatchId();
const settingsKey = liveMatchId ? `${SETTINGS_KEY_PREFIX}${liveMatchId}` : null;

function injectPageHook() {
    if (!settingsKey || document.getElementById("matchonline-page-hook")) return;
    const script = document.createElement("script");
    script.id = "matchonline-page-hook";
    script.src = browser.runtime.getURL("src/content/page-hook.js");
    script.onload = () => script.remove();
    script.onerror = () => {
        script.remove();
        void updateStoredStatus({
            status: "failed",
            error: "No se pudo instalar la captura de payloads de la página."
        });
    };
    (document.documentElement || document.head).appendChild(script);
}

function processMatchData(rawJson) {
    if (!rawJson || !rawJson.teams || rawJson.teams.length < 2) {
        console.error("Error: Datos de equipos no encontrados en el JSON del stream.");
        return;
    }

    const localTeam = rawJson.teams[0];
    const visitTeam = rawJson.teams[1];
    const finalLocalScore = Array.isArray(localTeam.periods)
        ? localTeam.periods.reduce((total, period) => total + (Number(period.score) || 0), 0)
        : 0;
    const finalVisitScore = Array.isArray(visitTeam.periods)
        ? visitTeam.periods.reduce((total, period) => total + (Number(period.score) || 0), 0)
        : 0;

    const mapPlayerData = player => ({
        dorsal: player.dorsal || "",
        name: player.name || "Desconocido",
        points: player.data ? (player.data.score || 0) : 0,
        fouls: player.data ? (player.data.personal || 0) : 0
    });

    const localPlayers = localTeam.players ? localTeam.players.map(mapPlayerData) : [];
    const visitPlayers = visitTeam.players ? visitTeam.players.map(mapPlayerData) : [];
    const teamToBlink = {
        local: previousScores.local === null || finalLocalScore > previousScores.local,
        visit: previousScores.visit === null || finalVisitScore > previousScores.visit
    };

    injectScoreboard(
        localTeam.name,
        finalLocalScore,
        visitTeam.name,
        finalVisitScore,
        localPlayers,
        visitPlayers
    );
    triggerScoreBlink(teamToBlink);
    previousScores = { local: finalLocalScore, visit: finalVisitScore };
    console.log(`[STREAM] Nuevo marcador: ${finalLocalScore} - ${finalVisitScore} (Jugadores actualizados)`);
}

function startLiveUpdate() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    if (!liveMatchId) {
        console.info("Content Script: Esta página no es un partido directo.");
        return;
    }

    const apiUrl = `${STREAM_BASE_URL}${liveMatchId}/${Math.random()}`;
    try {
        eventSource = new EventSource(apiUrl);
    } catch (error) {
        console.error("Error al crear EventSource.", error);
        return;
    }

    eventSource.addEventListener(`fcbq-${liveMatchId}`, event => {
        try {
            processMatchData(JSON.parse(event.data));
        } catch (error) {
            console.error("Error al parsear o procesar datos del stream:", error);
        }
    });
    eventSource.onerror = error => console.warn("EventSource error (conexión perdida o fallida).", error);

    intervalId = setInterval(startLiveUpdate, refreshIntervalSeconds * 1000);
    console.log(`Intervalo de actualización del marcador: ${refreshIntervalSeconds} segundos.`);
}

async function readImportSettings() {
    if (!settingsKey) return null;
    const result = await browser.storage.local.get(settingsKey);
    return result[settingsKey] ?? null;
}

async function updateStoredStatus(patch) {
    if (!settingsKey) return;
    const current = await readImportSettings();
    if (!current) return;
    const next = { ...current, ...patch };
    if (!current.active && patch.status) {
        next.status = "inactive";
    }
    if (patch.lastSuccessfulAt && !current.active) {
        next.status = "inactive";
    }
    await browser.storage.local.set({ [settingsKey]: next });
}

function requestCapturedPayloads() {
    window.postMessage({
        channel: PAGE_CAPTURE_CHANNEL,
        type: "GET_PAYLOADS"
    }, window.location.origin);
}

function handleCapturedPayloads(payloads) {
    if (!importSettings?.active) return;
    const statsPayload = payloads?.statsPayload;
    const pbpPayload = payloads?.pbpPayload;
    if (!statsPayload?.header || !Array.isArray(statsPayload.boxscore)
        || !Array.isArray(pbpPayload?.playByPlay)) {
        void updateStoredStatus({
            status: "failed",
            error: "No se han capturado todavía los payloads completos de estadísticas y play-by-play."
        });
        return;
    }

    const snapshot = { statsPayload, pbpPayload };
    const signature = JSON.stringify(snapshot);
    if (signature === lastSnapshotSignature) return;
    lastSnapshotSignature = signature;
    browser.runtime.sendMessage({
        type: "LIVE_MATCH_SNAPSHOT",
        liveMatchId,
        snapshot
    }).then(response => {
        if (!response?.ok) {
            return updateStoredStatus({ status: "failed", error: response?.error || "No se pudo encolar el snapshot." });
        }
    }).catch(error => updateStoredStatus({
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
    }));
}

window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== window.location.origin
        || event.data?.channel !== PAGE_CAPTURE_CHANNEL) return;
    if (event.data.type === "PAYLOADS") handleCapturedPayloads(event.data.payloads);
    if (event.data.type === "CAPTURE_ERROR" && importSettings?.active) {
        void updateStoredStatus({ status: "failed", error: event.data.error });
    }
});

browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !settingsKey || !changes[settingsKey]) return;
    const previous = importSettings;
    importSettings = changes[settingsKey].newValue ?? null;
    const nextInterval = Number(importSettings?.intervalSeconds);
    if (Number.isInteger(nextInterval) && nextInterval >= 5 && nextInterval <= 60
        && nextInterval !== refreshIntervalSeconds) {
        refreshIntervalSeconds = nextInterval;
        startLiveUpdate();
    }
    if (!previous?.active && importSettings?.active) {
        lastSnapshotSignature = null;
        requestCapturedPayloads();
    }
});

injectPageHook();
async function initializeLiveUpdates() {
    try {
        importSettings = await readImportSettings();
        const savedInterval = Number(importSettings?.intervalSeconds);
        if (Number.isInteger(savedInterval) && savedInterval >= 5 && savedInterval <= 60) {
            refreshIntervalSeconds = savedInterval;
        }
    } catch (error) {
        console.error("No se pudo leer la configuración de importación.", error);
    }
    startLiveUpdate();
    if (importSettings?.active) requestCapturedPayloads();
}
