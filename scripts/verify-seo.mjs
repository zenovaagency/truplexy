/**
 * Crawl-readiness audit of the built site. Run after `npm run build`:
 *
 *   npm run verify:seo
 *
 * 1. dist/sitemap.xml is well-formed, follows the sitemap protocol (absolute
 *    https URLs on SITE.url, no query or fragment, no trailing slash, no
 *    duplicates, valid W3C-date `lastmod`, under 50,000 URLs / 50 MB) and
 *    carries no leftover legacy sitemap files.
 * 2. Every sitemap URL maps to a built page that is indexable (no `noindex`
 *    in its robots meta) and whose canonical URL is the sitemap URL itself.
 * 3. Every built page is either in the sitemap or deliberately `noindex`
 *    (so a new public page can't be forgotten), and every internal link
 *    resolves to a built page or file.
 * 4. robots.txt references /sitemap.xml and lets Googlebot, Bingbot and
 *    OAI-SearchBot fetch every sitemap URL.
 * 5. No sitemap URL is a private, API, webhook or dashboard route.
 *
 * Exits non-zero on any problem. Live HTTP status, redirect and header checks
 * need a deployment; run them against production after each release.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../src/data/site.ts';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const errors = [];
const fail = (msg) => errors.push(msg);

const read = (name) => readFileSync(join(dist, name), 'utf8');
const BOTS = ['Googlebot', 'Bingbot', 'OAI-SearchBot'];
const PRIVATE = /^\/(api|app|admin|dashboard|webhooks?|sign-?in|sign-?up|login|register|account|settings|search|_astro|_image)(\/|$)/i;

// ── 1. sitemap.xml ──────────────────────────────────────────────────────────
for (const legacy of ['sitemap-index.xml', 'sitemap-0.xml']) {
  if (existsSync(join(dist, legacy)) && !read('sitemap.xml').includes(`/${legacy}`)) {
    fail(`${legacy} is still published but sitemap.xml does not reference it`);
  }
}
if (!existsSync(join(dist, 'sitemap.xml'))) {
  console.error('✗ dist/sitemap.xml is missing — run `npm run build` first.');
  process.exit(1);
}
const sitemapSize = statSync(join(dist, 'sitemap.xml')).size;
if (sitemapSize > 50 * 1024 * 1024) fail(`sitemap.xml is ${sitemapSize} bytes (limit 50 MB uncompressed)`);

/** Reads <loc> and <lastmod> out of `<tag>…</tag>` entries of one sitemap file. */
function entries(xml, tag) {
  const out = [];
  for (const m of xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))) {
    const loc = /<loc>([^<]*)<\/loc>/.exec(m[1])?.[1];
    const lastmod = /<lastmod>([^<]*)<\/lastmod>/.exec(m[1])?.[1];
    out.push({ loc: loc?.replaceAll('&amp;', '&'), lastmod, raw: m[1] });
  }
  return out;
}
function wellFormed(xml, name) {
  if (!xml.startsWith('<?xml')) fail(`${name}: missing XML declaration`);
  const stack = [];
  for (const m of xml.replace(/<\?[\s\S]*?\?>/g, '').matchAll(/<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g)) {
    const [, closing, tag, selfClosing] = m;
    if (selfClosing) continue;
    if (!closing) stack.push(tag);
    else if (stack.pop() !== tag) return fail(`${name}: mismatched </${tag}>`);
  }
  if (stack.length) fail(`${name}: unclosed <${stack.at(-1)}>`);
  // Text nodes may not hold a raw `&` or `<`.
  const text = xml.replace(/<[^>]*>/g, '');
  if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(text)) fail(`${name}: unescaped & in text`);
}

const root = read('sitemap.xml');
wellFormed(root, 'sitemap.xml');
const isIndex = /<sitemapindex[\s>]/.test(root);
const files = isIndex ? entries(root, 'sitemap').map((e) => e.loc) : ['sitemap.xml'];
const urls = [];
for (const file of files) {
  const name = file === 'sitemap.xml' ? file : new URL(file).pathname.slice(1);
  if (file !== 'sitemap.xml' && !file.startsWith(`${SITE.url}/`)) fail(`${file}: not on ${SITE.url}`);
  if (!existsSync(join(dist, name))) {
    fail(`${name}: listed in the index but not built`);
    continue;
  }
  const xml = read(name);
  if (name !== 'sitemap.xml') wellFormed(xml, name);
  if (!/<urlset[\s>]/.test(xml)) fail(`${name}: no <urlset>`);
  const list = entries(xml, 'url');
  if (list.length > 50_000) fail(`${name}: ${list.length} URLs (limit 50,000)`);
  urls.push(...list);
}

