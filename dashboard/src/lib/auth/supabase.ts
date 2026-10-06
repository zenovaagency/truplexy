import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

let client: Promise<SupabaseClient> | null = null;

/**
 * The Supabase client, loaded on first use so mock mode never downloads it.
 * Only the publishable key is used here; the API verifies the session's
 * access token itself.
 */
export function getSupabase() {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(env.supabaseUrl, env.supabaseKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        // /auth/callback completes sign-in explicitly, so the code is exchanged exactly once.
        detectSessionInUrl: false,
      },
    }),
  );
  return client;
}
