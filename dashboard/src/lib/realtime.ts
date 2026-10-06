import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { useRealtimeInfo } from '@/lib/api/endpoints/bot';
import { env } from '@/lib/env';
import { getSupabase } from '@/lib/auth/supabase';
import { qk } from '@/lib/query-keys';
import { useScopeCtx } from '@/lib/session/scope-context';

export type LiveStatus = 'connecting' | 'live' | 'polling' | 'off';

export interface LiveEvent {
  event: string;
  payload: { id?: string; type?: string; created_at?: string; data?: Record<string, unknown> };
}

/**
 * Subscribes to the bot's live topic and treats each event as a prompt to
 * refetch through the API. With live updates off on the server (503), the
 * 2-minute poll in the ticket queries is the fallback.
 */
export function useLiveUpdates(onEvent?: (e: LiveEvent) => void): LiveStatus {
  const { scope, can } = useScopeCtx();
  const enabled = can('tickets.read');
  const qc = useQueryClient();
  const info = useRealtimeInfo(enabled);
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    if (!enabled) return setStatus('off');
    if (info.isError) return setStatus('polling');
    if (!info.data) return setStatus('connecting');

    const handle = (e: LiveEvent) => {
      if (e.event.startsWith('ticket.') || e.event === 'message.created') {
        qc.invalidateQueries({ queryKey: qk.bot(scope, 'tickets') });
        qc.invalidateQueries({ queryKey: qk.bot(scope, 'support-stats') });
      }
      if (e.event === 'conversation.updated' || e.event.startsWith('ticket.')) {
        qc.invalidateQueries({ queryKey: qk.bot(scope, 'handoffs') });
      }
      onEvent?.(e);
    };

    const { url, publishable_key, bot_topic } = info.data;
    let cleanup = () => {};
    let cancelled = false;

    // The env check is static, so production builds drop the mock branch entirely.
    if (import.meta.env.VITE_USE_MOCKS === 'true' && url.startsWith('mock:')) {
      void import('@/lib/api/mock/transport').then(({ subscribeMockEvents }) => {
        if (cancelled) return;
        cleanup = subscribeMockEvents(bot_topic, handle);
        setStatus('live');
      });
    } else {
      // Same project as sign-in: reuse that client. Otherwise make one for this URL.
      const client: Promise<SupabaseClient> =
        url === env.supabaseUrl
          ? getSupabase()
          : import('@supabase/supabase-js').then(({ createClient }) => createClient(url, publishable_key));
      void client.then((sb) => {
        if (cancelled) return;
        const channel: RealtimeChannel = sb
          .channel(bot_topic)
          .on('broadcast', { event: '*' }, ({ event, payload }) => handle({ event, payload }))
          .subscribe((s) => {
            if (s === 'SUBSCRIBED') setStatus('live');
            else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('polling');
          });
        cleanup = () => void sb.removeChannel(channel);
      });
    }

    return () => {
      cancelled = true;
      cleanup();
    };
    // onEvent is intentionally not a dependency: resubscribing per render would drop events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, info.data, info.isError, scope.tenant, scope.bot, qc]);

  return status;
}
