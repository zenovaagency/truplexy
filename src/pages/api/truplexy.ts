import type { APIRoute } from 'astro';
import { createHandler } from '../../../sdk/packages/server/src/index';

/**
 * The route behind the site's own chat widget (see BubblyChat.astro).
 *
 * The widget never holds a key: it posts here, and this route holds the chat
 * key (TRUPLEXY_CHAT_KEY, from the dashboard under Integrations → Website
 * chat) and talks to the Truplexy API. Set it in the Vercel project's
 * environment variables for the site. TRUPLEXY_SESSION_SECRET is optional (it
 * falls back to the chat key).
 *
 * Without the key this answers 503, and BubblyChat stays in demo mode, so the
 * site works the same until the key is set.
 */
export const prerender = false;

// No allowedOrigins: the widget calls this route from the same origin, and an
// allow-list would also lock out preview deployments and local development.
const handle = createHandler({
  chatKey: process.env.TRUPLEXY_CHAT_KEY ?? import.meta.env.TRUPLEXY_CHAT_KEY,
});

export const POST: APIRoute = ({ request }) => {
  if (!(process.env.TRUPLEXY_CHAT_KEY ?? import.meta.env.TRUPLEXY_CHAT_KEY)) {
    return Response.json({ error: { code: 'NOT_CONFIGURED', message: 'Chat is not set up yet.' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return handle(request);
};
