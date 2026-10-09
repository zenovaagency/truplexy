// The SDK playground: the real widget and the real server route, end to end.
//
//   npm run build && npm run playground             → a pretend Truplexy API (no key needed)
//   TRUPLEXY_CHAT_KEY=tpx_… npm run playground       → the real API
//
// Then open http://localhost:4300
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createNodeHandler } from '../packages/server/dist/node.js';
import { mockApi } from './mock-api.mjs';

const PORT = Number(process.env.PORT ?? 4300);
const real = Boolean(process.env.TRUPLEXY_CHAT_KEY);

const truplexy = createNodeHandler(real ? {} : { chatKey: 'tpx_playground', apiBase: 'https://mock.truplexy', fetch: mockApi('https://mock.truplexy') });

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/truplexy.min.js': ['../packages/web/dist/truplexy.min.js', 'text/javascript'],
};

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/api/truplexy') return truplexy(req, res);
  const file = files[path];
  if (!file) return res.writeHead(404).end('Not found');
  try {
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' }).end(await readFile(new URL(file[0], import.meta.url)));
  } catch {
    res.writeHead(500).end(`Missing ${file[0]}. Run "npm run build" first.`);
  }
}).listen(PORT, () => {
  console.log(`Truplexy playground on http://localhost:${PORT} (${real ? 'real API' : 'mock API'})`);
});
