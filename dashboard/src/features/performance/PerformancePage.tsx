import { useMemo, useState } from 'react';
import { usePlatformPerformance } from '@/lib/api/endpoints/platform';
import { usePerformance } from '@/lib/api/endpoints/stats';
import { dayRange } from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import { useStoredState } from '@/hooks';
import { Page, PageHeader, Segmented } from '@/components/ui';
import { PerformanceView } from './PerformanceView';

type Days = '7' | '30' | '90';

const DAYS = [
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
] as const;

/** Performance of the API for the business: requests, latency, where a reply's time goes, retrieval quality. */
export default function PerformancePage() {
  const { bots, businessName, bot } = useScopeCtx();
  const [days, setDays] = useStoredState<Days>('truplexy.performance.days', '30');
  const [statsScope, setStatsScope] = useState<'bot' | 'business'>('bot');
  const range = useMemo(() => dayRange(Number(days)), [days]);
  const q = usePerformance(range, statsScope);
  return (
    <Page>
      <PageHeader
        eyebrow={businessName}
        title="Performance"
        description={`How fast and how well ${statsScope === 'bot' ? bot.name : 'your bots'} answered.`}
        actions={
          <>
            {bots.length > 1 && (
              <Segmented
                label="Stats scope"
                value={statsScope}
                onChange={setStatsScope}
                options={[
                  { value: 'bot', label: 'This bot' },
                  { value: 'business', label: 'All bots' },
                ]}
              />
            )}
            <Segmented label="Date range" value={days} onChange={setDays} options={[...DAYS]} />
          </>
        }
      />
      <PerformanceView q={q} variant="business" />
    </Page>
  );
}

/** The same body for the whole platform, with a date range only and the busiest businesses. */
export function PlatformPerformance() {
  const [days, setDays] = useStoredState<Days>('truplexy.performance.days', '30');
  const range = useMemo(() => dayRange(Number(days)), [days]);
  const q = usePlatformPerformance(range);
  return (
    <Page>
      <PageHeader
        eyebrow="Platform"
        title="Performance"
        description="How the API performed across every business: load, errors, latency and where a reply's time goes."
        actions={<Segmented label="Date range" value={days} onChange={setDays} options={[...DAYS]} />}
      />
      <PerformanceView q={q} variant="platform" />
    </Page>
  );
}
