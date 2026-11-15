(() => {
    const channel = '__matchonline_federation_capture__';
    if (window[channel]) return;

    const captured = { statsPayload: null, pbpPayload: null };
    window[channel] = captured;
    const directMatchId = window.location.pathname.match(/\/(?:estadistica\/)?directe\/(\d+)(?:\/|$)/)?.[1];
    let refreshInProgress = false;
    let refreshPending = false;
    let lastLiveMatchRequest = null;

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

    const rememberPayload = (value) => {
        const found = collectPayloads(value);
        if (found.statsPayload) captured.statsPayload = found.statsPayload;
        if (found.pbpPayload) captured.pbpPayload = found.pbpPayload;
        window.postMessage({
            channel,
            type: 'PAYLOADS',
            payloads: captured
        }, window.location.origin);
    };

    const reportCaptureError = (error) => {
        window.postMessage({
            channel,
            type: 'CAPTURE_ERROR',
            error: error instanceof Error ? error.message : String(error)
        }, window.location.origin);
    };

    const refreshLivePayloads = async () => {
        if (!directMatchId || typeof originalFetch !== 'function') return;
        if (refreshInProgress) {
            refreshPending = true;
            return;
        }

        refreshInProgress = true;
        try {
            do {
                refreshPending = false;
                const request = lastLiveMatchRequest
                    ? new Request(lastLiveMatchRequest.clone(), { cache: 'no-store' })
                    : new Request(
                        `https://streaming.optimalwayconsulting.com/streaming/match-id/${directMatchId}`,
                        { cache: 'no-store', credentials: 'include' }
                    );
                const response = await originalFetch.call(window, request);
                if (!response.ok) {
                    const detail = (await response.clone().text()).trim().slice(0, 300);
                    throw new Error(
                        `No se pudo actualizar el snapshot federativo (${response.status}${response.statusText ? ` ${response.statusText}` : ''})${detail ? `: ${detail}` : '.'}`
                    );
                }

                const payload = await response.json();
                const found = collectPayloads(payload);
                if (!found.statsPayload || !found.pbpPayload) {
                    throw new Error('La respuesta actualizada no contiene estadísticas y play-by-play completos.');
                }
                rememberPayload(payload);
            } while (refreshPending);
        } catch (error) {
            reportCaptureError(error);
        } finally {
            refreshInProgress = false;
        }
    };

    const isMatchJsonUrl = (value) => {
        try {
            const url = new URL(String(value ?? ''), window.location.href);
            if (url.hostname === 'streaming.optimalwayconsulting.com') {
                const match = url.pathname.match(/^\/streaming\/match-id\/(\d+)\/?$/);
                return Boolean(match && directMatchId && match[1] === directMatchId);
            }
            return /\/matches\/[^/?]+\/(?:stats|pbp)(?:\/|$)/.test(url.pathname);
        } catch {
            return false;
        }
    };

    window.addEventListener('message', event => {
        if (event.source === window && event.origin === window.location.origin
            && event.data?.channel === channel && event.data.type === 'GET_PAYLOADS') {
            if (event.data.refresh) {
                void refreshLivePayloads();
            } else {
                window.postMessage({ channel, type: 'PAYLOADS', payloads: captured }, window.location.origin);
            }
        }
    });

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
        window.fetch = function (...args) {
            const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            if (directMatchId && isMatchJsonUrl(requestUrl)) {
                try {
                    const request = args[0] instanceof Request
                        ? args[0].clone()
                        : new Request(requestUrl, args[1]);
                    const requestUrlObject = new URL(request.url);
                    if (requestUrlObject.hostname === 'streaming.optimalwayconsulting.com'
                        && requestUrlObject.pathname === `/streaming/match-id/${directMatchId}`) {
                        lastLiveMatchRequest = request;
                    }
                } catch (error) {
                    reportCaptureError(error);
                }
            }
            return originalFetch.apply(this, args).then(response => {
                if (response.ok && isMatchJsonUrl(requestUrl)) {
                    response.clone().json().then(rememberPayload).catch(() => {});
                }
                return response;
            });
        };
    }

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (method, url, ...args) {
        this[channel] = String(url ?? '');
        this[`${channel}_method`] = method;
        this[`${channel}_headers`] = [];
        return originalOpen.call(this, method, url, ...args);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        this[`${channel}_headers`].push([name, value]);
        return originalSetRequestHeader.call(this, name, value);
    };
    XMLHttpRequest.prototype.send = function (...args) {
        if (isMatchJsonUrl(this[channel])) {
            try {
                const requestUrl = new URL(this[channel], window.location.href);
                if (requestUrl.hostname === 'streaming.optimalwayconsulting.com'
                    && requestUrl.pathname === `/streaming/match-id/${directMatchId}`) {
                    const method = String(this[`${channel}_method`] ?? 'GET').toUpperCase();
                    const init = {
                        method,
                        headers: this[`${channel}_headers`],
                        credentials: this.withCredentials ? 'include' : 'same-origin',
                        cache: 'no-store'
                    };
                    if (method !== 'GET' && method !== 'HEAD' && args[0] !== undefined && args[0] !== null) {
                        init.body = args[0];
                    }
                    lastLiveMatchRequest = new Request(requestUrl.href, init);
                }
            } catch (error) {
                reportCaptureError(error);
            }
            this.addEventListener('load', () => {
                try {
                    const value = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
                    rememberPayload(value);
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
