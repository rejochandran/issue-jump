// The one place network requests are made. Providers call this and nothing else.

/**
 * JSON request with a timeout. Never throws.
 * Returns { ok, status, data } where status 0 means the request did not complete.
 */
export async function request(url, { method = 'GET', headers = {}, body, credentials = 'omit', signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(url, {
      method,
      credentials,
      signal: ctrl.signal,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    return { ok: res.ok && data !== null, status: res.status, data };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Turn a failed response into the error shape the UI understands. */
export function failure(r) {
  return { error: r.status === 401 || r.status === 403 ? 'auth' : 'network' };
}

export function originOf(url) {
  try { return new URL(String(url).replaceAll('{key}', 'X-1')).origin; } catch { return null; }
}

export function hostOf(site) {
  return String(site || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** Turn whatever the user pasted into an origin, or null. `suffix` completes a bare name. */
export function normalizeSite(input, suffix = '') {
  let v = String(input || '').trim();
  if (!v) return null;
  if (suffix && /^[a-z0-9-]+$/i.test(v)) v = `${v}${suffix}`;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.origin;
  } catch { return null; }
}
