#!/usr/bin/env node
/**
 * Vendors brand/channel logos from theSVG (https://thesvg.org) into
 * public/brands and dashboard/public/brands.
 *
 *   npm run brand:icons
 *
 * Source: the `@thesvg/icons` npm package (MIT), which ships the same artwork
 * as thesvg.org. It is fetched with `npm pack` into a temp dir and is NOT a
 * dependency of the site: the generated SVGs are committed. The logos are
 * trademarks of their owners; they are used only to identify the channel.
 *
 * Add a slug here, re-run, and reference `/brands/<slug>.svg`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SLUGS = [
  'whatsapp',
  'telegram',
  'discord',
  'messenger',
  'instagram',
  'shopify',
  'woocommerce',
  'wordpress',
  'hubspot',
  'zendesk',
  'slack',
  'microsoft-teams',
  'line',
  'viber',
  'wechat',
  'signal',
  'google',
];

/**
 * theSVG's WooCommerce logo is a 24×4.8 wordmark (bubble + "COMMERCE"), which
 * is unreadable at icon sizes. Crop it to the "Woo" bubble, the brand's own mark.
 */
const VIEWBOX = { woocommerce: '0 9.2 8.85 5.4' };

const root = new URL('..', import.meta.url).pathname;
const outDirs = [join(root, 'public/brands'), join(root, 'dashboard/public/brands')];

const work = mkdtempSync(join(tmpdir(), 'thesvg-'));
try {
  execFileSync('npm', ['pack', '@thesvg/icons', '--silent'], { cwd: work, stdio: ['ignore', 'pipe', 'inherit'] });
  const tgz = execFileSync('sh', ['-c', 'ls *.tgz'], { cwd: work }).toString().trim();
  execFileSync('tar', ['xzf', tgz], { cwd: work });
  const version = JSON.parse(readFileSync(join(work, 'package/package.json'), 'utf8')).version;

  for (const dir of outDirs) mkdirSync(dir, { recursive: true });

  for (const slug of SLUGS) {
    const mod = await import(pathToFileURL(join(work, 'package/dist', `${slug}.js`)).href);
    if (typeof mod.svg !== 'string') throw new Error(`@thesvg/icons has no "${slug}" icon`);
    let svg = mod.svg.trim() + '\n';
    if (VIEWBOX[slug]) svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${VIEWBOX[slug]}"`);
    for (const dir of outDirs) writeFileSync(join(dir, `${slug}.svg`), svg);
    console.log(`${slug}.svg  (${mod.title})`);
  }
  console.log(`\n${SLUGS.length} icons from @thesvg/icons@${version}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
