# sanpo-fit-worker

Cloudflare Worker that holds the user's Google OAuth refresh token so the
PWA can stay connected to Google Fit indefinitely. Without this, GIS only
gives 1-hour access tokens and the user has to re-tap "Connect" every
hour (web OAuth doesn't issue refresh tokens to browser-only clients).

## One-time setup (manual, ~10 minutes)

You only do this once.

### 1. Get the Google OAuth client_secret

The PWA's existing client_id `329322197077-ba96t4apoji356kphtccruujp7p3oth3.apps.googleusercontent.com`
is a "Web application" type, which has both a `client_id` and a
`client_secret`.

1. Go to https://console.cloud.google.com/apis/credentials (project: My First Project)
2. Click the OAuth 2.0 Client (Web type) the PWA already uses
3. Copy the **Client secret** (looks like `GOCSPX-...`)
4. **Authorized redirect URIs** — for the popup-based code flow used here,
   no redirect URI is required (we use `redirect_uri=postmessage`). But
   make sure the PWA's origin is in **Authorized JavaScript origins**:
   - `https://kentaro-source.github.io`
   - `http://localhost:5173`

### 2. Install Wrangler + Cloudflare account

```bash
cd worker
npm install
npx wrangler login    # opens browser to authorize
```

### 3. Create a KV namespace for storing refresh tokens

```bash
npx wrangler kv:namespace create FIT_KV
```

Wrangler prints something like:

```
[[kv_namespaces]]
binding = "FIT_KV"
id = "abcd1234..."
```

Copy that `id` into `wrangler.toml`, replacing `REPLACE_WITH_KV_NAMESPACE_ID`.

### 4. Set the client_secret as a secret (NOT a var)

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
# paste the GOCSPX-... value when prompted
```

### 5. Deploy

```bash
npx wrangler deploy
```

Output includes the Worker URL, something like `https://sanpo-fit.<your-subdomain>.workers.dev`.

### 6. Wire it into the PWA

1. In the repo root, add to `.env.local`:
   ```
   VITE_FIT_WORKER_URL=https://sanpo-fit.<your-subdomain>.workers.dev
   ```
2. Add the same as a GitHub Actions Secret named `VITE_FIT_WORKER_URL`
   (Settings → Secrets and variables → Actions → New repository secret)
3. Update `.github/workflows/deploy.yml` to inject it at build time
   (alongside `VITE_GOOGLE_MAPS_API_KEY`)
4. `git push` → PWA reads the env var and uses the worker

If `VITE_FIT_WORKER_URL` is unset, the PWA falls back to the legacy
GIS-only flow (1-hour re-auth loop).

## Updating

```bash
cd worker
npx wrangler deploy
```

Worker is stateless apart from the KV. Refresh tokens persist across
deploys.

## Troubleshooting

- **"forbidden origin"** — your `ALLOWED_ORIGIN` in wrangler.toml doesn't
  match the request's Origin header. Edit and re-deploy.
- **"no_refresh_token"** — Google withheld the refresh_token because the
  user previously consented. Revoke at
  https://myaccount.google.com/permissions and reconnect.
- **"invalid_grant" on /refresh** — refresh token revoked or expired.
  Worker auto-deletes the KV entry; PWA will prompt for fresh consent.
