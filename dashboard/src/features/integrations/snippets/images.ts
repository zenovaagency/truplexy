import { PUBLIC_API, type Lang } from './types';

/**
 * "Sending pictures" for the chat API guide (image input, planned: the API does not
 * serve it yet, so the dashboard labels the section "Coming soon" until it does).
 *
 * Deliberately not part of the language packs: the public docs build their
 * channel guides from those, and nothing about pictures may appear there before
 * the feature is live. Each snippet builds on its pack's helper (truplexy.js,
 * truplexy.py, …) and is a complete script. `sdk/scripts/snippets.mjs` extracts
 * them next to the helpers so they can be run against the mock API.
 *
 * Every snippet follows the same three steps: register the picture, PUT it to
 * the returned URL with exactly the returned headers, send the message.
 */
export interface ImageSnippet {
  file: string;
  code: string;
}

export const IMAGE_SNIPPETS: Record<Lang, ImageSnippet> = {
  node: {
    file: 'send-picture.js',
    code: String.raw`// send-picture.js — runs on your server only (uses truplexy.js above).
//   node send-picture.js ./screenshot.png "This error appears when I log in"
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { call, createConversation } from "./truplexy.js";

const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/** Registers one picture, PUTs it to storage and returns the ID to send with the message. */
export async function uploadPicture(conversationId, path) {
  const bytes = await readFile(path);
  // 1. Register it. The server reads the real bytes later; this is what you declare.
  const reg = await call("/conversations/" + conversationId + "/attachments", {
    filename: basename(path),
    content_type: TYPES[extname(path).toLowerCase()],
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  // 2. PUT the file to storage within 15 minutes, with exactly the headers returned.
  //    This request goes to storage, not to Truplexy: never add your chat key to it.
  //    Retry a network error or a 5xx up to twice; a 4xx will not get better.
  const put = await fetch(reg.url, { method: reg.method, headers: reg.headers, body: bytes });
  if (!put.ok) throw new Error("Upload failed (" + put.status + ")");
  return reg.attachment.id;
}

const [path, text = ""] = process.argv.slice(2);
const conversation = await createConversation(null);
const attachment = await uploadPicture(conversation.id, path);
// 3. Send the message, naming the picture. Text may be empty, but it gives better answers.
const r = await call("/conversations/" + conversation.id + "/messages", { message: text, attachments: [attachment] });
console.log(r.status, r.reply);`,
  },

  python: {
    file: 'send_picture.py',
    code: String.raw`# send_picture.py — runs on your server only (uses truplexy.py above).
#   python send_picture.py ./screenshot.png "This error appears when I log in"
import asyncio
import hashlib
import pathlib
import sys

import httpx

from truplexy import call, create_conversation

TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


async def upload_picture(conversation_id: str, path: str) -> str:
    """Registers one picture, PUTs it to storage and returns the ID to send with the message."""
    file = pathlib.Path(path)
    data = file.read_bytes()
    # 1. Register it. The server reads the real bytes later; this is what you declare.
    reg = await call(f"/conversations/{conversation_id}/attachments", {
        "filename": file.name,
        "content_type": TYPES[file.suffix.lower()],
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    })
    # 2. PUT the file to storage within 15 minutes, with exactly the headers returned.
    #    This goes to storage, not to Truplexy: use a plain client, because the one in
    #    truplexy.py carries your chat key. Retry a network error or a 5xx up to twice.
    async with httpx.AsyncClient(timeout=60) as storage:
        res = await storage.put(reg["url"], headers=reg["headers"], content=data)
    res.raise_for_status()
    return reg["attachment"]["id"]


async def main(path: str, text: str = "") -> None:
    conversation = await create_conversation()
    attachment = await upload_picture(conversation["id"], path)
    # 3. Send the message, naming the picture. Text may be empty, but it gives better answers.
    r = await call(f"/conversations/{conversation['id']}/messages", {"message": text, "attachments": [attachment]})
    print(r["status"], r["reply"])


asyncio.run(main(*sys.argv[1:3]))`,
  },

  php: {
    file: 'send_picture.php',
    code: String.raw`<?php // send_picture.php — runs on your server only (uses truplexy.php above).
//   php send_picture.php ./screenshot.png "This error appears when I log in"
require __DIR__ . '/truplexy.php';

/** Registers one picture, PUTs it to storage and returns the ID to send with the message. */
function upload_picture(string $conversationId, string $path): string {
    $types = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
    $bytes = file_get_contents($path);
    // 1. Register it. The server reads the real bytes later; this is what you declare.
    $reg = truplexy("/conversations/$conversationId/attachments", [
        'filename' => basename($path),
        'content_type' => $types[strtolower(pathinfo($path, PATHINFO_EXTENSION))],
        'size' => strlen($bytes),
        'sha256' => hash('sha256', $bytes),
    ]);
    // 2. PUT the file to storage within 15 minutes, with exactly the headers returned.
    //    This goes to storage, not to Truplexy: never add your chat key to it.
    //    Retry a network error or a 5xx up to twice; a 4xx will not get better.
    $headers = [];
    foreach ($reg['headers'] as $name => $value) $headers[] = "$name: $value";
    $ch = curl_init($reg['url']);
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => 'PUT', CURLOPT_POSTFIELDS => $bytes, CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60]);
    curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($status < 200 || $status >= 300) throw new RuntimeException("Upload failed ($status)");
    return $reg['attachment']['id'];
}

[, $path, $text] = $argv + [null, null, ''];
$conversation = create_conversation();
$attachment = upload_picture($conversation['id'], $path);
// 3. Send the message, naming the picture. Text may be empty, but it gives better answers.
$r = truplexy("/conversations/{$conversation['id']}/messages", ['message' => $text, 'attachments' => [$attachment]]);
echo $r['status'], ' ', $r['reply'], "\n";`,
  },

  go: {
    file: 'send_picture.go',
    code: String.raw`// send_picture.go — runs on your server only. Put it beside truplexy.go (same package):
//   go run truplexy.go send_picture.go ./screenshot.png "This error appears when I log in"
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

var pictureTypes = map[string]string{".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}

// uploadPicture registers one picture, PUTs it to storage and returns the ID to send with the message.
func uploadPicture(conversationID, path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	// 1. Register it. The server reads the real bytes later; this is what you declare.
	var reg struct {
		Attachment struct{ ID string }
		URL, Method string
		Headers     map[string]string
	}
	err = call("/conversations/"+conversationID+"/attachments", map[string]any{
		"filename":     filepath.Base(path),
		"content_type": pictureTypes[strings.ToLower(filepath.Ext(path))],
		"size":         len(data),
		"sha256":       hex.EncodeToString(sum[:]),
	}, &reg)
	if err != nil {
		return "", err
	}
	// 2. PUT the file to storage within 15 minutes, with exactly the headers returned.
	//    This goes to storage, not to Truplexy: never add your chat key to it.
	//    Retry a network error or a 5xx up to twice; a 4xx will not get better.
	req, err := http.NewRequest(reg.Method, reg.URL, bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	for name, value := range reg.Headers {
		req.Header.Set(name, value)
	}
	res, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("upload failed (%d)", res.StatusCode)
	}
	return reg.Attachment.ID, nil
}

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: send_picture <picture> [text]")
	}
	text := ""
	if len(os.Args) > 2 {
		text = os.Args[2]
	}
	conversationID, err := createConversation(ConversationOptions{})
	if err != nil {
		log.Fatal(err)
	}
	attachment, err := uploadPicture(conversationID, os.Args[1])
	if err != nil {
		log.Fatal(err)
	}
	// 3. Send the message, naming the picture. Text may be empty, but it gives better answers.
	var r struct{ Status, Reply string }
	if err := call("/conversations/"+conversationID+"/messages", map[string]any{"message": text, "attachments": []string{attachment}}, &r); err != nil {
		log.Fatal(err)
	}
	fmt.Println(r.Status, r.Reply)
}`,
  },

  java: {
    file: 'SendPicture.java',
    code: String.raw`// SendPicture.java — runs on your server only (uses Truplexy.java above; Java 17+).
//   java SendPicture ./screenshot.png "This error appears when I log in"
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

public class SendPicture {
    static final Map<String, String> TYPES = Map.of(".jpg", "image/jpeg", ".jpeg", "image/jpeg", ".png", "image/png", ".webp", "image/webp");

    /** Registers one picture, PUTs it to storage and returns the ID to send with the message. */
    static String uploadPicture(String conversationId, Path path) throws Exception {
        byte[] data = Files.readAllBytes(path);
        String name = path.getFileName().toString();
        // 1. Register it. The server reads the real bytes later; this is what you declare.
        var reg = Truplexy.call("/conversations/" + conversationId + "/attachments", Map.of(
            "filename", name,
            "content_type", TYPES.get(name.substring(name.lastIndexOf('.')).toLowerCase()),
            "size", data.length,
            "sha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data))));
        // 2. PUT the file to storage within 15 minutes, with exactly the headers returned.
        //    This goes to storage, not to Truplexy: never add your chat key to it.
        //    Retry a network error or a 5xx up to twice; a 4xx will not get better.
        var put = HttpRequest.newBuilder(URI.create(reg.get("url").asText())).PUT(HttpRequest.BodyPublishers.ofByteArray(data));
        reg.get("headers").fields().forEachRemaining(h -> put.header(h.getKey(), h.getValue().asText()));
        var res = HttpClient.newHttpClient().send(put.build(), HttpResponse.BodyHandlers.discarding());
        if (res.statusCode() / 100 != 2) throw new RuntimeException("Upload failed (" + res.statusCode() + ")");
        return reg.get("attachment").get("id").asText();
    }

    public static void main(String[] args) throws Exception {
        String text = args.length > 1 ? args[1] : "";
        String conversationId = Truplexy.createConversation(null, null).get("id").asText();
        String attachment = uploadPicture(conversationId, Path.of(args[0]));
        // 3. Send the message, naming the picture. Text may be empty, but it gives better answers.
        var r = Truplexy.call("/conversations/" + conversationId + "/messages", Map.of("message", text, "attachments", List.of(attachment)));
        System.out.println(r.get("status").asText() + " " + r.path("reply").asText(""));
    }
}`,
  },

  csharp: {
    file: 'SendPicture.cs',
    code: String.raw`// SendPicture.cs — runs on your server only (uses Truplexy.cs above). Top-level statements, .NET 8+:
//   dotnet run -- ./screenshot.png "This error appears when I log in"
using System.Security.Cryptography;

var types = new Dictionary<string, string> { [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".png"] = "image/png", [".webp"] = "image/webp" };

// Registers one picture, PUTs it to storage and returns the ID to send with the message.
async Task<string> UploadPicture(string conversationId, string path)
{
    var data = await File.ReadAllBytesAsync(path);
    // 1. Register it. The server reads the real bytes later; this is what you declare.
    var reg = await Truplexy.Call($"/conversations/{conversationId}/attachments", new
    {
        filename = Path.GetFileName(path),
        content_type = types[Path.GetExtension(path).ToLowerInvariant()],
        size = data.Length,
        sha256 = Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant(),
    });
    // 2. PUT the file to storage within 15 minutes, with exactly the headers returned.
    //    This goes to storage, not to Truplexy: use a plain client, because Truplexy's carries your chat key.
    //    Retry a network error or a 5xx up to twice; a 4xx will not get better.
    using var storage = new HttpClient();
    using var put = new HttpRequestMessage(HttpMethod.Put, reg.GetProperty("url").GetString()) { Content = new ByteArrayContent(data) };
    foreach (var h in reg.GetProperty("headers").EnumerateObject())
        if (!put.Content.Headers.TryAddWithoutValidation(h.Name, h.Value.GetString())) put.Headers.TryAddWithoutValidation(h.Name, h.Value.GetString());
    using var res = await storage.SendAsync(put);
    res.EnsureSuccessStatusCode();
    return reg.GetProperty("attachment").GetProperty("id").GetString()!;
}

var conversationId = (await Truplexy.CreateConversation()).GetProperty("id").GetString()!;
var attachment = await UploadPicture(conversationId, args[0]);
// 3. Send the message, naming the picture. Text may be empty, but it gives better answers.
var r = await Truplexy.Call($"/conversations/{conversationId}/messages", new { message = args.Length > 1 ? args[1] : "", attachments = new[] { attachment } });
Console.WriteLine($"{r.GetProperty("status").GetString()} {r.GetProperty("reply").GetString()}");`,
  },

  ruby: {
    file: 'send_picture.rb',
    code: String.raw`# send_picture.rb — runs on your server only (uses truplexy.rb above).
#   ruby send_picture.rb ./screenshot.png "This error appears when I log in"
require "digest"
require_relative "truplexy"

TYPES = { ".jpg" => "image/jpeg", ".jpeg" => "image/jpeg", ".png" => "image/png", ".webp" => "image/webp" }.freeze

# Registers one picture, PUTs it to storage and returns the ID to send with the message.
def upload_picture(conversation_id, path)
  bytes = File.binread(path)
  # 1. Register it. The server reads the real bytes later; this is what you declare.
  reg = Truplexy.call("/conversations/#{conversation_id}/attachments", {
    filename: File.basename(path),
    content_type: TYPES.fetch(File.extname(path).downcase),
    size: bytes.bytesize,
    sha256: Digest::SHA256.hexdigest(bytes)
  })
  # 2. PUT the file to storage within 15 minutes, with exactly the headers returned.
  #    This goes to storage, not to Truplexy: never add your chat key to it.
  #    Retry a network error or a 5xx up to twice; a 4xx will not get better.
  uri = URI(reg["url"])
  put = Net::HTTP::Put.new(uri)
  reg["headers"].each { |name, value| put[name] = value }
  put.body = bytes
  res = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https") { |http| http.request(put) }
  raise "Upload failed (#{res.code})" unless res.is_a?(Net::HTTPSuccess)
  reg.dig("attachment", "id")
end

path, text = ARGV
conversation = Truplexy.create_conversation
attachment = upload_picture(conversation["id"], path)
# 3. Send the message, naming the picture. Text may be empty, but it gives better answers.
r = Truplexy.call("/conversations/#{conversation["id"]}/messages", { message: text.to_s, attachments: [attachment] })
puts "#{r["status"]} #{r["reply"]}"`,
  },
};

