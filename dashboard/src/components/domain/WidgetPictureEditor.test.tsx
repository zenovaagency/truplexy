import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyError } from '@/lib/notify';
import { cleanup, renderPage, text } from '@/test-utils';
import { WidgetPictureEditor } from './WidgetPictureEditor';

vi.mock('@/lib/notify', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));
afterEach(cleanup);

const pick = async (file: File) => {
  const input = document.querySelector('[data-testid="widget-picture-input"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => void input.dispatchEvent(new Event('change', { bubbles: true })));
};

const mount = (props: Partial<Parameters<typeof WidgetPictureEditor>[0]> = {}) =>
  renderPage([{ path: '/', element: <WidgetPictureEditor value="" onSave={() => {}} onRemove={() => {}} {...props} /> }], '/', () => undefined);

describe('WidgetPictureEditor', () => {
  it('offers an upload when there is no picture, and Replace and Remove when there is', async () => {
    await mount();
    expect(text()).toContain('Upload a picture');
    expect(text()).not.toContain('Remove');
    await cleanup();
    await mount({ value: 'https://img.test/h.png' });
    expect(text()).toContain('Replace');
    expect(text()).toContain('Remove');
  });

  it('refuses a file that is not a PNG, JPEG or WebP, before any cropping', async () => {
    await mount();
    await pick(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    expect(notifyError).toHaveBeenCalledWith(expect.stringContaining('PNG, JPEG or WebP'));
    expect(document.querySelector('[data-testid="crop-frame"]')).toBeNull();
  });

  it('refuses a picture over 20 MB', async () => {
    await mount();
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });
    await pick(big);
    expect(notifyError).toHaveBeenCalledWith('The picture is larger than 20 MB.');
  });

  it("opens the crop frame for a picture the browser can read", async () => {
    const bitmap = { width: 800, height: 400, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ clearRect: vi.fn(), drawImage: vi.fn() })) as never;
    await mount();
    await pick(new File(['x'], 'p.png', { type: 'image/png' }));
    expect(document.querySelector('[data-testid="crop-frame"]')).not.toBeNull();
    expect(text()).toContain('Adjust the picture');
    expect(text()).toContain('Use this picture');
    vi.unstubAllGlobals();
  });
});
