import { useRef } from 'react';
import { Activity, AlertTriangle, Gauge, MessageSquareText, SearchX, Timer, Zap } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { isApiError } from '@/lib/api/client';
import type { PerformanceStats } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';
import { formatNumber, formatPercent } from '@/lib/format';
import { ERROR_RATE_WARN, formatLatency, hasActivity, isHigh, isRouteMissing, sampleNote, SERVER_ERROR_RATE_WARN } from '@/lib/performance';
import { Button, Card, EmptyState, Skeleton } from '@/components/ui';
import { Callout } from '@/components/ui';
import { StatCard } from '@/components/domain/StatCard';
import { NotFound } from '@/app/errors';
import { BusiestBusinesses, ModelTable, Off, REQUESTS_OFF, ReplyTime, RequestsOverTime, RetrievalBreakdown, RetrievalQuality, RouteTable } from './sections';

type Variant = 'business' | 'platform';

const OFF = '—';

/** The headline numbers. Request figures read "Not recorded" when the server isn't storing requests. */
function Headline({ s, variant, loading }: { s?: PerformanceStats; variant: Variant; loading: boolean }) {
  const http = s?.recording.http ?? true;
  const notRecorded = 'Request statistics are off on this server.';
  const r = s?.requests;
  const platform = variant === 'platform';

  const requests = (
    <StatCard
      key="requests"
      label="Requests"
      icon={<Activity />}
      loading={loading}
      value={http ? formatNumber(r?.total) : OFF}
      sub={s && (http ? `${formatNumber(r?.errors)} errors · ${formatNumber(r?.server_errors)} server errors` : notRecorded)}
      info={
        platform
          ? 'Includes requests no business could be identified for (a rejected key, an unknown route), so it is higher than the sum of the businesses.'
          : 'HTTP requests the API handled for this scope.'
      }
    />
  );
  const rate = platform ? r?.server_error_rate : r?.error_rate;
  const warn = platform ? SERVER_ERROR_RATE_WARN : ERROR_RATE_WARN;
  const high = http && isHigh(rate, warn);
  const errorRate = (
    <StatCard
      key="error-rate"
      label={platform ? 'Server error rate' : 'Error rate'}
      icon={<AlertTriangle />}
      loading={loading}
      value={http ? formatPercent(rate, 1) : OFF}
      tone={high ? 'warn' : undefined}
      sub={s && (http ? `${high ? 'High · ' : ''}${platform ? '5xx responses' : '4xx and 5xx responses'}` : notRecorded)}
      meter={http ? Math.min(1, rate ?? 0) : undefined}
      info={platform ? '5xx responses over all requests. 4xx is mostly client mistakes, so it is not counted here.' : 'Responses with status 4xx or 5xx over all requests.'}
    />
  );
  const p50 = <StatCard key="p50" label="p50 latency" icon={<Timer />} loading={loading} value={http ? formatLatency(s?.latency.p50_ms) : OFF} sub={s && (http ? `p50 · avg ${formatLatency(s.latency.avg_ms)}` : notRecorded)} info="Half of requests were faster than this. Every route together." />;
  const p95 = <StatCard key="p95" label="p95 latency" icon={<Gauge />} loading={loading} value={http ? formatLatency(s?.latency.p95_ms) : OFF} sub={s && (http ? `p95 · p99 ${formatLatency(s.latency.p99_ms)} · max ${formatLatency(s.latency.max_ms)}` : notRecorded)} info="95% of requests were faster than this. Every route together." />;
  const replies = (
    <StatCard
      key="replies"
      label="Replies"
      icon={<MessageSquareText />}
      loading={loading}
      value={formatNumber(s?.pipeline.replies)}
      sub={s && `Median ${formatLatency(s.pipeline.total.p50_ms)} until ready`}
      info="Answers recorded in the range."
    />
  );
  const noAnswer = (
    <StatCard
      key="no-answer"
      label="No answer found"
      icon={<SearchX />}
      loading={loading}
      value={formatPercent(s?.rag.no_answer_rate, 1)}
      sub={s && `${formatPercent(s.rag.empty_retrieval_rate, 1)} had no passage to answer from`}
      info="Share of replies in this range."
    />
  );
  return (
    <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {platform ? [errorRate, requests, p50, p95, replies, noAnswer] : [requests, errorRate, p50, p95, replies, noAnswer]}
    </div>
  );
}

function LoadingBody() {
  return (
    <div className="grid gap-4" aria-busy aria-label="Loading performance">
      <Skeleton className="h-[300px]" />
      <Skeleton className="h-[220px]" />
    </div>
  );
}

/**
 * The Performance page body, shared by the dashboard and the platform console. It reads `recording`
 * first: what isn't stored is replaced by a notice, never drawn as zero.
 */
export function PerformanceView({ q, variant }: { q: UseQueryResult<PerformanceStats>; variant: Variant }) {
  // The last good answer, so a failed refresh keeps what was on screen.
  const lastGood = useRef<PerformanceStats | undefined>(undefined);
  if (q.data) lastGood.current = q.data;
  const s = q.data ?? lastGood.current;

  // No such route on this server (404), or no access (403): the page isn't there, and says nothing alarming.
  if (q.isError && !s && (isRouteMissing(q.error) || (isApiError(q.error) && q.error.status === 403))) return <NotFound variant="inline" />;

  const refreshing = q.isFetching && Boolean(s);
  const failed = q.isError ? describeError(q.error) : undefined;
  const http = s?.recording.http ?? true;
  const sample = s ? sampleNote(s.recording.sample_rate) : null;

  return (
    <div className="grid gap-6">
      {failed && (
        <Callout
          tone="danger"
          icon={<AlertTriangle />}
          title={s ? "Couldn't refresh. Showing the last numbers." : failed.title}
          action={
            <Button size="xs" variant="soft" onClick={() => void q.refetch()} loading={q.isFetching}>
              Try again
            </Button>
          }
        >
          {failed.detail}
          {failed.requestId && <span className="block font-mono text-xs">Request {failed.requestId}</span>}
        </Callout>
      )}

      {!s ? (
        failed ? null : (
          <>
            <Headline variant={variant} loading s={undefined} />
            <LoadingBody />
          </>
        )
      ) : (
        <div className={cn('grid gap-6 transition-opacity', refreshing && 'opacity-60')} aria-busy={refreshing || undefined}>
          {sample && (
            <Callout tone="neutral" icon={<Zap />} title={`Request statistics are based on a ${sample} sample`}>
              Only that share of requests is stored. Counts are scaled back up and are right; percentiles are over the stored sample.
            </Callout>
          )}
          <Headline variant={variant} loading={false} s={s} />

          {http && !hasActivity(s) ? (
            <Card>
              <EmptyState compact icon={<Activity />} title="No activity in this range" description="Requests and replies show up here once the API handles some." />
            </Card>
          ) : (
            <>
              {http ? (
                <>
                  <RequestsOverTime s={s} />
                  <RouteTable s={s} />
                </>
              ) : (
                <Off title={REQUESTS_OFF}>The API isn't storing requests, so request counts, latency and routes can't be shown. The reply pipeline and retrieval quality below don't need it.</Off>
              )}
              <ReplyTime s={s} />
              <RetrievalBreakdown s={s} />
              <RetrievalQuality s={s} />
              <ModelTable s={s} />
              {variant === 'platform' && <BusiestBusinesses s={s} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}