/** The same three steps with nothing but curl and a shell. */
export const IMAGE_CURL = String.raw`# Run on your server. Copy each returned value into the next command.
FILE=screenshot.png
SHA=$(sha256sum "$FILE" | cut -d' ' -f1)      # macOS: shasum -a 256 "$FILE" | cut -d' ' -f1
SIZE=$(wc -c < "$FILE")

# 1. Register the picture.
curl --fail-with-body -X POST ${PUBLIC_API}/conversations/$CONVERSATION_ID/attachments \
  -H "Authorization: Bearer $TRUPLEXY_CHAT_KEY" -H "Content-Type: application/json" \
  -d "$(printf '{"filename":"%s","content_type":"image/png","size":%s,"sha256":"%s"}' "$FILE" "$SIZE" "$SHA")"
# → {"attachment":{"id":"att_…","status":"pending",…},"url":"https://…","method":"PUT","headers":{"Content-Type":"image/png",…},"expires_at":"…"}

# 2. PUT the file to that url within 15 minutes, with exactly those headers.
#    No Authorization header: this goes to storage, not to Truplexy.
curl --fail-with-body -X PUT "<url from above>" -H "Content-Type: image/png" --data-binary @"$FILE"

# 3. Send the message, naming the picture. "message" may be empty.
curl --fail-with-body -X POST ${PUBLIC_API}/conversations/$CONVERSATION_ID/messages \
  -H "Authorization: Bearer $TRUPLEXY_CHAT_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-42-message-1" \
  -d '{"message":"This error appears when I log in","attachments":["<att_… from above>"]}'`;

