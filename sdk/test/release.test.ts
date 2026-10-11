import { describe, expect, it, vi } from 'vitest';
import { checkVersions, nextReleaseVersion, versionManifest } from '../scripts/release.mjs';

describe('SDK releases', () => {
  const packages = [{ name: 'server', version: '0.4.0' }, { name: 'web', version: '0.4.0' }];

  it('automatically increments the published patch and compares versions numerically', () => {
    expect(nextReleaseVersion(packages, () => ['0.3.0', '0.4.0'])).toBe('0.4.1');
    expect(nextReleaseVersion(packages, () => ['0.4.9', '0.4.10', '1.0.0-beta.1'])).toBe('0.4.11');
  });

  it('keeps an unpublished prepared release when the updater is rerun', () => {
    expect(nextReleaseVersion(packages, () => ['0.3.0'])).toBe('0.4.0');
    const prepared = packages.map(p => ({ ...p, version: '0.4.1' }));
    expect(nextReleaseVersion(prepared, () => ['0.4.0'])).toBe('0.4.1');
    expect(nextReleaseVersion(packages, () => ['0.0.0-stage'])).toBe('0.4.0');
  });

  it('selects a common version after partial publication or when local versions lag npm', () => {
    expect(nextReleaseVersion(packages, name => name === 'web' ? ['0.4.0'] : ['0.3.0'])).toBe('0.4.1');
    expect(nextReleaseVersion(packages, () => ['0.5.0'])).toBe('0.5.1');
    expect(nextReleaseVersion([packages[0], { ...packages[1], version: '0.5.0' }], () => ['0.4.0'])).toBe('0.5.0');
  });

  it('does not choose a release when the registry cannot be checked', () => {
    expect(() => nextReleaseVersion(packages, () => { throw new Error('Registry unreachable'); })).toThrow('Registry unreachable');
    expect(() => nextReleaseVersion([{ name: 'server', version: 'latest' }], () => [])).toThrow('stable versions');
  });

  it('updates internal dependencies without changing external requirements', () => {
    const old = { name: '@truplexy/react', version: '0.3.0', dependencies: { '@truplexy/web': '^0.3.0' }, peerDependencies: { react: '>=18' } };
    expect(versionManifest(old, '0.4.0', ['@truplexy/web', '@truplexy/react'])).toEqual({ ...old, version: '0.4.0', dependencies: { '@truplexy/web': '^0.4.0' } });
    expect(old.dependencies['@truplexy/web']).toBe('^0.3.0');
    expect(() => versionManifest(old, 'latest', [])).toThrow('stable version');
  });

  it('refuses the whole release if even a later workspace was already published', () => {
    const packages = [{ name: 'server', version: '0.4.0' }, { name: 'web', version: '0.4.0' }];
    const lookup = vi.fn(name => name === 'web' ? ['0.3.0', '0.4.0'] : ['0.3.0']);
    expect(() => checkVersions(packages, lookup)).toThrow('web@0.4.0');
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(() => checkVersions(packages, () => ['0.3.0'])).not.toThrow();
  });

  it('stops on inconsistent versions or a registry failure', () => {
    const lookup = vi.fn(() => { throw new Error('Registry unreachable'); });
    expect(() => checkVersions([{ version: '0.3.0' }, { version: '0.4.0' }], lookup)).toThrow('versions differ');
    expect(lookup).not.toHaveBeenCalled();
    expect(() => checkVersions([{ name: 'server', version: '0.4.0' }], lookup)).toThrow('Registry unreachable');
  });
});
