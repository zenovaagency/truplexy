import { indent, PUBLIC_API, type LangPack } from './types';

/** Node.js 20+: Express for routes, global fetch for HTTP. */
const pack: LangPack = {
  files: { server: 'server.js', helper: 'truplexy.js', webhook: 'webhook.js', verify: 'verify.js' },

  helper: `// truplexy.js — runs on your server only.
// TRUPLEXY_CHAT_KEY lives in your secret manager, never in a browser or app.
const API = "${PUBLIC_API}";

export class TruplexyApiError extends Error {
  constructor(status, error, requestId) {
    super(error.message ?? "Truplexy request failed");
    this.status = status; this.code = error.code ?? "UPSTREAM_ERROR";
    this.requestId = error.request_id ?? requestId; this.details = error;
  }
}
export async function call(path, body, method = "POST") {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: \`Bearer \${process.env.TRUPLEXY_CHAT_KEY}\`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new TruplexyApiError(res.status, data.error ?? {}, res.headers.get("X-Request-ID"));
  return data;
}

export async function upsertCustomer(customer) {
  try { return await call("/customer", customer, "PUT"); }
  catch (e) {
    if (e.status !== 409 || e.code !== "CUSTOMER_EXISTS") throw e;
    return call("/customer", customer, "PUT"); // one retry only
  }
}
export async function createConversation(customer, channelId) {
  const known = customer == null ? null : await upsertCustomer(customer);
  if (customer != null && (typeof known?.id !== "string" || !known.id)) throw new TruplexyApiError(502, { code: "UPSTREAM_ERROR", message: "Missing customer ID" });
  return call("/conversations", { ...(known && { customer_id: known.id }), ...(channelId && { channel_id: channelId }) });
}

// One Truplexy conversation per customer thread. Use your database in production.
const threads = new Map();
export const threadFor = (conversationId) => [...threads].find(([, c]) => c === conversationId)?.[0];

export async function ask(thread, text, customer, channelId) {
  let id = threads.get(thread);
  if (!id) threads.set(thread, (id = (await createConversation(customer, channelId)).id));
  const r = await call(\`/conversations/\${id}/messages\`, { message: text.slice(0, 4000) });
  // "escalated" (a person has it) and "context" have no reply: send nothing.
  return { reply: r.reply, status: r.status, conversationId: id };
}

export const handoff = (id) => call(\`/conversations/\${id}/handoff\`);`,

  verify: `import crypto from "node:crypto";

export function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((part) => part.split("=")));
  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  return fresh && v1?.length === expected.length && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}`,

  receiver: ({ deliver, escalation }) => `// Your team acted in Truplexy → act on it here.
app.post("/truplexy-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const raw = req.body.toString("utf8");
  if (!verify(raw, req.get("X-Truplexy-Signature") ?? "", process.env.TRUPLEXY_WEBHOOK_SECRET)) return res.sendStatus(401);
  res.sendStatus(200);                                   // answer within 2.5 seconds
  const { type, data } = JSON.parse(raw);
  const conversationId = data.conversation_id;${
    deliver
      ? `
  if (type === "message.created") {                      // your team replied
    const text = data.message.content;
    const agent = data.message.agent ?? "Support";
    const thread = threadFor(conversationId);
    ${indent(deliver, '    ')}
  }`
      : ''
  }${
    escalation
      ? `
  if (type === "ticket.updated" && data.ticket?.escalated) {
    const ticket = data.ticket;
    ${indent(escalation, '    ')}
  }`
      : ''
  }
});`,

  integrations: {
    web: {
      file: 'server.js',
      standalone: true,
      handler: `// server.js: npm i express @truplexy/server
import express from "express";
import { createNodeHandler } from "@truplexy/server/node";

const app = express();

// The widget talks to this route. It reads TRUPLEXY_CHAT_KEY from the environment,
// keeps a signed session per visitor and never sends the key to the browser.
app.post("/api/truplexy", createNodeHandler());

app.listen(3000);`,
    },

    telegram: {
      handler: `app.post("/telegram", express.json(), async (req, res) => {
  res.sendStatus(200);
  const msg = req.body.message;
  if (!msg?.text || !msg.from || msg.sender_chat) return;
  const { reply } = await ask(\`tg:\${msg.chat.id}:\${msg.from.id}\`, msg.text, { contacts: [{ type: "telegram", value: String(msg.from.id) }] });
  if (reply) await sendTelegram(msg.chat.id, reply);
});

const sendTelegram = (chat_id, text) =>
  fetch(\`https://api.telegram.org/bot\${process.env.TELEGRAM_TOKEN}/sendMessage\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  });`,
      deliver: `await sendTelegram(thread.split(":")[1], \`\${agent}: \${text}\`);`,
    },

    email: {
      handler: `app.post("/inbound-email", express.json(), async (req, res) => {
  res.sendStatus(200);
  const { From, Subject, TextBody, MessageID } = req.body;   // Postmark's fields
  const { reply } = await ask(\`mail:\${From}\`, \`\${Subject}\\n\\n\${TextBody}\`.slice(0, 4000), { contacts: [{ type: "email", value: From }] });
  if (reply) await sendEmail({ to: From, subject: \`Re: \${Subject}\`, text: reply, inReplyTo: MessageID });
});`,
      deliver: `await sendEmail({ to: thread.replace("mail:", ""), subject: "Re: your request", text });`,
    },

    api: {
      standalone: true,
      file: 'example.js',
      handler: `// npm i @truplexy/server — server code only.
import { createChatClient } from "@truplexy/server";
const chat = createChatClient();
const customer = await chat.upsertCustomer({ contacts: [{ type: "app", value: "user-42" }, { type: "email", value: "ann@example.com" }] });
const conv = await chat.createConversation({ customer_id: customer.id });
const r = await chat.sendMessage(conv.id, "Where is my order?");
console.log(r.status, r.reply, r.sources);`,
      deliver: `// Deliver the reply to the customer's thread on your platform.
deliver(thread, text, agent);`,
    },
  },
};

export default pack;
