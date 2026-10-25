import { Link } from 'react-router';
import { ClipboardList, Plus } from 'lucide-react';
import { useQueries } from '@/lib/api/endpoints/queries';
import { useFeature } from '@/lib/features';
import { formatRelative } from '@/lib/format';
import { CATEGORY } from '@/lib/queries';
import { useScopeCtx } from '@/lib/session/scope-context';
import { Badge, Skeleton } from '@/components/ui';

/** A customer's latest queries, with a way to open one. Nothing shows until the API serves queries. */
export function CustomerQueries({ customerId }: { customerId: string }) {
  const { href, can } = useScopeCtx();
  const on = useFeature('queries') === 'on';
  const list = useQueries({ customer: customerId }, on);
  if (!on) return null;
  const rows = list.data?.pages[0]?.data.slice(0, 5) ?? [];
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <p className="mono text-ink-faint">Queries</p>
        {can('queries.write') && (
          <Link to={href(`queries?new=1&customer=${customerId}`)} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
            <Plus className="size-3.5" /> New query
          </Link>
        )}
      </div>
      {list.isPending ? (
        <Skeleton className="h-10 rounded-[12px]" />
      ) : rows.length ? (
        <ul className="divide-y divide-line rounded-[12px] border border-line">
          {rows.map((q) => (
            <li key={q.id}>
              <Link to={href(`queries/${q.id}`)} className="flex items-center gap-3 px-3 py-2.5 text-[0.8125rem] hover:bg-surface-2/60">
                <ClipboardList className="size-4 shrink-0 text-ink-faint" />
                <span className="mono shrink-0 text-xs text-ink-faint">{q.reference}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{q.subject || q.type_name}</span>
                <Badge tone={CATEGORY[q.status_category].tone}>{q.status_label}</Badge>
                <span className="whitespace-nowrap text-xs text-ink-faint">{formatRelative(q.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[0.8125rem] text-ink-faint">No queries yet.</p>
      )}
    </section>
  );
}

/** "Open a query" from a ticket, linked to its customer, conversation and the ticket itself. */
export function OpenQueryLink({ customerId, conversationId, ticketId }: { customerId?: string; conversationId?: string; ticketId: string }) {
  const { href, can } = useScopeCtx();
  const on = useFeature('queries') === 'on';
  if (!on || !can('queries.write')) return null;
  const params = new URLSearchParams({ new: '1', ticket: ticketId });
  if (customerId) params.set('customer', customerId);
  if (conversationId) params.set('conversation', conversationId);
  return (
    <Link to={href(`queries?${params}`)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
      <ClipboardList className="size-3.5" /> Open a query from this ticket
    </Link>
  );
}
