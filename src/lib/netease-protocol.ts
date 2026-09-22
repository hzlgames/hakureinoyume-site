/** Compatibility rules shared by the proxy and contract regression tests. */
export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function safeMusicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.protocol === 'http:' && /(^|\.)music\.126\.net$/.test(url.hostname)) url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}
export function isLoginExpiredPayload(payload: unknown) {
  const root = record(payload);
  const data = record(root?.data);
  return [root, data].some(item => {
    if (!item) return false;
    const code = Number(item.code);
    // -462 means risk control, not evidence that credentials have expired.
    if (code === 301 || code === 401) return true;
    const message = String(item.message ?? item.msg ?? '');
    return code !== 200 && /未登录|尚未登录|需要登录|请先登录|登录已失效|登录过期|登录状态.*失效/.test(message);
  });
}
export function isAuthenticatedStatus(payload: unknown) {
  const root = record(payload);
  const data = record(root?.data) ?? root;
  const account = record(data?.account);
  const profile = record(data?.profile);
  return Number(data?.code) === 200 && Boolean(profile?.userId) && account?.anonimousUser !== true;
}
export function normalizeCookie(cookie: string) {
  // The compatibility API returns joined Set-Cookie lines including attributes.
  const attributes = /^(?:path|domain|expires|max-age|samesite|secure|httponly|priority|partitioned)$/i;
  const pairs = new Map<string, string>();
  for (const part of cookie.split(/;|,(?=\s*[^\s;,=]+=)/)) {
    const split = part.indexOf('=');
    if (split < 1) continue;
    const key = part.slice(0, split).trim();
    if (attributes.test(key)) continue;
    pairs.set(key, part.slice(split + 1).trim());
  }
  return Array.from(pairs, ([key, value]) => `${key}=${value}`).join('; ');
}

export function isAnonymousStatus(payload: unknown) {
  const root = record(payload);
  const data = record(root?.data) ?? root;
  return Number(data?.code) === 200 && data?.profile === null
    && (data?.account === null || record(data?.account)?.anonimousUser === true);
}
