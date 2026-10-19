import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Info } from 'lucide-react';
import type { LatencyStats, PerformanceStats, StagePerformance } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/lib/format';
import {
  barStages,
  chartDays,
  countRows,
  ERROR_RATE_WARN,
  formatLatency,
  isHigh,
  OTHER_SHARE_NOTE,
  otherShare,
  SERVER_ERROR_RATE_WARN,
  STAGE_HELP,
  stageLabel,
} from '@/lib/performance';
import { Badge, Callout, Card, DataTable, EmptyState, Segmented, Tip, type Column } from '@/components/ui';
import { RequestsChart } from '@/components/charts';

type Stats = PerformanceStats;

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/** A rate as a percentage; past `limit` it turns amber and says "High", so colour is never the only signal. */
export function Rate({ value, limit }: { value: number; limit?: number }) {
  const high = limit != null && isHigh(value, limit);
  return (
    <span className={cn('inline-flex items-center gap-1 tabular-nums', high ? 'font-semibold text-warn' : 'text-ink-muted')}>
      {high && <AlertTriangle className="size-3.5" aria-hidden />}
      {formatPercent(value, 1)}
      {high && <span className="sr-only"> (high)</span>}
    </span>
  );
}

/** A "what is this" tip next to a label. */
export function Help({ children, label = 'About this number' }: { children: string; label?: string }) {
  return (
    <Tip content={children}>
      <button type="button" className="inline-grid align-middle text-ink-faint hover:text-ink [@media(pointer:coarse)]:min-h-0" aria-label={label} title={children}>
        <Info className="size-3.5" />
      </button>
    </Tip>
  );
}

const ms = (n: number) => <span className="tabular-nums text-ink-muted">{formatLatency(n)}</span>;

/** Latency cells over `ran` replies: with none, there is nothing to average. */
const overRan = (ran: number, n: number) => (ran > 0 ? ms(n) : <span className="text-ink-faint">—</span>);

/** The notice that stands where a section would be when the server doesn't store what it needs. */
export function Off({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Callout tone="neutral" icon={<Info />} title={title}>
      {children}
    </Callout>
  );
}

/* ------------------------------------------------------------------ */
/* Requests over time                                                  */
/* ------------------------------------------------------------------ */

