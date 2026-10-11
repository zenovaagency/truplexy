// Keep workspace versions together and check every package before publishing any.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const read = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const workspaces = () => read('package.json').workspaces.map(path => ({ path, manifest: read(`${path}/package.json`) }));

function npm(args) {
  if (!process.env.npm_execpath) throw new Error('Run this script through npm run version:sdk, publish:check, or release.');
  return spawnSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: fileURLToPath(root), encoding: 'utf8' });
}

export function versionManifest(manifest, version, names) {
  if (!stableVersion.test(version)) {
    throw new Error('Use a stable version such as 0.4.0.');
  }
  const next = structuredClone(manifest);
  next.version = version;
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of names) {
      if (next[section]?.[name]) next[section][name] = `^${version}`;
    }
  }
  return next;
}

const compareVersions = (a, b) => {
  const left = a.split('.').map(BigInt);
  const right = b.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
};

export function nextReleaseVersion(manifests, lookup) {
  if (!manifests.length || manifests.some(p => !stableVersion.test(p.version))) {
    throw new Error('SDK packages need stable versions before choosing the next release.');
  }
  const local = manifests.map(p => p.version).sort(compareVersions).at(-1);
  // Read every package before choosing a version, including a partially published release.
  const published = manifests.flatMap(p => lookup(p.name)).filter(v => stableVersion.test(v)).sort(compareVersions).at(-1);
  // Reuse a prepared release after cancelled publishing or failed authentication.
  if (!published || compareVersions(local, published) > 0) return local;
  const [major, minor, patch] = published.split('.');
  return `${major}.${minor}.${BigInt(patch) + 1n}`;
}

export function checkVersions(manifests, lookup) {
  const versions = new Set(manifests.map(p => p.version));
  if (versions.size !== 1) throw new Error('SDK versions differ. Run npm run version:sdk first.');
  const published = [];
  for (const p of manifests) {
    if (lookup(p.name).includes(p.version)) published.push(`${p.name}@${p.version}`);
  }
  if (published.length) throw new Error(`Already published: ${published.join(', ')}. Run npm run version:sdk to choose the next version. No publishing was attempted.`);
}

function registryVersions(name) {
  const result = npm(['view', name, 'versions', '--json']);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Could not check ${name} in the registry.\n${result.stderr}`);
  const data = JSON.parse(result.stdout);
  return Array.isArray(data) ? data : [data];
}

function run(command, version) {
  const packages = workspaces();
  if (command === 'version') {
    if (version === undefined || version === 'auto') {
      version = nextReleaseVersion(packages.map(p => p.manifest), registryVersions);
      console.log(`Selected SDK release ${version}.`);
    }
    const names = packages.map(p => p.manifest.name);
    // Validate every manifest before writing any file.
    const updated = packages.map(p => ({ ...p, manifest: versionManifest(p.manifest, version, names) }));
    for (const p of updated) writeFileSync(new URL(`${p.path}/package.json`, root), JSON.stringify(p.manifest, null, 2) + '\n');
    const lock = npm(['install', '--package-lock-only', '--ignore-scripts']);
    if (lock.error) throw lock.error;
    if (lock.status !== 0) throw new Error(`Versions changed, but lockfile update failed. Run npm install before releasing.\n${lock.stderr}`);
    console.log(`All SDK packages and internal dependencies updated to ${version}.`);
    return;
  }
  if (command !== 'check' && command !== 'publish') throw new Error('Expected version [auto|x.y.z], check, or publish.');
  checkVersions(packages.map(p => p.manifest), registryVersions);
  console.log('Unpublished versions verified: ' + packages.map(p => `${p.manifest.name}@${p.manifest.version}`).join(', '));
  if (command === 'publish') {
    // Inherit the terminal for npm authentication/OTP prompts. Preserve workspace order.
    const result = spawnSync(process.execPath, [process.env.npm_execpath, 'publish', '--workspaces', '--access', 'public'], { cwd: fileURLToPath(root), stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Publishing stopped. Some packages may already be published; check npm before retrying.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { run(...process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
