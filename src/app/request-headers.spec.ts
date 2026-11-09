import { activeHeaders, isHeaderList, isValidHeaderName, isValidHeaderValue } from './request-headers';

describe('request-headers', () => {
  it('sends only enabled headers with valid names, trimmed', () => {
    expect(
      activeHeaders([
        { name: ' polaris-tenant ', value: ' 2000 ', enabled: true },
        { name: 'Authorization', value: 'Bearer x', enabled: false },
        { name: 'bad name', value: '1', enabled: true },
        { name: '', value: '1', enabled: true },
      ]),
    ).toEqual({ 'polaris-tenant': '2000' });
  });

  it('validates names and values', () => {
    expect(isValidHeaderName('X-Api-Key')).toBe(true);
    expect(isValidHeaderName('x:y')).toBe(false);
    expect(isValidHeaderValue('a b')).toBe(true);
    expect(isValidHeaderValue('a\nb')).toBe(false);
  });

  it('accepts only well-formed stored lists', () => {
    expect(isHeaderList([{ name: 'a', value: 'b', enabled: true }])).toBe(true);
    expect(isHeaderList([{ name: 'a', value: 'b' }])).toBe(false);
    expect(isHeaderList({})).toBe(false);
  });
});
