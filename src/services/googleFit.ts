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

/** Trigger interactive sign-in. User clicks button -> popup -> consent. */
export async function signIn(): Promise<string> {
  const google = await waitForGoogle();
  const client = ensureTokenClient(google);

  return new Promise<string>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    client.requestAccessToken({ prompt: 'consent' });
  });
}

/** Get a valid access token: cached if fresh, otherwise re-prompt silently. */
async function getAccessToken(interactive = false): Promise<string> {
  const cached = loadToken();
  if (cached) return cached.access_token;

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

/**
 * Fetch step count from Google Fit between two timestamps.
 * Returns total steps in the window.
 */
export async function fetchStepsBetween(startMs: number, endMs: number): Promise<number> {
  const token = await getAccessToken(false);

  const body = {
    aggregateBy: [
      {
        dataTypeName: 'com.google.step_count.delta',
        dataSourceId:
          'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps',
      },
    ],
    bucketByTime: { durationMillis: endMs - startMs },
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

  const data = (await res.json()) as {
    bucket?: Array<{
      dataset?: Array<{
        point?: Array<{
          value?: Array<{ intVal?: number }>;
        }>;
      }>;
    }>;
  };

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
