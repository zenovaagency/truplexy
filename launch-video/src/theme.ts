/**
 * Brand tokens, copied from the site's src/styles/tokens.css so the film and
 * the product share one palette. The film is white-themed throughout.
 */
export const C = {
  white: '#FFFFFF',
  paper: '#F7F8FC',
  surface2: '#F1F3FA',
  surface3: '#E9ECF6',

  ink: '#0E1222',
  inkMuted: '#4A5068',
  inkFaint: '#61688A',

  line: '#E3E6F0',
  lineStrong: '#CBD0E0',

  accent: '#2338E6',
  accentSoft: '#EEF0FF',

  cyan: '#45D4FF',
  blue: '#1F7BFF',
  indigo: '#2338E6',
  violet: '#6A2BFF',
  lilac: '#D9B8FF',

  live: '#15803D',
  liveSoft: '#E6F6EB',
  human: '#9A4B00',
  humanSoft: '#FFF1DD',
  danger: '#B42318',
  dangerSoft: '#FDECEB',
} as const;

export const GRADIENT_BRAND = `linear-gradient(100deg, ${C.cyan} 0%, ${C.blue} 38%, ${C.indigo} 62%, ${C.violet} 100%)`;
/** Text-safe: no cyan, so the palest stop still reads on white. */
export const GRADIENT_TEXT = `linear-gradient(95deg, ${C.blue} 0%, ${C.indigo} 45%, ${C.violet} 100%)`;

export const SHADOW = {
  sm: '0 1px 2px rgb(14 18 34 / 0.04), 0 2px 8px rgb(14 18 34 / 0.04)',
  md: '0 2px 4px rgb(14 18 34 / 0.04), 0 12px 32px rgb(35 56 230 / 0.07)',
  lg: '0 4px 10px rgb(14 18 34 / 0.05), 0 28px 64px rgb(35 56 230 / 0.10)',
  xl: '0 8px 20px rgb(14 18 34 / 0.06), 0 48px 110px rgb(35 56 230 / 0.14)',
} as const;

export const FONT = {
  sans: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
  mono: "'Geist Mono', ui-monospace, monospace",
} as const;

export const RADIUS = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32 } as const;
