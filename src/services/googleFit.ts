// Google Fit integration via Google Identity Services + Fitness REST API.
//
// Two modes, picked at runtime based on whether VITE_FIT_WORKER_URL is set:
//
//   Worker mode (preferred): A small Cloudflare Worker (see /worker) holds
//   a refresh token in KV. The PWA never sees the refresh token; it just
//   asks the worker for a fresh access token whenever it needs one. This
//   means the user stays connected indefinitely after one consent.
//
//   Legacy GIS mode (fallback): Pure browser flow via initTokenClient.
//   Access tokens last 1 hour, no refresh tokens. User must re-tap once
//   per hour. Used when the worker isn't deployed yet.

const CLIENT_ID = '283060166957-n7v8roliir9nbhiueiolbgimdftjfd1d.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/fitness.activity.read';
const TOKEN_STORAGE_KEY = 'sanpo-google-fit-token';
const USER_KEY_STORAGE_KEY = 'sanpo-fit-user-key';

const WORKER_URL: string | undefined = import.meta.env.VITE_FIT_WORKER_URL;
const useWorker = !!WORKER_URL;

interface StoredToken {
  access_token: string;
  expires_at: number; // unix ms
}

// Google Identity Services types (minimal)
interface TokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface CodeClient {
  requestCode: () => void;
}

interface TokenResponse {
  access_token: string;
  expires_in: number; // seconds
  error?: string;
}

interface CodeResponse {
  code?: string;
  error?: string;
  error_description?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: unknown) => void;
          }) => TokenClient;
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode?: 'popup' | 'redirect';
            callback: (response: CodeResponse) => void;
            error_callback?: (error: unknown) => void;
          }) => CodeClient;
          revoke: (accessToken: string, callback?: () => void) => void;
        };
      };
    };
  }
}

/** Per-device random ID used to look up the user's refresh token in the worker's KV. */
function getOrCreateUserKey(): string {
  let key = localStorage.getItem(USER_KEY_STORAGE_KEY);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(USER_KEY_STORAGE_KEY, key);
  }
  return key;
}

let tokenClient: TokenClient | null = null;
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

function loadToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    if (t.expires_at < Date.now() + 60_000) return null; // expired or about to expire
    return t;
  } catch {
    return null;
  }
}

function saveToken(t: StoredToken): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(t));
  } catch {
    // ignore
  }
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/** Wait for Google Identity Services script to load (it's async deferred). */
async function waitForGoogle(): Promise<NonNullable<Window['google']>> {
  // Try up to ~5s
  for (let i = 0; i < 50; i++) {
    if (window.google?.accounts?.oauth2) return window.google;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Google Identity Services script failed to load');
}

function ensureTokenClient(google: NonNullable<Window['google']>): TokenClient {
  if (tokenClient) return tokenClient;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      if (response.error) {
        pendingReject?.(new Error(response.error));
      } else {
        const expires_at = Date.now() + (response.expires_in - 60) * 1000;
        saveToken({ access_token: response.access_token, expires_at });
        pendingResolve?.(response.access_token);
      }
      pendingResolve = null;
      pendingReject = null;
    },
    error_callback: (err) => {
      pendingReject?.(new Error(typeof err === 'string' ? err : 'OAuth error'));
      pendingResolve = null;
      pendingReject = null;
    },
  });
  return tokenClient;
}

// Serialize requestToken calls — GIS uses module-global pendingResolve/Reject
// so concurrent requests would clobber each other.
let inflightToken: Promise<string> | null = null;

async function requestToken(prompt: 'consent' | 'none' | ''): Promise<string> {
  if (inflightToken) return inflightToken;
  const google = await waitForGoogle();
  const client = ensureTokenClient(google);
  inflightToken = new Promise<string>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    client.requestAccessToken(prompt ? { prompt } : {});
  }).finally(() => {
    inflightToken = null;
  });
  return inflightToken;
}

