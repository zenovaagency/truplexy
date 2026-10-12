// A pretend Truplexy chat API, used by the playground and to test server routes
// written in other languages:  node playground/mock-api.mjs  → http://localhost:4301/v2
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/**
 * A pretend Truplexy chat API with the same shapes and errors as the real one,
 * so the proxy and widget run exactly as they would in production. Ask for
 * "a person" to see a handoff, then a teammate's reply 5 seconds later
 * (picked up by polling: the mock has no realtime).
 */
export function mockApi(base, { latency = 150, replyLatency = 900, autoAgent = true } = {}) {
  const conversations = new Map();
  const customers = new Map();
  const replies = new Map();
  const id = (prefix) => prefix + randomBytes(16).toString('hex');
  const now = () => new Date().toISOString();
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': id('req_') } });
  const notFound = () => json(404, { error: { code: 'CONVERSATION_NOT_FOUND', message: 'No such conversation.' } });
  const invalid = () => json(400, { error: { code: 'INVALID_REQUEST', message: 'Invalid input.' } });
  const add = (conv, role, content, extra = {}) => {
    const m = { id: id('msg_'), role, content, created_at: now(), ...extra };
    conv.messages.push(m);
    return m;
  };

  return async (url, init = {}) => {
    const path = String(url).replace(base, '');
    const body = init.body ? JSON.parse(init.body) : {};
    if (latency) await new Promise((r) => setTimeout(r, latency));

    // Match any normalized contact. Conflicting owners leave both records unchanged.
    if (path === '/customer' && init.method === 'PUT') {
      if (!Array.isArray(body.contacts) || !body.contacts.length || body.contacts.length > 20) return invalid();
      if (body.name !== undefined && (typeof body.name !== 'string' || [...body.name.trim().replace(/\s+/g, ' ')].length > 120)) return invalid();
      if (body.metadata !== undefined && (!body.metadata || Array.isArray(body.metadata) || typeof body.metadata !== 'object' || Buffer.byteLength(JSON.stringify(body.metadata)) > 4096)) return invalid();
      if (body.contacts.some(c => !c || typeof c.type !== 'string' || typeof c.value !== 'string' || (c.primary !== undefined && typeof c.primary !== 'boolean'))) return invalid();
      const sent = body.contacts.map(c => ({ ...c, value: c.type === 'email' ? c.value.toLowerCase() : c.type === 'phone' ? c.value.replace(/[\s.()-]/g, '') : c.value }));
      if (sent.some(c => !/^[a-z][a-z0-9_-]{1,31}$/.test(c.type) || typeof c.value !== 'string' || !c.value.length || c.value.length > 254 ||
        (c.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value)) || (c.type === 'phone' && !/^\+?\d{5,20}$/.test(c.value)) ||
        (c.label !== undefined && (typeof c.label !== 'string' || c.label.length > 60)))) return invalid();
      const primaryTypes = sent.filter(c => c.primary).map(c => c.type);
      if (new Set(primaryTypes).size !== primaryTypes.length) return invalid();
      const has = (c, k) => c.contacts.some((x) => x.type === k.type && x.value === k.value);
      const matches = [...customers.values()].filter((c) => sent.some((k) => has(c, k)));
      if (new Set(matches.map((c) => c.id)).size > 1) return json(409, { error: { code: 'CUSTOMER_CONFLICT', message: 'These contacts belong to different customers.' } });
      let customer = matches[0];
      const created = !customer;
      customer ??= { id: id('cus_'), tenant_id: 'demo', bot_id: 'support', contacts: [], first_seen_at: now(), conversations: 0, tickets: 0, open_tickets: 0, created_at: now() };
      if (customer.contacts.length + sent.filter(k => !has(customer, k)).length > 20) return invalid();
      for (const k of sent) if (!has(customer, k)) {
        const existingType = customer.contacts.some(x => x.type === k.type);
        customer.contacts.push({ ...k, primary: !existingType && (!primaryTypes.includes(k.type) || k.primary === true) });
      }
      // For a new type honor a requested primary even if it was not first in the input.
      for (const type of new Set(customer.contacts.map(c => c.type))) {
        const group = customer.contacts.filter(c => c.type === type);
        if (!group.some(c => c.primary)) (group.find(c => sent.some(k => has({ contacts: [c] }, k) && k.primary)) ?? group[0]).primary = true;
      }
      Object.assign(customer, { name: body.name?.trim().replace(/\s+/g, ' ') ?? customer.name ?? '', metadata: body.metadata ?? customer.metadata ?? {}, last_seen_at: now(), updated_at: now() });
      customers.set(customer.id, customer);
      return json(created ? 201 : 200, customer);
    }
    if (path === '/conversations' && init.method === 'POST') {
      if (body.customer_id && !customers.has(body.customer_id)) return json(404, { error: { code: 'CUSTOMER_NOT_FOUND', message: 'No such customer.' } });
      if (body.channel_id === 'chn_disabled') return json(403, { error: { code: 'CHANNEL_DISABLED', message: 'off' } });
      const conv = { id: id('conv_'), status: 'open', escalated: false, channel_id: body.channel_id, customer_id: body.customer_id, created_at: now(), updated_at: now(), messages: [] };
      if (body.customer_id) { const c = customers.get(body.customer_id); c.conversations++; c.last_seen_at = now(); }
      conversations.set(conv.id, conv);
      return json(201, conv);
    }
    // POST /conversations/:id/ticket opens (or returns) the conversation's ticket.
    const ticketMatch = path.match(/^\/conversations\/([^/]+)\/ticket$/);
    if (ticketMatch && init.method === 'POST') {
      const conv = conversations.get(ticketMatch[1]);
      if (!conv) return notFound();
      if (!conv.ticket || conv.ticket.status === 'closed') {
        conv.ticket = { id: id('tkt_'), subject: body.subject ?? 'Chat', customer_id: conv.customer_id, channel_id: conv.channel_id, status: 'open', priority: body.priority ?? 'normal', escalated: false, created_at: now() };
        const c = customers.get(conv.customer_id); if (c) { c.tickets++; c.open_tickets++; }
      }
      return json(200, conv.ticket);
    }
    if (path === '/profile') {
      return json(200, { business: { name: 'Acme Shop' }, bot: { id: 'support', name: 'Shop assistant' } });
    }
    if (path === '/realtime/token') return json(503, { error: { code: 'REALTIME_NOT_CONFIGURED', message: 'off' } });

    const [, , convId, action] = path.split('/');
    const conv = conversations.get(convId);
    if (!conv) return notFound();

    if (!action) return json(200, conv);
    if (action === 'escalate' || action === 'replies') {
      const replyKey = `${convId}:${body.external_id}`;
      if (action === 'replies' && body.external_id && replies.has(replyKey)) return json(200, replies.get(replyKey));
      if (action === 'replies' && (typeof body.content !== 'string' || !body.content.length || body.content.length > 8000)) return invalid();
      if (!conv.ticket || conv.ticket.status === 'closed') {
        conv.ticket = { id: id('tkt_'), subject: 'Chat', customer_id: conv.customer_id, channel_id: conv.channel_id, status: 'open', priority: 'normal', escalated: false, created_at: now() };
        const c = customers.get(conv.customer_id); if (c) { c.tickets++; c.open_tickets++; }
      }
      if (action === 'escalate' || body.escalate) conv.escalated = conv.ticket.escalated = true;
      if (action === 'escalate') return json(200, conv);
      const result = { message: add(conv, 'assistant', body.content, { author: 'agent', agent: body.author ?? 'Support' }), ticket_id: conv.ticket.id, escalated: conv.escalated };
      if (body.external_id) replies.set(replyKey, result);
      return json(201, result);
    }
    if (action === 'resume') {
      conv.escalated = false;
      if (conv.ticket) conv.ticket.escalated = false;
      return json(200, conv);
    }
    if (action === 'ticket' && path.endsWith('/ticket/close')) {
      if (!conv.ticket) return json(404, { error: { code: 'TICKET_NOT_FOUND', message: 'No ticket.' } });
      if (conv.ticket.status === 'open') { const c = customers.get(conv.customer_id); if (c) c.open_tickets--; }
      conv.ticket.status = 'closed';
      conv.ticket.escalated = conv.escalated = false;
      conv.status = 'open';
      return json(200, conv.ticket);
    }
    if (action === 'handoff') {
      conv.status = 'handoff';
      add(conv, 'assistant', "I've let the team know. Someone will reply here shortly.");
      if (autoAgent) setTimeout(() => {
        conv.escalated = true;
        add(conv, 'assistant', "Hi, I'm Priya from support. I've read the chat. Let me sort this out for you.", { author: 'agent', agent: 'Priya' });
      }, 5000);
      return json(200, conv);
    }
    if (action === 'messages') {
      const text = body.message;
      if (typeof text !== 'string' || !text.length || text.length > 4000) return invalid();
      if (/limit/i.test(text)) return json(429, { error: { code: 'PLAN_LIMIT_REACHED', message: 'Internal detail that must not leak', limit: 'replies_per_month' } });
      const message = add(conv, 'user', text);
      if (text.startsWith('[Context only')) return json(200, { message, reply: null, status: 'context', sources: [] });
      if (conv.escalated) return json(200, { message, reply: null, status: 'escalated', sources: [] });
      if (replyLatency) await new Promise((r) => setTimeout(r, replyLatency));
      const [status, reply, sources] = /person|human|agent/i.test(text)
        ? ['handoff_offered', 'I can bring in someone from the team. Want me to?', []]
        : /return|refund/i.test(text)
          ? ['answered', 'You can return any item within **30 days**:\n\n1. Open your order\n2. Choose *Return*\n3. Print the label', [{ document_id: 'doc_1', title: 'Returns policy', url: 'https://example.com/returns', score: 0.91 }, { kind: 'web', title: 'Return shipping labels', url: 'https://carrier.example.org/returns', score: 0.64 }]]
          : ['answered', `You said: “${text}”. Try asking about returns, for a person, or type "limit" to see an error.`, []];
      add(conv, 'assistant', reply);
      return json(200, { message, reply, status, sources });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'No such route.' } });
  };
}

// Run directly: serve the mock over HTTP, for routes in Python, PHP, Go…
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4301);
  const base = `http://localhost:${port}/v2`;
  const api = mockApi(base);
  createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const r = await api(`http://localhost:${port}${req.url}`, { method: req.method, body: body || undefined });
    res.writeHead(r.status, Object.fromEntries(r.headers)).end(await r.text());
  }).listen(port, () => console.log(`Mock Truplexy API on ${base}`));
}
