(() => {
    const channel = '__matchonline_federation_capture__';
    if (window[channel]) return;

    const captured = {
        statsPayload: null,
        pbpPayload: null,
        streamHookError: null,
        sourcePath: null,
        capturedAt: null,
        statsRequestStartedAt: null,
        pbpRequestStartedAt: null,
        requestStartedAt: null
    };
    window[channel] = captured;
    const directMatchId = window.location.pathname.match(/\/(?:estadistica\/)?directe\/(\d+)(?:\/|$)/)?.[1];

    const collectPayloads = (root) => {
        const found = { statsPayload: null, pbpPayload: null };
        const queue = [{ value: root, depth: 0 }];
        const seen = new WeakSet();

        while (queue.length && (!found.statsPayload || !found.pbpPayload)) {
            const { value, depth } = queue.shift();
            if (!value || typeof value !== 'object' || seen.has(value)) continue;
            seen.add(value);

            if (value.header && Array.isArray(value.boxscore)) found.statsPayload = value;
            if (Array.isArray(value.playByPlay)) found.pbpPayload = value;

            if (depth < 6) {
                for (const nested of Object.values(value)) {
                    if (nested && typeof nested === 'object') queue.push({ value: nested, depth: depth + 1 });
                }
            }
        }
        return found;
    };

    const sourcePathFor = value => {
        try {
            return new URL(String(value ?? ''), window.location.href).pathname;
        } catch {
            return null;
        }
    };

    const rememberPayload = (value, sourceUrl, requestStartedAt) => {
        const found = collectPayloads(value);
        if (found.statsPayload) {
            captured.statsPayload = found.statsPayload;
            captured.statsRequestStartedAt = requestStartedAt;
        }
        if (found.pbpPayload) {
            captured.pbpPayload = found.pbpPayload;
            captured.pbpRequestStartedAt = requestStartedAt;
        }
        if (!found.statsPayload && !found.pbpPayload) return;
        const requestTimes = [captured.statsRequestStartedAt, captured.pbpRequestStartedAt]
            .map(value => Date.parse(value ?? ""))
            .filter(Number.isFinite);
        captured.requestStartedAt = requestTimes.length
            ? new Date(Math.max(...requestTimes)).toISOString()
            : null;
        captured.sourcePath = sourcePathFor(sourceUrl);
        captured.capturedAt = new Date().toISOString();
        window.postMessage({
            channel,
            type: 'PAYLOADS',
            payloads: captured,
            fresh: true,
            sourcePath: captured.sourcePath,
            capturedAt: captured.capturedAt,
            requestStartedAt: captured.requestStartedAt
        }, window.location.origin);
    };

    const reportCaptureError = (error) => {
        window.postMessage({
            channel,
            type: 'CAPTURE_ERROR',
            error: error instanceof Error ? error.message : String(error)
        }, window.location.origin);
    };

    const reportStreamHookError = error => {
        captured.streamHookError = error instanceof Error ? error.message : String(error);
        window.postMessage({
            channel,
            type: 'STREAM_HOOK_ERROR',
            error: captured.streamHookError
        }, window.location.origin);
    };

    const isMatchJsonUrl = (value) => {
        try {
            const url = new URL(String(value ?? ''), window.location.href);
            if (url.hostname === 'streaming.optimalwayconsulting.com') {
                const pathSegments = url.pathname.split('/').filter(Boolean);
                return Boolean(directMatchId && pathSegments.at(-1) === directMatchId);
            }
            return /\/matches\/[^/?]+\/(?:stats|pbp)(?:\/|$)/.test(url.pathname);
        } catch {
            return false;
        }
    };

    const reportPageRefreshStarted = requestUrl => {
        const at = new Date().toISOString();
        window.postMessage({
            channel,
            type: 'PAGE_REFRESH_STARTED',
            sourcePath: sourcePathFor(requestUrl),
            at
        }, window.location.origin);
        return at;
    };

    const isMatchStreamUrl = value => {
        try {
            const url = new URL(String(value ?? ''), window.location.href);
            return url.hostname === 'streaming.optimalwayconsulting.com'
                && new RegExp(`^/(?:streaming/)?register/fcbq-${directMatchId}(?:/|$)`).test(url.pathname);
        } catch {
            return false;
        }
    };

    window.addEventListener('message', event => {
        if (event.source === window && event.origin === window.location.origin
            && event.data?.channel === channel && event.data.type === 'GET_PAYLOADS') {
            if (captured.streamHookError) {
                reportStreamHookError(new Error(captured.streamHookError));
            }
            window.postMessage({
                channel,
                type: 'PAYLOADS',
                payloads: captured,
                fresh: false,
                sourcePath: captured.sourcePath,
                capturedAt: captured.capturedAt,
                requestStartedAt: captured.requestStartedAt
            }, window.location.origin);
        }
    });

    const originalEventSource = window.EventSource;
    if (typeof originalEventSource === 'function' && directMatchId) {
        try {
            const eventSourcePrototype = originalEventSource.prototype;
            const originalAddEventListener = eventSourcePrototype?.addEventListener;
            if (typeof originalAddEventListener !== 'function') {
                throw new Error('No se pudo acceder al registro de eventos SSE.');
            }
            const observedEventSources = new WeakSet();
            const eventName = `fcbq-${directMatchId}`;
            const addEventListener = function (type, ...args) {
                if (type === eventName && isMatchStreamUrl(this.url) && !observedEventSources.has(this)) {
                    observedEventSources.add(this);
                    originalAddEventListener.call(this, type, event => {
                        window.postMessage({
                            channel,
                            type: 'STREAM_EVENT',
                            data: event.data
                        }, window.location.origin);
                    });
                }
                return originalAddEventListener.call(this, type, ...args);
            };
            eventSourcePrototype.addEventListener = addEventListener;
            if (eventSourcePrototype.addEventListener !== addEventListener) {
                throw new Error('El navegador no permitió observar la conexión SSE de la página.');
            }
        } catch (error) {
            reportStreamHookError(error);
        }
    } else {
        reportStreamHookError(new Error('EventSource no está disponible en esta página.'));
    }

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
        window.fetch = function (...args) {
            const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            const requestStartedAt = directMatchId && isMatchJsonUrl(requestUrl)
                ? reportPageRefreshStarted(requestUrl)
                : null;
            return originalFetch.apply(this, args).then(response => {
                if (response.ok && isMatchJsonUrl(requestUrl)) {
                    response.clone().json()
                        .then(payload => rememberPayload(payload, requestUrl, requestStartedAt))
                        .catch(() => {});
                }
                return response;
            });
        };
    }

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...args) {
        this[channel] = String(url ?? '');
        return originalOpen.call(this, method, url, ...args);
    };
    XMLHttpRequest.prototype.send = function (...args) {
        if (isMatchJsonUrl(this[channel])) {
            this[`${channel}_startedAt`] = reportPageRefreshStarted(this[channel]);
            this.addEventListener('load', () => {
                try {
                    const value = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
                    rememberPayload(value, this[channel], this[`${channel}_startedAt`]);
                } catch {
                    window.postMessage({
                        channel,
                        type: 'CAPTURE_ERROR',
                        error: 'La respuesta de la federación no contiene JSON válido.'
                    }, window.location.origin);
                }
            }, { once: true });
        }
        return originalSend.apply(this, args);
    };
})();
