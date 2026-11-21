import type { APIRoute } from 'astro';
import { LIMITS, TEAM_SIZES, THANKS_PATH, TOPICS } from '../../data/demo-request';

/**
 * Receives the /demo form and passes it on to the team.
 *
 * The request is posted as JSON to the URL in DEMO_REQUEST_WEBHOOK_URL (set
 * it in the Vercel project's environment variables). The body carries the
 * request as `text` and as `content`, so a Slack incoming webhook, a Discord
 * webhook, or a Zapier/Make catch hook all accept it without setup.
 *
 * Works with and without JS: a plain form post is redirected to the thanks
 * page (or back to the form with ?error=…); a fetch() that asks for JSON gets
 * JSON back.
 */
export const prerender = false;

const topicIds = new Set<string>(TOPICS.map((t) => t.id));
const sizes = new Set<string>(TEAM_SIZES);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A person takes longer than this to fill in the form; bots usually don't. */
const MIN_FILL_MS = 2500;

type Failure = 'invalid' | 'unavailable' | 'failed';

export const POST: APIRoute = async ({ request, redirect }) => {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const fail = (error: Failure, status: number) =>
    wantsJson ? Response.json({ ok: false, error }, { status }) : redirect(`/demo?error=${error}#request`, 303);
  const done = () => (wantsJson ? Response.json({ ok: true }) : redirect(THANKS_PATH, 303));

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('invalid', 400);
  }
  const field = (name: string, max: number) => String(form.get(name) ?? '').trim().slice(0, max);

  // Bots: a hidden field people never see, and a form sent too fast. Both get a
  // normal-looking success so there's nothing to learn from the response.
  const started = Number(form.get('started'));
  if (field('fax', 200) || (Number.isFinite(started) && started > 0 && Date.now() - started < MIN_FILL_MS)) return done();

  const name = field('name', LIMITS.name);
  const email = field('email', LIMITS.email);
  const company = field('company', LIMITS.company);
  const teamSize = field('team_size', 20);
  const topic = field('topic', 20);
  const message = field('message', LIMITS.message);

  if (!name || !EMAIL.test(email) || (teamSize && !sizes.has(teamSize)) || (topic && !topicIds.has(topic))) {
    return fail('invalid', 400);
  }

  const webhook = process.env.DEMO_REQUEST_WEBHOOK_URL ?? import.meta.env.DEMO_REQUEST_WEBHOOK_URL;
  if (!webhook) return fail('unavailable', 503);

  const topicLabel = TOPICS.find((t) => t.id === topic)?.label ?? 'A walkthrough of Truplexy';
  const lines = [
    `New demo request: ${topicLabel}`,
    `Name: ${name}`,
    `Email: ${email}`,
    company && `Company: ${company}`,
    teamSize && `Team size: ${teamSize}`,
    message && `Message: ${message}`,
  ].filter(Boolean);
  // Discord caps a message at 2,000 characters.
  const text = lines.join('\n').slice(0, 1990);

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`webhook answered ${res.status}`);
  } catch (err) {
    console.error('demo-request: could not deliver', err);
    return fail('failed', 502);
  }
  return done();
};
