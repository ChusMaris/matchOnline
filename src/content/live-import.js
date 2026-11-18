const LIVE_IMPORT_PANEL_ID = "matchonline-live-import";
const directMatchId = window.location.hostname === "www.basquetcatala.cat"
    ? window.location.pathname.match(/\/(?:estadistica\/)?directe\/(\d+)(?:\/|$)/)?.[1] ?? null
    : null;

let storageKey = null;
let currentState = null;

function showImportError(panel, message) {
    const errorNode = panel.querySelector("#matchonline-import-error");
    errorNode.textContent = message || "";
    errorNode.hidden = !message;
}

function setImportOptions(panel, id, values) {
    const list = panel.querySelector(`#${id}`);
    list.replaceChildren(...values.map(value => {
        const option = document.createElement("option");
        option.value = String(value);
        return option;
    }));
}

function updateImportPanel(panel, state) {
    currentState = state;
    const active = Boolean(state?.active);
    const form = panel.querySelector("#matchonline-import-form");
    const fields = panel.querySelector("#matchonline-import-fields");
    fields.querySelectorAll("input").forEach(input => {
        input.disabled = active;
    });
    const summary = panel.querySelector("#matchonline-import-summary");
    const summaryLines = panel.querySelectorAll(".matchonline-import-summary-line");
    const startButton = panel.querySelector("#matchonline-import-start");
    const cancelButton = panel.querySelector("#matchonline-import-cancel");
    const statusNode = panel.querySelector("#matchonline-import-status");
    const lastResultNode = panel.querySelector("#matchonline-import-last-result");
    const logList = panel.querySelector("#matchonline-import-log");
    const statuses = {
        active: "Importación activa",
        sending: "Enviando estadísticas...",
        failed: "Error en la última importación",
        inactive: "Importación detenida"
    };

    fields.hidden = active;
    summary.hidden = !active;
    summaryLines[0].textContent = `${state?.metadata?.temporada ?? ""} · ${state?.metadata?.categoria ?? ""}`;
    summaryLines[1].textContent = `${state?.metadata?.competicion ?? ""} · Jornada ${state?.metadata?.jornada ?? ""}`;
    startButton.hidden = active;
    startButton.disabled = !storageKey;
    cancelButton.hidden = !active;
    cancelButton.disabled = !storageKey;
    statusNode.textContent = directMatchId
        ? `${statuses[state?.status] ?? statuses.inactive} · Partido ${directMatchId}`
        : "Abre una página de partido directo para importar.";
    showImportError(panel, state?.error || "");

    if (state?.lastSuccessfulAt) {
        const score = state.lastResult?.score ? ` · Marcador ${state.lastResult.score}` : "";
        lastResultNode.textContent =
            `Último envío correcto: ${new Date(state.lastSuccessfulAt).toLocaleString()}${score}`;
        lastResultNode.hidden = false;
    } else {
        lastResultNode.textContent = "";
        lastResultNode.hidden = true;
    }

    const logs = Array.isArray(state?.activityLog) ? state.activityLog.slice(-4).reverse() : [];
    logList.replaceChildren(...logs.map(entry => {
        const item = document.createElement("li");
        const timestamp = new Date(entry.at).toLocaleTimeString();
        item.textContent = `${timestamp} · ${entry.message}`;
        return item;
    }));
    logList.hidden = logs.length === 0;
}

function addActivityEntry(state, message) {
    const entry = { at: new Date().toISOString(), message };
    return [...(Array.isArray(state?.activityLog) ? state.activityLog : []), entry].slice(-10);
}

