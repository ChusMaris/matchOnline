(() => {
    const channel = '__matchonline_federation_capture__';
    if (window[channel]) return;

    const captured = { statsPayload: null, pbpPayload: null };
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
            window.postMessage({ channel, type: 'PAYLOADS', payloads: captured }, window.location.origin);
        }
    });

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
        window.fetch = function (...args) {
            const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
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
    XMLHttpRequest.prototype.open = function (method, url, ...args) {
        this[channel] = String(url ?? '');
        return originalOpen.call(this, method, url, ...args);
    };
    XMLHttpRequest.prototype.send = function (...args) {
        if (isMatchJsonUrl(this[channel])) {
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
