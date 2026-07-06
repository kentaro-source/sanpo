// Pinch-to-zoom-out on the device map via CDP Input.dispatchTouchEvent.
// Usage: node scripts/_cdppinch.mjs <wsUrl> [repeat]
const wsUrl = process.argv[2];
const repeat = parseInt(process.argv[3] || '3', 10);
const dir = process.argv[4] || 'out'; // 'out' = zoom out, 'in' = zoom in
if (!wsUrl) { console.error('need ws'); process.exit(1); }

const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ws.addEventListener('message', (ev) => {
  let m;
  try { m = JSON.parse(ev.data); } catch { return; }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});

ws.addEventListener('open', async () => {
  // viewport size in CSS px
  const r = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({w:innerWidth,h:innerHeight})',
    returnByValue: true,
  });
  const { w, h } = JSON.parse(r.result.value);
  const cx = Math.round(w / 2); // center column (safe from L/R edges)
  const cy = Math.round(h * 0.48); // map middle; keep fingers clear of the
  // top status/notification zone (a top finger dragging down opened the shade)
  const touch = (type, pts) =>
    send('Input.dispatchTouchEvent', {
      type,
      touchPoints: pts.map((p) => ({ x: p.x, y: p.y })),
    });

  for (let n = 0; n < repeat; n++) {
    // VERTICAL pinch IN (fingers together) = zoom OUT. Vertical keeps both
    // touches on the center column, away from the screen edges (horizontal
    // spread ran off-screen and pulled the notification shade).
    const far = Math.round(h * 0.11), near = Math.round(h * 0.03);
    // zoom OUT: fingers far→near. zoom IN: fingers near→far.
    const startD = dir === 'in' ? near : far;
    const endD = dir === 'in' ? far : near;
    let top = { x: cx, y: cy - startD };
    let bot = { x: cx, y: cy + startD };
    await touch('touchStart', [top, bot]);
    const steps = 10;
    for (let s = 1; s <= steps; s++) {
      const d = startD + (endD - startD) * (s / steps);
      top = { x: cx, y: cy - d };
      bot = { x: cx, y: cy + d };
      await touch('touchMove', [top, bot]);
      await sleep(16);
    }
    await touch('touchEnd', []);
    await sleep(250);
  }
  console.log('pinch done x' + repeat);
  ws.close();
  process.exit(0);
});
ws.addEventListener('error', (e) => { console.error('ws err', e.message); process.exit(1); });
setTimeout(() => { console.error('timeout'); process.exit(1); }, 20000);
