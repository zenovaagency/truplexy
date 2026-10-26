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


class TruplexyApiError(Exception):
    def __init__(self, response, error):
        super().__init__(error.get("message", "Truplexy request failed"))
        self.status, self.code = response.status_code, error.get("code", "UPSTREAM_ERROR")
        self.request_id = error.get("request_id") or response.headers.get("x-request-id")
        self.details = error


async def call(path: str, body: dict | None = None, method: str = "POST") -> dict:
    res = await _http.request(method, path, **({"json": body} if body is not None else {}))
    try:
        data = res.json()
    except ValueError:
        data = {}
    if res.is_error:
        raise TruplexyApiError(res, data.get("error", {}))
    return data


async def upsert_customer(customer: dict) -> dict:
    try:
        return await call("/customer", customer, "PUT")
    except TruplexyApiError as e:
        if e.status != 409 or e.code != "CUSTOMER_EXISTS":
            raise
        return await call("/customer", customer, "PUT")


async def create_conversation(customer=None, channel_id=None) -> dict:
    opening = {"channel_id": channel_id} if channel_id else {}
    if customer is not None:
        opening["customer_id"] = (await upsert_customer(customer))["id"]
    return await call("/conversations", opening)


# One Truplexy conversation per customer thread. Use your database in production.
threads: dict[str, str] = {}


def thread_for(conversation_id: str) -> str | None:
    return next((t for t, c in threads.items() if c == conversation_id), None)


async def conversation_for(thread: str, customer=None, channel_id=None) -> str:
    conv = threads.get(thread)
    if not conv:
        conv = threads[thread] = (await create_conversation(customer, channel_id))["id"]
    return conv


# attachments: IDs of pictures you registered and uploaded (optional).
async def ask(thread: str, text: str, customer=None, channel_id=None, attachments=None) -> dict:
    conv = await conversation_for(thread, customer, channel_id)
    body = {"message": text[:4000], **({"attachments": attachments} if attachments else {})}
    r = await call(f"/conversations/{conv}/messages", body)
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
    def __init__(self, code: str, request_id: str | None, status: int = 502):
        self.code, self.request_id, self.status = code, request_id, status


async def api(method: str, path: str, body: dict | None = None, retry: bool = True) -> dict:
    try:
        res = await http.request(method, path, **({"json": body} if body is not None else {}))
        data = res.json()
    except (httpx.HTTPError, ValueError):
        raise Upstream("UPSTREAM_ERROR", None)
    if res.is_error:
        err = data.get("error", {})
        if retry and method == "PUT" and path == "/customer" and res.status_code == 409 and err.get("code") == "CUSTOMER_EXISTS":
            return await api(method, path, body, False)
        code = "NOT_CONFIGURED" if res.status_code == 401 else err.get("code", "UPSTREAM_ERROR")
        raise Upstream(code, err.get("request_id") or res.headers.get("x-request-id"), res.status_code)
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


def parse_customer(raw) -> dict | None:
    """Convert visitor details to API contacts; reject unusable input."""
    if raw is None:
        return None
    name = str(raw.get("name", "")).strip() if isinstance(raw, dict) else ""
    email = str(raw.get("email", "")).strip() if isinstance(raw, dict) else ""
    if not name or len(name) > 120 or len(email) > 254 or not EMAIL.fullmatch(email):
        raise ValueError
    return {"name": name, "contacts": [{"type": "email", "value": email}]}


async def resolve_customer(request: Request) -> dict | None:
    # Return {contacts, name?, metadata?} from your authenticated server session.
    # Never copy a customer_id or trusted metadata from the browser body.
    return None


