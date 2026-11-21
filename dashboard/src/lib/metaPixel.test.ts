import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getConsent, loadPixel, setConsent, track } from './metaPixel';

const scripts = () => [...document.head.querySelectorAll('script')].filter((s) => s.src.includes('facebook.net'));

beforeEach(() => {
  localStorage.clear();
  delete window.fbq;
  delete window._fbq;
  document.head.innerHTML = '';
});
afterEach(() => {
  delete window.fbq;
});

describe('metaPixel', () => {
  it('loads nothing until loadPixel is called, and never without an id', () => {
    expect(scripts()).toHaveLength(0);
    loadPixel('');
    expect(scripts()).toHaveLength(0);
    expect(window.fbq).toBeUndefined();
  });

  it('injects fbevents.js once and queues init + PageView', () => {
    loadPixel('123456');
    loadPixel('123456');
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]!.src).toBe('https://connect.facebook.net/en_US/fbevents.js');
    expect(window.fbq!.queue.map((a) => (a as unknown[]).slice(0, 2))).toEqual([
      ['init', '123456'],
      ['track', 'PageView'],
    ]);
  });

  it('track is a no-op when the Pixel is not running', () => {
    expect(() => track('CompleteRegistration')).not.toThrow();
    expect(window.fbq).toBeUndefined();
    loadPixel('123456');
    track('CompleteRegistration');
    expect(window.fbq!.queue.at(-1)).toEqual(['track', 'CompleteRegistration']);
  });

  it('remembers the visitor’s choice', () => {
    expect(getConsent()).toBeNull();
    setConsent('denied');
    expect(getConsent()).toBe('denied');
    setConsent('granted');
    expect(getConsent()).toBe('granted');
  });
});
