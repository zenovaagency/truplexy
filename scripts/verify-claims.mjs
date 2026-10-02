/**
 * Honesty audit for the built homepage. Run after `npm run build`:
 *
 *   npm run verify
 *
 * 1. Every visible mention of a channel that is not live must sit close to a
 *    "Coming soon" label (badge, diagram node, status row or footer list).
 * 2. No chat bubble (demo conversation) may mention a channel that is not live.
 *
 * The list of non-live channels comes straight from the registry in
 * src/data/channels.ts (Node strips its types on import), so flipping a
 * channel to 'live' there updates this check too.
 */
import { readFileSync } from 'node:fs';
import { SOON_CHANNELS } from '../src/data/channels.ts';

const NOT_LIVE = SOON_CHANNELS.map((c) => c.name);
const WINDOW = 700; // characters of markup either side of a mention

// Scripts, styles, comments and inline SVG carry no visible text (no
// component uses SVG <text>); SVG path data would only pad the distance
// between a channel name and its label.
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<svg[\s\S]*?<\/svg>/g, '');

let failures = 0;

for (const name of NOT_LIVE) {
  let from = 0;
  let count = 0;
  for (;;) {
    const i = html.indexOf(name, from);
    if (i === -1) break;
    from = i + name.length;
    // Skip occurrences inside attribute values (aria-labels, titles, classes).
    const lastOpen = html.lastIndexOf('<', i);
    const lastClose = html.lastIndexOf('>', i);
    if (lastOpen > lastClose) continue;
    count++;
    const near = html.slice(Math.max(0, i - WINDOW), i + WINDOW);
    if (!/Coming soon/i.test(near)) {
      failures++;
      console.log(`✗ "${name}" mentioned without a nearby Coming soon label: …${html.slice(i - 60, i + 60).replace(/\s+/g, ' ')}…`);
    }
  }
  console.log(`  ${name.padEnd(16)} ${count} visible mention(s)`);
}

// Demo text: chat bubbles, plus any element marked data-demo (the day-cycle's transcript).
const bubbles = [...html.matchAll(/class="[^"]*\bbubble\b[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1]);
const marked = [...html.matchAll(/<(\w+)\b[^>]*\bdata-demo\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
for (const b of [...bubbles, ...marked]) {
  const hit = NOT_LIVE.find((n) => b.includes(n));
  if (hit) {
    failures++;
    console.log(`✗ demo text mentions non-live channel "${hit}": ${b.replace(/<[^>]+>/g, '').trim().slice(0, 100)}`);
  }
}
console.log(`  ${bubbles.length} demo bubbles + ${marked.length} marked demo lines checked`);

if (failures) {
  console.log(`\nHonesty audit FAILED (${failures}).`);
  process.exit(1);
}
console.log('\nHonesty audit passed.');
