import type { Transport, WireConversation } from './types';

/**
 * A pretend server for previews and docs (`<truplexy-chat demo>`): canned
 * answers, a handoff, and a team member who joins a few seconds later.
 * Nothing leaves the page.
 */
export function demoTransport(): Transport {
  const conv: WireConversation = { status: 'open', escalated: false, messages: [] };
  const listeners = new Set<() => void>();
  let n = 0;
  const session = 'demo';
  const add = (role: 'user' | 'assistant', content: string, agent?: string) => {
    const msg = { id: `msg_${(++n).toString(16).padStart(32, '0')}`, role, content, created_at: new Date().toISOString(), ...(agent && { author: 'agent', agent }) };
    conv.messages.push(msg);
    return msg;
  };
  const later = (ms: number, fn: () => void) =>
    setTimeout(() => {
      fn();
      listeners.forEach((l) => l());
    }, ms);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const snapshot = () => ({ ...conv, messages: [...conv.messages] });

  return {
    async request(action, body): Promise<any> {
      if (action === 'message') {
        const text = String(body.text ?? '');
        const message = add('user', text);
        await wait(500 + Math.min(900, text.length * 12));
        if (conv.escalated) {
          later(2200, () => add('assistant', "Thanks, I've got that. Give me a moment to look into it.", 'Sam'));
          return { session, message, reply: null, status: 'escalated', sources: [] };
        }
        const [status, reply] = answer(text);
        add('assistant', reply);
        return { session, message, reply, status, sources: [] };
      }
      if (action === 'handoff') {
        await wait(400);
        conv.status = 'handoff';
        add('assistant', "Done. I've asked the team to join; someone will reply here shortly.");
        later(3500, () => {
          conv.escalated = true;
          add('assistant', "Hi, I'm Sam from the support team. I've read the conversation so far. How can I help?", 'Sam');
        });
        return { session, conversation: snapshot() };
      }
      if (action === 'profile') return { business: { name: 'Acme Shop', logo_url: 'https://cdn.test/acme.png' }, bot: { id: 'support', name: 'Shop assistant' } };
      if (action === 'history') return conv.messages.length ? { session, conversation: snapshot() } : { session: null };
      return {};
    },
    listen(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}

function answer(text: string): [string, string] {
  const t = text.toLowerCase();
  if (/\b(person|human|agent|someone|staff|representative)\b/.test(t)) return ['handoff_offered', 'I can bring in someone from the team. Would you like me to do that?'];
  if (/\b\d{4,}\b/.test(t)) {
    const order = /\b\d{4,}\b/.exec(t)![0];
    return ['answered', `Order **#${order}** shipped yesterday and should arrive on **Thursday**. You can follow it on the [tracking page](https://example.com/track).`];
  }
  if (/\b(order|delivery|shipping|track|package|parcel)\b/.test(t)) return ['clarification_required', "Happy to check. What's your order number?"];
  if (/\b(price|pricing|cost|plan|plans)\b/.test(t)) return ['answered', 'Here are the plans:\n\n- **Free**: one channel to try it out\n- **Starter**: $29 a month\n- **Pro**: $79 a month\n\nEvery plan includes the website widget.'];
  if (/\b(refund|return|exchange)\b/.test(t)) return ['answered', 'You can return anything within **30 days**. Start a return from your order page and we’ll email a prepaid label.'];
  if (/^(hi|hello|hey|yo|hiya)\b/.test(t)) return ['answered', 'Hello! Ask me about an order, returns or pricing, or ask to talk to a person.'];
  return ['answered', "This is a demo, so I only know a few things. Try asking where your order is, about returns or pricing, or to talk to a person."];
}
