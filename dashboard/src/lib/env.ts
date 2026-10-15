const trim = (s: string) => s.replace(/\/+$/, '');

/** Browser-safe configuration. See .env.example. */
export const env = {
  apiBaseUrl: trim(import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/v3'),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  dashboardUrl: trim(import.meta.env.VITE_DASHBOARD_URL || window.location.origin),
  useMocks: import.meta.env.VITE_USE_MOCKS === 'true',
  /** Paddle.js client-side token (test_… in sandbox, live_… in production). Safe to ship. */
  paddleToken: import.meta.env.VITE_PADDLE_CLIENT_TOKEN || '',
  paddleEnv: import.meta.env.VITE_PADDLE_ENV === 'production' ? 'production' : 'sandbox',
} as const;

export const authConfigured = env.useMocks || Boolean(env.supabaseUrl && env.supabaseKey);
