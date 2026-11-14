const API_BASE_URL = 'https://scrapertosupabase.onrender.com/api/federation';
const LIVE_IMPORT_KEY_PREFIX = 'liveImport:';

const form = document.getElementById('import-form');
const pageStatus = document.getElementById('page-status');
const errorNode = document.getElementById('error');
const lastResultNode = document.getElementById('last-result');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');

let activeTab;
let liveMatchId;
let storageKey;
let currentState;

const showError = (message) => {
  errorNode.textContent = message;
  errorNode.hidden = !message;
};

const setOptions = (id, values) => {
  const list = document.getElementById(id);
  list.replaceChildren(...values.map(value => {
    const option = document.createElement('option');
    option.value = String(value);
    return option;
  }));
};

const updateStateView = (state) => {
  currentState = state;
  const active = Boolean(state?.active);
  startButton.hidden = active;
  stopButton.hidden = !active;
  startButton.disabled = !liveMatchId;
  stopButton.disabled = !liveMatchId;

  if (state?.error) showError(state.error);
  else showError('');

  const statuses = {
    active: 'Importación activa',
    sending: 'Enviando snapshot...',
    failed: 'Error en la última importación',
    inactive: 'Importación detenida'
  };
  if (liveMatchId) {
    pageStatus.textContent = `${statuses[state?.status] ?? statuses[active ? 'active' : 'inactive']} · Partido ${liveMatchId}`;
  }

  if (state?.lastSuccessfulAt) {
    const score = state.lastResult?.score ? ` · Marcador ${state.lastResult.score}` : '';
    lastResultNode.textContent = `Último envío correcto: ${new Date(state.lastSuccessfulAt).toLocaleString()}${score}`;
    lastResultNode.hidden = false;
  } else {
    lastResultNode.hidden = true;
  }
};

const loadCatalogs = async () => {
  const response = await fetch(`${API_BASE_URL}/options`);
  const body = await response.json();
  if (!response.ok || body?.ok !== true || !body.options) {
    throw new Error(body?.error || `No se pudieron cargar los catálogos (${response.status}).`);
  }
  setOptions('seasons', body.options.temporadas ?? []);
  setOptions('categories', body.options.categorias ?? []);
  setOptions('competitions', body.options.competiciones ?? []);
  setOptions('matchdays', body.options.jornadas ?? []);
};

const initialize = async () => {
  try {
    [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    const activeUrl = activeTab?.url ? new URL(activeTab.url) : null;
    const match = activeUrl?.hostname === 'www.basquetcatala.cat'
      ? activeUrl.pathname.match(/\/(?:estadistica\/)?directe\/(\d+)(?:\/|$)/)
      : null;
    if (!match) {
      pageStatus.textContent = 'Abre una página de partido directo para configurar la importación.';
      form.hidden = true;
      return;
    }

    liveMatchId = match[1];
    storageKey = `${LIVE_IMPORT_KEY_PREFIX}${liveMatchId}`;
    pageStatus.textContent = `Partido directo ${liveMatchId}`;
    const stored = await browser.storage.local.get(storageKey);
    currentState = stored[storageKey] ?? null;
    if (currentState?.metadata) {
      for (const [field, value] of Object.entries(currentState.metadata)) {
        const input = form.elements.namedItem(field);
        if (input && value !== null && value !== undefined) input.value = String(value);
      }
    }
    document.getElementById('interval').value = String(currentState?.intervalSeconds ?? 5);
    updateStateView(currentState);
    await loadCatalogs();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
};

form.addEventListener('submit', async event => {
  event.preventDefault();
  showError('');
  const formData = new FormData(form);
  const metadata = {
    temporada: String(formData.get('temporada') ?? '').trim(),
    categoria: String(formData.get('categoria') ?? '').trim(),
    competicion: String(formData.get('competicion') ?? '').trim(),
    jornada: Number(formData.get('jornada'))
  };
  const intervalSeconds = Number(formData.get('intervalo'));

  if (Object.values(metadata).some(value => value === '' || value === 0)
    || !Number.isInteger(metadata.jornada) || metadata.jornada < 1) {
    showError('Completa temporada, categoría, competición y una jornada válida.');
    return;
  }
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 5 || intervalSeconds > 60) {
    showError('El intervalo debe ser un número entero entre 5 y 60 segundos.');
    return;
  }

  try {
    const nextState = {
      ...currentState,
      liveMatchId,
      tabId: activeTab.id,
      metadata,
      intervalSeconds,
      active: true,
      status: 'active',
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      stoppedReason: null,
      error: null
    };
    await browser.storage.local.set({ [storageKey]: nextState });
    updateStateView(nextState);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
});

stopButton.addEventListener('click', async () => {
  if (!currentState) return;
  try {
    const nextState = {
      ...currentState,
      active: false,
      status: 'inactive',
      stoppedAt: new Date().toISOString(),
      stoppedReason: 'Detenida manualmente.'
    };
    await browser.storage.local.set({ [storageKey]: nextState });
    updateStateView(nextState);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && storageKey && changes[storageKey]?.newValue) {
    updateStateView(changes[storageKey].newValue);
  }
});

void initialize();
