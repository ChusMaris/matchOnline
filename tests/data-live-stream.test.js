import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/content/data.js", import.meta.url), "utf8");

test("updates the scoreboard from SSE without starting a duplicate snapshot request", () => {
    const listeners = new Map();
    const messages = [];
    const renderedScores = [];
    const window = {
        location: {
            origin: "https://www.basquetcatala.cat",
            pathname: "/estadistica/directe/302113"
        },
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        postMessage(message) {
            messages.push(message);
        }
    };
    const document = {
        getElementById() {
            return null;
        },
        createElement() {
            return { remove() {} };
        },
        documentElement: { appendChild() {} }
    };
    const browser = {
        runtime: { getURL: path => `moz-extension://test/${path}` },
        storage: {
            onChanged: { addListener() {} }
        }
    };

    runInNewContext(
        `${source}\nimportSettings = { active: true };`,
        {
            window,
            browser,
            document,
            console,
            injectScoreboard: (...args) => renderedScores.push(args),
            triggerScoreBlink() {}
        }
    );

    const streamState = {
        teams: [
            { name: "Local", periods: [{ score: 21 }], players: [] },
            { name: "Visitante", periods: [{ score: 17 }], players: [] }
        ]
    };
    const deliver = () => listeners.get("message")({
        source: window,
        origin: window.location.origin,
        data: {
            channel: "__matchonline_federation_capture__",
            type: "STREAM_EVENT",
            data: JSON.stringify(streamState)
        }
    });

    deliver();
    deliver();

    assert.equal(renderedScores.length, 2);
    assert.deepEqual(renderedScores[0].slice(1, 4), [21, "Visitante", 17]);
    assert.equal(messages.some(message => message.type === "GET_PAYLOADS"), false);
});

test("enqueues a complete captured snapshot during an active import", async () => {
    const listeners = new Map();
    const sentMessages = [];
    const window = {
        location: {
            origin: "https://www.basquetcatala.cat",
            pathname: "/estadistica/directe/302113"
        },
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        postMessage() {}
    };
    const browser = {
        runtime: {
            sendMessage(message) {
                sentMessages.push(message);
                return Promise.resolve({ ok: true });
            }
        },
        storage: {
            onChanged: { addListener() {} }
        }
    };

    runInNewContext(
        `${source}\nsettingsKey = "live-import:1:302113"; importSettings = { active: true, sessionId: "session-1" };`,
        {
            window,
            browser,
            console,
            injectScoreboard() {},
            triggerScoreBlink() {}
        }
    );

    const snapshot = {
        statsPayload: {
            header: {
                localTeam: { name: "Local" },
                visitorTeam: { name: "Visitante" },
                score: { local: 52, visitor: 48 }
            },
            boxscore: []
        },
        pbpPayload: { playByPlay: [] }
    };
    listeners.get("message")({
        source: window,
        origin: window.location.origin,
        data: {
            channel: "__matchonline_federation_capture__",
            type: "PAYLOADS",
            payloads: snapshot
        }
    });

    await new Promise(resolve => setImmediate(resolve));
    const importRequest = sentMessages.find(message => message.type === "LIVE_MATCH_SNAPSHOT");
    assert.ok(importRequest);
    assert.equal(importRequest.liveMatchId, "302113");
    assert.equal(importRequest.sessionId, "session-1");
    assert.equal(importRequest.snapshot.statsPayload.header.score.local, 52);
});

test("does not let a stale full snapshot overwrite a newer SSE scoreboard", () => {
    const listeners = new Map();
    const renderedScores = [];
    const window = {
        location: {
            origin: "https://www.basquetcatala.cat",
            pathname: "/estadistica/directe/302113"
        },
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        postMessage() {}
    };
    const browser = {
        runtime: {},
        storage: {
            onChanged: { addListener() {} }
        }
    };

    runInNewContext(
        `${source}\nimportSettings = { active: false };`,
        {
            window,
            browser,
            console,
            injectScoreboard: (...args) => renderedScores.push(args),
            triggerScoreBlink() {}
        }
    );

    listeners.get("message")({
        source: window,
        origin: window.location.origin,
        data: {
            channel: "__matchonline_federation_capture__",
            type: "STREAM_EVENT",
            data: JSON.stringify({
                teams: [
                    { name: "Local", periods: [{ score: 21 }], players: [] },
                    { name: "Visitante", periods: [{ score: 17 }], players: [] }
                ]
            })
        }
    });
    listeners.get("message")({
        source: window,
        origin: window.location.origin,
        data: {
            channel: "__matchonline_federation_capture__",
            type: "PAYLOADS",
            payloads: {
                statsPayload: {
                    header: {
                        localTeam: { name: "Local" },
                        visitorTeam: { name: "Visitante" },
                        score: { local: 19, visitor: 17 }
                    },
                    boxscore: []
                }
            }
        }
    });

    assert.equal(renderedScores.length, 1);
    assert.deepEqual(renderedScores[0].slice(1, 4), [21, "Visitante", 17]);
});

