import { highlightJson, parseJson, sortKeysDeep } from './json-utils';

describe('json-utils', () => {
  it('treats blank input as empty', () => {
    expect(parseJson('  \n').ok).toBeNull();
  });

  it('parses valid JSON', () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 }, unescaped: 0 });
  });

  it('reports line and column for errors', () => {
    const r = parseJson('{\n  "a": 1,\n  oops\n}');
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.line).toBe(3);
  });

  it('parses JSON escaped into a string body (no outer quotes)', () => {
    const r = parseJson('{\\"a\\":{\\"b\\":[1,\\"x\\"]},\\"c\\":\\"æøå\\"}');
    expect(r).toEqual({ ok: true, value: { a: { b: [1, 'x'] }, c: 'æøå' }, unescaped: 1 });
  });

  it('parses an escaped array of objects', () => {
    const r = parseJson('[{\\"id\\":1},{\\"id\\":2}]');
    expect(r).toEqual({ ok: true, value: [{ id: 1 }, { id: 2 }], unescaped: 1 });
  });

  it('unwraps JSON-in-a-JSON-string, several levels deep', () => {
    const once = JSON.stringify(JSON.stringify({ a: 1 }));
    const twice = JSON.stringify(once);
    expect(parseJson(once)).toEqual({ ok: true, value: { a: 1 }, unescaped: 1 });
    expect(parseJson(twice)).toEqual({ ok: true, value: { a: 1 }, unescaped: 2 });
  });

  it('leaves ordinary strings and valid JSON alone', () => {
    expect(parseJson('"hello"')).toEqual({ ok: true, value: 'hello', unescaped: 0 });
    expect(parseJson('{"q":"say \\"hi\\""}')).toEqual({ ok: true, value: { q: 'say "hi"' }, unescaped: 0 });
  });

  it('still reports errors for broken escaped input', () => {
    expect(parseJson('{\\"a\\":}').ok).toBe(false);
  });

  it('sorts keys deeply', () => {
    expect(JSON.stringify(sortKeysDeep({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } }))).toBe(
      '{"a":{"c":[{"y":2,"z":1}],"d":1},"b":1}',
    );
  });

  it('highlights tokens and escapes HTML', () => {
    const html = highlightJson('{"<k>": "<script>", "n": -1.5e3, "t": true, "x": null}');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<span class="tok-key">"&lt;k&gt;"</span>');
    expect(html).toContain('<span class="tok-number">-1.5e3</span>');
    expect(html).toContain('<span class="tok-boolean">true</span>');
    expect(html).toContain('<span class="tok-null">null</span>');
  });
});