async function loadImportContext(panel) {
    if (!directMatchId) {
        updateImportPanel(panel, null);
        panel.querySelector("#matchonline-import-form").hidden = true;
        return;
    }

    try {
        const context = await browser.runtime.sendMessage({ type: "LIVE_IMPORT_CONTEXT" });
        if (!context?.ok || !context.storageKey) {
            throw new Error(context?.error || "No se pudo identificar esta pestaña.");
        }
        storageKey = context.storageKey;
        currentState = context.state ?? null;

        const form = panel.querySelector("#matchonline-import-form");
        if (currentState?.metadata) {
            for (const [field, value] of Object.entries(currentState.metadata)) {
                const input = form.elements.namedItem(field);
                if (input && value !== null && value !== undefined && String(value).trim()) {
                    input.value = String(value);
                }
            }
        }
        updateImportPanel(panel, currentState);

        try {
            const catalogResponse = await browser.runtime.sendMessage({ type: "LIVE_IMPORT_OPTIONS" });
            if (!catalogResponse?.ok || !catalogResponse.options) {
                throw new Error(catalogResponse?.error || "No se pudieron cargar los catálogos.");
            }
            setImportOptions(panel, "matchonline-seasons", catalogResponse.options.temporadas ?? []);
            setImportOptions(panel, "matchonline-categories", catalogResponse.options.categorias ?? []);
            setImportOptions(panel, "matchonline-competitions", catalogResponse.options.competiciones ?? []);
            setImportOptions(panel, "matchonline-matchdays", catalogResponse.options.jornadas ?? []);
        } catch (error) {
            showImportError(panel, error instanceof Error ? error.message : String(error));
        }
    } catch (error) {
        showImportError(panel, error instanceof Error ? error.message : String(error));
    }
}

function createImportPanel() {
    const panel = document.createElement("section");
    panel.id = LIVE_IMPORT_PANEL_ID;
    panel.className = "matchonline-import-panel";
    panel.setAttribute("aria-label", "Importación de partido en directo");
    const heading = document.createElement("h3");
    heading.textContent = "Importar partido en directo";
    panel.append(heading);

    const statusNode = document.createElement("p");
    statusNode.id = "matchonline-import-status";
    statusNode.setAttribute("role", "status");
    statusNode.textContent = "Comprobando partido...";
    panel.append(statusNode);

    const form = document.createElement("form");
    form.id = "matchonline-import-form";
    const summary = document.createElement("div");
    summary.id = "matchonline-import-summary";
    summary.className = "matchonline-import-summary";
    summary.hidden = true;
    for (let index = 0; index < 2; index += 1) {
        const line = document.createElement("p");
        line.className = "matchonline-import-summary-line";
        summary.append(line);
    }
    form.append(summary);

    const fields = document.createElement("div");
    fields.id = "matchonline-import-fields";
    form.append(fields);
    const addField = (labelText, id, name, options = {}) => {
        const label = document.createElement("label");
        label.htmlFor = id;
        label.textContent = labelText;

        const input = document.createElement("input");
        input.id = id;
        input.name = name;
        input.required = true;
        if (options.type) input.type = options.type;
        if (options.list) {
            input.setAttribute("list", options.list);
            const list = document.createElement("datalist");
            list.id = options.list;
            fields.append(label, input, list);
        } else {
            fields.append(label, input);
        }
        if (options.min !== undefined) input.min = String(options.min);
        if (options.max !== undefined) input.max = String(options.max);
        if (options.step !== undefined) input.step = String(options.step);
        if (options.value !== undefined) input.value = String(options.value);
        if (options.autocomplete) input.autocomplete = options.autocomplete;
    };

    addField("Temporada", "matchonline-season", "temporada", {
        list: "matchonline-seasons",
        autocomplete: "off"
    });
    addField("Categoría", "matchonline-category", "categoria", {
        list: "matchonline-categories",
        autocomplete: "off"
    });
    addField("Competición", "matchonline-competition", "competicion", {
        list: "matchonline-competitions",
        autocomplete: "off"
    });
    addField("Jornada", "matchonline-matchday", "jornada", {
        list: "matchonline-matchdays",
        type: "number",
        min: 1,
        step: 1
    });
    const errorNode = document.createElement("p");
    errorNode.id = "matchonline-import-error";
    errorNode.className = "matchonline-import-error";
    errorNode.setAttribute("role", "alert");
    errorNode.hidden = true;

    const lastResultNode = document.createElement("p");
    lastResultNode.id = "matchonline-import-last-result";
    lastResultNode.className = "matchonline-import-last-result";
    lastResultNode.hidden = true;
    form.append(errorNode, lastResultNode);

    const logList = document.createElement("ul");
    logList.id = "matchonline-import-log";
    logList.className = "matchonline-import-log";
    logList.setAttribute("aria-label", "Actividad de importación");
    logList.hidden = true;
    form.append(logList);

    const startButton = document.createElement("button");
    startButton.id = "matchonline-import-start";
    startButton.type = "submit";
    startButton.textContent = "Iniciar importación";
    form.append(startButton);

    const cancelButton = document.createElement("button");
    cancelButton.id = "matchonline-import-cancel";
    cancelButton.type = "button";
    cancelButton.textContent = "Cancelar importación";
    cancelButton.hidden = true;
    form.append(cancelButton);
    panel.append(form);

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!storageKey || currentState?.active) return;
        showImportError(panel, "");

        const form = event.currentTarget;
        const values = new FormData(form);
        const metadata = {
            temporada: String(values.get("temporada") ?? "").trim(),
            categoria: String(values.get("categoria") ?? "").trim(),
            competicion: String(values.get("competicion") ?? "").trim(),
            jornada: Number(values.get("jornada"))
        };
        if (Object.values(metadata).some(value => value === "" || value === 0)
            || !Number.isInteger(metadata.jornada) || metadata.jornada < 1) {
            showImportError(panel, "Completa temporada, categoría, competición y una jornada válida.");
            return;
        }

        try {
            const nextState = {
                ...currentState,
                liveMatchId: directMatchId,
                tabId: Number(storageKey.split(":")[1]),
                metadata,
                activityLog: addActivityEntry(currentState, "Importación iniciada."),
                sessionId: globalThis.crypto?.randomUUID?.()
                    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                active: true,
                status: "active",
                startedAt: new Date().toISOString(),
                stoppedAt: null,
                stoppedReason: null,
                error: null
            };
            await browser.storage.local.set({ [storageKey]: nextState });
            updateImportPanel(panel, nextState);
        } catch (error) {
            showImportError(panel, error instanceof Error ? error.message : String(error));
        }
    });

    panel.querySelector("#matchonline-import-cancel").addEventListener("click", async () => {
        if (!storageKey || !currentState?.active) return;
        try {
            const nextState = {
                ...currentState,
                active: false,
                status: "inactive",
                stoppedAt: new Date().toISOString(),
                stoppedReason: "Importación cancelada desde la página.",
                activityLog: addActivityEntry(currentState, "Importación cancelada.")
            };
            await browser.storage.local.set({ [storageKey]: nextState });
            updateImportPanel(panel, nextState);
        } catch (error) {
            showImportError(panel, error instanceof Error ? error.message : String(error));
        }
    });

    return panel;
}

