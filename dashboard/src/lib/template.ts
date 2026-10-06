/**
 * Renders a prompt template body the way the API does, for previews:
 *   {{#key}}…{{/key}} keeps its text only when `key` has a value (no nesting);
 *   {{key}} becomes the key's value, unknown keys become empty.
 */
export function renderTemplate(body: string, values: Record<string, string | undefined>) {
  const has = (k: string) => Boolean(values[k]?.trim());
  return body
    .replace(/\{\{#([a-z][a-z0-9_]*)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key: string, inner: string) => (has(key) ? inner : ''))
    .replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_, key: string) => values[key] ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Every variable key a body references, in order of first use. */
export function templateKeys(body: string) {
  const keys = new Set<string>();
  for (const m of body.matchAll(/\{\{[#/]?([a-z][a-z0-9_]*)\}\}/g)) keys.add(m[1]!);
  return [...keys];
}

/** Built-in variables the API fills itself. */
export const BUILTIN_VARIABLES = ['business_name', 'assistant_name'] as const;
