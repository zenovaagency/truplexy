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
export function mockApi(base) {
  const conversations = new Map();
  const customers = new Map();
  const id = (prefix) => prefix + randomBytes(16).toString('hex');
  const now = () => new Date().toISOString();
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': id('req_') } });
  const notFound = () => json(404, { error: { code: 'CONVERSATION_NOT_FOUND', message: 'No such conversation.' } });
  const add = (conv, role, content, extra = {}) => {
    const m = { id: id('msg_'), role, content, created_at: now(), ...extra };
    conv.messages.push(m);
    return m;
  };

  return async (url, init = {}) => {
    const path = String(url).replace(base, '');
    const body = init.body ? JSON.parse(init.body) : {};
    await new Promise((r) => setTimeout(r, 150));

    // PUT /customer finds or creates the customer by external_id, else email.
    if (path === '/customer' && init.method === 'PUT') {
      const sent = (body.contacts ?? []).map((c) => ({ type: String(c.type), value: c.type === 'email' ? String(c.value).toLowerCase() : String(c.value) }));
      if (!sent.length) return json(400, { error: { code: 'INVALID_REQUEST', message: 'Send at least one contact.' } });
      const has = (c, k) => c.contacts.some((x) => x.type === k.type && x.value === k.value);
      const matches = [...customers.values()].filter((c) => sent.some((k) => has(c, k)));
      if (new Set(matches.map((c) => c.id)).size > 1) return json(409, { error: { code: 'CUSTOMER_CONFLICT', message: 'These contacts belong to different customers.' } });
      let customer = matches[0];
      const created = !customer;
      customer ??= { id: id('cus_'), contacts: [], first_seen_at: now(), conversations: 0, tickets: 0, open_tickets: 0, created_at: now() };
      for (const k of sent) if (!has(customer, k)) customer.contacts.push({ ...k, primary: !customer.contacts.some((x) => x.type === k.type) });
      Object.assign(customer, { name: body.name ?? customer.name ?? '', metadata: body.metadata ?? customer.metadata ?? {}, last_seen_at: now(), updated_at: now() });
      customers.set(customer.id, customer);
      return json(created ? 201 : 200, customer);
    }
    if (path === '/conversations' && init.method === 'POST') {
      if (body.customer_id && !customers.has(body.customer_id)) return json(404, { error: { code: 'CUSTOMER_NOT_FOUND', message: 'No such customer.' } });
      const conv = { id: id('conv_'), status: 'open', escalated: false, customer_id: body.customer_id, created_at: now(), updated_at: now(), messages: [] };
      conversations.set(conv.id, conv);
      return json(201, conv);
    }
    // POST /conversations/:id/ticket opens (or returns) the conversation's ticket.
    const ticketMatch = path.match(/^\/conversations\/([^/]+)\/ticket$/);
    if (ticketMatch && init.method === 'POST') {
      const conv = conversations.get(ticketMatch[1]);
      if (!conv) return notFound();
      conv.ticket ??= { id: id('tkt_'), subject: body.subject ?? 'Chat', customer_id: conv.customer_id, status: 'open', priority: 'normal', escalated: false, created_at: now() };
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
    if (action === 'handoff') {
      conv.status = 'handoff';
      add(conv, 'assistant', "I've let the team know. Someone will reply here shortly.");
      setTimeout(() => {
        conv.escalated = true;
        add(conv, 'assistant', "Hi, I'm Priya from support. I've read the chat. Let me sort this out for you.", { author: 'agent', agent: 'Priya' });
      }, 5000);
      return json(200, conv);
    }
    if (action === 'messages') {
      const text = body.message;
      const message = add(conv, 'user', text);
      if (text.startsWith('[Context only')) return json(200, { message, reply: null, status: 'context', sources: [] });
      if (conv.escalated) return json(200, { message, reply: null, status: 'escalated', sources: [] });
      if (/limit/i.test(text)) return json(429, { error: { code: 'PLAN_LIMIT_REACHED', message: 'Internal detail that must not leak', limit: 'replies_per_month' } });
      await new Promise((r) => setTimeout(r, 900));
      const [status, reply, sources] = /person|human|agent/i.test(text)
        ? ['handoff_offered', 'I can bring in someone from the team. Want me to?', []]
        : /return|refund/i.test(text)
          ? ['answered', 'You can return any item within **30 days**:\n\n1. Open your order\n2. Choose *Return*\n3. Print the label', [{ document_id: 'doc_1', title: 'Returns policy', url: 'https://example.com/returns', score: 0.91 }]]
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