// === Worker-mode helpers ===

let codeClient: CodeClient | null = null;
let pendingCodeResolve: ((code: string) => void) | null = null;
let pendingCodeReject: ((err: Error) => void) | null = null;

function ensureCodeClient(google: NonNullable<Window['google']>): CodeClient {
  if (codeClient) return codeClient;
  codeClient = google.accounts.oauth2.initCodeClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    ux_mode: 'popup',
    callback: (response) => {
      if (response.error) {
        pendingCodeReject?.(new Error(response.error));
      } else if (response.code) {
        pendingCodeResolve?.(response.code);
      } else {
        pendingCodeReject?.(new Error('no code returned'));
      }
      pendingCodeResolve = null;
      pendingCodeReject = null;
    },
    error_callback: (err) => {
      pendingCodeReject?.(
        new Error(typeof err === 'string' ? err : 'OAuth error'),
      );
      pendingCodeResolve = null;
      pendingCodeReject = null;
    },
  });
  return codeClient;
}

async function requestAuthCode(): Promise<string> {
  const google = await waitForGoogle();
  const client = ensureCodeClient(google);
  return new Promise<string>((resolve, reject) => {
    pendingCodeResolve = resolve;
    pendingCodeReject = reject;
    client.requestCode();
  });
}

interface WorkerTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  hint?: string;
}

async function workerExchange(code: string): Promise<string> {
  const userKey = getOrCreateUserKey();
  const res = await fetch(`${WORKER_URL}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, userKey }),
    cache: 'no-store',
  });
  const data = (await res.json()) as WorkerTokenResponse;
  if (!res.ok || !data.access_token || !data.expires_in) {
    throw new Error(data.error ?? `worker exchange failed: ${res.status}`);
  }
  saveToken({
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  });
  return data.access_token;
}

async function workerRefresh(): Promise<string> {
  const userKey = getOrCreateUserKey();
  const res = await fetch(`${WORKER_URL}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userKey }),
    cache: 'no-store',
  });
  const data = (await res.json()) as WorkerTokenResponse;
  if (!res.ok || !data.access_token || !data.expires_in) {
    throw new Error(data.error ?? `worker refresh failed: ${res.status}`);
  }
  saveToken({
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  });
  return data.access_token;
}

