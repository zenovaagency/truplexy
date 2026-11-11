import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from '@/test-utils';
import { isCaptchaError, useTurnstile } from './Turnstile';

const env = vi.hoisted(() => ({ useMocks: false, turnstileSiteKey: 'site-key' }));
vi.mock('@/lib/env', () => ({ env }));

type Options = Record<string, (...a: string[]) => void> & { sitekey: string; appearance: string };

let root: Root | undefined;
let options: Options;
const api = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };

function Probe() {
  const t = useTurnstile();
  return (
    <div>
      <div id="widget" ref={t.ref} />
      <output id="state">{JSON.stringify({ enabled: t.enabled, ready: t.ready, token: t.token ?? null, failed: t.failed })}</output>
      <button id="reset" onClick={t.reset} />
    </div>
  );
}

const state = () => JSON.parse(document.getElementById('state')!.textContent!);

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Probe />));
  await tick();
}

beforeEach(() => {
  env.useMocks = false;
  env.turnstileSiteKey = 'site-key';
  api.render.mockImplementation((_el: HTMLElement, o: Options) => {
    options = o;
    return 'widget-1';
  });
  (window as unknown as { turnstile: typeof api }).turnstile = api;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  delete (window as { turnstile?: unknown }).turnstile;
  vi.clearAllMocks();
});

describe('useTurnstile', () => {
  it('renders an invisible-until-needed widget and is ready only once it has a token', async () => {
    await mount();
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(options.sitekey).toBe('site-key');
    expect(options.appearance).toBe('interaction-only');
    expect(state()).toEqual({ enabled: true, ready: false, token: null, failed: false });

    await act(async () => options.callback('tok-1'));
    expect(state()).toMatchObject({ ready: true, token: 'tok-1' });
  });

  it('drops the token when it expires, and after a reset (a token works once)', async () => {
    await mount();
    await act(async () => options.callback('tok-1'));
    await act(async () => options['expired-callback']());
    expect(state()).toMatchObject({ ready: false, token: null });

    await act(async () => options.callback('tok-2'));
    await act(async () => document.getElementById('reset')!.click());
    expect(api.reset).toHaveBeenCalledWith('widget-1');
    expect(state()).toMatchObject({ ready: false, token: null });
  });

  it('reports a check that cannot run, and recovers when a token arrives', async () => {
    await mount();
    await act(async () => options['error-callback']());
    expect(state()).toMatchObject({ failed: true, ready: false });
    await act(async () => options.callback('tok-3'));
    expect(state()).toMatchObject({ failed: false, ready: true });
  });

  it('removes the widget when the form goes away', async () => {
    await mount();
    await act(async () => root!.unmount());
    root = undefined;
    expect(api.remove).toHaveBeenCalledWith('widget-1');
  });

  it('does nothing without a site key, and is always ready', async () => {
    env.turnstileSiteKey = '';
    await mount();
    expect(api.render).not.toHaveBeenCalled();
    expect(state()).toEqual({ enabled: false, ready: true, token: null, failed: false });
  });

  it('does nothing in demo mode', async () => {
    env.useMocks = true;
    await mount();
    expect(api.render).not.toHaveBeenCalled();
    expect(state().ready).toBe(true);
  });
});

describe('isCaptchaError', () => {
  it('recognises Supabase captcha refusals only', () => {
    expect(isCaptchaError(new Error('captcha verification process failed'))).toBe(true);
    expect(isCaptchaError(new Error('Invalid login credentials'))).toBe(false);
    expect(isCaptchaError('captcha')).toBe(false);
  });
});