export function RequestsOverTime({ s }: { s: Stats }) {
  const days = useMemo(() => chartDays(s.requests.by_day), [s.requests.by_day]);
  return (
    <Card
      title="Requests over time"
      description="Per day, in UTC. A day with no requests has no latency, so the line has a gap there."
      actions={
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--chart-1)' }} />
            Requests
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: 'var(--chart-3)' }} />
            Errors
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: 'var(--chart-2)' }} />
            p95 latency (right axis)
          </li>
        </ul>
      }
    >
      <RequestsChart data={days} />
      <details className="mt-3 text-[0.8125rem]">
        <summary className="cursor-pointer font-semibold text-accent">Show as a table</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-[10px] border border-line">
          <table className="table">
            <caption className="sr-only">Requests, errors and p95 latency per day</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col" className="text-right">Requests</th>
                <th scope="col" className="text-right">Errors</th>
                <th scope="col" className="text-right">p95</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <th scope="row" className="font-medium text-ink">{d.date}</th>
                  <td className="text-right tabular-nums">{formatNumber(d.requests)}</td>
                  <td className="text-right tabular-nums">{formatNumber(d.errors)}</td>
                  <td className="text-right tabular-nums">{d.p95 == null ? <span className="text-ink-faint">No requests</span> : formatLatency(d.p95)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Latency by route                                                    */
/* ------------------------------------------------------------------ */

type RouteSort = 'requests' | 'p95_ms';

export function RouteTable({ s }: { s: Stats }) {
  const [sort, setSort] = useState<RouteSort>('requests');
  const rows = useMemo(
    () => [...s.requests.by_route].sort((a, b) => (sort === 'requests' ? b.requests - a.requests : b.p95_ms - a.p95_ms)),
    [s.requests.by_route, sort],
  );
  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'method', header: 'Method', cell: (r) => <span className="font-mono text-xs font-semibold text-ink-muted">{r.method}</span> },
    { key: 'route', header: 'Route', cell: (r) => <span className="break-all font-mono text-xs text-ink">{r.route}</span> },
    { key: 'requests', header: 'Requests', align: 'right', cell: (r) => <span className="tabular-nums text-ink">{formatNumber(r.requests)}</span> },
    { key: 'errors', header: 'Error rate', align: 'right', cell: (r) => <Rate value={r.error_rate} limit={ERROR_RATE_WARN} /> },
    { key: 'p50', header: 'p50', align: 'right', cell: (r) => ms(r.p50_ms) },
    { key: 'p95', header: 'p95', align: 'right', cell: (r) => ms(r.p95_ms) },
    { key: 'p99', header: 'p99', align: 'right', hideBelowLg: true, cell: (r) => ms(r.p99_ms) },
    { key: 'max', header: 'Max', align: 'right', hideBelowLg: true, cell: (r) => ms(r.max_ms) },
  ];
  return (
    <Card
      title="Latency by route"
      description="How long each endpoint took to answer. Percentiles are the API's, over the range."
      actions={
        <Segmented
          size="xs"
          label="Sort routes by"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'requests', label: 'Requests' },
            { value: 'p95_ms', label: 'p95' },
          ]}
        />
      }
      flush
      footer={<p className="text-xs text-ink-faint">The 50 busiest routes. Routes show their pattern, such as /conversations/{'{id}'}/messages, never real IDs.</p>}
    >
      <DataTable
        columns={columns}
        rows={rows}
        getKey={(r) => `${r.method} ${r.route}`}
        empty={<EmptyState compact title="No requests in this range" />}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Where a reply's time goes                                           */
/* ------------------------------------------------------------------ */

/** Each stage's look. Seven stages share four chart colours, so neighbours differ and every one is named in the table. */
const STAGE_STYLE: Record<string, CSSProperties> = {
  prepare: { background: 'color-mix(in srgb, var(--chart-4) 55%, transparent)' },
  quota: { background: 'var(--chart-4)' },
  retrieval: { background: 'var(--chart-2)' },
  web_search: { background: 'color-mix(in srgb, var(--chart-3) 55%, transparent)' },
  llm: { background: 'var(--chart-1)' },
  postprocess: { background: 'var(--chart-3)' },
  other: { background: 'repeating-linear-gradient(135deg, var(--color-surface-3) 0 4px, var(--color-line-strong) 4px 6px)' },
};
const stageStyle = (stage: string): CSSProperties => STAGE_STYLE[stage] ?? { background: 'var(--color-ink-faint)' };

function Swatch({ stage }: { stage: string }) {
  return <span className="inline-block size-3 shrink-0 rounded-[3px] border border-line" style={stageStyle(stage)} aria-hidden />;
}

function TotalLine({ total }: { total: LatencyStats }) {
  return (
    <p className="text-[0.8125rem] text-ink-muted">
      <span className="font-semibold text-ink">Total time until the reply was ready</span> · average {formatLatency(total.avg_ms)} · p50 {formatLatency(total.p50_ms)} · p95{' '}
      {formatLatency(total.p95_ms)} · p99 {formatLatency(total.p99_ms)}
    </p>
  );
}

