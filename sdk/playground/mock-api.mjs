// A pretend Truplexy chat API, used by the playground and to test server routes
// written in other languages:  node playground/mock-api.mjs  → http://localhost:4301/v3
// With image input (planned) on:  IMAGES=1 node playground/mock-api.mjs
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/**
 * A pretend Truplexy chat API with the same shapes and errors as the real one,
 * so the proxy and widget run exactly as they would in production. Ask for
 * "a person" to see a handoff, then a teammate's reply 5 seconds later
 * (picked up by polling: the mock has no realtime).
 */
// A stand-in logo, so the header picture shows without hosting an image.
const LOGO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#e5484d"/><text x="32" y="43" font-family="system-ui,sans-serif" font-size="32" font-weight="700" text-anchor="middle" fill="#fff">A</text></svg>')}`;

/**
 * `images` turns on image input (planned: the real API doesn't serve it yet):
 *   false (default)  like the API today: /conversations/:id/attachments is 404 and `attachments` is an unknown field
 *   true             enabled, with the contract's limits
 *   'plan'           the plan has no image input: 403 PLAN_LIMIT_REACHED, limit image_input
 *   'no_vision'      no model can read pictures: 400 FEATURE_UNAVAILABLE
 * The mock also plays R2: a registration's presigned `url` is `<base>/_r2/<id>`. It wants exactly the
 * headers it handed out, refuses an `Authorization` header, and checks the sha256 of what was uploaded.
 */
export function mockApi(base, { latency = 150, replyLatency = 900, autoAgent = true, images = false } = {}) {
  const origin = new URL(base).origin;
  const IMAGE_LIMITS = { max_bytes: 20_971_520, max_per_message: 3, content_types: ['image/jpeg', 'image/png', 'image/webp'] };
  const pictures = new Map();
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

  const lower = (headers = {}) => Object.fromEntries(Object.entries(headers instanceof Headers ? Object.fromEntries(headers) : headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const sniff = (b) => (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? 'image/png' : b.length > 11 && Buffer.from(b.subarray(0, 4)).toString() === 'RIFF' && Buffer.from(b.subarray(8, 12)).toString() === 'WEBP' ? 'image/webp' : null);
  const shown = (conv) => ({
    ...conv,
    messages: conv.messages.map((m) => (m.pictures ? { ...m, pictures: undefined, attachments: m.pictures.map((a) => ({ ...a, url: `${origin}/_r2/${a.id}?exp=${Date.now() + 3_600_000}`, url_expires_at: new Date(Date.now() + 3_600_000).toISOString() })) } : m)),
  });

  return async (url, init = {}) => {
    // The stand-in for R2: a PUT of the raw bytes to the presigned URL.
    if (String(url).startsWith(`${origin}/_r2/`)) {
      const id = String(url).slice(`${origin}/_r2/`.length).split('?')[0];
      const pic = pictures.get(id);
      const h = lower(init.headers);
      if (init.method !== 'PUT' || !pic) return new Response('', { status: 403 });
      if (h.authorization) return new Response('<Error>Unexpected Authorization header</Error>', { status: 400 });
      if (h['x-mock-signature'] !== pic.signature || h['content-type'] !== pic.content_type) return new Response('<Error>SignatureDoesNotMatch</Error>', { status: 403 });
      const bytes = init.body instanceof Blob ? Buffer.from(await init.body.arrayBuffer()) : Buffer.from(init.body ?? []);
      if (createHash('sha256').update(bytes).digest('hex') !== pic.sha256 || bytes.length !== pic.size) return new Response('<Error>BadDigest</Error>', { status: 400 });
      pic.bytes = bytes;
      return new Response('', { status: 200 });
    }
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
      return json(200, { business: { name: 'Acme Shop', logo_url: LOGO }, bot: { id: 'support', name: 'Shop assistant' }, ...(images && { attachments: { enabled: images === true, ...(images === true && IMAGE_LIMITS) } }) });
    }
    if (path === '/realtime/token') return json(503, { error: { code: 'REALTIME_NOT_CONFIGURED', message: 'off' } });

    const [, , convId, action] = path.split('/');
    const conv = conversations.get(convId);
    if (!conv) return notFound();

    if (!action) return json(200, shown(conv));
    if (action === 'attachments' && init.method === 'POST') {
      if (!images) return json(404, { error: { code: 'NOT_FOUND', message: 'No such route.' } });
      if (images === 'plan') return json(403, { error: { code: 'PLAN_LIMIT_REACHED', message: 'No picture input on this plan.', limit: 'image_input' } });
      if (images === 'no_vision') return json(400, { error: { code: 'FEATURE_UNAVAILABLE', message: 'No model can read pictures.' } });
      const allowed = ['filename', 'content_type', 'size', 'sha256'];
      if (Object.keys(body).some((k) => !allowed.includes(k)) || typeof body.filename !== 'string' || !body.filename.length || body.filename.length > 260 || /[\\/]/.test(body.filename) || !/\.(jpe?g|png|webp)$/i.test(body.filename)) return invalid();
      if (!IMAGE_LIMITS.content_types.includes(body.content_type)) return json(400, { error: { code: 'UNSUPPORTED_IMAGE_TYPE', message: 'Use a JPEG, PNG or WebP picture.' } });
      if (!Number.isInteger(body.size) || body.size < 1) return invalid();
      if (body.size > IMAGE_LIMITS.max_bytes) return json(413, { error: { code: 'IMAGE_TOO_LARGE', message: 'Pictures can be at most 20 MB.' } });
      if (!/^[0-9a-f]{64}$/.test(body.sha256 ?? '')) return invalid();
      const pid = id('att_');
      const signature = randomBytes(8).toString('hex');
      pictures.set(pid, { id: pid, conv: conv.id, content_type: body.content_type, size: body.size, sha256: body.sha256, signature, at: Date.now() });
      return json(201, { attachment: { id: pid, status: 'pending', filename: body.filename, content_type: body.content_type, size: body.size }, url: `${origin}/_r2/${pid}`, method: 'PUT', headers: { 'Content-Type': body.content_type, 'x-mock-signature': signature }, expires_at: new Date(Date.now() + 900_000).toISOString() });
    }
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
      const ids = body.attachments;
      if (ids !== undefined && !images) return invalid(); // an unknown field, as today
      if (typeof text !== 'string' || text.length > 4000 || (!text.length && ids === undefined)) return invalid();
      let sent = [];
      if (ids !== undefined) {
        if (images === 'plan') return json(403, { error: { code: 'PLAN_LIMIT_REACHED', message: 'No picture input on this plan.', limit: 'image_input' } });
        if (images === 'no_vision') return json(400, { error: { code: 'FEATURE_UNAVAILABLE', message: 'No model can read pictures.' } });
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3 || new Set(ids).size !== ids.length || ids.some((x) => !/^att_[0-9a-f]{32}$/.test(x))) return invalid();
        const found = ids.map((x) => pictures.get(x));
        if (found.some((p) => !p || p.conv !== conv.id || p.sent || Date.now() - p.at > 3_600_000)) return json(404, { error: { code: 'ATTACHMENT_NOT_FOUND', message: 'That attachment does not exist, was already sent, or expired.' } });
        if (found.some((p) => !p.bytes)) return json(409, { error: { code: 'ATTACHMENT_NOT_UPLOADED', message: 'Finish the upload, then send again.' } });
        // The bytes are read now, so a bad file fails before anything is stored. The failed attachment can't be reused.
        for (const p of found) {
          const real = sniff(p.bytes);
          if (!real) { p.sent = true; return json(400, { error: { code: p.bytes.length < 12 ? 'INVALID_IMAGE' : 'UNSUPPORTED_IMAGE_TYPE', message: 'That file is not a picture the assistant can read.' } }); }
        }
        sent = found.map((p) => (p.sent = true, { id: p.id, content_type: 'image/jpeg', width: 640, height: 480, size: Math.min(p.size, 1_048_576) }));
      }
      if (/limit/i.test(text)) return json(429, { error: { code: 'PLAN_LIMIT_REACHED', message: 'Internal detail that must not leak', limit: 'replies_per_month' } });
      const message = add(conv, 'user', text, sent.length ? { pictures: sent } : {});
      if (sent.length) message.attachments = shown({ messages: [message] }).messages[0].attachments;
      if (text.startsWith('[Context only')) return json(200, { message, reply: null, status: 'context', sources: [] });
      if (conv.escalated) return json(200, { message, reply: null, status: 'escalated', sources: [] });
      if (replyLatency) await new Promise((r) => setTimeout(r, replyLatency));
      const [status, reply, sources] = sent.length
        ? ['answered', `I can see ${sent.length === 1 ? 'your picture' : `your ${sent.length} pictures`}${text ? ` and read “${text}”` : ''}.`, []]
        : /person|human|agent/i.test(text)
        ? ['handoff_offered', 'I can bring in someone from the team. Want me to?', []]
        : /return|refund/i.test(text)
          ? ['answered', 'You can return any item within **30 days**:\n\n1. Open your order\n2. Choose *Return*\n3. Print the label', [{ document_id: 'doc_1', title: 'Returns policy', url: 'https://example.com/returns', score: 0.91 }, { kind: 'web', title: 'Return shipping labels', url: 'https://carrier.example.org/returns', score: 0.64 }]]
          : ['answered', `You said: “${text}”. Try asking about returns, for a person, or type "limit" to see an error.`, []];
      add(conv, 'assistant', reply);
      const { pictures: _stored, ...out } = message;
      return json(200, { message: out, reply, status, sources });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'No such route.' } });
  };
}

