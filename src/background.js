const LIVE_IMPORT_KEY_PREFIX = "liveImport:";
const API_BASE_URL = "https://scrapertosupabase.onrender.com/api/federation";
const pendingByMatch = new Map();
const runningMatches = new Set();

const directMatchIdFromUrl = value => {
    try {
        const url = new URL(value);
        if (url.hostname !== "www.basquetcatala.cat") return null;
        const match = url.pathname.match(/\/(?:estadistica\/)?directe\/(\d+)(?:\/|$)/);
        return match?.[1] ?? null;
    } catch {
        return null;
    }
};

const sessionStorageKey = (tabId, liveMatchId) =>
    `${LIVE_IMPORT_KEY_PREFIX}${tabId}:${liveMatchId}`;

const getSettings = async key => {
    const result = await browser.storage.local.get(key);
    return result[key] ?? null;
};

const updateSettings = async (key, patch) => {
    const current = await getSettings(key);
    if (!current) return;
    const next = { ...current, ...patch };
    if (!current.active && patch.status) next.status = "inactive";
    await browser.storage.local.set({ [key]: next });
};

const activityLogWith = (state, message) => [
    ...(Array.isArray(state?.activityLog) ? state.activityLog : []),
    { at: new Date().toISOString(), message }
].slice(-10);

const stopSession = async (key, state, reason) => {
    await browser.storage.local.set({
        [key]: {
            ...state,
            active: false,
            status: "inactive",
            stoppedAt: new Date().toISOString(),
            stoppedReason: reason
        }
    });
};

const restoreActiveImports = async () => {
    const [tabs, stored] = await Promise.all([
        browser.tabs.query({}),
        browser.storage.local.get(null)
    ]);
    const tabsById = new Map(tabs.map(tab => [tab.id, tab]));
    const updates = {};

    for (const [key, state] of Object.entries(stored)) {
        if (!key.startsWith(LIVE_IMPORT_KEY_PREFIX) || !state) continue;
        const legacyMatch = key.match(/^liveImport:(\d+)$/);
        if (legacyMatch) {
            const liveMatchId = legacyMatch[1];
            const tab = tabsById.get(state.tabId);
            if (tab && !Object.prototype.hasOwnProperty.call(stored, sessionStorageKey(tab.id, liveMatchId))) {
                const active = Boolean(state.active)
                    && directMatchIdFromUrl(tab.url ?? "") === liveMatchId;
                updates[sessionStorageKey(tab.id, liveMatchId)] = {
                    ...state,
                    liveMatchId,
                    tabId: tab.id,
                    active,
                    status: active ? state.status : "inactive",
                    sessionId: state.sessionId
                        ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
                };
            }
            if (state.active) {
                updates[key] = {
                    ...state,
                    active: false,
                    status: "inactive",
                    stoppedAt: new Date().toISOString(),
                    stoppedReason: "Importación migrada a una sesión por pestaña."
                };
            }
            continue;
        }
        if (!state.active) continue;
        const tab = tabsById.get(state.tabId);
        if (!tab || directMatchIdFromUrl(tab.url ?? "") !== String(state.liveMatchId)) {
            updates[key] = {
                ...state,
                active: false,
                status: "inactive",
                stoppedAt: new Date().toISOString(),
                stoppedReason: "No se encontró la pestaña activa en la URL de directo."
            };
        } else if (!state.sessionId) {
            updates[key] = {
                ...state,
                sessionId: `${Date.now()}-${Math.random().toString(36).slice(2)}`
            };
        }
    }

    if (Object.keys(updates).length) await browser.storage.local.set(updates);
};

browser.runtime.onStartup.addListener(() => {
    void restoreActiveImports().catch(error => console.error("No se pudieron restaurar las importaciones.", error));
});
browser.runtime.onInstalled.addListener(() => {
    void restoreActiveImports().catch(error => console.error("No se pudieron restaurar las importaciones.", error));
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!changeInfo.url || !tab.url) return;

    const activeId = directMatchIdFromUrl(tab.url);
    const prefix = `${LIVE_IMPORT_KEY_PREFIX}${tabId}:`;
    const stored = await browser.storage.local.get(null);
    const updates = {};

    for (const [key, state] of Object.entries(stored)) {
        if (!key.startsWith(prefix) || !state?.active) continue;
        if (activeId === String(state.liveMatchId)) continue;

        updates[key] = {
            ...state,
            active: false,
            status: "inactive",
            stoppedAt: new Date().toISOString(),
            stoppedReason: "La pestaña salió de la página de partido directo."
        };
    }

    if (Object.keys(updates).length) await browser.storage.local.set(updates);
});

browser.tabs.onRemoved.addListener(async tabId => {
    const prefix = `${LIVE_IMPORT_KEY_PREFIX}${tabId}:`;
    const stored = await browser.storage.local.get(null);
    for (const [key, state] of Object.entries(stored)) {
        if (key.startsWith(prefix) && state?.active) {
            await stopSession(key, state, "La pestaña con la importación se cerró.");
        }
    }
});

