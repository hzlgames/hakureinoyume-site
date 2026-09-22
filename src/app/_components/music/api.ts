export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('content-type', 'application/json');
  const response = await fetch(url, {
    cache: 'no-store', credentials: 'same-origin', ...init, headers,
    signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000)
  });
  let data;
  try { data = await response.json(); }
  catch { throw new ApiError('服务暂时没有返回有效数据，请重试。', response.status); }
  if (!response.ok) throw new ApiError(data.message || '请求失败，请重试。', response.status, data.error);
  return data as T;
}
export function errorMessage(error: unknown, fallback = '请求失败，请重试。') {
  return error instanceof Error ? error.message : fallback;
}
export function announceAccountChange() {
  window.dispatchEvent(new Event('music-account-change'));
  try { localStorage.setItem('hakurei-music-account-change', String(Date.now())); } catch {}
}
