// Sends a picture and a question to the assistant. Runs on your server only: it uses the chat key.
//
//   TRUPLEXY_CHAT_KEY=tpx_… node examples/send-picture.mjs ./screenshot.png "This error appears when I log in"
//
// Against the mock API (no key needed):
//   IMAGES=1 node playground/mock-api.mjs
//   TRUPLEXY_CHAT_KEY=test TRUPLEXY_API_BASE=http://localhost:4301/v3 node examples/send-picture.mjs examples/sample.png "Is this OK?"
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createChatClient, TruplexyApiError } from "@truplexy/server";

const [path, text = ""] = process.argv.slice(2);
if (!path) {
  console.error("Usage: node examples/send-picture.mjs <picture> [text]");
  process.exit(2);
}

const chat = createChatClient(); // TRUPLEXY_CHAT_KEY, optional TRUPLEXY_API_BASE

// Image input is planned: ask first. `enabled` is false until the API serves it, and for plans without it.
const pictures = await chat.getAttachmentConfig();
if (!pictures.enabled) console.log("Pictures are not available for this bot, so only the text is sent.");

const conversation = await chat.createConversation();
try {
  // One call: upload the picture (hash, register, PUT with the exact headers, retried twice), then send.
  const bytes = await readFile(path);
  const result = await chat.sendMessage(
    conversation.id,
    pictures.enabled ? { text, images: [{ data: bytes, filename: basename(path) }], idempotencyKey: `example-${Date.now()}` } : text,
  );
  console.log(result.status, result.reply);
} catch (e) {
  // Match on the code, never the text. Keep the request ID for support.
  if (!(e instanceof TruplexyApiError)) throw e;
  console.error(`${e.code}${e.limit ? ` (${e.limit})` : ""} — request ${e.requestId ?? "unknown"}`);
  process.exitCode = 1;
}
