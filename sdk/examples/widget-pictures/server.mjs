// A website that lets visitors send pictures. Your server holds the chat key; the browser never does.
//
//   1. npm run build                                   (from sdk/: builds @truplexy/server and @truplexy/web)
//   2. IMAGES=1 node playground/mock-api.mjs           (or point TRUPLEXY_API_BASE at the real API)
//   3. TRUPLEXY_CHAT_KEY=test TRUPLEXY_API_BASE=http://localhost:4301/v3 node examples/widget-pictures/server.mjs
//   4. open http://localhost:4302
//
// The flow: the browser describes the picture, this server registers it, the browser PUTs the file
// straight to storage, and this server sends the message with the attachment ID.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createChatClient, TruplexyApiError } from "@truplexy/server";

const chat = createChatClient();
const page = await readFile(new URL("./index.html", import.meta.url));
// In your own site, import from "@truplexy/web" through your bundler instead of serving the file.
const web = await readFile(new URL("../../packages/web/dist/index.js", import.meta.url));

// One visitor, for the demo. A real route keeps a conversation per visitor (see createHandler in @truplexy/server).
let conversationId;
const conversation = async () => (conversationId ??= (await chat.createConversation()).id);

const send = (res, status, body, type = "application/json") =>
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" }).end(type === "application/json" ? JSON.stringify(body) : body);
const readJson = async (req) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
};

export const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") return send(res, 200, page, "text/html; charset=utf-8");
    if (req.method === "GET" && req.url === "/web.js") return send(res, 200, web, "text/javascript");
    if (req.method === "GET" && req.url === "/api/config") return send(res, 200, await chat.getAttachmentConfig());

    if (req.method === "POST" && req.url === "/api/pictures") {
      // Step 1. Add your own sign-in and rate limit here. Pass on only these four fields; Truplexy checks them.
      const { filename, content_type, size, sha256 } = await readJson(req);
      return send(res, 200, await chat.registerImage(await conversation(), { filename, content_type, size, sha256 }));
    }

    if (req.method === "POST" && req.url === "/api/message") {
      // Step 3. The browser's PUT has finished; name the pictures in the message.
      const { text, attachments } = await readJson(req);
      const r = await chat.sendMessage(await conversation(), { text, attachments, idempotencyKey: req.headers["idempotency-key"] });
      return send(res, 200, { status: r.status, reply: r.reply });
    }
    send(res, 404, { error: { code: "NOT_FOUND" } });
  } catch (e) {
    // Pass on the code and request ID, not the API's own wording, which is for your logs.
    if (e instanceof TruplexyApiError) return send(res, e.status >= 500 ? 502 : e.status, { error: { code: e.code, request_id: e.requestId } });
    send(res, 500, { error: { code: "INTERNAL_ERROR" } });
  }
});

const port = Number(process.env.PORT ?? 4302);
server.listen(port, () => console.log(`Open http://localhost:${port}`));
