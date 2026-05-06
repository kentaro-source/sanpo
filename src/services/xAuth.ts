/**
 * X (Twitter) OAuth 2.0 PKCE flow + token persistence.
 *
 * Public-client (= no secret) PKCE flow because the X app is mobile
 * with no trusted server backend. The client_id is bundled in the APK
 * which is acceptable for a personal-use app — leaking it would only
 * let someone else impersonate the registration display name, not
 * post on behalf of users (each user goes through the consent screen
 * separately).
 *
 * Token lifecycle:
 *   - access_token: ~2h lifetime
 *   - refresh_token: months, used to silently mint new access_tokens
 *   - both stored in @capacitor/preferences (Android Keystore-backed
 *     when the OS supports it)
 */

import { Browser } from '@capacitor/browser';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';
import { CapacitorHttp } from '@capacitor/core';

const AUTH_URL = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const STORE_KEY = 'sanpo-x-token-v1';
const VERIFIER_KEY = 'sanpo-x-pkce-v1';

const CLIENT_ID = import.meta.env.VITE_X_CLIENT_ID ?? '';
const REDIRECT_URI = 'com.kentarosource.sanpo://oauth-callback';
// Scopes required for "post on behalf of user" + offline refresh.
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

interface StoredToken {
  accessToken: string;
  refreshToken: string;
  /** Unix ms when the access_token expires. */
  expiresAt: number;
  /** X username (without @) — fetched after first connect via /2/users/me. */
  username?: string;
  /** X numeric user id, kept for reply chains and other API calls. */
  userId?: string;
}

interface PkceState {
  codeVerifier: string;
  state: string;
}

/** Generate a cryptographically random URL-safe string of length n. */
function randomString(n: number): string {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return [...buf]
    .map((b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 62])
    .join('');
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** True if VITE_X_CLIENT_ID is set at build time. */
export function isXAuthConfigured(): boolean {
  return CLIENT_ID.length > 0;
}

export async function loadStoredToken(): Promise<StoredToken | null> {
  try {
    const { value } = await Preferences.get({ key: STORE_KEY });
    if (!value) return null;
    return JSON.parse(value) as StoredToken;
  } catch {
    return null;
  }
}

async function saveToken(t: StoredToken): Promise<void> {
  await Preferences.set({ key: STORE_KEY, value: JSON.stringify(t) });
}

export async function clearStoredToken(): Promise<void> {
  await Preferences.remove({ key: STORE_KEY });
}

async function savePkce(p: PkceState): Promise<void> {
  await Preferences.set({ key: VERIFIER_KEY, value: JSON.stringify(p) });
}

async function loadPkce(): Promise<PkceState | null> {
  try {
    const { value } = await Preferences.get({ key: VERIFIER_KEY });
    if (!value) return null;
    return JSON.parse(value) as PkceState;
  } catch {
    return null;
  }
}

async function clearPkce(): Promise<void> {
  await Preferences.remove({ key: VERIFIER_KEY });
}

/**
 * Begin the OAuth dance: generate PKCE pair, persist verifier, open
 * the X consent screen in an in-app browser. Resolves when the deep
 * link handler completes the token exchange.
 */
export async function startXAuth(): Promise<StoredToken> {
  if (!isXAuthConfigured()) {
    throw new Error('VITE_X_CLIENT_ID is not configured at build time.');
  }
  const codeVerifier = randomString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const state = randomString(24);
  await savePkce({ codeVerifier, state });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  const url = `${AUTH_URL}?${params.toString()}`;

  // Wait for the deep link callback. Capacitor App emits 'appUrlOpen'
  // when the OS routes the custom-scheme URL back to this app.
  return new Promise<StoredToken>((resolve, reject) => {
    let resolved = false;
    const handle = App.addListener('appUrlOpen', async (event) => {
      if (resolved) return;
      const incoming = event.url;
      if (!incoming.startsWith(REDIRECT_URI)) return;
      try {
        const token = await handleCallback(incoming);
        resolved = true;
        await Browser.close();
        (await handle).remove();
        resolve(token);
      } catch (e) {
        resolved = true;
        (await handle).remove();
        reject(e);
      }
    });

    Browser.open({ url, presentationStyle: 'popover' }).catch((e) => {
      reject(e);
    });
  });
}

async function handleCallback(url: string): Promise<StoredToken> {
  const u = new URL(url);
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  const err = u.searchParams.get('error');
  if (err) throw new Error(`X authorize failed: ${err}`);
  if (!code || !state) throw new Error('X callback missing code/state');
  const stored = await loadPkce();
  if (!stored) throw new Error('PKCE state not found');
  if (stored.state !== state) throw new Error('PKCE state mismatch');
  const token = await exchangeCodeForToken(code, stored.codeVerifier);
  // Best-effort username lookup so the UI can display
  // "投稿先: @sekai_sanpo_" after connect. Failure is non-fatal — token
  // is still valid for posting.
  try {
    const me = await fetchMe(token.accessToken);
    token.username = me.username;
    token.userId = me.id;
  } catch {
    // ignore
  }
  await saveToken(token);
  await clearPkce();
  return token;
}

interface XUser {
  id: string;
  username: string;
}

async function fetchMe(accessToken: string): Promise<XUser> {
  const r = await CapacitorHttp.get({
    url: 'https://api.x.com/2/users/me',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (r.status < 200 || r.status >= 300)
    throw new Error(`/users/me failed: ${r.status}`);
  return { id: r.data.data.id, username: r.data.data.username };
}

/**
 * X token endpoint exchange. WebView fetch() into api.x.com fails with
 * CORS / "Failed to fetch" because the cross-origin preflight from
 * https://localhost is rejected. CapacitorHttp goes through the native
 * Android HttpURLConnection so CORS doesn't apply at all.
 */
async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
): Promise<StoredToken> {
  const r = await CapacitorHttp.post({
    url: TOKEN_URL,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    },
  });
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`Token exchange failed: ${r.status} ${JSON.stringify(r.data)}`);
  }
  const j = r.data;
  const expiresAt = Date.now() + (Number(j.expires_in) || 7200) * 1000;
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<StoredToken> {
  const r = await CapacitorHttp.post({
    url: TOKEN_URL,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    },
  });
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`Token refresh failed: ${r.status} ${JSON.stringify(r.data)}`);
  }
  const j = r.data;
  const expiresAt = Date.now() + (Number(j.expires_in) || 7200) * 1000;
  const token: StoredToken = {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? refreshToken,
    expiresAt,
  };
  await saveToken(token);
  return token;
}

/**
 * Return a fresh access token, transparently refreshing if needed.
 * Returns null when no token is stored (= user must connect first).
 */
export async function getAccessToken(): Promise<string | null> {
  const t = await loadStoredToken();
  if (!t) return null;
  // 60s slack to dodge clock skew + transit jitter.
  if (t.expiresAt - 60_000 > Date.now()) return t.accessToken;
  try {
    const refreshed = await refreshAccessToken(t.refreshToken);
    return refreshed.accessToken;
  } catch {
    await clearStoredToken();
    return null;
  }
}
