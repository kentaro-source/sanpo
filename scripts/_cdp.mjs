// Minimal CDP eval helper over an already-forwarded WebView devtools socket.
// Usage: node scripts/_cdp.mjs <wsUrl> [exprFile]
// Evaluates the JS in exprFile (default scripts/_cdpexpr.js) in the page with
// awaitPromise + returnByValue and prints the JSON result.
import { readFileSync } from 'node:fs';

const wsUrl = process.argv[2];
const exprFile = process.argv[3] || 'scripts/_cdpexpr.js';
if (!wsUrl) {
  console.error('need ws url');
  process.exit(1);
}
const expression = readFileSync(exprFile, 'utf8');

const ws = new WebSocket(wsUrl);
let done = false;
const fail = (m) => {
  if (done) return;
  done = true;
  console.error('ERR', m);
  process.exit(1);
};
setTimeout(() => fail('timeout'), 45000);

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
  ws.send(
    JSON.stringify({
      id: 2,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }),
  );
});
ws.addEventListener('message', (ev) => {
  let msg;
  try {
    msg = JSON.parse(ev.data);
  } catch {
    return;
  }
  if (msg.id !== 2) return;
  done = true;
  if (msg.error) {
    console.log(JSON.stringify({ cdpError: msg.error }, null, 2));
  } else if (msg.result?.exceptionDetails) {
    console.log(
      JSON.stringify(
        { jsException: msg.result.exceptionDetails.exception?.description ?? msg.result.exceptionDetails },
        null,
        2,
      ),
    );
  } else {
    console.log(JSON.stringify(msg.result?.result?.value ?? msg.result?.result, null, 2));
  }
  ws.close();
  process.exit(0);
});
ws.addEventListener('error', (e) => fail(e.message || 'ws error'));