/**
 * The browser-widget pattern. The browser never holds a chat key, so your server registers the
 * picture and hands the browser where to PUT it; the file goes straight to storage.
 */
export const IMAGE_WIDGET = {
  server: {
    file: 'server.js',
    code: String.raw`// server.js: npm i express @truplexy/server — your route; the chat key stays here.
import express from "express";
import { createChatClient } from "@truplexy/server";

const chat = createChatClient(); // TRUPLEXY_CHAT_KEY
const app = express();
app.use(express.json());

// 1. The browser sends the picture's details. You register them and hand back where to PUT.
app.post("/api/pictures", async (req, res) => {
  const conversationId = await conversationFor(req); // your own lookup of this visitor's conversation
  const { filename, content_type, size, sha256 } = req.body;
  // Only these four fields; Truplexy checks them. Add your own sign-in and rate limit here.
  const target = await chat.registerImage(conversationId, { filename, content_type, size, sha256 });
  res.json(target); // { attachmentId, url, headers, … }: nothing secret
});

// 3. After the browser's PUT, send the message with the picture IDs.
app.post("/api/message", async (req, res) => {
  const conversationId = await conversationFor(req);
  const { text, attachments } = req.body;
  const r = await chat.sendMessage(conversationId, { text, attachments, idempotencyKey: req.get("Idempotency-Key") });
  res.json({ reply: r.reply, status: r.status });
});`,
  },
  browser: {
    file: 'browser.js',
    code: String.raw`// browser.js: npm i @truplexy/web — runs on your page; no key here.
import { uploadImage } from "@truplexy/web";

const register = (details) =>
  fetch("/api/pictures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details) }).then((r) => r.json());

async function sendWithPictures(files, text) {
  // 2. Hash each file, have your server register it, then PUT it straight to storage.
  //    uploadImage sends exactly the returned headers, no cookies and no Authorization,
  //    and retries a network error or a 5xx twice.
  const attachments = await Promise.all(files.map((file) => uploadImage(file, register)));
  const res = await fetch("/api/message", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ text, attachments }),
  });
  return res.json();
}`,
  },
};

