import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/content/page-hook.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

test('loads the page hook in the main world before the isolated content scripts', () => {
  const [pageHook, contentScripts] = manifest.content_scripts;

  assert.equal(pageHook.world, 'MAIN');
  assert.equal(pageHook.run_at, 'document_start');
  assert.deepEqual(pageHook.js, ['src/content/page-hook.js']);
  assert.equal(contentScripts.run_at, 'document_start');
  assert.ok(contentScripts.js.indexOf('src/content/data.js') < contentScripts.js.indexOf('src/content/index.js'));
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '128.0');
});

const createHarness = (fetchImpl, beforeHook) => {
  const listeners = new Map();
  const postedMessages = [];
  const eventSources = [];
  const requests = [];
  class MockEventSource {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      eventSources.push(this);
    }

    addEventListener(type, listener) {
      const callbacks = this.listeners.get(type) ?? [];
      callbacks.push(listener);
      this.listeners.set(type, callbacks);
    }

    emit(type, data) {
      const event = {
        data,
        stopped: false,
        stopImmediatePropagation() {
          this.stopped = true;
        }
      };
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
        if (event.stopped) break;
      }
    }
  }
  const window = {
    location: {
      href: 'https://www.basquetcatala.cat/estadistica/directe/302113',
      origin: 'https://www.basquetcatala.cat',
      pathname: '/estadistica/directe/302113'
    },
    fetch: fetchImpl,
    EventSource: MockEventSource,
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) ?? [];
      callbacks.push(listener);
      listeners.set(type, callbacks);
    },
    postMessage(message) {
      postedMessages.push(message);
    }
  };
  class XMLHttpRequest {
    constructor() {
      this.listeners = new Map();
      this.responseType = 'json';
      this.response = null;
      this.responseText = '';
      requests.push(this);
    }

    addEventListener(type, listener) {
      const callbacks = this.listeners.get(type) ?? [];
      callbacks.push(listener);
      this.listeners.set(type, callbacks);
    }

    open(method, url) {
      this.method = method;
      this.url = url;
    }

    setRequestHeader() {}

    send(body) {
      this.body = body;
    }

    complete(value) {
      this.response = value;
      this.responseText = JSON.stringify(value);
      for (const listener of this.listeners.get('load') ?? []) listener.call(this);
    }
  }

  const beforeHookState = beforeHook?.(window);
  runInNewContext(source, { window, XMLHttpRequest, URL });

  return {
    ...beforeHookState,
    postedMessages,
    requests,
    pageFetch: (...args) => window.fetch(...args),
    openEventSource: url => new window.EventSource(url),
    openXhr(method, url) {
      const request = new XMLHttpRequest();
      request.open(method, url);
      return request;
    },
    eventSources,
    requestCapturedData() {
      for (const listener of listeners.get('message') ?? []) {
        listener({
          source: window,
          origin: window.location.origin,
          data: {
            channel: '__matchonline_federation_capture__',
            type: 'GET_PAYLOADS'
          }
        });
      }
    }
  };
};

test('forwards page SSE events from a connection created before the hook', () => {
  const harness = createHarness(async () => {}, window => ({
    pageStream: new window.EventSource(
      'https://streaming.optimalwayconsulting.com/streaming/register/fcbq-302113/nonce'
    )
  }));
  harness.pageStream.addEventListener('fcbq-302113', () => {});
  harness.pageStream.emit('fcbq-302113', '{"teams":[]}');

  const forwarded = harness.postedMessages.filter(message => message.type === 'STREAM_EVENT');
  assert.equal(harness.eventSources.length, 1);
  assert.deepEqual(forwarded.map(message => message.data), ['{"teams":[]}']);
});

