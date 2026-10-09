import { useLocation, useNavigate } from 'react-router';
import { Bot, Check, ChevronsUpDown, Plus, Settings2 } from 'lucide-react';
import { useMe } from '@/lib/api/endpoints/account';
import { useTenant } from '@/lib/api/endpoints/business';
import { cn } from '@/lib/cn';
import { ROLE_LABEL } from '@/lib/permissions';
import { scopeLink, useScopeCtx } from '@/lib/session/scope-context';
import { Avatar, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui';

/** The tab segment of the current URL, so switching keeps you on the same tab (not the same record). */
function useCurrentTab() {
  const loc = useLocation();
  const parts = loc.pathname.split('/').slice(1);
  const tab = parts[0] ?? 'overview';
  // Sub-tabs are shared across scopes; record ids (tickets/abc) are not.
  return tab === 'tickets' ? 'tickets' : parts.join('/') || 'overview';
}

const triggerCls =
  'flex h-9 min-w-0 items-center gap-2 rounded-[10px] px-2 text-[0.8125rem] font-semibold text-ink transition-colors hover:bg-surface-2 data-[state=open]:bg-surface-2 [@media(pointer:coarse)]:h-11';

export function ScopeSwitcher() {
  const { scope, businessName, bot, bots, can, membership, isPlatformAdmin } = useScopeCtx();
  const me = useMe();
  const tenant = useTenant();
  const logoUrl = membership?.logo_url ?? tenant.data?.logo_url;
  const nav = useNavigate();
  const tab = useCurrentTab();
  const go = (link: ReturnType<typeof scopeLink>) => nav(link.to, { state: link.state });
  const memberships = me.data?.memberships ?? [];

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <Menu>
        <MenuTrigger className={triggerCls} aria-label={`Business: ${businessName}`}>
          {logoUrl ? (
            <Avatar name={businessName} src={logoUrl} size={24} className="rounded-[7px]" />
          ) : (
            <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-[image:var(--gradient-brand)] text-[0.65rem] font-bold text-white">
              {businessName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="max-w-[9rem] truncate sm:max-w-[14rem]">{businessName}</span>
          {!membership && isPlatformAdmin && <span className="chip hidden bg-warn-soft text-warn sm:inline-flex">Visiting</span>}
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-faint" />
        </MenuTrigger>
        <MenuContent align="start" className="w-[280px]">
          <MenuLabel>Businesses</MenuLabel>
          {memberships.map((m) => (
            <MenuItem
              key={m.tenant_id}
              onSelect={() => m.bots[0] && go(scopeLink({ tenant: m.tenant_id, bot: m.bots[0].id }, tab))}
              disabled={!m.bots.length}
            >
              <Avatar name={m.name} src={m.logo_url} size={22} className="rounded-[7px]" />
              <span className="grid min-w-0 flex-1">
                <span className="truncate">{m.name}</span>
                <span className="text-[0.7rem] font-normal text-ink-faint">
                  {ROLE_LABEL[m.role]} · {m.plan.charAt(0).toUpperCase() + m.plan.slice(1)}
                  {m.status === 'suspended' && ' · Suspended'}
                </span>
              </span>
              {m.tenant_id === scope.tenant && <Check className="!text-accent" />}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={() => nav('/onboarding')}>
            <Plus />
            Create a business
          </MenuItem>
        </MenuContent>
      </Menu>

      <span className="text-line-strong select-none" aria-hidden>
        /
      </span>

      <Menu>
        <MenuTrigger className={cn(triggerCls, 'text-ink-muted')} aria-label={`Bot: ${bot.name}`}>
          {bot.avatar_url ? (
            <Avatar name={bot.name} src={bot.avatar_url} size={24} className="rounded-[7px]" />
          ) : (
            <Bot className="size-4 shrink-0 text-ink-faint" />
          )}
          <span className="max-w-[7rem] truncate sm:max-w-[12rem]">{bot.name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-faint" />
        </MenuTrigger>
        <MenuContent align="start" className="w-[260px]">
          <MenuLabel>Bots in {businessName}</MenuLabel>
          {bots.map((b) => (
            <MenuItem key={b.id} onSelect={() => go(scopeLink({ tenant: scope.tenant, bot: b.id }, tab))}>
              {b.avatar_url ? <Avatar name={b.name} src={b.avatar_url} size={22} className="rounded-[7px]" /> : <Bot />}
              <span className="grid min-w-0 flex-1">
                <span className="truncate">{b.name}</span>
                <span className="font-mono text-[0.68rem] font-normal text-ink-faint">{b.id}</span>
              </span>
              {b.id === scope.bot && <Check className="!text-accent" />}
            </MenuItem>
          ))}
          {(can('bots.create') || can('members.read')) && <MenuSeparator />}
          {can('bots.create') && (
            <MenuItem onSelect={() => nav('/settings/bots?new=1')}>
              <Plus />
              New bot
            </MenuItem>
          )}
          <MenuItem onSelect={() => nav('/settings/bots')}>
            <Settings2 />
            Manage bots
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}