export function ReplyTime({ s }: { s: Stats }) {
  const { stages, total } = s.pipeline;
  const bar = barStages(stages);
  const other = otherShare(stages);
  const columns: Column<StagePerformance>[] = [
    {
      key: 'stage',
      header: 'Stage',
      cell: (r) => (
        <span className="inline-flex items-center gap-2 font-medium text-ink">
          <Swatch stage={r.stage} />
          {stageLabel(r.stage)}
          {STAGE_HELP[r.stage] && <Help label={`About ${stageLabel(r.stage)}`}>{STAGE_HELP[r.stage]!}</Help>}
        </span>
      ),
    },
    { key: 'share', header: 'Share of reply time', align: 'right', cell: (r) => <span className="tabular-nums text-ink">{formatPercent(r.share, 1)}</span> },
    {
      key: 'ran',
      header: 'Ran for',
      align: 'right',
      cell: (r) => (
        <span className="tabular-nums text-ink-muted">
          {formatNumber(r.ran)} <span className="text-ink-faint">{r.ran === 1 ? 'reply' : 'replies'}</span>
        </span>
      ),
    },
    { key: 'avg', header: 'Avg', align: 'right', cell: (r) => overRan(r.ran, r.avg_ms) },
    { key: 'p50', header: 'p50', align: 'right', cell: (r) => overRan(r.ran, r.p50_ms) },
    { key: 'p95', header: 'p95', align: 'right', cell: (r) => overRan(r.ran, r.p95_ms) },
    { key: 'p99', header: 'p99', align: 'right', hideBelowLg: true, cell: (r) => overRan(r.ran, r.p99_ms) },
  ];
  return (
    <Card
      title="Where a reply's time goes"
      description={`${formatNumber(s.pipeline.replies)} ${s.pipeline.replies === 1 ? 'reply' : 'replies'} in this range.`}
      bodyClassName="grid gap-4"
    >
      <TotalLine total={total} />
      {bar.length ? (
        <div
          role="img"
          aria-label={`Share of reply time: ${bar.map((b) => `${stageLabel(b.stage)} ${formatPercent(b.share, 1)}`).join(', ')}`}
          className="flex h-5 gap-[2px] overflow-hidden rounded-full bg-surface-3"
        >
          {bar.map((b) => (
            <div key={b.stage} title={`${stageLabel(b.stage)}: ${formatPercent(b.share, 1)}`} style={{ ...stageStyle(b.stage), flex: b.share, minWidth: 3 }} />
          ))}
        </div>
      ) : (
        <p className="rounded-[10px] bg-surface-2 px-3 py-2 text-[0.8125rem] text-ink-muted">No reply time was recorded in this range.</p>
      )}
      {other > OTHER_SHARE_NOTE && (
        <Callout tone="neutral" icon={<Info />} title={`${formatPercent(other, 0)} of reply time isn't itemised`}>
          Replies recorded before stage timings existed have no prepare, quota or post-processing time, so it shows here. A range that starts after the release shows less.
        </Callout>
      )}
      <div className="-mx-5 border-t border-line">
        <DataTable columns={columns} rows={stages} getKey={(r) => r.stage} empty={<EmptyState compact title="No stages recorded" />} />
      </div>
      <p className="text-xs text-ink-faint">
        Averages and percentiles are over the replies each stage ran for (see “Ran for”), so a stage few replies use isn't diluted by zeros. A cached answer skips most stages. Shares are each stage's part of all reply
        time.
      </p>
    </Card>
  );
}

