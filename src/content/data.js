const PAGE_CAPTURE_CHANNEL = "__matchonline_federation_capture__";

let previousScores = { local: null, visit: null };
let importSettings = null;
let lastSnapshotSignature = null;
let lastStreamSignature = null;
let streamHookError = null;
let lastStreamUpdateAt = null;
let captureActivityQueue = Promise.resolve();

function extractMatchId() {
    const match = window.location.pathname.match(/\/(?:estadistica\/)?directe\/(\d+)(?:\/|$)/);
    return match?.[1] ?? null;
}

const liveMatchId = extractMatchId();
let settingsKey = null;

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
    const streamSignature = JSON.stringify(rawJson.teams);
    const streamChanged = streamSignature !== lastStreamSignature;
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
    if (streamChanged) {
        lastStreamSignature = streamSignature;
        lastStreamUpdateAt = Date.now();
        if (importSettings?.active) {
            void appendCaptureActivity(`Evento SSE recibido: ${finalLocalScore}-${finalVisitScore}.`)
                .catch(error => console.error("No se pudo registrar el evento SSE.", error));
        }
    }
}

function renderCapturedScoreboard(statsPayload, requestStartedAt) {
    const requestStartedAtMs = Date.parse(requestStartedAt ?? "");
    if (lastStreamUpdateAt !== null
        && (!Number.isFinite(requestStartedAtMs) || requestStartedAtMs < lastStreamUpdateAt)) return;

    const header = statsPayload?.header;
    const localTeam = header?.localTeam;
    const visitTeam = header?.visitorTeam;
    const localScore = Number(header?.score?.local);
    const visitScore = Number(header?.score?.visitor);
    if (!localTeam?.name || !visitTeam?.name || !Number.isFinite(localScore) || !Number.isFinite(visitScore)) {
        return;
    }

    const boxscore = Array.isArray(statsPayload.boxscore) ? statsPayload.boxscore : [];
    const totals = boxscore.find(entry => Number(entry?.period) === 0) ?? boxscore[boxscore.length - 1];
    const mapPlayerData = player => ({
        dorsal: player.dorsal || "",
        name: player.name || "Desconocido",
        points: player.accumulated?.pts ?? player.data?.score ?? 0,
        fouls: player.accumulated?.fc ?? player.data?.personal ?? 0
    });
    const localPlayers = Array.isArray(totals?.local?.players)
        ? totals.local.players.map(mapPlayerData)
        : [];
    const visitPlayers = Array.isArray(totals?.visitor?.players)
        ? totals.visitor.players.map(mapPlayerData)
        : [];

    injectScoreboard(
        localTeam.name,
        localScore,
        visitTeam.name,
        visitScore,
        localPlayers,
        visitPlayers
    );
    previousScores = { local: localScore, visit: visitScore };
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

function appendCaptureActivity(message) {
    const at = new Date().toISOString();
    const write = captureActivityQueue.then(async () => {
        if (!settingsKey) return;
        const current = await readImportSettings();
        if (!current?.active) return;
        const activityLog = Array.isArray(current.activityLog) ? current.activityLog : [];
        await browser.storage.local.set({
            [settingsKey]: {
                ...current,
                activityLog: [...activityLog, { at, message }].slice(-10)
            }
        });
    });
    captureActivityQueue = write.catch(error => {
        console.error("No se pudo guardar la actividad de captura.", error);
    });
    return write;
}

function requestCapturedPayloads() {
    window.postMessage({
        channel: PAGE_CAPTURE_CHANNEL,
        type: "GET_PAYLOADS"
    }, window.location.origin);
}

function handleCapturedPayloads(payloads, captureDetails = {}) {
    const statsPayload = payloads?.statsPayload;
    const pbpPayload = payloads?.pbpPayload;
    if (statsPayload?.header) {
        renderCapturedScoreboard(
            statsPayload,
            captureDetails.requestStartedAt ?? payloads?.requestStartedAt
        );
    }
    if (captureDetails.fresh && importSettings?.active) {
        const source = captureDetails.sourcePath || payloads?.sourcePath || "origen desconocido";
        void appendCaptureActivity(`Datos recibidos de la web: ${source}.`)
            .catch(error => console.error("No se pudo registrar la respuesta de la web.", error));
    }
    if (!importSettings?.active) return;
    if (!statsPayload?.header || !Array.isArray(statsPayload.boxscore)
        || !Array.isArray(pbpPayload?.playByPlay)) {
        return;
    }

    const requestStartedAt = captureDetails.requestStartedAt ?? payloads?.requestStartedAt;
    const requestStartedAtMs = Date.parse(requestStartedAt ?? "");
    if (lastStreamUpdateAt !== null
        && (!Number.isFinite(requestStartedAtMs) || requestStartedAtMs < lastStreamUpdateAt)) {
        void appendCaptureActivity("Snapshot anterior al último SSE; esperando el siguiente refresco de la web.")
            .catch(error => console.error("No se pudo registrar el snapshot atrasado.", error));
        return;
    }

    const snapshot = { statsPayload, pbpPayload };
    const signature = JSON.stringify(snapshot);
    if (signature === lastSnapshotSignature) return;
    lastSnapshotSignature = signature;
    browser.runtime.sendMessage({
        type: "LIVE_MATCH_SNAPSHOT",
        liveMatchId,
        sessionId: importSettings.sessionId,
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
    if (event.data.type === "PAGE_REFRESH_STARTED" && importSettings?.active) {
        const source = event.data.sourcePath || "origen desconocido";
        void appendCaptureActivity(`La web inicia actualización: ${source}.`)
            .catch(error => console.error("No se pudo registrar el inicio de actualización.", error));
    }
    if (event.data.type === "PAYLOADS") {
        try {
            handleCapturedPayloads(event.data.payloads, event.data);
        } catch (error) {
            console.error("Error al procesar el snapshot capturado.", error);
            if (importSettings?.active) {
                void updateStoredStatus({
                    status: "failed",
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }
    if (event.data.type === "STREAM_EVENT") {
        try {
            processMatchData(JSON.parse(event.data.data));
        } catch (error) {
            console.error("Error al parsear o procesar datos del stream:", error);
        }
    }
    if (event.data.type === "STREAM_HOOK_ERROR") {
        streamHookError = event.data.error || "No se pudo observar el stream SSE de la página.";
        if (importSettings?.active) {
            void updateStoredStatus({ status: "failed", error: streamHookError });
        }
    }
    if (event.data.type === "CAPTURE_ERROR" && importSettings?.active) {
        void updateStoredStatus({ status: "failed", error: event.data.error });
    }
});

browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !settingsKey || !changes[settingsKey]) return;
    const previous = importSettings;
    importSettings = changes[settingsKey].newValue ?? null;
    if (!previous?.active && importSettings?.active) {
        lastSnapshotSignature = null;
        void appendCaptureActivity("Importación iniciada; esperando la actualización de datos de la web.")
            .catch(error => console.error("No se pudo registrar el inicio de importación.", error));
        requestCapturedPayloads();
    }
});

async function initializeLiveUpdates() {
    try {
        const context = await browser.runtime.sendMessage({ type: "LIVE_IMPORT_CONTEXT" });
        if (!context?.ok) throw new Error(context?.error || "No se pudo identificar la sesión de importación.");
        settingsKey = context.storageKey;
        importSettings = await readImportSettings();
        if (!importSettings) importSettings = context.state ?? null;
    } catch (error) {
        console.error("No se pudo leer la configuración de importación.", error);
    }
    requestCapturedPayloads();
}