/** Shown as a table: what pictures may be and what the server does to them. */
export const IMAGE_LIMITS: readonly (readonly [string, string])[] = [
  ['Pictures per message', '1 to 3.'],
  ['Types', 'JPEG, PNG and WebP. Animated WebP, GIF, SVG, HEIC and PDF are refused.'],
  ['Upload size', 'Up to 20 MB (20,971,520 bytes). A bigger picture is refused with IMAGE_TOO_LARGE.'],
  ['Dimensions', '8 to 16,384 pixels on each side, and small enough to decode within the server’s memory limit.'],
  ['What the server does', 'Reads the real bytes, not the declared type. Turns the picture upright using its EXIF orientation, removes all metadata (including location), puts transparency on a white background, scales the long edge to at most 1280 px, and stores a JPEG of at most 1 MiB. Big uploads are compressed, not rejected.'],
  ['What you get back', 'width, height and size describe the stored copy, never the file you uploaded. content_type is always image/jpeg.'],
];

/** Behaviour notes, in the order a developer meets them. */
export const IMAGE_NOTES: readonly string[] = [
  'The assistant sees a picture only in the reply to the message that carried it. Later turns see a short note that a picture was sent, plus the assistant’s own earlier answer. A customer who needs a second look should send the picture again.',
  'message may be empty when pictures are sent, but text gives better answers: knowledge retrieval searches on the text.',
  'An attachment belongs to one message. It must be sent within an hour of being registered; after that, or once sent, it answers 404 ATTACHMENT_NOT_FOUND. Sending before the PUT has finished is 409 ATTACHMENT_NOT_UPLOADED: finish the upload and send again.',
  'Registration checks only the details you declare. The picture itself is read, checked and shrunk when the message arrives, so a bad file fails that call before anything is stored or any tokens are spent. The failed attachment can’t be reused: register a new one.',
  'A message’s attachments[].url is a signed link for showing the picture (it works in an img tag) and is valid for 1 hour. Never store it or log it; fetch the conversation again for a fresh one.',
  'Pictures are deleted with their conversation, and with a deleted business. A conversation with a ticket keeps its pictures while the ticket exists.',
  'Each picture costs roughly 250–1,500 input tokens, depending on the model that answers, counted with the rest of the message’s tokens.',
  'A message that only says it carried a picture, such as “[sent an attachment in Discord]”, with no attachments, is handled as before: the assistant asks the customer to describe it. Sending the real pictures through attachments replaces the need for that.',
];

