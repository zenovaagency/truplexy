import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from '@/lib/api/types';
import { createImageRefresher } from '@/lib/images/refresh';
import { fitBox, MessageImages, pictureAlt } from './MessageImages';

const HOUR = 3_600_000;
const att = (n: number, over: Partial<Attachment> = {}): Attachment => ({
  id: `att_${String(n).padStart(32, '0')}`,
  content_type: 'image/jpeg',
  width: 1280,
  height: 720,
  size: 200_000,
  url: `https://files.example/att_${n}?sig=fresh`,
  url_expires_at: new Date(Date.now() + HOUR).toISOString(),
  ...over,
});

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

async function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(ui));
  return container;
}
const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});
const imgs = () => [...document.querySelectorAll('img')];

describe('MessageImages', () => {
  it('renders each picture lazily, with alt text and its stored size so space is reserved', async () => {
    const refresher = createImageRefresher(async () => {});
    const c = await render(<MessageImages images={[att(1), att(2, { width: 600, height: 900 })]} refresher={refresher} />);
    const [a, b] = [...c.querySelectorAll('img')];
    expect(a!.getAttribute('alt')).toBe('Picture sent by the customer (1 of 2)');
    expect(b!.getAttribute('alt')).toBe('Picture sent by the customer (2 of 2)');
    expect(a!.getAttribute('src')).toBe('https://files.example/att_1?sig=fresh');
    expect([a!.getAttribute('width'), a!.getAttribute('height')]).toEqual(['1280', '720']);
    expect(a!.getAttribute('loading')).toBe('lazy');
    // The box is reserved at the picture's shape before it loads.
    const box = a!.closest('button') as HTMLElement;
    expect(box.style.width).toBe('240px');
    expect(box.style.height).toBe('135px');
    expect((b!.closest('button') as HTMLElement).style.height).toBe('300px');
  });

  it('uses a plain alt for a single picture, and nothing for no pictures', async () => {
    const refresher = createImageRefresher(async () => {});
    const c = await render(<MessageImages images={[att(1)]} refresher={refresher} />);
    expect(c.querySelector('img')!.getAttribute('alt')).toBe('Picture sent by the customer');
    await act(async () => root!.render(<MessageImages images={[]} refresher={refresher} />));
    expect(c.innerHTML).toBe('');
    expect(pictureAlt(0, 1)).toBe('Picture sent by the customer');
  });

  it('opens the picture larger on click, in a dialog that closes with Escape', async () => {
    const refresher = createImageRefresher(async () => {});
    const c = await render(<MessageImages images={[att(1)]} refresher={refresher} />);
    const button = c.querySelector('button')!;
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-label')).toBe('Picture sent by the customer. View larger');
    await act(async () => button.click());
    await flush();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).toBeTruthy();
    expect(dialog.querySelector('img')!.getAttribute('alt')).toBe('Picture sent by the customer');
    expect(dialog.querySelector('img')!.getAttribute('src')).toBe('https://files.example/att_1?sig=fresh');
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await flush();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('an expired link', () => {
  it('reloads the owner once when a picture fails to load, then swaps in the fresh URL', async () => {
    const reload = vi.fn(async () => {});
    const refresher = createImageRefresher(reload);
    const c = await render(<MessageImages images={[att(1)]} refresher={refresher} />);
    await act(async () => imgs()[0]!.dispatchEvent(new Event('error')));
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);

    // The reloaded conversation arrives with a new signed URL.
    await act(async () => root!.render(<MessageImages images={[att(1, { url: 'https://files.example/att_1?sig=NEW' })]} refresher={refresher} />));
    await flush();
    expect(c.querySelector('img')!.getAttribute('src')).toBe('https://files.example/att_1?sig=NEW');
    await act(async () => imgs()[0]!.dispatchEvent(new Event('load')));
    expect(c.textContent).not.toContain('unavailable');
  });

  it('gives up after that one reload: "Picture unavailable", with a button to try by hand', async () => {
    const reload = vi.fn(async () => {});
    const refresher = createImageRefresher(reload);
    const c = await render(<MessageImages images={[att(1)]} refresher={refresher} />);
    await act(async () => imgs()[0]!.dispatchEvent(new Event('error')));
    await flush();
    await act(async () => imgs()[0]!.dispatchEvent(new Event('error')));
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(c.textContent).toContain('Picture unavailable');

    const reloadButton = [...c.querySelectorAll('button')].find((b) => b.textContent?.includes('Reload'))!;
    await act(async () => reloadButton.click());
    await flush();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('renews a link whose url_expires_at has passed before trying to show it', async () => {
    const reload = vi.fn(async () => {});
    const refresher = createImageRefresher(reload);
    const stale = att(1, { url: 'https://files.example/att_1?sig=OLD', url_expires_at: new Date(Date.now() - 60_000).toISOString() });
    const c = await render(<MessageImages images={[stale]} refresher={refresher} />);
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);

    await act(async () => root!.render(<MessageImages images={[att(1, { url: 'https://files.example/att_1?sig=NEW' })]} refresher={refresher} />));
    await flush();
    expect(c.querySelector('img')!.getAttribute('src')).toBe('https://files.example/att_1?sig=NEW');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows the picture anyway if the reload still returns an expired link (a skewed clock must not loop)', async () => {
    const reload = vi.fn(async () => {});
    const refresher = createImageRefresher(reload);
    const stale = att(1, { url_expires_at: new Date(Date.now() - 60_000).toISOString() });
    const c = await render(<MessageImages images={[stale]} refresher={refresher} />);
    await flush();
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(c.querySelector('img')).toBeTruthy();
  });

  it('reloads once for all the pictures of a message that expire together', async () => {
    const reload = vi.fn(async () => {});
    const refresher = createImageRefresher(reload);
    await render(<MessageImages images={[att(1), att(2), att(3)]} refresher={refresher} />);
    await act(async () => imgs().forEach((i) => i.dispatchEvent(new Event('error'))));
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('never keeping the URL', () => {
  it('writes nothing to local or session storage', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const refresher = createImageRefresher(async () => {});
    await render(<MessageImages images={[att(1)]} refresher={refresher} />);
    await act(async () => imgs()[0]!.dispatchEvent(new Event('error')));
    await flush();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('asks the browser not to send a Referer with the signed link', async () => {
    const refresher = createImageRefresher(async () => {});
    await render(<MessageImages images={[att(1)]} refresher={refresher} />);
    expect(imgs()[0]!.getAttribute('referrerpolicy')).toBe('no-referrer');
  });
});

describe('fitBox', () => {
  it('keeps the shape and never enlarges', () => {
    expect(fitBox(1280, 720, 240, 300)).toEqual({ width: 240, height: 135 });
    expect(fitBox(100, 50, 240, 300)).toEqual({ width: 100, height: 50 });
    expect(fitBox(600, 1800, 240, 300)).toEqual({ width: 100, height: 300 });
    expect(fitBox(0, 0, 240, 300)).toEqual({ width: 240, height: 180 });
  });
});
