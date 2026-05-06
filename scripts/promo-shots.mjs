import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

// Use bundled-ish Chromium: try playwright's, else system Chrome.
const candidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.CHROME_PATH,
].filter(Boolean);
const exe = candidates.find((p) => existsSync(p));
if (!exe) {
  console.error('Chrome not found. Set CHROME_PATH env.');
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  // Phone-size for the pinned-post images (matches what the user actually plays).
  const phone = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
  });
  const p1 = await phone.newPage();
  await p1.goto('http://localhost:5173/sanpo/', { waitUntil: 'networkidle' });
  await p1.waitForTimeout(6000); // wait for tiles + dismiss bonus toast
  await p1.screenshot({ path: 'public/x-promo/post-map.png', fullPage: false });

  // Casino dialog
  await p1.click('button:has-text("カジノでプレイ")', { timeout: 5000 }).catch(() => {});
  await p1.waitForTimeout(1500);
  await p1.screenshot({ path: 'public/x-promo/post-casino.png', fullPage: false });

  // Header banner: 1500x500 wide landscape
  const banner = await browser.newContext({
    viewport: { width: 1500, height: 500 },
    deviceScaleFactor: 1,
  });
  const p2 = await banner.newPage();
  await p2.goto('http://localhost:5173/sanpo/', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(6000);
  await p2.screenshot({ path: 'public/x-promo/header-banner.png', fullPage: false });

  console.log('Wrote promo screenshots to public/x-promo/');
} finally {
  await browser.close();
}
