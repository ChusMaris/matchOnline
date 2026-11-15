import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/content/data.js", import.meta.url), "utf8");

const createHarness = async () => {
    const windowListeners = new Map();
    const rendered = [];
    const storageListeners = [];
    const browser = {
        runtime: {
            getURL: path => `moz-extension://test/${path}`,
            sendMessage: async () => ({
                ok: true,
                storageKey: "liveImport:1:302113",
                state: null
            })
        },
        storage: {
            local: { get: async () => ({}) },
            onChanged: { addListener: listener => storageListeners.push(listener) }
        }
    };
    const document = {
        location: { pathname: "/estadistica/directe/302113" },
        getElementById: () => null,
        createElement: () => ({
            remove() {},
            set src(value) { this.source = value; }
        }),
        documentElement: {
            appendChild(script) {
                script.onload?.();
            }
        },
        head: { appendChild() {} }
    };
    const window = {
        location: {
            pathname: "/estadistica/directe/302113",
            origin: "https://www.basquetcatala.cat"
        },
        addEventListener(type, listener) {
            const listeners = windowListeners.get(type) ?? [];
            listeners.push(listener);
            windowListeners.set(type, listeners);
        },
        postMessage() {}
    };
    class EventSource {
        addEventListener() {}
        close() {}
    }

    await runInNewContext(`${source}\ninitializeLiveUpdates()`, {
        window,
        document,
        browser,
        EventSource,
        setInterval: () => 1,
        clearInterval() {},
        injectScoreboard: (...args) => rendered.push(args),
        triggerScoreBlink() {},
        console
    });

    return {
        rendered,
        sendCapturedPayloads(payloads) {
            for (const listener of windowListeners.get("message") ?? []) {
                listener({
                    source: window,
                    origin: window.location.origin,
                    data: {
                        channel: "__matchonline_federation_capture__",
                        type: "PAYLOADS",
                        payloads
                    }
                });
            }
        }
    };
};

test("renders the extension scoreboard from a full snapshot when no SSE event has arrived", async () => {
    const harness = await createHarness();
    harness.sendCapturedPayloads({
        statsPayload: {
            header: {
                localTeam: { name: "LOCAL" },
                visitorTeam: { name: "VISITOR" },
                score: { local: 59, visitor: 65 }
            },
            boxscore: [{
                period: 0,
                local: {
                    players: [{
                        dorsal: "7",
                        name: "PLAYER LOCAL",
                        accumulated: { pts: 12, fc: 3 }
                    }]
                },
                visitor: {
                    players: [{
                        dorsal: "9",
                        name: "PLAYER VISITOR",
                        accumulated: { pts: 15, fc: 2 }
                    }]
                }
            }]
        },
        pbpPayload: { playByPlay: [] }
    });

    assert.equal(harness.rendered.length, 1);
    assert.deepEqual(
        JSON.parse(JSON.stringify(harness.rendered[0])),
        [
            "LOCAL",
            59,
            "VISITOR",
            65,
            [{ dorsal: "7", name: "PLAYER LOCAL", points: 12, fouls: 3 }],
            [{ dorsal: "9", name: "PLAYER VISITOR", points: 15, fouls: 2 }]
        ]
    );
});
