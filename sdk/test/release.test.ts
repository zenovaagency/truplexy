import { describe, expect, it, vi } from 'vitest';
import { checkVersions, versionManifest } from '../scripts/release.mjs';

describe('SDK releases', () => {
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
