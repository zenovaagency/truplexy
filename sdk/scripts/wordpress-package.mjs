// Builds the WordPress.org plugin folder: the plugin files plus the built widget (truplexy.min.js),
// in dist/wordpress/truplexy-chat, and zips it to dist/wordpress/truplexy-chat-<version>.zip.
// Run `npm run build` first so packages/web/dist/truplexy.min.js is current.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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