const W3C_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;
const seen = new Set();
const routes = [];
for (const { loc, lastmod } of urls) {
  if (!loc) {
    fail('a <url> has no <loc>');
    continue;
  }
  if (seen.has(loc)) fail(`duplicate URL: ${loc}`);
  seen.add(loc);
  const u = new URL(loc);
  if (u.origin !== SITE.url) fail(`${loc}: not on ${SITE.url}`);
  if (u.search || u.hash) fail(`${loc}: has a query string or fragment`);
  if (u.pathname !== '/' && u.pathname.endsWith('/')) fail(`${loc}: trailing slash (site uses none)`);
  if (PRIVATE.test(u.pathname)) fail(`${loc}: looks like a private or technical route`);
  if (lastmod && (!W3C_DATE.test(lastmod) || Number.isNaN(Date.parse(lastmod)))) fail(`${loc}: invalid lastmod "${lastmod}"`);
  if (lastmod && Date.parse(lastmod) > Date.now() + 864e5) fail(`${loc}: lastmod "${lastmod}" is in the future`);
  routes.push(u.pathname);
}

// ── 2 & 3. built pages ──────────────────────────────────────────────────────
/** Built HTML pages, as { route, file }. 404.html is the error page, not a route. */
function pages(dir = '') {
  return readdirSync(join(dist, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = join(dir, e.name);
    if (e.isDirectory()) return e.name === '_astro' ? [] : pages(rel);
    if (e.name === 'index.html') return [{ route: '/' + dir.split('\\').join('/'), file: rel }];
    return [];
  });
}
const built = pages().map((p) => ({ ...p, route: p.route.replace(/\/$/, '') || '/' }));
const byRoute = new Map(built.map((p) => [p.route, p]));
const metaRobots = (html) => /<meta\s+name="robots"\s+content="([^"]*)"/i.exec(html)?.[1] ?? '';
const canonicalOf = (html) => /<link\s+rel="canonical"\s+href="([^"]*)"/i.exec(html)?.[1];

for (const route of routes) {
  const page = byRoute.get(route);
  if (!page) {
    fail(`${route}: in the sitemap but no built page (would 404)`);
    continue;
  }
  const html = read(page.file);
  if (/noindex/i.test(metaRobots(html))) fail(`${route}: in the sitemap but marked noindex`);
  const canonical = canonicalOf(html);
  if (canonical !== SITE.url + (route === '/' ? '/' : route)) fail(`${route}: canonical is ${canonical ?? 'missing'}`);
}
for (const { route, file } of built) {
  const indexable = !/noindex/i.test(metaRobots(read(file)));
  if (indexable && !seen.has(SITE.url + (route === '/' ? '/' : route))) fail(`${route}: indexable but missing from the sitemap`);
}

// Internal links (and assets) must resolve to something that was built.
const broken = new Set();
for (const { route, file } of built) {
  const html = read(file);
  for (const m of html.matchAll(/\s(?:href|src)="([^"#?][^"]*?)(?:[#?][^"]*)?"/g)) {
    const href = m[1];
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const path = href.replace(/\/$/, '') || '/';
    const exists = byRoute.has(path) || (path !== '/' && existsSync(join(dist, path)) && statSync(join(dist, path)).isFile());
    if (!exists) broken.add(`${href}  (linked from ${route})`);
  }
}
for (const b of broken) fail(`broken internal link: ${b}`);

// ── 4. robots.txt ───────────────────────────────────────────────────────────
const robots = read('robots.txt');
const sitemapLines = [...robots.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]);
if (!sitemapLines.includes(`${SITE.url}/sitemap.xml`)) fail(`robots.txt must contain "Sitemap: ${SITE.url}/sitemap.xml" (has: ${sitemapLines.join(', ') || 'none'})`);

/** Groups of rules per user-agent token, per RFC 9309. */
const groups = [];
for (const block of robots.split(/\n\s*\n/)) {
  const agents = [];
  const rules = [];
  for (const line of block.split('\n')) {
    const m = /^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'user-agent') agents.push(m[2].toLowerCase());
    else if (key === 'allow' || key === 'disallow') rules.push({ allow: key === 'allow', pattern: m[2] });
  }
  if (agents.length) groups.push({ agents, rules });
}
const toRegExp = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
function allowed(bot, path) {
  const token = bot.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  let best = { allow: true, length: -1 };
  for (const { rules } of applicable) {
    for (const r of rules) {
      if (!r.pattern || !toRegExp(r.pattern).test(path)) continue;
      const length = r.pattern.length;
      if (length > best.length || (length === best.length && r.allow)) best = { allow: r.allow, length };
    }
  }
  return best.allow;
}
for (const bot of BOTS) {
  for (const route of routes) {
    if (!allowed(bot, route)) fail(`robots.txt blocks ${bot} from ${route}`);
  }
}
for (const path of ['/_astro/', '/favicon.ico', '/og-card.png']) {
  if (!allowed('Googlebot', path)) fail(`robots.txt blocks rendering resource ${path}`);
}

// ── report ──────────────────────────────────────────────────────────────────
const dated = urls.filter((u) => u.lastmod).length;
console.log(`sitemap.xml: ${urls.length} URLs (${dated} with lastmod), ${isIndex ? `index of ${files.length} files` : 'single urlset'}, ${sitemapSize} bytes`);
console.log(`built pages: ${built.length} (${built.length - routes.length} kept out of the sitemap as noindex)`);
console.log(`robots.txt: ${BOTS.join(', ')} may fetch all ${routes.length} sitemap URLs`);
if (errors.length) {
  console.error(`\n✗ ${errors.length} problem${errors.length === 1 ? '' : 's'}:`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('✓ sitemap, canonicals, noindex and robots.txt are consistent');
