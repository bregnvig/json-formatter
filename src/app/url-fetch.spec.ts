import { asHttpUrl, fileNameFromUrl } from './url-fetch';

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
});
