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
const USER_KEY = 'mf_user';
const REQUEST_TIMEOUT_MS = 15000;

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
  await AsyncStorage.multiRemove([REFRESH_KEY, USER_KEY]);
}

// Bridge a HARD session loss (refresh token rejected mid-session) back to the
// store so it can reset user state and swap the navigator back to Login. Without
// this, clearSession() only nulls the in-memory token: live-session callers
// swallow the resulting 401 and the app is stuck as a tokenless "zombie" shell
// until a force-quit. The store registers a callback on mount (resetState).
let onSessionExpired: (() => void) | null = null;
export function setOnSessionExpired(cb: (() => void) | null) {
  onSessionExpired = cb;
}

// Bridge a mid-session account SUSPENSION (any authed request returns
// 403 account_suspended) back to the store so it can gate the app to the
// Account Suspended screen instead of surfacing scattered 403 errors.
let onAccountSuspended: (() => void) | null = null;
export function setOnAccountSuspended(cb: (() => void) | null) {
  onAccountSuspended = cb;
}

export function getAccessToken() {
  return accessToken;
}

export async function getStoredRefresh(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_KEY);
}

// The last-known user is cached so a returning user sees the app instantly on a
// cold start (before the network confirms), and a transient backend error (e.g.
// a Render free-tier cold start) never forces a re-login.
export async function setStoredUser(user: unknown) {
  try { await AsyncStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* ignore */ }
}

export async function getStoredUser<T = any>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

type ReqOpts = { method?: string; body?: unknown; auth?: boolean; _retried?: boolean };

async function raw(path: string, opts: ReqOpts): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.auth && accessToken) headers.authorization = `Bearer ${accessToken}`;
  // Time out a hung connection so a stalled mobile network can't leave a request
  // (or the app's session bootstrap) pending forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Try to mint a new access token from the stored refresh token. Returns true on
// success (rotation means we persist the new refresh token too). Crucially, the
// session is only DESTROYED on a genuine auth failure (the refresh token itself
// is rejected) — a network/timeout/5xx is transient, so we keep the session and
// let the caller retry, instead of logging the user out on a flaky connection.
//
// SINGLE-FLIGHT: the app runs several pollers (notifications, incoming, active
// favor) whose access tokens expire at the same moment, so multiple requests
// 401 together and each would call this concurrently. The server rotates the
// refresh token on use (single-use), so parallel refreshes send the SAME stored
// token: the first rotates+revokes it and stores a fresh session, the losers
// then present the now-revoked token, get 401, and clearSession() — wiping the
// valid session the winner just minted and silently logging the user out. We
// dedupe to ONE in-flight refresh so every waiter shares the winner's result.
let refreshInFlight: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = await getStoredRefresh();
  if (!refreshToken) return false;
  let res: Response;
  try {
    res = await raw('/api/auth/refresh', { method: 'POST', body: { refreshToken } });
  } catch {
    return false; // network/timeout — keep the session, retry later
  }
  if (res.status === 401 || res.status === 403) {
    await clearSession(); // the refresh token is invalid/expired — real logout
    onSessionExpired?.(); // notify the store so it resets user state -> Login
    return false;
  }
  if (!res.ok) return false; // 5xx / transient — keep the session
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
    // A suspended account gets cut off on any authed call — notify the store to
    // gate the whole app, then still throw so the caller's flow unwinds.
    if (res.status === 403 && err.code === 'account_suspended') onAccountSuspended?.();
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}
