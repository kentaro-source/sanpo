/**
 * Wrapper around POST /2/tweets — direct Tweet creation via X API v2.
 * Uses the access_token managed by xAuth.ts. Free tier rate limit:
 * ~17 posts per 24h per user; the daily-post use case stays under it.
 */

import { CapacitorHttp } from '@capacitor/core';
import { getAccessToken } from './xAuth';

const TWEETS_URL = 'https://api.x.com/2/tweets';

export interface PostTweetResult {
  /** X-assigned tweet id, useful for reply chains later. */
  id: string;
  text: string;
}

export class XPostError extends Error {
  status: number;
  detail?: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'XPostError';
    this.status = status;
    this.detail = detail;
  }
}

export async function postTweet(text: string): Promise<PostTweetResult> {
  const token = await getAccessToken();
  if (!token) {
    throw new XPostError('Not connected to X — run startXAuth first.', 401);
  }
  // CapacitorHttp routes through native HTTP, dodging WebView CORS.
  const r = await CapacitorHttp.post({
    url: TWEETS_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: { text },
  });
  if (r.status < 200 || r.status >= 300) {
    // 429 = rate limit. 401 = token died. 403 = scope mismatch / suspended.
    throw new XPostError(`X post failed: ${r.status}`, r.status, r.data);
  }
  return { id: r.data.data.id, text: r.data.data.text };
}