export function RetrievalBreakdown({ s }: { s: Stats }) {
  const columns: Column<StagePerformance>[] = [
    {
      key: 'stage',
      header: 'Stage',
      cell: (r) => (
        <span className="inline-flex items-center gap-2 font-medium text-ink">
          {stageLabel(r.stage)}
          {STAGE_HELP[r.stage] && <Help label={`About ${stageLabel(r.stage)}`}>{STAGE_HELP[r.stage]!}</Help>}
        </span>
      ),
    },
    { key: 'ran', header: 'Ran for', align: 'right', cell: (r) => <span className="tabular-nums text-ink-muted">{formatNumber(r.ran)}</span> },
    { key: 'avg', header: 'Avg', align: 'right', cell: (r) => overRan(r.ran, r.avg_ms) },
    { key: 'p50', header: 'p50', align: 'right', cell: (r) => overRan(r.ran, r.p50_ms) },
    { key: 'p95', header: 'p95', align: 'right', cell: (r) => overRan(r.ran, r.p95_ms) },
    { key: 'p99', header: 'p99', align: 'right', hideBelowLg: true, cell: (r) => overRan(r.ran, r.p99_ms) },
  ];
  return (
    <Card
      title="Retrieval breakdown"
      description="What retrieval spends its time on, over the replies each stage ran for."
      actions={<Badge tone="warn">Stages overlap</Badge>}
      flush
      footer={<p className="text-xs text-ink-faint">Dense and lexical search run at the same time, so these times don't add up to retrieval's time.</p>}
    >
      <DataTable columns={columns} rows={s.pipeline.retrieval_stages} getKey={(r) => r.stage} empty={<EmptyState compact title="No retrieval stages recorded" />} />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Retrieval quality                                                   */
/* ------------------------------------------------------------------ */

function Metric({ label, help, value, meter, children }: { label: string; help: string; value: ReactNode; meter?: number; children?: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5 rounded-[12px] border border-line bg-surface px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="flex items-center gap-1.5 text-[0.8125rem] text-ink-muted">
          {label}
          <Help label={`About ${label}`}>{help}</Help>
        </dt>
        <dd className="text-sm font-semibold tabular-nums text-ink">{value}</dd>
      </div>
      {meter != null && (
        <div className="h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.min(100, Math.max(0, meter * 100))}%` }} />
        </div>
      )}
      {children}
    </div>
  );
}

function Counts({ counts, empty, order }: { counts: Record<string, number> | undefined; empty: string; order?: string[] }) {
  const rows = order ? order.map((k) => [k, counts?.[k] ?? 0] as const).filter(([, n]) => n > 0) : countRows(counts);
  if (!rows.length) return <p className="text-xs text-ink-faint">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {rows.map(([k, n]) => (
        <li key={k} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-muted">
          {k.replace(/_/g, ' ')} <span className="font-semibold tabular-nums text-ink">{formatNumber(n)}</span>
        </li>
      ))}
    </ul>
  );
}

const SHARE_OF_REPLIES = 'Share of the replies in this range.';

export function RetrievalQuality({ s }: { s: Stats }) {
  const r = s.rag;
  return (
    <Card title="Retrieval quality" description={`How well retrieval served ${formatNumber(r.replies)} ${r.replies === 1 ? 'reply' : 'replies'}. Rates are shares of replies.`}>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Answered" help={SHARE_OF_REPLIES} value={formatPercent(r.answered_rate, 1)} meter={r.answered_rate} />
        <Metric label="No answer found" help={SHARE_OF_REPLIES} value={formatPercent(r.no_answer_rate, 1)} meter={r.no_answer_rate} />
        <Metric label="Asked to clarify" help={SHARE_OF_REPLIES} value={formatPercent(r.clarification_rate, 1)} meter={r.clarification_rate} />
        <Metric label="Handed to a person" help={SHARE_OF_REPLIES} value={formatPercent(r.handoff_rate, 1)} meter={r.handoff_rate} />
        <Metric label="Empty retrieval" help="Replies with no passage to answer from." value={formatPercent(r.empty_retrieval_rate, 1)} meter={r.empty_retrieval_rate} />
        <Metric label="Served from cache" help="Cache hits by kind, such as semantic or retrieval." value={formatPercent(r.cache_hit_rate, 1)} meter={r.cache_hit_rate}>
          <Counts counts={r.cache_hits} empty="No cache hits." />
        </Metric>
        <Metric label="Question rewritten" help={SHARE_OF_REPLIES} value={formatPercent(r.rewrite_rate, 1)} meter={r.rewrite_rate} />
        <Metric label="Degraded" help="Replies that went on without a stage that failed, by stage." value={formatPercent(r.degraded_rate, 1)} meter={r.degraded_rate}>
          <Counts counts={r.degraded} empty="No stage failed." />
        </Metric>
        <Metric
          label="Confidence"
          help="Replies by how well the evidence supported an answer, high, low or none; unknown when nothing was searched."
          value={<span className="text-xs font-normal text-ink-faint">replies</span>}
        >
          <Counts counts={r.confidence} order={['high', 'low', 'none', 'unknown']} empty="No replies." />
        </Metric>
        <Metric label="Used web results" help="Replies that used web results." value={formatPercent(r.web_search_rate, 1)} meter={r.web_search_rate} />
        <Metric label="Question split" help="Replies whose message was split into several questions." value={formatPercent(r.split_rate, 1)} meter={r.split_rate} />
        <Metric label="Candidates per reply" help="Average over the replies in this range." value={r.avg_candidates.toFixed(1)} />
        <Metric label="Passages per reply" help="Average over the replies in this range." value={r.avg_passages.toFixed(1)} />
        <Metric label="Top passage score" help="The best passage's average rerank score." value={r.avg_top_score.toFixed(3)} />
        <Metric label="Retrieval time (p50)" help="Durations in milliseconds, with nearest-rank percentiles." value={formatLatency(r.retrieval.p50_ms)}>
          <p className="text-xs text-ink-faint">
            p95 {formatLatency(r.retrieval.p95_ms)} · p99 {formatLatency(r.retrieval.p99_ms)} · avg {formatLatency(r.retrieval.avg_ms)}
          </p>
        </Metric>
      </dl>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */

export function ModelTable({ s }: { s: Stats }) {
  const columns: Column<Stats['models'][number]>[] = [
    { key: 'model', header: 'Model', cell: (m) => <span className="break-all font-mono text-xs text-ink">{m.model}</span> },
    { key: 'attempts', header: 'Calls', align: 'right', cell: (m) => <span className="tabular-nums text-ink">{formatNumber(m.attempts)}</span> },
    {
      key: 'failed',
      header: 'Failed calls',
      align: 'right',
      cell: (m) => (
        <span className="tabular-nums text-ink-muted">
          {formatNumber(m.failures)} · <Rate value={m.failure_rate} />
        </span>
      ),
    },
    { key: 'p50', header: 'p50', align: 'right', cell: (m) => ms(m.p50_ms) },
    { key: 'p95', header: 'p95', align: 'right', cell: (m) => ms(m.p95_ms) },
  ];
  return (
    <Card
      title="Models"
      description="Latency and failures of each model call."
      flush={s.recording.model_attempts}
      footer={
        s.recording.model_attempts ? (
          <p className="text-xs text-ink-faint">The 10 most-called models. A failed call may have been answered by a fallback model, so these are failed calls, not failed replies.</p>
        ) : undefined
      }
    >
      {!s.recording.model_attempts ? (
        <Off title="Model call statistics are off">This server isn't storing model calls, so there is nothing to show here.</Off>
      ) : (
        <DataTable columns={columns} rows={s.models} getKey={(m) => m.model} empty={<EmptyState compact title="No model calls in this range" />} />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Platform: the busiest businesses                                    */
/* ------------------------------------------------------------------ */

export function BusiestBusinesses({ s }: { s: Stats }) {
  const rows = s.tenants ?? [];
  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'name',
      header: 'Business',
      cell: (t) => (
        <Link to={`/platform/businesses?open=${encodeURIComponent(t.tenant_id)}`} className="font-semibold text-accent hover:underline">
          {t.name || t.tenant_id}
        </Link>
      ),
    },
    { key: 'requests', header: 'Requests', align: 'right', cell: (t) => <span className="tabular-nums text-ink">{formatNumber(t.requests)}</span> },
    { key: 'server', header: 'Server errors', align: 'right', cell: (t) => <span className="tabular-nums text-ink-muted">{formatNumber(t.server_errors)}</span> },
    { key: 'rate', header: 'Server error rate', align: 'right', cell: (t) => <Rate value={t.server_error_rate} limit={SERVER_ERROR_RATE_WARN} /> },
  ];
  return (
    <Card
      title="Busiest businesses"
      description="Who is driving load, and who is seeing 5xx."
      flush
      footer={<p className="text-xs text-ink-faint">The 20 businesses with the most requests.</p>}
    >
      <DataTable columns={columns} rows={rows} getKey={(t) => t.tenant_id} empty={<EmptyState compact title="No requests in this range" />} />
    </Card>
  );
}

export const REQUESTS_OFF = 'Request statistics are off on this server';
