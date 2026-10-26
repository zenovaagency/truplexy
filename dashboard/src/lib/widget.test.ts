import { describe, expect, it } from 'vitest';
import { WIDGET_DEFAULTS, cleanWidget, previewable, sameWidget, widgetErrors } from './widget';

describe('the chat widget settings', () => {
  it('applies the API rules before asking', () => {
    expect(widgetErrors(WIDGET_DEFAULTS)).toEqual({});
    expect(widgetErrors({ ...WIDGET_DEFAULTS, accent: 'red' }).accent).toBeTruthy();
    expect(widgetErrors({ ...WIDGET_DEFAULTS, accent: '#fff' }).accent).toBeTruthy();
    expect(widgetErrors({ ...WIDGET_DEFAULTS, heading: 'é'.repeat(60) })).toEqual({});
    expect(widgetErrors({ ...WIDGET_DEFAULTS, heading: 'é'.repeat(61) }).heading).toBeTruthy();
    expect(widgetErrors({ ...WIDGET_DEFAULTS, greeting: 'x'.repeat(301) }).greeting).toBeTruthy();
    expect(widgetErrors({ ...WIDGET_DEFAULTS, subtitle: 'x'.repeat(101) }).subtitle).toBeTruthy();
    expect(widgetErrors({ ...WIDGET_DEFAULTS, placeholder: 'x'.repeat(81) }).placeholder).toBeTruthy();
  });

  it('cleans what the form leaves', () => {
    expect(cleanWidget({ ...WIDGET_DEFAULTS, heading: '  Acme  ', accent: ' #AABBCC ' })).toMatchObject({ heading: 'Acme', accent: '#aabbcc' });
  });

  it('compares what would be saved, ignoring spaces and case', () => {
    expect(sameWidget({ ...WIDGET_DEFAULTS, heading: ' Hi ', accent: '#2338E6' }, { ...WIDGET_DEFAULTS, heading: 'Hi' })).toBe(true);
    expect(sameWidget({ ...WIDGET_DEFAULTS, heading: 'Hi' }, WIDGET_DEFAULTS)).toBe(false);
  });

  it('previews a half-typed value as the default instead of breaking the preview', () => {
    const shown = previewable({ ...WIDGET_DEFAULTS, accent: '#12', heading: 'Acme' });
    expect(shown.accent).toBe(WIDGET_DEFAULTS.accent);
    expect(shown.heading).toBe('Acme');
  });
});
