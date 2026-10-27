import type { WidgetSettings } from '@/lib/api/types';

/* The chat widget setting (API_REFERENCE.md → "Chat widget (2026-10-26)"): one look for every place the chat is shown. */

/** What the window shows until the business changes it; GET /widget returns the same as `defaults`. */
export const WIDGET_DEFAULTS: WidgetSettings = {
  heading: '',
  subtitle: '',
  greeting: '',
  placeholder: '',
  accent: '#2338e6',
  theme: 'light',
  position: 'right',
  show_sources: false,
  details: 'ask',
  suggestions: [],
};

/**
 * Ready-made colours to pick from; any other code is a custom colour. The widget writes white on the
 * colour, so each of these keeps white text readable (4.5:1 or better). The first is the default.
 */
export const WIDGET_COLOURS = [
  { id: 'indigo', name: 'Indigo', hex: '#2338e6' },
  { id: 'ocean', name: 'Ocean', hex: '#0369a1' },
  { id: 'teal', name: 'Teal', hex: '#0f766e' },
  { id: 'forest', name: 'Forest', hex: '#15803d' },
  { id: 'amber', name: 'Amber', hex: '#b45309' },
  { id: 'rose', name: 'Rose', hex: '#be123c' },
  { id: 'plum', name: 'Plum', hex: '#7e22ce' },
  { id: 'graphite', name: 'Graphite', hex: '#1f2937' },
] as const;

/** The ready-made colour this code is, if it is one. */
export const colourPreset = (accent: string) => WIDGET_COLOURS.find((c) => c.hex === accent.trim().toLowerCase());

const isHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s.trim());

/** How well white text reads on this colour, as a WCAG contrast ratio (1 to 21). */
export function contrastOnWhite(hex: string): number {
  const n = parseInt(hex.trim().slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

/** A colour the widget's white text is hard to read on. Only a warning: the API takes any colour. */
export const lowContrast = (hex: string) => isHex(hex) && contrastOnWhite(hex) < 3;

/** The longest each text may be, in characters. */
export const WIDGET_LIMITS = { heading: 60, subtitle: 100, greeting: 300, placeholder: 80 } as const;

/** How many suggested questions the window shows, and how long each may be. */
export const MAX_SUGGESTIONS = 4;
export const SUGGESTION_LIMIT = 80;

/** The questions as the API keeps them: on one line, trimmed, without empty or repeated ones (ignoring case). */
export function cleanSuggestions(list: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const q = raw.replace(/\s+/g, ' ').trim();
    if (q && !seen.has(q.toLowerCase())) {
      seen.add(q.toLowerCase());
      out.push(q);
    }
  }
  return out;
}

/** The same rules the API applies, so a form can say what is wrong before it asks. */
export function widgetErrors(s: WidgetSettings): Partial<Record<keyof WidgetSettings, string>> {
  const out: Partial<Record<keyof WidgetSettings, string>> = {};
  for (const [key, max] of Object.entries(WIDGET_LIMITS) as [keyof typeof WIDGET_LIMITS, number][]) {
    if ([...s[key].trim()].length > max) out[key] = `Keep this to ${max} characters.`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s.accent.trim())) out.accent = 'Pick a colour, such as #2338e6.';
  const questions = cleanSuggestions(s.suggestions);
  if (questions.some((q) => [...q].length > SUGGESTION_LIMIT)) out.suggestions = `Keep each question to ${SUGGESTION_LIMIT} characters.`;
  else if (questions.length > MAX_SUGGESTIONS) out.suggestions = `Keep to ${MAX_SUGGESTIONS} questions.`;
  return out;
}

/** The settings as the API stores them: trimmed, as the form leaves them. */
export const cleanWidget = (s: WidgetSettings): WidgetSettings => ({
  ...s,
  heading: s.heading.trim(),
  subtitle: s.subtitle.trim(),
  greeting: s.greeting.trim(),
  placeholder: s.placeholder.trim(),
  accent: s.accent.trim().toLowerCase(),
  suggestions: cleanSuggestions(s.suggestions),
});

/** The same settings, comparable: what the form would save. */
export const sameWidget = (a: WidgetSettings, b: WidgetSettings) => JSON.stringify(cleanWidget(a)) === JSON.stringify(cleanWidget(b));

/** The settings with the fields that don't pass their rules put back to the defaults, so a half-typed value doesn't break a preview. */
export function previewable(s: WidgetSettings): WidgetSettings {
  const errors = widgetErrors(s);
  const out = { ...cleanWidget(s) } as Record<string, unknown>;
  for (const key of Object.keys(errors) as (keyof WidgetSettings)[]) out[key] = WIDGET_DEFAULTS[key];
  return out as unknown as WidgetSettings;
}
