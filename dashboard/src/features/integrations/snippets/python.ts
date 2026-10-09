import { indent, PUBLIC_API, type LangPack } from './types';

/** Python 3.10+: FastAPI for routes, httpx for HTTP. */
const pack: LangPack = {
  files: { server: 'app.py', helper: 'truplexy.py', webhook: 'webhook.py', verify: 'verify.py' },

  helper: `# truplexy.py — runs on your server only.
# TRUPLEXY_CHAT_KEY lives in your secret manager, never in a browser or app.
import os
import httpx

API = "${PUBLIC_API}"
_http = httpx.AsyncClient(
    base_url=API,
    headers={"Authorization": f"Bearer {os.environ['TRUPLEXY_CHAT_KEY']}"},
    timeout=60,
)


async def call(path: str, body: dict | None = None) -> dict:
    res = await _http.post(path, json=body)
    res.raise_for_status()
    return res.json()


# One Truplexy conversation per customer thread. Use your database in production.
threads: dict[str, str] = {}


def thread_for(conversation_id: str) -> str | None:
    return next((t for t, c in threads.items() if c == conversation_id), None)


async def ask(thread: str, text: str) -> dict:
    conv = threads.get(thread)
    if not conv:
        conv = threads[thread] = (await call("/conversations"))["id"]
    r = await call(f"/conversations/{conv}/messages", {"message": text[:4000]})
    # "escalated" (a person has it) and "context" have no reply: send nothing.
    return {"reply": r.get("reply"), "status": r["status"], "conversation_id": conv}


async def handoff(conversation_id: str) -> dict:
    return await call(f"/conversations/{conversation_id}/handoff")`,

  verify: `import hashlib
import hmac
import time


def verify(raw_body: bytes, header: str, secret: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    t, v1 = parts.get("t", ""), parts.get("v1", "")
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    fresh = t.isdigit() and abs(time.time() - int(t)) < 300
    return fresh and hmac.compare_digest(v1, expected)`,

  receiver: ({ deliver, escalation }) => `import json
import os
from fastapi import BackgroundTasks, Request, Response
from truplexy import thread_for
from verify import verify


# Your team acted in Truplexy → act on it here.
@app.post("/truplexy-webhook")
async def truplexy_webhook(request: Request, background: BackgroundTasks):
    raw = await request.body()
    if not verify(raw, request.headers.get("X-Truplexy-Signature", ""), os.environ["TRUPLEXY_WEBHOOK_SECRET"]):
        return Response(status_code=401)
    background.add_task(on_event, json.loads(raw))   # answer within 2.5 seconds
    return Response(status_code=200)


async def on_event(event: dict):
    data = event["data"]
    conversation_id = data.get("conversation_id")${
      deliver
        ? `
    if event["type"] == "message.created":   # your team replied
        text = data["message"]["content"]
        agent = data["message"].get("agent") or "Support"
        thread = thread_for(conversation_id)
        ${indent(deliver, '        ')}`
        : ''
    }${
      escalation
        ? `
    if event["type"] == "ticket.updated" and data.get("ticket", {}).get("escalated"):
        ticket = data["ticket"]
        ${indent(escalation, '        ')}`
        : ''
    }`,

  integrations: {
    web: {
      file: 'app.py',
      standalone: true,
      handler: `# app.py — the route the Truplexy widget talks to: POST /api/truplexy
# pip install fastapi uvicorn httpx. TRUPLEXY_CHAT_KEY stays on this server.
import base64, hashlib, hmac, os, re, time

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

API = "${PUBLIC_API}"
KEY = os.environ["TRUPLEXY_CHAT_KEY"]
SECRET = (os.environ.get("TRUPLEXY_SESSION_SECRET") or KEY).encode()
TTL = 30 * 24 * 3600
http = httpx.AsyncClient(base_url=API, headers={"Authorization": f"Bearer {KEY}"}, timeout=60)
app = FastAPI()


# Sessions: a signed conversation ID the visitor's browser keeps. No database needed.
def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign(conv: str) -> str:
    payload = f"{conv}.{int(time.time())}".encode()
    return f"{b64(payload)}.{b64(hmac.new(SECRET, payload, hashlib.sha256).digest())}"


def verify(token) -> str | None:
    try:
        p, s = token.split(".")
        payload = unb64(p)
        if not hmac.compare_digest(unb64(s), hmac.new(SECRET, payload, hashlib.sha256).digest()):
            return None
        m = re.fullmatch(r"(conv_[0-9a-f]{32})\\.(\\d+)", payload.decode())
        return m[1] if m and -300 <= time.time() - int(m[2]) <= TTL else None
    except (AttributeError, ValueError, UnicodeDecodeError):
        return None


class Upstream(Exception):
    def __init__(self, code: str, request_id: str | None):
        self.code, self.request_id = code, request_id


async def api(method: str, path: str, body: dict | None = None) -> dict:
    res = await http.request(method, path, json=body)
    if res.is_error:
        err = (res.json() if res.content else {}).get("error", {})
        code = "NOT_CONFIGURED" if res.status_code == 401 else err.get("code", "UPSTREAM_ERROR")
        raise Upstream(code, err.get("request_id") or res.headers.get("x-request-id"))
    return res.json()


def public(conv: dict) -> dict:
    """What the visitor may see: no background "[Context only" messages."""
    keep = ("id", "role", "content", "author", "agent", "created_at")
    messages = [
        {k: m[k] for k in keep if k in m}
        for m in conv["messages"]
        if not (m["role"] == "user" and m["content"].startswith("[Context only"))
    ]
    return {"status": conv["status"], "escalated": conv["escalated"], "messages": messages}


EMAIL = re.compile(r"[^\\s@]+@[^\\s@]+\\.[^\\s@]+")


def parse_customer(raw) -> tuple[str, str] | None:
    """(name, email) from the widget's details form, None when absent. Raises ValueError when unusable."""
    if raw is None:
        return None
    name = str(raw.get("name", "")).strip() if isinstance(raw, dict) else ""
    email = str(raw.get("email", "")).strip() if isinstance(raw, dict) else ""
    if not name or len(name) > 80 or len(email) > 254 or not EMAIL.fullmatch(email):
        raise ValueError
    return name, email


async def start_conversation(customer) -> tuple[str, dict | None]:
    """Starts the conversation, tells the assistant who is chatting and opens a ticket for the team. The chat works without either."""
    conv = (await api("POST", "/conversations"))["id"]
    ticket = None
    try:
        if customer:
            await api("POST", f"/conversations/{conv}/messages", {"message": f"[Context only] Customer: {customer[0]} <{customer[1]}>"})
    except Upstream:
        pass
    try:
        t = await api("POST", f"/conversations/{conv}/ticket", {"subject": f"Chat with {customer[0]}" if customer else "Website chat"})
        ticket = {"id": t["id"], "subject": t.get("subject"), "status": t.get("status")}
    except Upstream:
        pass
    return conv, ticket


# Messages the visitor sees. Never pass on the API's own message.
ERRORS = {
    "INVALID_REQUEST": (400, "Check your message, name and email."),
    "CHANNEL_DISABLED": (503, "Chat is turned off right now."),
    "PLAN_LIMIT_REACHED": (503, "The assistant can't reply right now. Please try again later."),
    "LLM_RATE_LIMITED": (429, "The assistant is busy. Please try again in a moment."),
    "LLM_TIMEOUT": (504, "The reply took too long. Please try again."),
}


def error(code: str, request_id: str | None = None) -> JSONResponse:
    if code not in ERRORS:
        code = "UPSTREAM_ERROR"
    status, message = ERRORS.get(code, (502, "Chat is unavailable right now."))
    return JSONResponse({"error": {"code": code, "message": message, "request_id": request_id}}, status)


@app.post("/api/truplexy")
async def truplexy(request: Request):
    body = await request.json()
    action, conv = body.get("action"), verify(body.get("session"))
    try:
        if action == "message":
            text = str(body.get("text", "")).strip()
            if not 0 < len(text) <= 4000 or text.startswith("[Context only"):
                return error("INVALID_REQUEST")
            try:
                customer = parse_customer(body.get("customer"))
            except ValueError:
                return error("INVALID_REQUEST")
            ticket = None
            if not conv:
                conv, ticket = await start_conversation(customer)
            r = await api("POST", f"/conversations/{conv}/messages", {"message": text})
            return {"session": sign(conv), "message": r["message"], "reply": r["reply"], "status": r["status"], "sources": r.get("sources", []), **({"ticket": ticket} if ticket else {})}
        if action == "history":
            if not conv:
                return {"session": None}
            return {"session": sign(conv), "conversation": public(await api("GET", f"/conversations/{conv}"))}
        if action == "handoff" and conv:
            return {"session": sign(conv), "conversation": public(await api("POST", f"/conversations/{conv}/handoff"))}
        if action == "profile":
            # The business and bot name and picture; the widget shows them in its header.
            p = await api("GET", "/profile")
            business, bot = p.get("business", {}), p.get("bot", {})
            return {
                "business": {"name": business.get("name"), "logo_url": business.get("logo_url")},
                "bot": {"id": bot.get("id"), "name": bot.get("name"), "avatar_url": bot.get("avatar_url")},
            }
        if action == "live":
            if not conv:
                return {}
            t = await api("POST", "/realtime/token", {"conversation_id": conv})
            # Only the conversation's own topic: bot_topic carries every customer's messages.
            return {k: t[k] for k in ("url", "publishable_key", "conversation_topic") if k in t}
    except Upstream as e:
        if action == "history" and e.code == "CONVERSATION_NOT_FOUND":
            return {"session": None}
        if action == "live":
            return {}
        return error(e.code, e.request_id)
    return error("INVALID_REQUEST")`,
    },

    whatsapp: {
      handler: `import os
import httpx
from fastapi import BackgroundTasks, FastAPI, Request, Response
from truplexy import ask

app = FastAPI()


@app.get("/whatsapp")   # Meta's verification handshake
async def whatsapp_verify(request: Request):
    q = request.query_params
    if q.get("hub.verify_token") == os.environ["WA_VERIFY_TOKEN"]:
        return Response(q.get("hub.challenge"))
    return Response(status_code=403)


@app.post("/whatsapp")
async def whatsapp(request: Request, background: BackgroundTasks):
    background.add_task(handle_whatsapp, await request.json())   # answer Meta at once
    return Response(status_code=200)


async def handle_whatsapp(body: dict):
    value = body["entry"][0]["changes"][0]["value"]
    for msg in value.get("messages", []):
        if msg["type"] != "text":
            continue
        r = await ask(f"wa:{msg['from']}", msg["text"]["body"])
        if r["reply"]:
            await send_whatsapp(msg["from"], r["reply"])


async def send_whatsapp(to: str, body: str):
    async with httpx.AsyncClient() as http:
        await http.post(
            f"https://graph.facebook.com/v21.0/{os.environ['WA_PHONE_ID']}/messages",
            headers={"Authorization": f"Bearer {os.environ['WA_TOKEN']}"},
            json={"messaging_product": "whatsapp", "to": to, "text": {"body": body}},
        )`,
      deliver: `await send_whatsapp(thread.removeprefix("wa:"), text)`,
    },

    telegram: {
      handler: `import os
import httpx
from fastapi import BackgroundTasks, FastAPI, Request, Response
from truplexy import ask

app = FastAPI()
TELEGRAM = f"https://api.telegram.org/bot{os.environ['TELEGRAM_TOKEN']}"


@app.post("/telegram")
async def telegram(request: Request, background: BackgroundTasks):
    background.add_task(handle_update, await request.json())
    return Response(status_code=200)


async def handle_update(update: dict):
    msg = update.get("message") or {}
    if not msg.get("text"):
        return
    r = await ask(f"tg:{msg['chat']['id']}", msg["text"])
    if r["reply"]:
        await send_telegram(msg["chat"]["id"], r["reply"])


async def send_telegram(chat_id, text: str):
    async with httpx.AsyncClient() as http:
        await http.post(f"{TELEGRAM}/sendMessage", json={"chat_id": chat_id, "text": text})`,
      deliver: `await send_telegram(thread.removeprefix("tg:"), f"{agent}: {text}")`,
    },

    discord: {
      file: 'bot.py',
      handler: `# pip install discord.py — keeps a gateway connection open.
import os
import discord
from truplexy import ask

intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)


@client.event
async def on_message(m: discord.Message):
    if m.author.bot or not m.content:
        return
    async with m.channel.typing():
        r = await ask(f"dc:{m.channel.id}:{m.author.id}", m.content)
    if r["reply"]:
        await m.reply(r["reply"])


# Run the webhook receiver in the same process (e.g. client.start() in FastAPI's lifespan).
client.run(os.environ["DISCORD_TOKEN"])`,
      deliver: `_, channel_id, _ = thread.split(":")
channel = client.get_channel(int(channel_id)) or await client.fetch_channel(int(channel_id))
await channel.send(f"**{agent}:** {text}")`,
    },

    messenger: {
      handler: `import os
import httpx
from fastapi import BackgroundTasks, FastAPI, Request, Response
from truplexy import ask

app = FastAPI()


@app.post("/messenger")
async def messenger(request: Request, background: BackgroundTasks):
    background.add_task(handle_messenger, await request.json())
    return Response(status_code=200)


async def handle_messenger(body: dict):
    for entry in body.get("entry", []):
        for ev in entry.get("messaging", []):
            text = ev.get("message", {}).get("text")
            if not text:
                continue
            r = await ask(f"fb:{ev['sender']['id']}", text)
            if r["reply"]:
                await send_messenger(ev["sender"]["id"], r["reply"])


async def send_messenger(psid: str, text: str):
    async with httpx.AsyncClient() as http:
        await http.post(
            "https://graph.facebook.com/v21.0/me/messages",
            params={"access_token": os.environ["FB_PAGE_TOKEN"]},
            json={"recipient": {"id": psid}, "message": {"text": text}},
        )`,
      deliver: `await send_messenger(thread.removeprefix("fb:"), text)`,
    },

    instagram: {
      handler: `import os
import httpx
from fastapi import BackgroundTasks, FastAPI, Request, Response
from truplexy import ask

app = FastAPI()


@app.post("/instagram")
async def instagram(request: Request, background: BackgroundTasks):
    background.add_task(handle_instagram, await request.json())
    return Response(status_code=200)


async def handle_instagram(body: dict):
    for entry in body.get("entry", []):
        for ev in entry.get("messaging", []):
            message = ev.get("message", {})
            if not message.get("text") or message.get("is_echo"):
                continue
            r = await ask(f"ig:{ev['sender']['id']}", message["text"])
            if r["reply"]:
                await send_instagram(ev["sender"]["id"], r["reply"])


async def send_instagram(igsid: str, text: str):
    async with httpx.AsyncClient() as http:
        await http.post(
            "https://graph.facebook.com/v21.0/me/messages",
            params={"access_token": os.environ["IG_PAGE_TOKEN"]},
            json={"recipient": {"id": igsid}, "message": {"text": text}},
        )`,
      deliver: `await send_instagram(thread.removeprefix("ig:"), text)`,
    },

    email: {
      handler: `from fastapi import BackgroundTasks, FastAPI, Request, Response
from truplexy import ask

app = FastAPI()


@app.post("/inbound-email")
async def inbound_email(request: Request, background: BackgroundTasks):
    background.add_task(handle_email, await request.json())
    return Response(status_code=200)


async def handle_email(mail: dict):   # Postmark's fields
    r = await ask(f"mail:{mail['From']}", f"{mail['Subject']}\\n\\n{mail['TextBody']}"[:4000])
    if r["reply"]:
        await send_email(to=mail["From"], subject=f"Re: {mail['Subject']}", text=r["reply"], in_reply_to=mail["MessageID"])`,
      deliver: `await send_email(to=thread.removeprefix("mail:"), subject="Re: your request", text=text)`,
    },

    shopify: {
      handler: `import hashlib
import hmac
import os
from urllib.parse import parse_qsl
from fastapi import FastAPI, Request, Response
from truplexy import ask

app = FastAPI()


# App Proxy: https://{shop}/apps/support/chat → https://your-server.com/shopify/chat
@app.post("/shopify/chat")
async def shopify_chat(request: Request):
    if not valid_proxy_signature(request.url.query, os.environ["SHOPIFY_SECRET"]):
        return Response(status_code=401)
    body = await request.json()
    q = request.query_params
    customer = q.get("logged_in_customer_id") or body["visitor_id"]
    return await ask(f"shop:{q['shop']}:{customer}", body["text"])


# Shopify signs proxy requests: sorted "key=value" pairs, joined without separators.
def valid_proxy_signature(query: str, secret: str) -> bool:
    params = parse_qsl(query, keep_blank_values=True)
    signature = dict(params).get("signature", "")
    message = "".join(sorted(f"{k}={v}" for k, v in params if k != "signature"))
    digest = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)`,
      deliver: `# Push to the storefront widget through your own socket or long-poll endpoint.
await notify_storefront(thread, {"from": agent, "text": text})`,
    },

    hubspot: {
      handler: `import os
import httpx
from fastapi import BackgroundTasks, FastAPI, Request, Response
from truplexy import ask

app = FastAPI()
hubspot = httpx.AsyncClient(base_url="https://api.hubapi.com", headers={"Authorization": f"Bearer {os.environ['HUBSPOT_TOKEN']}"})
last_channel: dict[str, dict] = {}   # thread → its channel, for your team's replies


@app.post("/hubspot")
async def hubspot_events(request: Request, background: BackgroundTasks):
    background.add_task(handle_events, await request.json())
    return Response(status_code=200)


async def handle_events(events: list):
    for e in events:
        thread_id = str(e["objectId"])
        msg = (await hubspot.get(f"/conversations/v3/conversations/threads/{thread_id}/messages/{e['messageId']}")).json()
        if msg.get("direction") != "INCOMING":
            continue
        last_channel[thread_id] = msg
        r = await ask(f"hs:{thread_id}", msg["text"])
        if r["reply"]:
            await hubspot_send(thread_id, r["reply"])


async def hubspot_send(thread_id: str, text: str):
    channel = last_channel[thread_id]
    await hubspot.post(f"/conversations/v3/conversations/threads/{thread_id}/messages", json={
        "type": "MESSAGE", "text": text, "senderActorId": os.environ["HS_ACTOR"],
        "channelId": channel["channelId"], "channelAccountId": channel["channelAccountId"],
    })`,
      deliver: `await hubspot_send(thread.removeprefix("hs:"), text)`,
    },

    zendesk: {
      handler: `import os
import httpx
from fastapi import BackgroundTasks, FastAPI, Request, Response
from truplexy import ask

app = FastAPI()
zendesk = httpx.AsyncClient(
    base_url=f"https://{os.environ['ZENDESK_SUBDOMAIN']}.zendesk.com/api/v2",
    auth=(f"{os.environ['ZENDESK_EMAIL']}/token", os.environ["ZENDESK_TOKEN"]),
)


@app.post("/zendesk")
async def new_ticket(request: Request, background: BackgroundTasks):
    background.add_task(handle_ticket, await request.json())   # fields from your trigger's JSON body
    return Response(status_code=200)


async def handle_ticket(body: dict):
    r = await ask(f"zd:{body['ticket_id']}", body["description"])
    if r["reply"] and r["status"] == "answered":
        await comment(body["ticket_id"], r["reply"])


async def comment(ticket_id, text: str):
    await zendesk.put(f"/tickets/{ticket_id}", json={"ticket": {"comment": {"body": text, "public": True}}})`,
      deliver: `await comment(thread.removeprefix("zd:"), text)`,
    },

    slack: {
      file: 'slack_app.py',
      handler: `# pip install slack_bolt aiohttp
import os
from slack_bolt.async_app import AsyncApp
from truplexy import call

slack = AsyncApp(token=os.environ["SLACK_BOT_TOKEN"], signing_secret=os.environ["SLACK_SIGNING_SECRET"])


# A teammate replied in the escalation's Slack thread → send it to the customer.
@slack.event("message")
async def on_reply(event, client):
    if not event.get("thread_ts") or event.get("bot_id") or event.get("subtype"):
        return
    conversation_id = await conversation_for_slack_thread(event["thread_ts"])
    user = await client.users_info(user=event["user"])
    await call(f"/conversations/{conversation_id}/replies", {
        "content": event["text"],
        "author": user["user"]["real_name"],
        "external_id": event.get("client_msg_id"),
    })


if __name__ == "__main__":
    slack.start(port=3000)`,
      escalation: `# Post it to #support; replies in its thread come back through on_reply.
post = await slack.client.chat_postMessage(channel="#support", text=f"Escalated: {ticket['subject']}")
await save_slack_thread(post["ts"], conversation_id)`,
    },

    teams: {
      file: 'bot.py',
      handler: `# pip install botbuilder-core botbuilder-integration-aiohttp
from botbuilder.core import ActivityHandler, TurnContext
from truplexy import call


class SupportBot(ActivityHandler):
    # A reply in an escalation's thread → send it to the customer.
    async def on_message_activity(self, ctx: TurnContext):
        a = ctx.activity
        conversation_id = await conversation_for_teams_thread(a.conversation.id)
        await call(f"/conversations/{conversation_id}/replies", {
            "content": a.text, "author": a.from_property.name, "external_id": a.id,
        })`,
      escalation: `await post_teams_card(support_channel, title="Escalated", text=ticket["subject"], conversation_id=conversation_id)`,
    },

    api: {
      file: 'example.py',
      handler: `import asyncio
from truplexy import call


async def main():
    conv = await call("/conversations")
    r = await call(f"/conversations/{conv['id']}/messages", {"message": "Where is my order?"})
    print(r["status"], r["reply"], r["sources"])

asyncio.run(main())`,
      deliver: `# Deliver the reply to the customer's thread on your platform.
await deliver(thread, text, agent)`,
    },
  },
};

export default pack;
