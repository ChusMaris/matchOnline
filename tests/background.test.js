import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/background.js", import.meta.url), "utf8");

const createEvent = () => {
    const listeners = [];
    return {
        addListener(listener) {
            listeners.push(listener);
        },
        emit(...args) {
            return listeners.map(listener => listener(...args));
        },
        listeners
    };
};

const createHarness = (tabs, fetchImpl) => {
    const storage = {};
    const storageChanged = createEvent();
    const message = createEvent();
    const onUpdated = createEvent();
    const onRemoved = createEvent();
    const onInstalled = createEvent();
    const browser = {
        runtime: {
            onMessage: message,
            onStartup: createEvent(),
            onInstalled
        },
        tabs: {
            query: async () => tabs,
            onUpdated,
            onRemoved
        },
        storage: {
            onChanged: storageChanged,
            local: {
                async get(key) {
                    if (key === null) return structuredClone(storage);
                    return key in storage ? { [key]: structuredClone(storage[key]) } : {};
                },
                async set(values) {
                    const changes = {};
                    for (const [key, newValue] of Object.entries(values)) {
                        changes[key] = {
                            oldValue: storage[key] === undefined ? undefined : structuredClone(storage[key]),
                            newValue: structuredClone(newValue)
                        };
                        storage[key] = structuredClone(newValue);
                    }
                    storageChanged.emit(changes, "local");
                }
            }
        }
    };
    runInNewContext(source, { browser, fetch: fetchImpl, URL, console, Date, Math, Map, Set });

    return {
        storage,
        setStorage: values => browser.storage.local.set(values),
        updateTab: (...args) => Promise.all(onUpdated.emit(...args)),
        install: () => onInstalled.emit(),
        sendMessage(payload, tab) {
            return new Promise(resolve => {
                for (const listener of message.listeners) {
                    if (listener(payload, { tab }, resolve) === true) return;
                }
                resolve(undefined);
            });
        }
    };
};

const waitFor = async predicate => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    assert.fail("Timed out waiting for background processing.");
};

const activeState = (tabId, liveMatchId, metadata) => ({
    tabId,
    liveMatchId,
    metadata,
    active: true,
    status: "active",
    sessionId: `session-${tabId}`
});

const snapshotMessage = (liveMatchId, tabId) => ({
    type: "LIVE_MATCH_SNAPSHOT",
    liveMatchId,
    sessionId: `session-${tabId}`,
    snapshot: {
        statsPayload: { header: {}, boxscore: [] },
        pbpPayload: { playByPlay: [] }
    }
});

test("serializes the same match across tabs and keeps other tabs queued when one is canceled", async () => {
    const requests = [];
    const harness = createHarness([
        { id: 1, url: "https://www.basquetcatala.cat/directe/302113" },
        { id: 2, url: "https://www.basquetcatala.cat/estadistica/directe/302113" }
    ], (url, init) => new Promise(resolve => {
        requests.push({ url, body: JSON.parse(init.body), resolve });
    }));
    const key1 = "liveImport:1:302113";
    const key2 = "liveImport:2:302113";
    await harness.setStorage({
        [key1]: activeState(1, "302113", { categoria: "A" }),
        [key2]: activeState(2, "302113", { categoria: "B" })
    });

    const tab1 = { id: 1, url: "https://www.basquetcatala.cat/directe/302113" };
    const tab2 = { id: 2, url: "https://www.basquetcatala.cat/estadistica/directe/302113" };
    assert.equal((await harness.sendMessage(snapshotMessage("302113", 1), tab1)).queued, true);
    await waitFor(() => requests.length === 1);
    assert.equal((await harness.sendMessage(snapshotMessage("302113", 2), tab2)).queued, true);
    await harness.setStorage({
        [key1]: { ...harness.storage[key1], active: false, status: "inactive" }
    });
    assert.equal(requests.length, 1);

    requests[0].resolve({ ok: true, json: async () => ({ ok: true }) });
    await waitFor(() => requests.length === 2);
    assert.equal(requests[0].body.metadata.categoria, "A");
    assert.equal(requests[1].body.metadata.categoria, "B");
    assert.equal(requests[0].url, "https://scrapertosupabase.onrender.com/api/federation/live-import");
    assert.equal(requests[1].url, requests[0].url);

    requests[1].resolve({ ok: true, json: async () => ({ ok: true }) });
    await waitFor(() => harness.storage[key2].status === "active");
    assert.equal(harness.storage[key1].active, false);
    assert.equal(harness.storage[key2].active, true);
    assert.ok(harness.storage[key2].activityLog.some(entry => /Enviando/.test(entry.message)));
    assert.ok(harness.storage[key2].activityLog.some(entry => /correctamente/.test(entry.message)));
});

test("submits different matches concurrently from separate tabs", async () => {
    const requests = [];
    const harness = createHarness([
        { id: 3, url: "https://www.basquetcatala.cat/directe/3003" },
        { id: 4, url: "https://www.basquetcatala.cat/directe/4004" }
    ], (_url, init) => new Promise(resolve => {
        requests.push({ body: JSON.parse(init.body), resolve });
    }));
    await harness.setStorage({
        "liveImport:3:3003": activeState(3, "3003", { categoria: "A" }),
        "liveImport:4:4004": activeState(4, "4004", { categoria: "B" })
    });

    await harness.sendMessage(snapshotMessage("3003", 3), {
        id: 3,
        url: "https://www.basquetcatala.cat/directe/3003"
    });
    await harness.sendMessage(snapshotMessage("4004", 4), {
        id: 4,
        url: "https://www.basquetcatala.cat/directe/4004"
    });
    await waitFor(() => requests.length === 2);

    assert.deepEqual(requests.map(request => request.body.liveMatchId).sort(), ["3003", "4004"]);
    for (const request of requests) {
        request.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    await waitFor(() =>
        harness.storage["liveImport:3:3003"].status === "active"
        && harness.storage["liveImport:4:4004"].status === "active"
    );
});

test("stops only the session whose tab navigates away from its direct match", async () => {
    const harness = createHarness([
        { id: 1, url: "https://www.basquetcatala.cat/directe/1001" },
        { id: 2, url: "https://www.basquetcatala.cat/directe/2002" }
    ], async () => ({ ok: true, json: async () => ({ ok: true }) }));
    const firstKey = "liveImport:1:1001";
    const secondKey = "liveImport:2:2002";
    await harness.setStorage({
        [firstKey]: activeState(1, "1001", { categoria: "A" }),
        [secondKey]: activeState(2, "2002", { categoria: "B" })
    });

    await harness.updateTab(
        1,
        { url: "https://www.basquetcatala.cat/estadistica/partit/finished" },
        { id: 1, url: "https://www.basquetcatala.cat/estadistica/partit/finished" }
    );

    assert.equal(harness.storage[firstKey].active, false);
    assert.equal(harness.storage[secondKey].active, true);
});

test("migrates existing match settings to the tab-specific storage key", async () => {
    const harness = createHarness([
        { id: 8, url: "https://www.basquetcatala.cat/directe/8080" }
    ], async () => ({ ok: true, json: async () => ({ ok: true }) }));
    await harness.setStorage({
        "liveImport:8080": {
            ...activeState(8, "8080", { categoria: "Sènior" }),
            intervalSeconds: 10
        }
    });

    harness.install();
    await waitFor(() => harness.storage["liveImport:8:8080"]?.active === true);

    assert.equal(harness.storage["liveImport:8:8080"].metadata.categoria, "Sènior");
    assert.equal(harness.storage["liveImport:8:8080"].intervalSeconds, 10);
    assert.equal(harness.storage["liveImport:8080"].active, false);
});
