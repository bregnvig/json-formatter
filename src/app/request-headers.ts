/** A request header the user added, sent with URL fetches while `enabled`. */
export interface RequestHeader {
  name: string;
  value: string;
  enabled: boolean;
}

/** RFC 9110 token: what a header name may consist of. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export const isValidHeaderName = (name: string): boolean => TOKEN.test(name.trim());

/** Values may not contain line breaks (the browser would reject the request). */
export const isValidHeaderValue = (value: string): boolean => !/[\r\n\0]/.test(value);

const isRequestHeader = (v: unknown): v is RequestHeader => {
  const h = v as RequestHeader;
  return (
    !!h &&
    typeof h === 'object' &&
    typeof h.name === 'string' &&
    typeof h.value === 'string' &&
    typeof h.enabled === 'boolean'
  );
};

export const isHeaderList = (v: unknown): v is RequestHeader[] =>
  Array.isArray(v) && v.every(isRequestHeader);

/** The headers to send: enabled, with a valid name and value. Later duplicates win. */
export const activeHeaders = (list: RequestHeader[]): Record<string, string> =>
  Object.fromEntries(
    list
      .filter((h) => h.enabled && isValidHeaderName(h.name) && isValidHeaderValue(h.value))
      .map((h) => [h.name.trim(), h.value.trim()]),
  );
