import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadImageSnippets, loadSnippets } from '../scripts/snippets.mjs';
import { serve } from '../playground/mock-api.mjs';

/**
 * The "Sending pictures" example in the integration guide (image input, planned), run for real:
 * extracted next to its helper, then pointed at the mock API over HTTP. Python and Go were run the
 * same way by hand (see sdk/README.md); only Node is automated, because it needs nothing installed.
 */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let dir: string;
let on: { server: Server; base: string };
let off: { server: Server; base: string };

beforeAll(async () => {
  on = await serve({ images: true, latency: 0, replyLatency: 0 });
  off = await serve({ images: false, latency: 0, replyLatency: 0 });
  dir = mkdtempSync(join(tmpdir(), 'truplexy-images-'));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'picture.png'), PNG);
  writeFileSync(join(dir, 'notes.txt'), 'not a picture');
  const pack = loadSnippets('node', on.base);
  writeFileSync(join(dir, 'truplexy.js'), pack.helper);
  writeFileSync(join(dir, 'send-picture.js'), loadImageSnippets(on.base).IMAGE_SNIPPETS.node.code);
});

afterAll(() => {
  on.server.close();
  off.server.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Runs the example as its own process. Asynchronous on purpose: the mock API lives in this process, and a blocked event loop could not answer it. */
function run(args: string[]) {
  return new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve) => {
    execFile(process.execPath, ['send-picture.js', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, TRUPLEXY_CHAT_KEY: 'test' }, timeout: 20_000 }, (error, stdout, stderr) =>
      resolve({ ok: !error, stdout, stderr }),
    );
  });
}

describe('the Node "Sending pictures" example', () => {
  it('registers, PUTs to storage and sends: the reply has read the picture', async () => {
    const r = await run(['picture.png', 'This error appears when I log in']);
    expect(r.ok, r.stderr).toBe(true);
    expect(r.stdout.trim()).toBe('answered I can see your picture and read “This error appears when I log in”.');
  });

  it('sends a picture with no text', async () => {
    const r = await run(['picture.png']);
    expect(r.ok, r.stderr).toBe(true);
    expect(r.stdout.trim()).toBe('answered I can see your picture.');
  });

  it('fails on a file type the API takes no picture from, instead of sending anything', async () => {
    const r = await run(['notes.txt', 'hi']);
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/INVALID_REQUEST|TruplexyApiError/);
  });
});

describe('the example files', () => {
  it('cover all seven languages and curl, each doing the three steps with the returned headers', () => {
    const { IMAGE_SNIPPETS, IMAGE_CURL } = loadImageSnippets();
    expect(Object.keys(IMAGE_SNIPPETS).sort()).toEqual(['csharp', 'go', 'java', 'node', 'php', 'python', 'ruby']);
    for (const [lang, { code }] of Object.entries<{ code: string }>(IMAGE_SNIPPETS)) {
      expect(code, lang).toMatch(/\/attachments/);
      expect(code, lang).toMatch(/attachments/);
      expect(code, lang).toMatch(/headers/i);
      expect(code, lang).toMatch(/sha256/i);
      // Nothing in them sends the chat key to storage.
      expect(code, lang).toMatch(/never add your chat key|plain client|plain one|carries your chat key/i);
    }
    expect(IMAGE_CURL).toContain('No Authorization header');
    expect(IMAGE_CURL).toContain('--data-binary');
  });
});