async def start_conversation(raw, request: Request) -> tuple[str, dict | None]:
    customer = await resolve_customer(request)
    if customer is None:
        customer = parse_customer(raw)
    opening = {"channel_id": os.environ["TRUPLEXY_CHANNEL_ID"]} if os.environ.get("TRUPLEXY_CHANNEL_ID") else {}
    if customer is not None:
        known = await api("PUT", "/customer", customer)
        if not isinstance(known.get("id"), str) or not known["id"]:
            raise Upstream("UPSTREAM_ERROR", None)
        opening["customer_id"] = known["id"]
    conv = (await api("POST", "/conversations", opening))["id"]
    name = customer.get("name", "") if customer else ""

    ticket = None
    try:
        if customer:
            await api("POST", f"/conversations/{conv}/messages", {"message": f"[Context only] Customer: {name}"})
    except Upstream:
        pass
    try:
        t = await api("POST", f"/conversations/{conv}/ticket", {"subject": f"Chat with {name}" if name else "Website chat"})
        ticket = {"id": t["id"], "subject": t.get("subject"), "status": t.get("status")}
    except Upstream:
        pass
    return conv, ticket


# Messages the visitor sees. Never pass on the API's own message.
ERRORS = {
    "CUSTOMER_CONFLICT": (409, "Your contact details could not be linked. Please contact support."),
    "CUSTOMER_EXISTS": (409, "Your contact details could not be saved. Please try again."),
    "NOT_CONFIGURED": (500, "Chat is not set up correctly."),
    "TENANT_SUSPENDED": (503, "Chat is turned off right now."),
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
    try:
        body = await request.json()
    except ValueError:
        return error("INVALID_REQUEST")
    if not isinstance(body, dict):
        return error("INVALID_REQUEST")
    action, conv = body.get("action"), verify(body.get("session"))
    try:
        if action == "message":
            text = str(body.get("text", "")).strip()
            if not 0 < len(text) <= 4000 or text.startswith("[Context only"):
                return error("INVALID_REQUEST")
            ticket = None
            if not conv:
                conv, ticket = await start_conversation(body.get("customer"), request)
            try:
                r = await api("POST", f"/conversations/{conv}/messages", {"message": text})
            except Upstream as e:
                if e.code != "CONVERSATION_NOT_FOUND" or not verify(body.get("session")):
                    raise
                conv, ticket = await start_conversation(body.get("customer"), request)
                r = await api("POST", f"/conversations/{conv}/messages", {"message": text})
            return {"session": sign(conv), "message": r["message"], "reply": r["reply"], "status": r["status"], "sources": r.get("sources", []), **({"ticket": ticket} if ticket else {})}
        if action == "history":
            if not conv:
                return {"session": None}
            return {"session": sign(conv), "conversation": public(await api("GET", f"/conversations/{conv}"))}
        if action == "handoff" and conv:
            return {"session": sign(conv), "conversation": public(await api("POST", f"/conversations/{conv}/handoff"))}
        if action == "profile":
            # The business and bot name and picture, and how the business set the window to look
            # (Truplexy dashboard: Integrations, Chat widget); the widget shows them.
            p = await api("GET", "/profile")
            business, bot, look = p.get("business", {}), p.get("bot", {}), p.get("widget")
            out = {
                "business": {"name": business.get("name"), "logo_url": business.get("logo_url")},
                "bot": {"id": bot.get("id"), "name": bot.get("name"), "avatar_url": bot.get("avatar_url")},
            }
            if isinstance(look, dict):
                out["widget"] = {k: look[k] for k in ("heading", "subtitle", "greeting", "placeholder", "accent", "theme", "position", "show_sources", "details", "picture_url") if k in look}
            return out
        if action == "live":
            if not conv:
                return {}
            t = await api("POST", "/realtime/token", {"conversation_id": conv})
            # Only the conversation's own topic: bot_topic carries every customer's messages.
            return {k: t[k] for k in ("url", "publishable_key", "conversation_topic") if k in t}
    except Upstream as e:
        if action == "history" and e.code == "CONVERSATION_NOT_FOUND":
            return {"session": None}
        if action == "live" and e.code == "REALTIME_NOT_CONFIGURED":
            return {}
        return error(e.code, e.request_id)
    except ValueError:
        return error("INVALID_REQUEST")
    return error("INVALID_REQUEST")`,
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
    if not msg.get("text") or not msg.get("from") or msg.get("sender_chat"):
        return
    r = await ask(f"tg:{msg['chat']['id']}:{msg['from']['id']}", msg["text"], {"contacts": [{"type": "telegram", "value": str(msg["from"]["id"])}]})
    if r["reply"]:
        await send_telegram(msg["chat"]["id"], r["reply"])


async def send_telegram(chat_id, text: str):
    async with httpx.AsyncClient() as http:
        await http.post(f"{TELEGRAM}/sendMessage", json={"chat_id": chat_id, "text": text})`,
      deliver: `await send_telegram(thread.split(":")[1], f"{agent}: {text}")`,
    },

    discord: {
      file: 'bot.py',
      handler: `# pip install discord.py — keeps a gateway connection open.
import hashlib
import os
import discord
import httpx
from truplexy import ask, call, conversation_for

intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)

TYPES = ("image/jpeg", "image/png", "image/webp")


async def upload_pictures(m: discord.Message, conversation_id: str) -> list[str]:
    """Pictures in a Discord message → Truplexy attachment IDs. Empty when pictures are off for this business."""
    pictures = [a for a in m.attachments if a.content_type in TYPES and a.size <= 20 * 1024 * 1024][:3]
    if not pictures:
        return []
    # Absent or enabled: false means the API or the plan can't read pictures: send the text only.
    if not (await call("/profile", method="GET")).get("attachments", {}).get("enabled"):
        return []
    ids = []
    # Storage, not Truplexy: use a plain client, because the one in truplexy.py carries your chat key.
    async with httpx.AsyncClient(timeout=60) as storage:
        for a in pictures:
            data = await a.read()
            # 1. Register it. The server reads the real bytes later; this is what you declare.
            reg = await call(f"/conversations/{conversation_id}/attachments", {
                "filename": a.filename, "content_type": a.content_type, "size": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            })
            # 2. PUT it to storage with exactly the headers returned.
            (await storage.put(reg["url"], headers=reg["headers"], content=data)).raise_for_status()
            ids.append(reg["attachment"]["id"])
    return ids


@client.event
async def on_message(m: discord.Message):
    if m.author.bot or not (m.content or m.attachments):
        return
    async with m.channel.typing():
        thread = f"dc:{m.channel.id}:{m.author.id}"
        customer = {"contacts": [{"type": "discord", "value": str(m.author.id)}]}
        try:
            attachments = await upload_pictures(m, await conversation_for(thread, customer))
        except Exception as e:  # answer the text instead
            print("pictures skipped:", getattr(e, "code", e))
            attachments = []
        if not (m.content or attachments):
            return
        # 3. Send the message, naming the pictures. Text may be empty, but it gives better answers.
        r = await ask(thread, m.content, customer, attachments=attachments)
    if r["reply"]:
        await m.reply(r["reply"])


# Run the webhook receiver in the same process (e.g. client.start() in FastAPI's lifespan).
client.run(os.environ["DISCORD_TOKEN"])`,
      deliver: `_, channel_id, _ = thread.split(":")
channel = client.get_channel(int(channel_id)) or await client.fetch_channel(int(channel_id))
await channel.send(f"**{agent}:** {text}")`,
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
    r = await ask(f"mail:{mail['From']}", f"{mail['Subject']}\\n\\n{mail['TextBody']}"[:4000], {"contacts": [{"type": "email", "value": mail["From"]}]})
    if r["reply"]:
        await send_email(to=mail["From"], subject=f"Re: {mail['Subject']}", text=r["reply"], in_reply_to=mail["MessageID"])`,
      deliver: `await send_email(to=thread.removeprefix("mail:"), subject="Re: your request", text=text)`,
    },

    api: {
      file: 'example.py',
      handler: `import asyncio
from truplexy import call, create_conversation


async def main():
    conv = await create_conversation({"contacts": [{"type": "app", "value": "user-42"}]})
    r = await call(f"/conversations/{conv['id']}/messages", {"message": "Where is my order?"})
    print(r["status"], r["reply"], r["sources"])

asyncio.run(main())`,
      deliver: `# Deliver the reply to the customer's thread on your platform.
await deliver(thread, text, agent)`,
    },
  },
};

export default pack;