/** Feature check: read `attachments` from GET /profile. */
export const IMAGE_FEATURE_CHECK = String.raw`// Run on your server. Absent means the API doesn't serve pictures: hide the attach button.
const { attachments } = await chat.getProfile();
const canAttach = attachments?.enabled === true;
// With enabled: true, attachments also carries max_bytes, max_per_message and content_types:
// use those for your limits instead of copying them. The reason (plan or model) isn't revealed.
// GET /profile may be cached: Cache-Control: private, max-age=60.`;

/** What each error means and what to do about it. `code` is what to match on, never the text. */
export const IMAGE_ERRORS: readonly (readonly [string, string, string])[] = [
  ['UNSUPPORTED_IMAGE_TYPE', '400', 'The file isn’t a JPEG, PNG or WebP picture. Ask for another file.'],
  ['INVALID_IMAGE', '400', 'The file can’t be read, is under 8 px or over 16,384 px on a side, or is too big to open safely. Ask for another file; message says why.'],
  ['IMAGE_TOO_LARGE', '413', 'The picture is over 20 MB, or can’t be shrunk under 1 MiB without ruining it. Ask for a smaller or simpler picture.'],
  ['ATTACHMENT_NOT_UPLOADED', '409', 'The message names a picture whose PUT hadn’t finished. Wait for it, then send again.'],
  ['ATTACHMENT_NOT_FOUND', '404', 'The attachment expired (an hour), was already sent, or belongs to another conversation. Register and upload that picture again, then send.'],
  ['PLAN_LIMIT_REACHED', '403', 'With limit "image_input": the plan has no picture input. Hide the attach button. Other limits keep their usual meaning.'],
  ['FEATURE_UNAVAILABLE', '400', 'No assistant model can read pictures right now. Hide the attach button.'],
];

/** The two calls the picture flow adds to the chat API. */
export const IMAGE_ENDPOINTS: readonly (readonly [string, string, string, string])[] = [
  ['POST', '/conversations/{id}/attachments', 'registerImage(id, image) / uploadImage(id, image)', 'Register a picture {filename, content_type, size, sha256}; 201 with a presigned url, method, headers and expires_at.'],
  ['POST', '/conversations/{id}/messages', 'sendMessage(id, {text, images})', 'Add attachments: ["att_…"] (1–3). message may then be empty.'],
];
