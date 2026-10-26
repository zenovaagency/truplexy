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
};

/** The longest each text may be, in characters. */
export const WIDGET_LIMITS = { heading: 60, subtitle: 100, greeting: 300, placeholder: 80 } as const;

/** The same rules the API applies, so a form can say what is wrong before it asks. */
export function widgetErrors(s: WidgetSettings): Partial<Record<keyof WidgetSettings, string>> {
  const out: Partial<Record<keyof WidgetSettings, string>> = {};
  for (const [key, max] of Object.entries(WIDGET_LIMITS) as [keyof typeof WIDGET_LIMITS, number][]) {
    if ([...s[key].trim()].length > max) out[key] = `Keep this to ${max} characters.`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s.accent.trim())) out.accent = 'Pick a colour, such as #2338e6.';
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
