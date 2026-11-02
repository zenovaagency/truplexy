import { ClipboardList, ListChecks } from 'lucide-react';
import { useScopeCtx } from '@/lib/session/scope-context';
import { SubNav } from '@/components/ui';

/** Queries and their types are one section: the list of requests, and the kinds of request they come in. */
export function QueriesTabs() {
  const { href } = useScopeCtx();
  const onTypes = (pathname: string) => pathname === href('queries/types');
  return (
    <SubNav
      items={[
        // An open query is /queries/:id, so this tab is current everywhere in the section except Types.
        { to: href('queries'), label: 'Queries', icon: <ClipboardList />, active: (p) => !onTypes(p) },
        { to: href('queries/types'), label: 'Types', icon: <ListChecks />, active: onTypes },
      ]}
    />
  );
}