test("logs the SSE score while waiting for the page's native refresh", async () => {
    const listeners = new Map();
    const messages = [];
    let storedSettings = { active: true, activityLog: [] };
    const window = {
        location: {
            origin: "https://www.basquetcatala.cat",
            pathname: "/estadistica/directe/302113"
        },
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        postMessage(message) {
            messages.push(message);
        }
    };
    const browser = {
        runtime: {},
        storage: {
            local: {
                async get(key) {
                    return { [key]: storedSettings };
                },
                async set(values) {
                    storedSettings = values["live-import:1:302113"];
                }
            },
            onChanged: { addListener() {} }
        }
    };

    runInNewContext(
        `${source}\nsettingsKey = "live-import:1:302113"; importSettings = { active: true, sessionId: "session-1" };`,
        {
            window,
            browser,
            console,
            injectScoreboard() {},
            triggerScoreBlink() {}
        }
    );
    listeners.get("message")({
        source: window,
        origin: window.location.origin,
        data: {
            channel: "__matchonline_federation_capture__",
            type: "STREAM_EVENT",
            data: JSON.stringify({
                teams: [
                    { name: "Local", periods: [{ score: 21 }], players: [] },
                    { name: "Visitante", periods: [{ score: 17 }], players: [] }
                ]
            })
        }
    });

    await new Promise(resolve => setImmediate(resolve));
    assert.match(storedSettings.activityLog[0].message, /Evento SSE recibido: 21-17/);
    assert.equal(messages.some(message => message.type === "GET_PAYLOADS"), false);
});

test("logs when the page starts and completes its native data refresh", async () => {
    const listeners = new Map();
    const sentMessages = [];
    let storedSettings = { active: true, activityLog: [] };
    const window = {
        location: {
            origin: "https://www.basquetcatala.cat",
            pathname: "/estadistica/directe/302113"
        },
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        postMessage() {}
    };
    const browser = {
        runtime: {
            sendMessage(message) {
                sentMessages.push(message);
                return Promise.resolve({ ok: true });
            }
        },
        storage: {
            local: {
                async get(key) {
                    return { [key]: storedSettings };
                },
                async set(values) {
                    storedSettings = values["live-import:1:302113"];
                }
            },
            onChanged: { addListener() {} }
        }
    };

    runInNewContext(
        `${source}\nsettingsKey = "live-import:1:302113"; importSettings = { active: true, sessionId: "session-1" };`,
        {
            window,
            browser,
            console,
            injectScoreboard() {},
            triggerScoreBlink() {}
        }
    );

    const requestStartedAt = new Date().toISOString();
    listeners.get("message")({
        source: window,
        origin: window.location.origin,
        data: {
            channel: "__matchonline_federation_capture__",
            type: "PAGE_REFRESH_STARTED",
            sourcePath: "/291286",
            at: requestStartedAt
        }
    });
    listeners.get("message")({
        source: window,
        origin: window.location.origin,
        data: {
            channel: "__matchonline_federation_capture__",
            type: "PAYLOADS",
            payloads: {
                statsPayload: {
                    header: {
                        localTeam: { name: "Local" },
                        visitorTeam: { name: "Visitante" },
                        score: { local: 21, visitor: 17 }
                    },
                    boxscore: []
                },
                pbpPayload: { playByPlay: [] }
            },
            fresh: true,
            sourcePath: "/291286",
            requestStartedAt
        }
    });

    await new Promise(resolve => setImmediate(resolve));
    const activityMessages = storedSettings.activityLog.map(entry => entry.message);
    assert.ok(activityMessages.includes("La web inicia actualización: /291286."));
    assert.ok(activityMessages.includes("Datos recibidos de la web: /291286."));
    assert.equal(sentMessages.some(message => message.type === "LIVE_MATCH_SNAPSHOT"), true);
});
