// Fails when the CDN widget grows past its budget (gzipped).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET = 20 * 1024;
const file = new URL('../packages/web/dist/truplexy.min.js', import.meta.url);
const bytes = gzipSync(readFileSync(file)).length;
console.log(`truplexy.min.js: ${(bytes / 1024).toFixed(1)} KB gzipped (budget ${BUDGET / 1024} KB)`);
if (bytes > BUDGET) process.exit(1);
