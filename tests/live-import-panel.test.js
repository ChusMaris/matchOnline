import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/content/live-import.js", import.meta.url), "utf8");

class Element {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.listeners = {};
    }

    append(...nodes) {
        this.children.push(...nodes);
    }

    addEventListener(type, listener) {
        this.listeners[type] = listener;
    }

    setAttribute() {}

    querySelector(selector) {
        const id = selector.slice(1);
        const pending = [...this.children];
        while (pending.length) {
            const element = pending.shift();
            if (element.id === id) return element;
            pending.push(...element.children);
        }
        return null;
    }

    get elements() {
        return {
            namedItem: name => {
                const pending = [...this.children];
                while (pending.length) {
                    const element = pending.shift();
                    if (element.name === name) return element;
                    pending.push(...element.children);
                }
                return null;
            }
        };
    }
}

test("builds the editable import panel with all metadata inputs", () => {
    const start = source.indexOf("function createImportPanel()");
    const end = source.indexOf("function ensureLiveImportPanel()", start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);

    const document = { createElement: tagName => new Element(tagName) };
    const panel = runInNewContext(
        `${source.slice(start, end)}\ncreateImportPanel()`,
        {
            document,
            LIVE_IMPORT_PANEL_ID: "matchonline-live-import",
            metadataFieldNames: ["temporada", "categoria", "competicion", "jornada"]
        }
    );

    assert.ok(panel.querySelector("#matchonline-import-fields"));
    for (const name of ["temporada", "categoria", "competicion", "jornada"]) {
        assert.ok(panel.querySelector("#matchonline-import-form").elements.namedItem(name));
    }
    assert.equal(panel.querySelector("#matchonline-import-form").elements.namedItem("intervalo"), null);
    assert.equal(panel.querySelector("#matchonline-import-cancel").hidden, true);
});

test("hides and disables fields while importing, then restores them on cancel", () => {
    const start = source.indexOf("function updateImportPanel(");
    const end = source.indexOf("function addActivityEntry(", start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);

    const input = { disabled: false };
    const fields = { hidden: false, querySelectorAll: () => [input] };
    const summaryLines = [{}, {}];
    const startButton = {};
    const cancelButton = {};
    const statusNode = {};
    const lastResultNode = {};
    const logList = { replaceChildren() {} };
    const errorNode = {};
    const elements = new Map([
        ["#matchonline-import-fields", fields],
        ["#matchonline-import-summary", { hidden: true }],
        ["#matchonline-import-start", startButton],
        ["#matchonline-import-cancel", cancelButton],
        ["#matchonline-import-status", statusNode],
        ["#matchonline-import-last-result", lastResultNode],
        ["#matchonline-import-log", logList],
        ["#matchonline-import-error", errorNode]
    ]);
    const panel = {
        querySelector: selector => elements.get(selector),
        querySelectorAll: () => summaryLines
    };
    const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
    const applyState = runInNewContext(
        `${source.slice(start, end)}\nstate => updateImportPanel(panel, state)`,
        {
            panel,
            currentState: null,
            directMatchId: "12345",
            storageKey: "liveImport:1:12345",
            showImportError: (_panel, message) => { errorNode.textContent = message; }
        }
    );

    applyState({ active: true, status: "active", metadata: {} });
    assert.equal(fields.hidden, true);
    assert.equal(input.disabled, true);
    assert.equal(elements.get("#matchonline-import-summary").hidden, false);
    assert.doesNotMatch(summaryLines[1].textContent, /Cada/);
    assert.equal(startButton.hidden, true);
    assert.equal(cancelButton.hidden, false);

    applyState({ active: false, status: "inactive" });
    assert.equal(fields.hidden, false);
    assert.equal(input.disabled, false);
    assert.equal(elements.get("#matchonline-import-summary").hidden, true);
    assert.equal(startButton.hidden, false);
    assert.equal(cancelButton.hidden, true);
    assert.match(css, /#matchonline-live-import #matchonline-import-fields\[hidden\][\s\S]*?display:\s*none\s*!important/);
});
