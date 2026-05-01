// Google Fit integration via Google Identity Services + Fitness REST API

const CLIENT_ID = '329322197077-ba96t4apoji356kphtccruujp7p3oth3.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/fitness.activity.read';
const TOKEN_STORAGE_KEY = 'sanpo-google-fit-token';

interface StoredToken {
  access_token: string;
  expires_at: number; // unix ms
}

// Google Identity Services types (minimal)
interface TokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface TokenResponse {
  access_token: string;
  expires_in: number; // seconds
  error?: string;
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
          revoke: (accessToken: string, callback?: () => void) => void;
        };
      };
    };
  }
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

/** Trigger first-time interactive sign-in (with consent screen). */
export async function signIn(): Promise<string> {
  return requestToken('consent');
}

/**
 * Re-authenticate after token expiry. Skips the consent screen (the user
 * already granted access), so this is typically a one-tap operation —
 * Google may flash an account picker briefly but won't ask "do you allow
 * this app to access...". Use for the 再連携 flow.
 */
export async function reAuth(): Promise<string> {
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

  // Try silent refresh first — works if the user previously granted consent
  // and is still signed in to Google in this browser. Avoids prompting them
  // every hour when the access token expires.
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
  const t = loadToken();
  if (t && window.google) {
    try {
      window.google.accounts.oauth2.revoke(t.access_token);
    } catch {
      // ignore
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
