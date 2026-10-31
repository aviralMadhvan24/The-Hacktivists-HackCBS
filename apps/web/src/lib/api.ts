// Thin fetch client. Uses the httpOnly session cookie (same origin) and sends
// the CSRF header the API requires for cookie-authenticated writes.

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: Method, path: string, body?: unknown, init?: { form?: FormData; signal?: AbortSignal }): Promise<T> {
  const headers: Record<string, string> = { 'X-LOS-CSRF': '1' };
  let payload: BodyInit | undefined;
  if (init?.form) payload = init.form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin', signal: init?.signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw new ApiError(0, 'ABORTED', 'Cancelled.');
    throw new ApiError(0, 'NETWORK', 'Cannot reach the FinSight server. Check your connection.');
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    if (res.status === 401 && onUnauthorized && !path.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(res.status, json?.error || 'HTTP_ERROR', json?.message || `Request failed (${res.status}).`, json?.details);
  }
  return json as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown, opts?: { signal?: AbortSignal }) => request<T>('POST', p, b ?? {}, opts),
  patch: <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
  put: <T>(p: string, b: unknown) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
  upload: <T>(p: string, form: FormData) => request<T>('POST', p, undefined, { form }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
