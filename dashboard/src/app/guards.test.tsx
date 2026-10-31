import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ScopeContext, type ScopeContextValue } from '@/lib/session/scope-context';
import { RequireScopePlatformAdmin } from './guards';
import { BUSINESS_NAV } from './nav';

let root: Root | null = null;
let container: HTMLDivElement;

async function open(isPlatformAdmin: boolean) {
  const ctx = { isPlatformAdmin, can: () => true } as unknown as ScopeContextValue;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={['/performance']}>
        <ScopeContext.Provider value={ctx}>
          <Routes>
            <Route element={<RequireScopePlatformAdmin />}>
              <Route path="performance" element={<p>Performance page</p>} />
            </Route>
          </Routes>
        </ScopeContext.Provider>
      </MemoryRouter>,
    );
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container?.remove();
});

describe('RequireScopePlatformAdmin', () => {
  it('opens the page for a platform admin', async () => {
    await open(true);
    expect(container.textContent).toContain('Performance page');
  });

  it('is a 404 for everyone else', async () => {
    await open(false);
    expect(container.textContent).not.toContain('Performance page');
  });
});

describe('the business nav', () => {
  it("marks Performance as platform-admin only", () => {
    const item = BUSINESS_NAV.flatMap((s) => s.items).find((i) => i.id === 'performance');
    expect(item?.platformAdmin).toBe(true);
  });
});
