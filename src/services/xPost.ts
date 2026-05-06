/**
 * Wrapper around POST /2/tweets — direct Tweet creation via X API v2.
 * Uses the access_token managed by xAuth.ts. Free tier rate limit:
 * ~17 posts per 24h per user; the daily-post use case stays under it.
 */

import { getAccessToken } from './xAuth';

const TWEETS_URL = 'https://api.x.com/2/tweets';

export interface PostTweetResult {
  /** X-assigned tweet id, useful for reply chains later. */
  id: string;
  text: string;
}

export class XPostError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: unknown,
  ) {
    super(message);
    this.name = 'XPostError';
  }
}

export async function postTweet(text: string): Promise<PostTweetResult> {
  const token = await getAccessToken();
  if (!token) {
    throw new XPostError('Not connected to X — run startXAuth first.', 401);
  }
  const r = await fetch(TWEETS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) {
    let detail: unknown;
    try {
      detail = await r.json();
    } catch {
      detail = await r.text();
    }
    // 429 = rate limit. 401 = token died. 403 = scope mismatch / suspended.
    throw new XPostError(`X post failed: ${r.status}`, r.status, detail);
  }
  const j = await r.json();
  return { id: j.data.id, text: j.data.text };
}
