import { HttpErrorResponse } from '@angular/common/http';
import { asHttpUrl, describeFetchError, fileNameFromUrl, mixedContentProblem } from './url-fetch';

describe('url-fetch', () => {
  it('recognises a single http(s) URL', () => {
    expect(asHttpUrl('  https://api.example.com/v1/items?x=1 \n')?.href).toBe('https://api.example.com/v1/items?x=1');
    expect(asHttpUrl('http://localhost:34942/odata/$metadata')?.host).toBe('localhost:34942');
  });

  it('ignores JSON, text with spaces and other schemes', () => {
    expect(asHttpUrl('{"url":"https://x.dk"}')).toBeNull();
    expect(asHttpUrl('see https://x.dk')).toBeNull();
    expect(asHttpUrl('ftp://x.dk/a.json')).toBeNull();
    expect(asHttpUrl('"https://x.dk"')).toBeNull();
  });

  it('derives a download name from the URL path', () => {
    expect(fileNameFromUrl('https://x.dk/api/users/42')).toBe('42.json');
    expect(fileNameFromUrl('https://x.dk/data/config.json?v=2')).toBe('config.json');
    expect(fileNameFromUrl('https://x.dk/')).toBe('response.json');
  });

  const url = new URL('https://api.example.com/items');

  it('explains CORS / unreachable hosts (status 0, or the service worker\'s empty 504)', () => {
    for (const err of [
      new HttpErrorResponse({ status: 0, error: new TypeError('Failed to fetch') }),
      new HttpErrorResponse({ status: 504, statusText: 'Gateway Timeout', error: '' }),
    ]) {
      const f = describeFetchError(err, url);
      expect(f.message).toContain('CORS');
      expect(f.body).toBeNull();
    }
  });

  it('keeps the body of an error response', () => {
    const f = describeFetchError(new HttpErrorResponse({ status: 404, statusText: 'Not Found', error: '{"error":"nope"}' }), url);
    expect(f).toEqual({ message: 'HTTP 404 Not Found', body: '{"error":"nope"}' });
  });

  it('reports timeouts', () => {
    const err = new HttpErrorResponse({ status: 0, error: new DOMException('signal timed out', 'TimeoutError') });
    expect(describeFetchError(err, url).message).toBe('api.example.com did not answer within 30 seconds');
  });

  it('blocks http:// from an https:// page, except for the local machine', () => {
    expect(mixedContentProblem(new URL('http://api.example.com/x'), 'https:')).toContain('https://api.example.com/x');
    expect(mixedContentProblem(new URL('http://localhost:8080/x'), 'https:')).toBeNull();
    expect(mixedContentProblem(new URL('http://api.example.com/x'), 'http:')).toBeNull();
  });
});
