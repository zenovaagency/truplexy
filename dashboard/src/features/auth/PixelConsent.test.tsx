import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from '@/test-utils';
import { PixelConsent } from './PixelConsent';

const env = vi.hoisted(() => ({ useMocks: false, metaPixelId: '123456' }));
vi.mock('@/lib/env', () => ({ env }));

let root: Root | undefined;
const pixelScripts = () => [...document.head.querySelectorAll('script')].filter((s) => s.src.includes('fbevents.js')).length;
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === label)!;

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<PixelConsent />));
  await tick();
}

beforeEach(() => {
  env.useMocks = false;
  env.metaPixelId = '123456';
  localStorage.clear();
  delete window.fbq;
  delete window._fbq;
  document.head.innerHTML = '';
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('PixelConsent', () => {
  it('shows no banner and loads nothing without a Pixel ID', async () => {
    env.metaPixelId = '';
    await mount();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(pixelScripts()).toBe(0);
  });

  it('shows no banner and loads nothing in demo mode', async () => {
    env.useMocks = true;
    await mount();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(pixelScripts()).toBe(0);
  });

  it('asks first, and loads nothing until Accept', async () => {
    await mount();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(pixelScripts()).toBe(0);
    await act(async () => button('Accept cookies').click());
    expect(pixelScripts()).toBe(1);
    expect(localStorage.getItem('tpx-consent')).toBe('granted');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('Decline keeps the Pixel off and remembers it', async () => {
    await mount();
    await act(async () => button('Decline').click());
    expect(pixelScripts()).toBe(0);
    expect(localStorage.getItem('tpx-consent')).toBe('denied');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('loads the Pixel on a return visit after Accept, without asking again', async () => {
    localStorage.setItem('tpx-consent', 'granted');
    await mount();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(pixelScripts()).toBe(1);
  });
});
