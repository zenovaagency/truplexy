// Runs the SDK's picture examples against the mock API. They import the built packages, so run
// `npm run build` first:  npm run check:examples
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve } from '../playground/mock-api.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `: ${detail}`}`);
  if (!ok) failures++;
};
const root = fileURLToPath(new URL('..', import.meta.url));
const env = (base) => ({ ...process.env, TRUPLEXY_CHAT_KEY: 'test', TRUPLEXY_API_BASE: base });
// Asynchronous on purpose: the mock API lives in this process, and a blocked event loop could not answer it.
const sh = (args, base) =>
  new Promise((resolve) => execFile(process.execPath, args, { cwd: root, env: env(base), encoding: 'utf8', timeout: 20_000 }, (error, stdout, stderr) => resolve({ ok: !error, out: `${stdout}${stderr}` })));

const on = await serve({ images: true, latency: 0, replyLatency: 0 });
const off = await serve({ images: false, latency: 0, replyLatency: 0 });

// examples/send-picture.mjs
let r = await sh(['examples/send-picture.mjs', 'examples/sample.png', 'Is this OK?'], on.base);
check('send-picture: uploads the picture and the reply has read it', r.ok && /answered I can see your picture and read “Is this OK\?”/.test(r.out), r.out);
r = await sh(['examples/send-picture.mjs', 'examples/sample.png', 'Is this OK?'], off.base);
check('send-picture: against an API without image input it says so and sends the text only', r.ok && /not available/.test(r.out) && /answered/.test(r.out), r.out);

// examples/widget-pictures: the server, and the browser's side played from Node with the built browser helper.
process.env.TRUPLEXY_CHAT_KEY = 'test';
process.env.TRUPLEXY_API_BASE = on.base;
process.env.PORT = '0';
const { server } = await import('../examples/widget-pictures/server.mjs');
await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
const site = `http://localhost:${server.address().port}`;
const { uploadImage } = await import('../packages/web/dist/index.js');
const post = async (path, body, headers = {}) => {
  const res = await fetch(site + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
};

const page = await fetch(site + '/');
check('widget-pictures: serves the page', page.status === 200 && (await page.text()).includes('Send a picture'));
const config = await fetch(site + '/api/config').then((x) => x.json());
check('widget-pictures: the feature check passes through the server', config.enabled === true && config.max_per_message === 3, JSON.stringify(config));

const sample = new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' });
let registrations = 0;
const id = await uploadImage(sample, async (details) => {
  registrations++;
  const res = await post('/api/pictures', details);
  return res.data;
});
check('widget-pictures: the browser PUTs straight to storage and gets an attachment ID', /^att_[0-9a-f]{32}$/.test(id) && registrations === 1, id);
const sent = await post('/api/message', { text: 'From the widget', attachments: [id] }, { 'Idempotency-Key': 'widget-1' });
check('widget-pictures: the server sends the message with the ID', sent.status === 200 && sent.data.status === 'answered' && /From the widget/.test(sent.data.reply), JSON.stringify(sent));
const again = await post('/api/message', { text: 'From the widget', attachments: [id] });
check('widget-pictures: an attachment is single-use (ATTACHMENT_NOT_FOUND the second time)', again.status === 404 && again.data.error.code === 'ATTACHMENT_NOT_FOUND', JSON.stringify(again));
const bad = await post('/api/pictures', { filename: 'x.png', content_type: 'image/png', size: 20_971_521, sha256: 'a'.repeat(64) });
check('widget-pictures: a refusal from the API reaches the browser as a code and request ID, not its text', bad.status === 413 && bad.data.error.code === 'IMAGE_TOO_LARGE' && /^req_/.test(bad.data.error.request_id), JSON.stringify(bad));

server.close();
on.server.close();
off.server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll example checks passed');
process.exit(failures ? 1 : 0);
