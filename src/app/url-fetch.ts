/** A single http(s) URL and nothing else (surrounding whitespace allowed), or null. */
export const asHttpUrl = (text: string): URL | null => {
  const t = text.trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return null;
  try {
    return new URL(t);
  } catch {
    return null;
  }
};

export interface FetchResult {
  text: string;
  status: number;
  statusText: string;
  ok: boolean;
}

const TIMEOUT_MS = 30_000;
const isLocal = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');

/**
 * GET a URL from the browser. There is no server behind this app, so the target must allow
 * cross-origin requests (CORS). Errors are thrown as readable messages; an abort through
 * `signal` rejects with an AbortError, which callers should ignore.
 */
export const fetchText = async (url: URL, signal: AbortSignal): Promise<FetchResult> => {
  // An https page cannot load plain http, except from the local machine.
  if (location.protocol === 'https:' && url.protocol === 'http:' && !isLocal(url.hostname)) {
    throw new Error(`Browsers block http:// requests from an https:// page. Try https://${url.host}${url.pathname}${url.search}`);
  }
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    // Accept is a CORS-safelisted header, so this stays a "simple" request (no preflight).
    const res = await fetch(url, {
      headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
      signal: AbortSignal.any([signal, timeout]),
    });
    const text = await res.text();
    // Angular's service worker turns a failed network request into an empty 504.
    if (res.status === 504 && !text) throw new TypeError('network error via service worker');
    return { text, status: res.status, statusText: res.statusText, ok: res.ok };
  } catch (e) {
    if (signal.aborted) throw e;
    if (timeout.aborted) throw new Error(`${url.host} did not answer within ${TIMEOUT_MS / 1000} seconds`);
    // fetch reports CORS refusals and unreachable hosts identically, as a TypeError.
    throw new Error(
      `Couldn't load ${url.host}. Either it doesn't allow requests from other websites (CORS), or it can't be reached.`,
    );
  }
};

/** A sensible download filename for a fetched URL: its last path segment, as .json. */
export const fileNameFromUrl = (url: string): string => {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    const base = decodeURIComponent(last).replace(/[^\w.-]+/g, '_').replace(/^\.+/, '');
    if (!base) return 'response.json';
    return /\.json$/i.test(base) ? base : `${base}.json`;
  } catch {
    return 'response.json';
  }
};