const processSnapshots = async liveMatchId => {
    if (runningMatches.has(liveMatchId)) return;
    runningMatches.add(liveMatchId);

    try {
        const queue = pendingByMatch.get(liveMatchId) ?? [];
        while (queue.length) {
            const snapshot = queue.shift();
            const settings = await getSettings(snapshot.storageKey);
            if (!settings?.active || settings.sessionId !== snapshot.sessionId) continue;

            await updateSettings(snapshot.storageKey, {
                status: "sending",
                error: null,
                activityLog: activityLogWith(settings, "Enviando actualización a la API.")
            });
            try {
                const response = await fetch(`${API_BASE_URL}/import`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        statsPayload: snapshot.statsPayload,
                        pbpPayload: snapshot.pbpPayload,
                        sourceUrl: snapshot.sourceUrl,
                        metadata: settings.metadata,
                        liveMatchId
                    })
                });
                const result = await response.json();
                if (!response.ok || result?.ok !== true) {
                    throw new Error(result?.error || `La API respondió ${response.status}.`);
                }

                const latest = await getSettings(snapshot.storageKey);
                if (latest?.sessionId === snapshot.sessionId) {
                    await updateSettings(snapshot.storageKey, {
                        status: latest.active ? "active" : "inactive",
                        lastSuccessfulAt: new Date().toISOString(),
                        lastResult: result.result ?? null,
                        error: null,
                        activityLog: activityLogWith(latest, "Actualización enviada correctamente.")
                    });
                }
            } catch (error) {
                const latest = await getSettings(snapshot.storageKey);
                if (latest?.sessionId === snapshot.sessionId) {
                    await updateSettings(snapshot.storageKey, {
                        status: latest.active ? "failed" : "inactive",
                        error: error instanceof Error ? error.message : String(error),
                        activityLog: activityLogWith(
                            latest,
                            `Error al enviar: ${error instanceof Error ? error.message : String(error)}`
                        )
                    });
                }
            }
        }
    } finally {
        runningMatches.delete(liveMatchId);
        const remaining = pendingByMatch.get(liveMatchId);
        if (!remaining?.length) {
            pendingByMatch.delete(liveMatchId);
        } else {
            void processSnapshots(liveMatchId);
        }
    }
};

browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    for (const [key, change] of Object.entries(changes)) {
        if (!key.startsWith(LIVE_IMPORT_KEY_PREFIX) || change.newValue?.active) continue;
        const state = change.oldValue;
        if (!state) continue;
        const queue = pendingByMatch.get(String(state.liveMatchId));
        if (queue) {
            for (let index = queue.length - 1; index >= 0; index -= 1) {
                if (queue[index].storageKey === key) queue.splice(index, 1);
            }
            if (!queue.length) pendingByMatch.delete(String(state.liveMatchId));
        }
    }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    const liveMatchId = directMatchIdFromUrl(sender.tab?.url ?? "");

    if (message?.type === "LIVE_IMPORT_CONTEXT") {
        if (!Number.isInteger(tabId) || !liveMatchId) {
            sendResponse({ ok: false, error: "Abre una URL de partido directo para configurar la importación." });
            return false;
        }
        const key = sessionStorageKey(tabId, liveMatchId);
        getSettings(key)
            .then(state => sendResponse({ ok: true, storageKey: key, state }))
            .catch(error => sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        return true;
    }

    if (message?.type === "LIVE_IMPORT_OPTIONS") {
        fetch(`${API_BASE_URL}/options`)
            .then(async response => {
                const body = await response.json();
                if (!response.ok || body?.ok !== true || !body.options) {
                    throw new Error(body?.error || `No se pudieron cargar los catálogos (${response.status}).`);
                }
                sendResponse({ ok: true, options: body.options });
            })
            .catch(error => sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        return true;
    }

    if (message?.type === "LIVE_MATCH_SNAPSHOT") {
        const snapshotMatchId = String(message.liveMatchId ?? "");
        if (!Number.isInteger(tabId) || !liveMatchId || snapshotMatchId !== liveMatchId || !message.snapshot) {
            sendResponse({ ok: false, error: "El snapshot no procede de la URL directa de esta pestaña." });
            return false;
        }

        const key = sessionStorageKey(tabId, liveMatchId);
        getSettings(key)
            .then(settings => {
                if (!settings?.active || settings.tabId !== tabId
                    || !message.sessionId || settings.sessionId !== message.sessionId) {
                    sendResponse({ ok: false, error: "La importación no está activa en esta pestaña." });
                    return;
                }
                const queue = pendingByMatch.get(liveMatchId) ?? [];
                queue.push({
                    storageKey: key,
                    sessionId: settings.sessionId,
                    statsPayload: message.snapshot.statsPayload,
                    pbpPayload: message.snapshot.pbpPayload,
                    sourceUrl: sender.tab.url
                });
                pendingByMatch.set(liveMatchId, queue);
                sendResponse({ ok: true, queued: true });
                void processSnapshots(liveMatchId);
            })
            .catch(error => sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        return true;
    }

    return false;
});