/**
 * Serves the mock over HTTP, for routes in Python, PHP, Go… and for browsers. It plays R2's CORS rule
 * too: a website may PUT a picture from any origin, with Content-Type and the headers the registration returned.
 */
export function serve({ port = 0, ...options } = {}) {
  let api;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const binary = req.url.startsWith('/_r2/');
    const cors = binary ? { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': 'content-type, x-mock-signature', 'Access-Control-Max-Age': '600' } : {};
    if (binary && req.method === 'OPTIONS') return void res.writeHead(204, cors).end();
    const r = await api(`http://localhost:${server.address().port}${req.url}`, { method: req.method, headers: req.headers, body: binary ? raw : raw.toString() || undefined });
    res.writeHead(r.status, { ...Object.fromEntries(r.headers), ...cors }).end(Buffer.from(await r.arrayBuffer()));
  });
  return new Promise((resolve) => server.listen(port, () => {
    const bound = server.address().port;
    api = mockApi(`http://localhost:${bound}/v3`, options);
    resolve({ server, port: bound, base: `http://localhost:${bound}/v3` });
  }));
}

// Run directly: serve the mock over HTTP, for routes in Python, PHP, Go…
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const images = process.env.IMAGES === 'plan' || process.env.IMAGES === 'no_vision' ? process.env.IMAGES : process.env.IMAGES === '1';
  const { base } = await serve({ port: Number(process.env.PORT ?? 4301), images });
  console.log(`Mock Truplexy API on ${base}${images ? ` (image input: ${images})` : ''}`);
}