async function workerRevoke(): Promise<void> {
  const userKey = getOrCreateUserKey();
  try {
    await fetch(`${WORKER_URL}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey }),
    });
  } catch {
    // best-effort
  }
}

// === Public API ===

/** Trigger first-time interactive sign-in (with consent screen). */
export async function signIn(): Promise<string> {
  if (useWorker) {
    // Get an auth code from Google (popup), exchange via worker for tokens.
    const code = await requestAuthCode();
    return workerExchange(code);
  }
  return requestToken('consent');
}

/**
 * Re-authenticate after token expiry.
 *
 * Worker mode: hits /refresh — completely silent, no UI. The user only
 * sees the popup ONCE during initial signIn().
 *
 * Legacy mode: prompt-less GIS interactive flow. May flash an account
 * picker; doesn't re-ask for consent if previously granted.
 */
export async function reAuth(): Promise<string> {
  if (useWorker) {
    return workerRefresh();
  }
  return requestToken('');
}

/**
 * Silently fetch a token if the user previously consented and is still
 * signed in to Google in this browser. Returns null on any failure.
 * Used to keep the connection alive across token expiry without UI.
 */
export async function silentSignIn(): Promise<string | null> {
  try {
    return await requestToken('none');
  } catch {
    return null;
  }
}

/** Get a valid access token: cached if fresh, otherwise try silent refresh,
 * then optionally fall through to interactive sign-in. */
async function getAccessToken(interactive = false): Promise<string> {
  const cached = loadToken();
  if (cached) return cached.access_token;

  // Worker mode: refresh is fully silent and reliable. No interactive
  // step needed except for initial signIn().
  if (useWorker) {
    try {
      return await workerRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      // If the worker has no creds for us, fall through to signIn.
      if (msg.includes('not_found') || msg.includes('invalid_grant')) {
        if (!interactive) throw new Error('Not signed in');
        return signIn();
      }
      throw e;
    }
  }

  // Legacy GIS mode: try silent refresh first — works if user is still
  // signed in to Google. Otherwise prompt.
  const silent = await silentSignIn();
  if (silent) return silent;

  if (!interactive) {
    throw new Error('Not signed in');
  }
  return signIn();
}

export function isSignedIn(): boolean {
  return loadToken() !== null;
}

export function signOut(): void {
  if (useWorker) {
    void workerRevoke();
  } else {
    const t = loadToken();
    if (t && window.google) {
      try {
        window.google.accounts.oauth2.revoke(t.access_token);
      } catch {
        // ignore
      }
    }
  }
  clearToken();
}

interface AggregateResponse {
  bucket?: Array<{
    dataset?: Array<{
      point?: Array<{
        value?: Array<{ intVal?: number }>;
      }>;
    }>;
  }>;
}

function sumAggregate(data: AggregateResponse): number {
  let total = 0;
  for (const bucket of data.bucket ?? []) {
    for (const ds of bucket.dataset ?? []) {
      for (const point of ds.point ?? []) {
        for (const v of point.value ?? []) {
          total += v.intVal ?? 0;
        }
      }
    }
  }
  return total;
}

async function aggregateOnce(
  token: string,
  startMs: number,
  endMs: number,
  dataSourceId?: string,
): Promise<number> {
  const aggregateBy: Record<string, string>[] = [
    { dataTypeName: 'com.google.step_count.delta' },
  ];
  if (dataSourceId) aggregateBy[0].dataSourceId = dataSourceId;

  const body = {
    aggregateBy,
    bucketByTime: { durationMillis: Math.max(60_000, endMs - startMs) },
    startTimeMillis: startMs,
    endTimeMillis: endMs,
  };

  const res = await fetch(
    'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );
  if (res.status === 401) {
    clearToken();
    throw new Error('Authentication expired. Please sign in again.');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fitness API error: ${res.status} ${text}`);
  }
  const data = (await res.json()) as AggregateResponse;
  return sumAggregate(data);
}

/**
 * Fetch step count from Google Fit between two timestamps.
 *
 * Strategy: Modern Android devices have multiple step data streams
 * coexisting in a single Fit account (legacy estimated_steps from Google
 * Play Services, the merged stream, Health Connect mirrors, manufacturer
 * stream from Fitbit/Samsung/Xiaomi, etc.). Different streams update at
 * different cadences and one of them can stall while another is fresh.
 * We query each step-count data source the user has and return the
 * MAX — the most generous estimate of "what the user actually walked".
 */
export async function fetchStepsBetween(startMs: number, endMs: number): Promise<number> {
  const token = await getAccessToken(false);

  // 1) Default aggregate (no dataSourceId). Fit picks its merged stream.
  let best = await aggregateOnce(token, startMs, endMs);

  // 2) List all step-count data sources for the user and probe each.
  try {
    const dsRes = await fetch(
      'https://www.googleapis.com/fitness/v1/users/me/dataSources?dataTypeName=com.google.step_count.delta',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      },
    );
    if (dsRes.ok) {
      const list = (await dsRes.json()) as {
        dataSource?: Array<{ dataStreamId?: string }>;
      };
      const sourceIds = (list.dataSource ?? [])
        .map((d) => d.dataStreamId)
        .filter((s): s is string => !!s);

      const results = await Promise.all(
        sourceIds.map((id) =>
          aggregateOnce(token, startMs, endMs, id).catch(() => 0),
        ),
      );
      for (const r of results) {
        if (r > best) best = r;
      }
    }
  } catch {
    // List endpoint failed — fall back to the default aggregate value.
  }

  return best;
}
