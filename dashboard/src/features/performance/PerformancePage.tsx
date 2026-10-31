import { useMemo } from 'react';
import { usePlatformPerformance } from '@/lib/api/endpoints/platform';
import { dayRange } from '@/lib/format';
import { useStoredState } from '@/hooks';
import { Page, PageHeader, Segmented } from '@/components/ui';
import { PerformanceView } from './PerformanceView';

type Days = '7' | '30' | '90';

const DAYS = [
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
] as const;

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
      <PerformanceView q={q} />
    </Page>
  );
}
