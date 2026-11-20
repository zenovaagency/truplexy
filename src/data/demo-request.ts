/**
 * The "Book a demo" / "Contact sales" request: the fields the form on /demo
 * sends and the server route (src/pages/api/demo-request.ts) checks. Shared so
 * the two can't drift.
 */

/** Why someone is getting in touch. `?topic=` on /demo preselects one. */
export const TOPICS = [
  { id: 'demo', label: 'A walkthrough of Truplexy' },
  { id: 'sales', label: 'Enterprise pricing and limits' },
  { id: 'other', label: 'Something else' },
] as const;

export type TopicId = (typeof TOPICS)[number]['id'];

export const TEAM_SIZES = ['Just me', '2–10', '11–50', '51–200', '200+'] as const;

/** Upper bounds on each field, in characters. */
export const LIMITS = { name: 120, email: 254, company: 160, message: 2000 } as const;

/**
 * Where a successful request lands. Kept out of search: it only makes sense
 * after sending the form.
 */
export const THANKS_PATH = '/demo/thanks';
