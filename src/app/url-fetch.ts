import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';

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

/** Requests to remote URLs give up after this long (applied by `timeoutInterceptor`). */
export const FETCH_TIMEOUT_MS = 30_000;

const isLocal = (host: string) =>
  host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');

/** Why the browser will refuse this URL before even trying, or null. */
export const mixedContentProblem = (url: URL, pageProtocol = location.protocol): string | null =>
  // An https page cannot load plain http, except from the local machine.
  pageProtocol === 'https:' && url.protocol === 'http:' && !isLocal(url.hostname)
    ? `Browsers block http:// requests from an https:// page. Try https://${url.host}${url.pathname}${url.search}`
    : null;

export interface FetchFailure {
  /** Shown to the user. */
  message: string;
  /** The response body, when the server answered with an error status but sent content. */
  body: string | null;
}

/** Turn an HttpClient error for `url` into something readable. */
export const describeFetchError = (err: unknown, url: URL): FetchFailure => {
  if (!(err instanceof HttpErrorResponse)) {
    return { message: err instanceof Error ? err.message : String(err), body: null };
  }
  if (err.error instanceof DOMException && err.error.name === 'TimeoutError') {
    return { message: `${url.host} did not answer within ${FETCH_TIMEOUT_MS / 1000} seconds`, body: null };
  }
  const body = typeof err.error === 'string' && err.error.trim() ? err.error : null;
  // Status 0: the browser refused (CORS) or never reached the host; it can't tell us which.
  // Angular's service worker reports the same failure as an empty 504.
  if (err.status === 0 || (err.status === 504 && !body)) {
    return {
      message: `Couldn't load ${url.host}. Either it doesn't allow requests from other websites (CORS), or it can't be reached.`,
      body: null,
    };
  }
  return { message: `HTTP ${err.status} ${err.statusText ?? ''}`.trim(), body };
};

/** Gives every HttpClient request a timeout (HttpResourceRequest has no option for it). */
export const timeoutInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.timeout ? req : req.clone({ timeout: FETCH_TIMEOUT_MS }));

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
