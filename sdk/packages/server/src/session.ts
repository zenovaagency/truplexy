/**
 * Widget sessions: a conversation ID the visitor's browser may use, signed so
 * nobody can swap in someone else's. The token is
 *
 *   base64url("<conversation_id>.<issued_at>") + "." + base64url(HMAC-SHA256(secret, "<conversation_id>.<issued_at>"))
 *
 * with `issued_at` in Unix seconds. See PROTOCOL.md for other languages.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const keys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string) {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keys.set(secret, key);
  }
  return key;
}

/** Signs a session for `conversationId`, issued at `now` (milliseconds). */
export async function signSession(conversationId: string, secret: string, now = Date.now()): Promise<string> {
  const payload = encoder.encode(`${conversationId}.${Math.floor(now / 1000)}`);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), payload));
  return `${base64url(payload)}.${base64url(signature)}`;
}

/** The conversation ID of a valid, unexpired session, or null. `ttl` is in seconds. */
export async function verifySession(token: unknown, secret: string, ttl: number, now = Date.now()): Promise<string | null> {
  if (typeof token !== 'string' || token.length > 512) return null;
  const [p, s, extra] = token.split('.');
  if (!p || !s || extra !== undefined) return null;
  const payload = fromBase64url(p);
  const signature = fromBase64url(s);
  if (!payload || !signature) return null;
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), signature as BufferSource, payload as BufferSource);
  if (!valid) return null;
  const match = /^(conv_[0-9a-f]{32})\.(\d{1,12})$/.exec(decoder.decode(payload));
  if (!match) return null;
  const age = now / 1000 - Number(match[2]);
  if (age > ttl || age < -300) return null;
  return match[1];
}