test('forwards only the direct match event from the page EventSource', () => {
  const harness = createHarness(async () => {});
  const pageStream = harness.openEventSource(
    'https://streaming.optimalwayconsulting.com/streaming/register/fcbq-302113/nonce'
  );
  const unrelatedStream = harness.openEventSource(
    'https://streaming.optimalwayconsulting.com/streaming/register/fcbq-999999/nonce'
  );

  pageStream.addEventListener('fcbq-302113', () => {});
  unrelatedStream.addEventListener('fcbq-302113', () => {});
  pageStream.emit('fcbq-302113', '{"teams":[]}');
  unrelatedStream.emit('fcbq-302113', '{"teams":[]}');

  const forwarded = harness.postedMessages.filter(message => message.type === 'STREAM_EVENT');
  assert.equal(harness.eventSources.length, 2);
  assert.deepEqual(forwarded.map(message => message.data), ['{"teams":[]}']);
});

test('forwards the matching event before the page can stop immediate propagation', () => {
  const harness = createHarness(async () => {});
  const pageStream = harness.openEventSource(
    'https://streaming.optimalwayconsulting.com/streaming/register/fcbq-302113/nonce'
  );
  let pageListenerCalled = false;
  pageStream.addEventListener('fcbq-302113', event => {
    pageListenerCalled = true;
    event.stopImmediatePropagation();
  });

  pageStream.emit('fcbq-302113', '{"teams":[]}');

  const forwarded = harness.postedMessages.filter(message => message.type === 'STREAM_EVENT');
  assert.equal(pageListenerCalled, true);
  assert.deepEqual(forwarded.map(message => message.data), ['{"teams":[]}']);
});

test('also forwards the legacy SSE registration path', () => {
  const harness = createHarness(async () => {});
  const pageStream = harness.openEventSource(
    'https://streaming.optimalwayconsulting.com/register/fcbq-302113/nonce'
  );
  pageStream.addEventListener('fcbq-302113', () => {});
  pageStream.emit('fcbq-302113', '{"teams":[]}');

  const forwarded = harness.postedMessages.filter(message => message.type === 'STREAM_EVENT');
  assert.deepEqual(forwarded.map(message => message.data), ['{"teams":[]}']);
});

const completeSnapshot = {
  header: { date: '2026-11-15T12:00:00Z' },
  boxscore: [],
  playByPlay: []
};

test('captures the complete snapshot from the page native fetch response', async () => {
  const requests = [];
  const harness = createHarness(async (...args) => {
    requests.push(args);
    return {
      ok: true,
      status: 200,
      clone() {
        return { json: async () => completeSnapshot };
      }
    };
  });

  await harness.pageFetch('https://streaming.optimalwayconsulting.com/302113');
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(requests.length, 1);
  const start = harness.postedMessages.find(message => message.type === 'PAGE_REFRESH_STARTED');
  const payloads = harness.postedMessages.find(message => message.type === 'PAYLOADS');
  assert.equal(start.sourcePath, '/302113');
  assert.equal(payloads.fresh, true);
  assert.equal(payloads.sourcePath, '/302113');
  assert.equal(payloads.payloads.pbpPayload, completeSnapshot);
});

test('captures the page native XHR response and traces the request start', () => {
  const harness = createHarness(async () => {
    throw new Error('No extra fetch should be needed.');
  });
  const request = harness.openXhr(
    'GET',
    'https://streaming.optimalwayconsulting.com/streaming/match-id/302113'
  );
  request.send();
  request.complete(completeSnapshot);

  const start = harness.postedMessages.find(message => message.type === 'PAGE_REFRESH_STARTED');
  const payloads = harness.postedMessages.find(message => message.type === 'PAYLOADS');
  assert.equal(start.sourcePath, '/streaming/match-id/302113');
  assert.equal(payloads.fresh, true);
  assert.equal(payloads.sourcePath, '/streaming/match-id/302113');
  assert.equal(payloads.payloads.requestStartedAt, payloads.requestStartedAt);
  assert.equal(harness.requests.length, 1);
});

test('returns cached captured data without issuing an extension-owned fetch', () => {
  let fetchCount = 0;
  const harness = createHarness(async () => {
    fetchCount += 1;
    throw new Error('No extension-owned fetch should be issued.');
  });

  harness.requestCapturedData();

  assert.equal(fetchCount, 0);
  assert.equal(harness.postedMessages.at(-1).type, 'PAYLOADS');
  assert.equal(harness.postedMessages.at(-1).fresh, false);
});
