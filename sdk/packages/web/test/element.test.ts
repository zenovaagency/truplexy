// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount, TruplexyChatElement } from '../src/index';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('<truplexy-chat>', () => {
  it('registers and renders the launcher and greeting', () => {
    const el = mount({ demo: true, heading: 'Acme help', greeting: 'Hello **there**' });
    expect(el).toBeInstanceOf(TruplexyChatElement);
    const root = el.shadowRoot!;
    expect(root.querySelector('.title')!.textContent).toBe('Acme help');
    expect(root.querySelector('.greeting .bubble')!.innerHTML).toBe('<p>Hello <strong>there</strong></p>');
    expect((root.querySelector('.panel') as HTMLElement).hidden).toBe(true);
    el.remove();
  });

  it('takes the header name and logo from the profile unless you set your own', async () => {
    const el = mount({ demo: true });
    await tick(5);
    const root = el.shadowRoot!;
    expect(root.querySelector('.title')!.textContent).toBe('Acme Shop');
    expect(root.querySelector('.avatar img')!.getAttribute('src')).toBe('https://cdn.test/acme.png');
    el.setAttribute('heading', 'Mine');
    el.setAttribute('avatar', 'https://mine.test/a.png');
    expect(root.querySelector('.title')!.textContent).toBe('Mine');
    expect(root.querySelector('.avatar img')!.getAttribute('src')).toBe('https://mine.test/a.png');
    el.remove();
  });

  it('opens, sends a message in demo mode and fires events', async () => {
    const el = mount({ demo: true });
    const events: string[] = [];
    for (const name of ['open', 'close', 'status', 'message']) el.addEventListener(`truplexy:${name}`, () => events.push(name));
    el.open();
    expect((el.shadowRoot!.querySelector('.panel') as HTMLElement).hidden).toBe(false);
    await el.send('where is order 12345');
    await tick();
    const bubbles = [...el.shadowRoot!.querySelectorAll('.msg:not(.greeting):not(.typing) .bubble')].map((b) => b.textContent);
    expect(bubbles[0]).toBe('where is order 12345');
    expect(bubbles[1]).toContain('#12345');
    el.close();
    expect(events).toEqual(['open', 'message', 'status', 'close']);
    el.remove();
  });

  it('links to Truplexy under the message box, in any language', () => {
    const el = mount({ demo: true });
    const brand = el.shadowRoot!.querySelector<HTMLAnchorElement>('.brand')!;
    expect(brand.textContent!.trim()).toBe('Powered by');
    expect(brand.getAttribute('aria-label')).toBeNull();
    const logos = brand.querySelectorAll('img');
    expect([...logos].map((i) => i.className)).toEqual(['wordmark-on-light', 'wordmark-on-dark']);
    expect([...logos].every((i) => i.alt === 'Truplexy' && i.src.startsWith('data:image/png;base64,'))).toBe(true);
    expect(brand.href).toMatch(/^https:\/\/zenovasolution\.xyz\/\?utm_source=chat-widget/);
    expect(brand.target).toBe('_blank');
    expect(brand.rel).toContain('noopener');
    el.labels = { poweredBy: 'Desarrollado por Truplexy' };
    expect(brand.textContent!.trim()).toBe('Desarrollado por');
    expect(brand.querySelectorAll('img')).toHaveLength(2);
    el.remove();
  });

  it('renders inline, always open', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const el = mount({ demo: true, mode: 'inline', target: host });
    expect(el.isOpen).toBe(true);
    expect((el.shadowRoot!.querySelector('.panel') as HTMLElement).hidden).toBe(false);
    host.remove();
  });
});
