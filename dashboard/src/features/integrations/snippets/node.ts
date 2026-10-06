import { indent, PUBLIC_API, type LangPack } from './types';

/** Node.js 20+: Express for routes, global fetch for HTTP. */
const pack: LangPack = {
  files: { server: 'server.js', helper: 'truplexy.js', webhook: 'webhook.js', verify: 'verify.js' },

  helper: `// truplexy.js — runs on your server only.
// TRUPLEXY_CHAT_KEY lives in your secret manager, never in a browser or app.
const API = "${PUBLIC_API}";

export async function call(path, body) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: { Authorization: \`Bearer \${process.env.TRUPLEXY_CHAT_KEY}\`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(\`Truplexy \${res.status}: \${await res.text()}\`);
  return res.json();
}

// One Truplexy conversation per customer thread. Use your database in production.
const threads = new Map();
export const threadFor = (conversationId) => [...threads].find(([, c]) => c === conversationId)?.[0];

export async function ask(thread, text) {
  let id = threads.get(thread);
  if (!id) threads.set(thread, (id = (await call("/conversations")).id));
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
      handler: `// POST /chat  { visitorId, text } from your widget
app.post("/chat", express.json(), async (req, res) => {
  const { visitorId, text } = req.body;
  const { reply, status, conversationId } = await ask(\`web:\${visitorId}\`, text);
  res.json({ reply, status, conversationId });
});

// The widget's "Talk to a person" button
app.post("/chat/handoff", express.json(), async (req, res) => {
  res.json(await handoff(req.body.conversationId));
});`,
      deliver: `// Push the reply to the open widget, e.g. over your own WebSocket.
sockets.get(thread)?.send(JSON.stringify({ from: agent, text }));`,
    },

    whatsapp: {
      handler: `app.get("/whatsapp", (req, res) =>  // Meta's verification handshake
  req.query["hub.verify_token"] === process.env.WA_VERIFY_TOKEN
    ? res.send(req.query["hub.challenge"]) : res.sendStatus(403));

app.post("/whatsapp", express.json(), async (req, res) => {
  res.sendStatus(200);                       // answer Meta at once
  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (msg?.type !== "text") return;
  const { reply } = await ask(\`wa:\${msg.from}\`, msg.text.body);
  if (reply) await sendWhatsApp(msg.from, reply);
});

const sendWhatsApp = (to, body) =>
  fetch(\`https://graph.facebook.com/v21.0/\${process.env.WA_PHONE_ID}/messages\`, {
    method: "POST",
    headers: { Authorization: \`Bearer \${process.env.WA_TOKEN}\`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, text: { body } }),
  });`,
      deliver: `await sendWhatsApp(thread.replace("wa:", ""), text);`,
    },

    telegram: {
      handler: `app.post("/telegram", express.json(), async (req, res) => {
  res.sendStatus(200);
  const msg = req.body.message;
  if (!msg?.text) return;
  const { reply } = await ask(\`tg:\${msg.chat.id}\`, msg.text);
  if (reply) await sendTelegram(msg.chat.id, reply);
});

const sendTelegram = (chat_id, text) =>
  fetch(\`https://api.telegram.org/bot\${process.env.TELEGRAM_TOKEN}/sendMessage\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  });`,
      deliver: `await sendTelegram(thread.replace("tg:", ""), \`\${agent}: \${text}\`);`,
    },

    discord: {
      file: 'bot.js',
      handler: `// npm i discord.js — keeps a gateway connection open.
import { Client, GatewayIntentBits } from "discord.js";
const discord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages] });

discord.on("messageCreate", async (m) => {
  if (m.author.bot || !m.content) return;
  await m.channel.sendTyping();
  const { reply } = await ask(\`dc:\${m.channelId}:\${m.author.id}\`, m.content);
  if (reply) await m.reply(reply);
});
discord.login(process.env.DISCORD_TOKEN);`,
      deliver: `const [, channelId] = thread.split(":");
await (await discord.channels.fetch(channelId)).send(\`**\${agent}:** \${text}\`);`,
    },

    messenger: {
      handler: `app.post("/messenger", express.json(), async (req, res) => {
  res.sendStatus(200);
  for (const e of req.body.entry ?? []) for (const ev of e.messaging ?? []) {
    if (!ev.message?.text) continue;
    const { reply } = await ask(\`fb:\${ev.sender.id}\`, ev.message.text);
    if (reply) await sendMessenger(ev.sender.id, reply);
  }
});

const sendMessenger = (id, text) =>
  fetch(\`https://graph.facebook.com/v21.0/me/messages?access_token=\${process.env.FB_PAGE_TOKEN}\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id }, message: { text } }),
  });`,
      deliver: `await sendMessenger(thread.replace("fb:", ""), text);`,
    },

    instagram: {
      handler: `app.post("/instagram", express.json(), async (req, res) => {
  res.sendStatus(200);
  for (const e of req.body.entry ?? []) for (const ev of e.messaging ?? []) {
    if (!ev.message?.text || ev.message.is_echo) continue;
    const { reply } = await ask(\`ig:\${ev.sender.id}\`, ev.message.text);
    if (reply) await sendInstagram(ev.sender.id, reply);
  }
});

const sendInstagram = (id, text) =>
  fetch(\`https://graph.facebook.com/v21.0/me/messages?access_token=\${process.env.IG_PAGE_TOKEN}\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id }, message: { text } }),
  });`,
      deliver: `await sendInstagram(thread.replace("ig:", ""), text);`,
    },

    email: {
      handler: `app.post("/inbound-email", express.json(), async (req, res) => {
  res.sendStatus(200);
  const { From, Subject, TextBody, MessageID } = req.body;   // Postmark's fields
  const { reply } = await ask(\`mail:\${From}\`, \`\${Subject}\\n\\n\${TextBody}\`.slice(0, 4000));
  if (reply) await sendEmail({ to: From, subject: \`Re: \${Subject}\`, text: reply, inReplyTo: MessageID });
});`,
      deliver: `await sendEmail({ to: thread.replace("mail:", ""), subject: "Re: your request", text });`,
    },

    shopify: {
      handler: `import crypto from "node:crypto";

// App Proxy: https://{shop}/apps/support/chat → https://your-server.com/shopify/chat
app.post("/shopify/chat", express.json(), async (req, res) => {
  if (!validProxySignature(req.query, process.env.SHOPIFY_SECRET)) return res.sendStatus(401);
  const customer = req.query.logged_in_customer_id || req.body.visitorId;
  const { reply, status, conversationId } = await ask(\`shop:\${req.query.shop}:\${customer}\`, req.body.text);
  res.json({ reply, status, conversationId });
});

// Shopify signs proxy requests: sorted "key=value" pairs, joined without separators.
function validProxySignature({ signature = "", ...params }, secret) {
  const message = Object.keys(params).sort().map((k) => \`\${k}=\${[].concat(params[k]).join(",")}\`).join("");
  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");
  return signature.length === digest.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}`,
      deliver: `// Push to the storefront widget through your own socket or long-poll endpoint.
notifyStorefront(thread, { from: agent, text });`,
    },

    hubspot: {
      handler: `const hubspot = (path, body) =>
  fetch(\`https://api.hubapi.com\${path}\`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: \`Bearer \${process.env.HUBSPOT_TOKEN}\`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  }).then((r) => r.json());

const lastChannel = new Map();   // thread → its channel, for your team's replies

app.post("/hubspot", express.json(), async (req, res) => {
  res.sendStatus(200);
  for (const e of req.body) {
    const msg = await hubspot(\`/conversations/v3/conversations/threads/\${e.objectId}/messages/\${e.messageId}\`);
    if (msg.direction !== "INCOMING") continue;
    lastChannel.set(e.objectId, msg);
    const { reply } = await ask(\`hs:\${e.objectId}\`, msg.text);
    if (reply) await hubspotSend(e.objectId, reply, msg);
  }
});

const hubspotSend = (threadId, text, { channelId, channelAccountId } = lastChannel.get(threadId)) =>
  hubspot(\`/conversations/v3/conversations/threads/\${threadId}/messages\`, {
    type: "MESSAGE", text, senderActorId: process.env.HS_ACTOR, channelId, channelAccountId,
  });`,
      deliver: `await hubspotSend(thread.replace("hs:", ""), text);`,
    },

    zendesk: {
      handler: `const zendesk = (path, body) =>
  fetch(\`https://\${process.env.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2\${path}\`, {
    method: "PUT",
    headers: {
      Authorization: "Basic " + Buffer.from(\`\${process.env.ZENDESK_EMAIL}/token:\${process.env.ZENDESK_TOKEN}\`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

app.post("/zendesk", express.json(), async (req, res) => {
  res.sendStatus(200);
  const { ticket_id, description } = req.body;            // fields from your trigger's JSON body
  const { reply, status } = await ask(\`zd:\${ticket_id}\`, description);
  if (reply && status === "answered") await zendesk(\`/tickets/\${ticket_id}\`, { ticket: { comment: { body: reply, public: true } } });
});`,
      deliver: `await zendesk(\`/tickets/\${thread.replace("zd:", "")}\`, { ticket: { comment: { body: text, public: true } } });`,
    },

    slack: {
      file: 'slack.js',
      handler: `// npm i @slack/bolt
import bolt from "@slack/bolt";
const slack = new bolt.App({ token: process.env.SLACK_BOT_TOKEN, signingSecret: process.env.SLACK_SIGNING_SECRET });

// A teammate replied in the escalation's Slack thread → send it to the customer.
slack.message(async ({ message, client }) => {
  if (!message.thread_ts || message.bot_id || message.subtype) return;
  const conversationId = await conversationForSlackThread(message.thread_ts);
  const { user } = await client.users.info({ user: message.user });
  await call(\`/conversations/\${conversationId}/replies\`, {
    content: message.text, author: user.real_name, external_id: message.client_msg_id,
  });
});
await slack.start(3000);`,
      escalation: `// Post it to #support; replies in its thread come back through slack.message.
const post = await slack.client.chat.postMessage({ channel: "#support", text: \`Escalated: \${ticket.subject}\` });
await saveSlackThread(post.ts, conversationId);`,
    },

    teams: {
      file: 'bot.js',
      handler: `// npm i botbuilder — an Azure Bot registered for your support team.
import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from "botbuilder";
const adapter = new CloudAdapter(new ConfigurationBotFrameworkAuthentication(process.env));

// A reply in an escalation's thread → send it to the customer.
app.post("/api/messages", express.json(), (req, res) =>
  adapter.process(req, res, async (ctx) => {
    if (ctx.activity.type !== "message") return;
    const conversationId = await conversationForTeamsThread(ctx.activity.conversation.id);
    await call(\`/conversations/\${conversationId}/replies\`, {
      content: ctx.activity.text, author: ctx.activity.from.name, external_id: ctx.activity.id,
    });
  }));`,
      escalation: `await postTeamsCard(supportChannel, { title: "Escalated", text: ticket.subject, conversationId });`,
    },

    api: {
      file: 'example.js',
      handler: `import { call } from "./truplexy.js";

const conv = await call("/conversations");
const r = await call(\`/conversations/\${conv.id}/messages\`, { message: "Where is my order?" });
console.log(r.status, r.reply, r.sources);`,
      deliver: `// Deliver the reply to the customer's thread on your platform.
deliver(thread, text, agent);`,
    },
  },
};

export default pack;
