import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Attachment, TicketDetail } from '@/lib/api/types';
import { createImageRefresher } from '@/lib/images/refresh';
import { TooltipProvider } from '@/components/ui';
import { Transcript } from './TicketDetail';

const HOUR = 3_600_000;
const picture = (n: number, over: Partial<Attachment> = {}): Attachment => ({
  id: `att_${String(n).padStart(32, '0')}`,
  content_type: 'image/jpeg',
  width: 800,
  height: 600,
  size: 90_000,
  url: `https://files.example/att_${n}?sig=a`,
  url_expires_at: new Date(Date.now() + HOUR).toISOString(),
  ...over,
});

const ticket = (messages: TicketDetail['messages']): TicketDetail => ({ messages, replies: [] }) as unknown as TicketDetail;
const message = (id: string, over: Partial<TicketDetail['messages'][number]> = {}): TicketDetail['messages'][number] => ({
  id,
  role: 'user',
  content: 'Hello',
  author: 'customer',
  created_at: '2026-10-19T10:00:00Z',
  ...over,
});

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

async function render(t: TicketDetail, reload = vi.fn(async () => {})) {
  const refresher = createImageRefresher(reload);
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const show = (next: TicketDetail) =>
    act(async () =>
      root!.render(
        <TooltipProvider>
          <Transcript ticket={next} refresher={refresher} />
        </TooltipProvider>,
      ),
    );
  await show(t);
  return { container, reload, show };
}

describe('the ticket transcript', () => {
  it("shows a customer message's pictures with alt text, above its text", async () => {
    const { container } = await render(ticket([message('msg_1', { content: 'This is the error', attachments: [picture(1), picture(2)] })]));
    const imgs = [...container.querySelectorAll('img')];
    expect(imgs.map((i) => i.getAttribute('alt'))).toEqual(['Picture sent by the customer (1 of 2)', 'Picture sent by the customer (2 of 2)']);
    expect(imgs[0]!.getAttribute('src')).toBe('https://files.example/att_1?sig=a');
    expect(container.querySelector('.bubble-customer')!.textContent).toBe('This is the error');
    // Pictures come first in the document order.
    expect(imgs[0]!.compareDocumentPosition(container.querySelector('.bubble-customer')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no empty text bubble for a message that is pictures alone', async () => {
    const { container } = await render(ticket([message('msg_1', { content: '', attachments: [picture(1)] })]));
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('.bubble-customer')).toBeNull();
  });

  it('renders messages without pictures exactly as before, even when empty', async () => {
    const { container } = await render(ticket([message('msg_1', { content: 'Just text' }), message('msg_2', { content: '' })]));
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect([...container.querySelectorAll('.bubble-customer')].map((b) => b.textContent)).toEqual(['Just text', '']);
  });

  it('reloads the ticket once when a picture stops loading, and shows the fresh URL', async () => {
    const t = ticket([message('msg_1', { attachments: [picture(1)] })]);
    const { container, reload, show } = await render(t);
    await act(async () => container.querySelector('img')!.dispatchEvent(new Event('error')));
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
    expect(reload).toHaveBeenCalledTimes(1);

    await show(ticket([message('msg_1', { attachments: [picture(1, { url: 'https://files.example/att_1?sig=NEW' })] })]));
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://files.example/att_1?sig=NEW');
  });

  it('reloads before showing a picture whose link has already expired', async () => {
    const stale = picture(1, { url_expires_at: new Date(Date.now() - 60_000).toISOString() });
    const { reload } = await render(ticket([message('msg_1', { attachments: [stale] })]));
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
