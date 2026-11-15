import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/content/page-hook.js', import.meta.url), 'utf8');

const createHarness = fetchImpl => {
  const listeners = new Map();
  const postedMessages = [];
  const window = {
    location: {
      href: 'https://www.basquetcatala.cat/estadistica/directe/302113',
      origin: 'https://www.basquetcatala.cat',
      pathname: '/estadistica/directe/302113'
    },
    fetch: fetchImpl,
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) ?? [];
      callbacks.push(listener);
      listeners.set(type, callbacks);
    },
    postMessage(message) {
      postedMessages.push(message);
    }
  };
  class XMLHttpRequest {}

  runInNewContext(source, { window, XMLHttpRequest, URL, Request });

  return {
    postedMessages,
    pageFetch: (...args) => window.fetch(...args),
    requestRefresh() {
      for (const listener of listeners.get('message') ?? []) {
        listener({
          source: window,
          origin: window.location.origin,
          data: {
            channel: '__matchonline_federation_capture__',
            type: 'GET_PAYLOADS',
            refresh: true
          }
        });
      }
    }
  };
};

const completeSnapshot = {
  header: { date: '2026-11-15T12:00:00Z' },
  boxscore: [],
  playByPlay: []
};

test('refreshes a complete federation snapshot without using the cache', async () => {
  const requests = [];
  const harness = createHarness(async (...args) => {
    requests.push(args);
    return {
      ok: true,
      status: 200,
      json: async () => completeSnapshot,
      clone() {
        return { json: async () => completeSnapshot };
      }
    };
  });

  harness.requestRefresh();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0][0].url,
    'https://streaming.optimalwayconsulting.com/streaming/match-id/302113'
  );
  assert.equal(requests[0][0].cache, 'no-store');
  assert.equal(requests[0][0].credentials, 'include');
  assert.equal(harness.postedMessages.at(-1).type, 'PAYLOADS');
  assert.equal(harness.postedMessages.at(-1).payloads.pbpPayload, completeSnapshot);
});

test('replays the page request headers and credentials when refreshing the snapshot', async () => {
  const requests = [];
  const harness = createHarness(async (...args) => {
    requests.push(args);
    return {
      ok: true,
      status: 200,
      json: async () => completeSnapshot,
      clone() {
        return { json: async () => completeSnapshot };
      }
    };
  });

  await harness.pageFetch(
    'https://streaming.optimalwayconsulting.com/streaming/match-id/302113',
    {
      credentials: 'include',
      headers: { authorization: 'Bearer test-token', 'x-client': 'match-page' }
    }
  );
  harness.requestRefresh();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(requests.length, 2);
  const refreshedRequest = requests[1][0];
  assert.equal(refreshedRequest.credentials, 'include');
  assert.equal(refreshedRequest.headers.get('authorization'), 'Bearer test-token');
  assert.equal(refreshedRequest.headers.get('x-client'), 'match-page');
  assert.equal(refreshedRequest.cache, 'no-store');
});

test('reports an error when the refreshed response is not a complete snapshot', async () => {
  const harness = createHarness(async () => ({
    ok: true,
    json: async () => ({ header: {}, boxscore: [] }),
    clone() {
      return { json: async () => ({ header: {}, boxscore: [] }) };
    }
  }));

  harness.requestRefresh();
  await new Promise(resolve => setImmediate(resolve));

  const errorMessage = harness.postedMessages.find(message => message.type === 'CAPTURE_ERROR');
  assert.match(errorMessage.error, /no contiene estadísticas y play-by-play completos/);
});

test('includes upstream response details when refreshing the snapshot fails', async () => {
  const harness = createHarness(async () => ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    clone() {
      return { text: async () => 'upstream match service failed' };
    }
  }));

  harness.requestRefresh();
  await new Promise(resolve => setImmediate(resolve));

  const errorMessage = harness.postedMessages.find(message => message.type === 'CAPTURE_ERROR');
  assert.match(errorMessage.error, /500 Internal Server Error/);
  assert.match(errorMessage.error, /upstream match service failed/);
});
