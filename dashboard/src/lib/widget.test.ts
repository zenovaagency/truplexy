import { describe, expect, it } from 'vitest';
import { WIDGET_COLOURS, WIDGET_DEFAULTS, cleanWidget, colourPreset, contrastOnWhite, lowContrast, previewable, sameWidget, widgetErrors } from './widget';

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

describe('the ready-made colours', () => {
  it('start with the default and keep white text readable', () => {
    expect(WIDGET_COLOURS[0].hex).toBe(WIDGET_DEFAULTS.accent);
    for (const c of WIDGET_COLOURS) {
      expect(widgetErrors({ ...WIDGET_DEFAULTS, accent: c.hex })).toEqual({});
      expect(contrastOnWhite(c.hex)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('match a saved code however it is written', () => {
    expect(colourPreset(' #2338E6 ')?.id).toBe('indigo');
    expect(colourPreset('#123456')).toBeUndefined();
  });

  it('warn about a light custom colour, not a half-typed one', () => {
    expect(contrastOnWhite('#ffffff')).toBeCloseTo(1);
    expect(contrastOnWhite('#000000')).toBeCloseTo(21);
    expect(lowContrast('#ffff00')).toBe(true);
    expect(lowContrast('#2338e6')).toBe(false);
    expect(lowContrast('#12')).toBe(false);
  });
});
