import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { choose } from '@/test-utils';
import { presenceOf, rolesOf } from '@/lib/support';
import { CategorySelect, StatusDot } from './support';

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

async function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
  return container;
}

describe('presence', () => {
  it('reads availability and activity together', () => {
    expect(presenceOf({ availability: 'available', online: true })).toBe('online');
    expect(presenceOf({ availability: 'available', online: false })).toBe('idle');
    expect(presenceOf({ availability: 'away', online: false })).toBe('away');
    expect(presenceOf({ availability: 'offline', online: false })).toBe('offline');
    expect(rolesOf({ support_roles: [] })).toEqual(['general']);
  });

  it('labels the status dot', async () => {
    const c = await render(<StatusDot member={{ availability: 'available', online: false }} />);
    expect(c.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Away (inactive)');
  });
});

describe('the category picker', () => {
  it('lists every category and reports the one picked', async () => {
    const onChange = vi.fn();
    const c = await render(<CategorySelect value="general" onChange={onChange} />);
    const select = c.querySelector('select')!;
    expect(select.options).toHaveLength(8);
    await choose(select, 'billing');
    expect(onChange).toHaveBeenCalledWith('billing');
  });
});
