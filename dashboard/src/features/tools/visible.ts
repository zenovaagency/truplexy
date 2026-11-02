import type { Tool } from '@/lib/api/types';

/**
 * Built-in tools that aren't set up (no store connected, no query types) are left out of the Tools tab.
 * The business's own API tools always show, so a broken one can still be fixed or deleted.
 */
export const isShown = (t: Tool) => t.available || !t.built_in;
