const LIVE_IMPORT_KEY_PREFIX = 'liveImport:';
const API_URL = 'https://scrapertosupabase.onrender.com/api/federation/import';
const pendingByMatch = new Map();
const runningMatches = new Set();

const directMatchIdFromUrl = (value) => {
    try {
        const url = new URL(value);
        if (url.hostname !== 'www.basquetcatala.cat') return null;
        const match = url.pathname.match(/\/(?:estadistica\/)?directe\/(\d+)(?:\/|$)/);
        return match?.[1] ?? null;
    } catch {
        return null;
    }
};

const restoreActiveImports = async () => {
    const [tabs, stored] = await Promise.all([
        browser.tabs.query({}),
        browser.storage.local.get(null)
    ]);
    const updates = {};

    for (const [key, state] of Object.entries(stored)) {
        if (!key.startsWith(LIVE_IMPORT_KEY_PREFIX) || !state?.active) continue;
        const liveMatchId = key.slice(LIVE_IMPORT_KEY_PREFIX.length);
        const tab = tabs.find(candidate =>
            candidate.id === state.tabId && directMatchIdFromUrl(candidate.url ?? '') === liveMatchId
        ) ?? tabs.find(candidate => directMatchIdFromUrl(candidate.url ?? '') === liveMatchId);

        updates[key] = tab
            ? { ...state, tabId: tab.id }
            : {
                ...state,
                active: false,
                status: 'inactive',
                stoppedAt: new Date().toISOString(),
                stoppedReason: 'No se encontró una pestaña abierta en la URL de directo.'
            };
    }

    if (Object.keys(updates).length) await browser.storage.local.set(updates);
};

browser.runtime.onStartup.addListener(() => {
    void restoreActiveImports();
});
browser.runtime.onInstalled.addListener(() => {
    void restoreActiveImports();
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!changeInfo.url || !tab.url) return;

    const activeId = directMatchIdFromUrl(tab.url);
    const stored = await browser.storage.local.get(null);
    const updates = {};

    for (const [key, state] of Object.entries(stored)) {
        if (!key.startsWith(LIVE_IMPORT_KEY_PREFIX) || !state?.active || state.tabId !== tabId) continue;
        if (activeId === state.liveMatchId) continue;

        updates[key] = {
            ...state,
            active: false,
            status: 'inactive',
            stoppedAt: new Date().toISOString(),
            stoppedReason: 'La pestaña salió de la página de partido directo.'
        };
    }

    if (Object.keys(updates).length) {
        await browser.storage.local.set(updates);
    }
});

const getSettings = async (liveMatchId) => {
    const key = `${LIVE_IMPORT_KEY_PREFIX}${liveMatchId}`;
    const result = await browser.storage.local.get(key);
    return result[key] ?? null;
};

const updateSettings = async (liveMatchId, patch) => {
    const key = `${LIVE_IMPORT_KEY_PREFIX}${liveMatchId}`;
    const current = await getSettings(liveMatchId);
    if (!current) return;
    const next = { ...current, ...patch };
    if (!current.active && patch.status) next.status = 'inactive';
    await browser.storage.local.set({ [key]: next });
};

const processSnapshots = async (liveMatchId) => {
    if (runningMatches.has(liveMatchId)) return;
    runningMatches.add(liveMatchId);

    try {
        const queue = pendingByMatch.get(liveMatchId) ?? [];
        while (queue.length) {
            const settings = await getSettings(liveMatchId);
            if (!settings?.active) {
                queue.length = 0;
                break;
            }

            const snapshot = queue.shift();
            await updateSettings(liveMatchId, { status: 'sending', error: null });
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...snapshot,
                        metadata: settings.metadata,
                        liveMatchId
                    })
                });
                const result = await response.json();
                if (!response.ok || result?.ok !== true) {
                    throw new Error(result?.error || `La API respondió ${response.status}.`);
                }

                const latest = await getSettings(liveMatchId);
                await updateSettings(liveMatchId, {
                    status: latest?.active ? 'active' : 'inactive',
                    lastSuccessfulAt: new Date().toISOString(),
                    lastResult: result.result ?? null,
                    error: null
                });
            } catch (error) {
                const latest = await getSettings(liveMatchId);
                await updateSettings(liveMatchId, {
                    status: latest?.active ? 'failed' : 'inactive',
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    } finally {
        runningMatches.delete(liveMatchId);
        if (pendingByMatch.get(liveMatchId)?.length === 0) pendingByMatch.delete(liveMatchId);
    }
};

browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
        if (!key.startsWith(LIVE_IMPORT_KEY_PREFIX) || change.newValue?.active) continue;
        const liveMatchId = key.slice(LIVE_IMPORT_KEY_PREFIX.length);
        const queue = pendingByMatch.get(liveMatchId);
        if (queue) queue.length = 0;
    }
});

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'LIVE_MATCH_SNAPSHOT') {
        const liveMatchId = String(message.liveMatchId ?? '');
        const senderMatchId = directMatchIdFromUrl(_sender.tab?.url ?? '');
        if (!liveMatchId || senderMatchId !== liveMatchId || !message.snapshot) {
            sendResponse({ ok: false, error: 'El snapshot no procede de la URL directa activa.' });
            return false;
        }

        getSettings(liveMatchId)
            .then(settings => {
                if (!settings?.active || settings.tabId !== _sender.tab?.id) {
                    sendResponse({ ok: false, error: 'La importación no está activa para esta pestaña.' });
                    return;
                }
                const queue = pendingByMatch.get(liveMatchId) ?? [];
                queue.push({
                    statsPayload: message.snapshot.statsPayload,
                    pbpPayload: message.snapshot.pbpPayload,
                    sourceUrl: _sender.tab?.url
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

});