function ensureLiveImportPanel() {
    if (!directMatchId || !document.body) return;
    let panel = document.getElementById(LIVE_IMPORT_PANEL_ID);
    if (!panel) {
        panel = createImportPanel();
        document.body.insertAdjacentElement("afterbegin", panel);
        void loadImportContext(panel);
    }
    panel.hidden = false;
    panel.style.setProperty("display", "block", "important");
    panel.style.setProperty("visibility", "visible", "important");

    const scoreboard = document.getElementById("basquet-catala-scoreboard-container");
    if (scoreboard?.parentElement && panel.nextElementSibling !== scoreboard) {
        scoreboard.parentElement.insertBefore(panel, scoreboard);
    }
}

let liveImportPanelObserver = null;

function observeLiveImportPanel() {
    if (!document.documentElement || liveImportPanelObserver) return;
    liveImportPanelObserver = new MutationObserver(ensureLiveImportPanel);
    liveImportPanelObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    ensureLiveImportPanel();
}

if (document.documentElement) {
    observeLiveImportPanel();
} else {
    document.addEventListener("DOMContentLoaded", observeLiveImportPanel, { once: true });
}

browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !storageKey || !changes[storageKey]) return;
    const panel = document.getElementById(LIVE_IMPORT_PANEL_ID);
    if (panel) updateImportPanel(panel, changes[storageKey].newValue ?? null);
});
