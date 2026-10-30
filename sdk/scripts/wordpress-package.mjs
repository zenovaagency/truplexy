// Builds the WordPress.org plugin folder: the plugin files plus the built widget (truplexy.min.js),
// in dist/wordpress/truplexy-chat, and zips it to dist/wordpress/truplexy-chat-<version>.zip.
// Run `npm run build` first so packages/web/dist/truplexy.min.js is current.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'wordpress', 'truplexy-chat');
const widget = join(root, 'packages', 'web', 'dist', 'truplexy.min.js');
const out = join(root, 'dist', 'wordpress');
const staged = join(out, 'truplexy-chat');

if (!existsSync(widget)) {
  console.error('packages/web/dist/truplexy.min.js is missing. Run `npm run build` first.');
  process.exit(1);
}

const version = /^ \* Version:\s+(\S+)/m.exec(readFileSync(join(source, 'truplexy-chat.php'), 'utf8'))?.[1];
const stable = /^Stable tag:\s*(\S+)/m.exec(readFileSync(join(source, 'readme.txt'), 'utf8'))?.[1];
if (!version || version !== stable) {
  console.error(`The plugin version (${version}) and the readme's Stable tag (${stable}) must match.`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(source, staged, { recursive: true });
cpSync(widget, join(staged, 'truplexy.min.js'));

// WordPress.org doesn't allow plugins to load scripts from a CDN, so its build always serves the bundled
// truplexy.min.js. The source keeps the CDN fallback for the copy-paste version the dashboard shows, which has no
// script file beside it. Each piece must be found exactly once, so a change to that code stops the build.
const php = join(staged, 'truplexy-chat.php');
let code = readFileSync(php, 'utf8').replace(/\r\n/g, '\n');
for (const [from, to] of [
  ["const TRUPLEXY_CHAT_CDN = 'https://cdn.jsdelivr.net/npm/@truplexy/web@0/dist/truplexy.min.js';\n", ''],
  ['    // A copy of truplexy.min.js beside this file is used first; otherwise the CDN.\n', ''],
  ["    $local = file_exists(plugin_dir_path(__FILE__) . 'truplexy.min.js');\n", ''],
  ["$local ? plugins_url('truplexy.min.js', __FILE__) : TRUPLEXY_CHAT_CDN", "plugins_url('truplexy.min.js', __FILE__)"],
]) {
  const hits = code.split(from).length - 1;
  if (hits !== 1) {
    console.error(`Could not remove the CDN fallback from the WordPress.org build ("${from.trim()}" found ${hits} times). Update scripts/wordpress-package.mjs.`);
    process.exit(1);
  }
  code = code.replace(from, to);
}
if (/CDN|jsdelivr/i.test(code)) {
  console.error('The WordPress.org build still mentions a CDN. Update scripts/wordpress-package.mjs.');
  process.exit(1);
}
writeFileSync(php, code);

const zip = join(out, `truplexy-chat-${version}.zip`);
// bsdtar (Windows 10+, macOS) writes zip with -a; the folder is the archive's only top-level entry.
// On Windows, use the system tar: a GNU tar earlier on PATH (Git Bash) cannot write zips.
const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const result = spawnSync(tar, ['-a', '-c', '-f', `truplexy-chat-${version}.zip`, 'truplexy-chat'], { cwd: out, stdio: 'inherit' });
if (result.status !== 0) {
  console.error(`Could not create the zip. Zip the folder yourself: ${staged}`);
  process.exit(1);
}
// The site serves the same zip, unversioned, so the docs link never changes.
const download = join(root, '..', 'public', 'downloads', 'truplexy-chat.zip');
mkdirSync(dirname(download), { recursive: true });
cpSync(zip, download);
console.log(`Plugin folder: ${staged}\nZip for upload: ${zip}`);
