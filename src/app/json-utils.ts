export type ParseResult =
  /** `unescaped` counts how many layers of string-escaping were removed to get at the JSON. */
  | { ok: true; value: unknown; unescaped: number }
  | { ok: false; message: string; line?: number; column?: number }
  | { ok: null }; // empty input

const MAX_UNESCAPE = 5;

/**
 * Parse JSON, also accepting JSON that has been escaped into a string, e.g. copied from a log
 * or a database column: `{\"a\":1}` (no surrounding quotes) or `"{\"a\":1}"` (a JSON string
 * whose content is JSON, possibly several levels deep).
 */
export const parseJson = (text: string): ParseResult => {
  if (!text.trim()) return { ok: null };
  let value: unknown;
  let unescaped = 0;
  try {
    value = JSON.parse(text);
  } catch (e) {
    const inner = unescapeBody(text);
    if (inner === undefined) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, message, ...locate(text, message) };
    }
    value = inner;
    unescaped = 1;
  }
  // A JSON string that itself contains JSON: keep unwrapping.
  while (typeof value === 'string' && unescaped < MAX_UNESCAPE && looksLikeJson(value)) {
    try {
      value = JSON.parse(value);
      unescaped++;
    } catch {
      break;
    }
  }
  return { ok: true, value, unescaped };
};

/** Treat the text as the body of a JSON string literal (escaped quotes, no outer quotes). */
const unescapeBody = (text: string): unknown => {
  const body = text.trim();
  if (!/^[[{]/.test(body) || !body.includes('\\"')) return undefined;
  try {
    // Raw newlines/tabs are not allowed inside a string literal; escape them first.
    const str = JSON.parse(
      '"' + body.replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t') + '"',
    ) as string;
    return JSON.parse(str);
  } catch {
    return undefined;
  }
};

const looksLikeJson = (s: string): boolean => {
  const t = s.trim();
  return (
    (t.startsWith('{') && t.endsWith('}')) ||
    (t.startsWith('[') && t.endsWith(']')) ||
    // another layer of string-encoding around an object/array
    (/^"\s*[[{]/.test(t) && t.endsWith('"'))
  );
};

/** Derive line/column from a JSON.parse error message. */
const locate = (text: string, message: string): { line?: number; column?: number } => {
  const lc = /line (\d+) column (\d+)/i.exec(message);
  if (lc) return { line: +lc[1], column: +lc[2] };
  const pos = /position (\d+)/i.exec(message);
  if (!pos) return {};
  const before = text.slice(0, +pos[1]).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
};

export const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TOKEN =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],]/g;

/** Turn already-formatted JSON into HTML with token spans. Input is escaped. */
export const highlightJson = (json: string): string => {
  let out = '';
  let last = 0;
  for (const m of json.matchAll(TOKEN)) {
    out += escapeHtml(json.slice(last, m.index));
    const [token, str, colon, bool] = m;
    let cls: string;
    if (str !== undefined) {
      cls = colon ? 'tok-key' : 'tok-string';
      out += `<span class="${cls}">${escapeHtml(str)}</span>`;
      if (colon) out += `<span class="tok-punct">${colon}</span>`;
    } else {
      cls = bool
        ? 'tok-boolean'
        : token === 'null'
          ? 'tok-null'
          : /^[{}[\],]$/.test(token)
            ? 'tok-punct'
            : 'tok-number';
      out += `<span class="${cls}">${token}</span>`;
    }
    last = m.index + token.length;
  }
  return out + escapeHtml(json.slice(last));
};

const CHUNK_LINES = 400;

/**
 * Highlight formatted JSON in blocks of lines. Tokens never span lines in pretty-printed
 * JSON (strings cannot contain raw newlines), so splitting on lines is safe.
 */
export const highlightChunks = (json: string): { lines: number; html: string }[] => {
  const lines = json.split('\n');
  const chunks: { lines: number; html: string }[] = [];
  for (let i = 0; i < lines.length; i += CHUNK_LINES) {
    const part = lines.slice(i, i + CHUNK_LINES);
    chunks.push({ lines: part.length, html: highlightJson(part.join('\n')) });
  }
  return chunks;
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
