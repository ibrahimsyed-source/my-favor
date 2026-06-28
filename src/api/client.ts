import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// API client for the My Favor backend (server/). One place handles the base
// URL, auth headers, token storage, and automatic refresh-on-401. The store
// calls these helpers; screens never talk to the network directly.
//
// Base URL: set EXPO_PUBLIC_API_URL to point at your server (e.g. your LAN IP
// on a physical device). Defaults to localhost for web/simulator dev.
// ---------------------------------------------------------------------------
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

const REFRESH_KEY = 'mf_refresh_token';

// Access token lives in memory only; the long-lived refresh token is persisted
// so a session survives an app restart. (Production: prefer expo-secure-store
// over AsyncStorage for the refresh token.)
let accessToken: string | null = null;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function setSession(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  await AsyncStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export async function clearSession() {
  accessToken = null;
  await AsyncStorage.removeItem(REFRESH_KEY);
}

export function getAccessToken() {
  return accessToken;
}

export async function getStoredRefresh(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_KEY);
}

type ReqOpts = { method?: string; body?: unknown; auth?: boolean; _retried?: boolean };

async function raw(path: string, opts: ReqOpts): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.auth && accessToken) headers.authorization = `Bearer ${accessToken}`;
  return fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

// Try to mint a new access token from the stored refresh token. Returns true on
// success. Refresh-token rotation means we persist the new refresh token too.
async function tryRefresh(): Promise<boolean> {
  const refreshToken = await getStoredRefresh();
  if (!refreshToken) return false;
  const res = await raw('/api/auth/refresh', { method: 'POST', body: { refreshToken } });
  if (!res.ok) {
    await clearSession();
    return false;
  }
  const data = await res.json();
  await setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return true;
}

// Core request helper. Parses JSON, throws ApiError on failure, and transparently
// refreshes the session once on a 401 before retrying.
export async function apiRequest<T = any>(path: string, opts: ReqOpts = {}): Promise<T> {
  let res: Response;
  try {
    res = await raw(path, opts);
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the server. Is the API running?');
  }

  if (res.status === 401 && opts.auth && !opts._retried) {
    if (await tryRefresh()) {
      return apiRequest<T>(path, { ...opts, _retried: true });
    }
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}
