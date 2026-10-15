/**
 * Which crawlers may fetch the site, in two lists that stay separate so that
 * allowing search never implies allowing model training. Read by
 * src/pages/robots.txt.ts (which writes robots.txt) and by
 * scripts/verify-seo.mjs (which checks the built file against these lists).
 * Keep this file free of imports: the script loads it directly with Node.
 *
 * - SEARCH_CRAWLERS fetch pages to show them (or cite them) in results:
 *   Google Search and AI Overviews, Bing, ChatGPT Search, Perplexity, Claude
 *   search, Apple and DuckDuckGo. Allowed everywhere, on purpose, so Truplexy
 *   can be found and cited. The "-User" agents fetch a page when a person asks
 *   an assistant about it; some vendors apply them regardless of robots.txt.
 * - TRAINING_CRAWLERS collect content to train models. Blocked until the team
 *   decides otherwise: move a name to SEARCH_CRAWLERS to allow it. Blocking
 *   them does not touch search ranking; Google-Extended, for one, is separate
 *   from Googlebot and does not affect Google Search or AI Overviews.
 */
export const SEARCH_CRAWLERS = [
  'Googlebot',
  'Bingbot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-SearchBot',
  'Claude-User',
  'Applebot',
  'DuckDuckBot',
];

export const TRAINING_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Bytespider',
  'Meta-ExternalAgent',
  'cohere-ai',
];

