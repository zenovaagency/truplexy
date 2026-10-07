import { useContext, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Command } from 'cmdk';
import { Dialog as D } from 'radix-ui';
import {
  ArrowRight,
  Bot,
  CornerDownLeft,
  FilePlus2,
  KeyRound,
  MessageSquarePlus,
  Moon,
  Search,
  Sun,
  Upload,
  UserPlus,
} from 'lucide-react';
import { useMe } from '@/lib/api/endpoints/account';
import type { Permission } from '@/lib/api/types';
import { ScopeContext, scopeLink } from '@/lib/session/scope-context';
import { useTheme } from '@/lib/theme';
import { BUSINESS_NAV, PLATFORM_NAV } from '@/app/nav';
import { Kbd } from '@/components/ui';

interface Entry {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
  keywords?: string[];
  permission?: Permission;
}

const SUB_PAGES: { label: string; path: string; permission: Permission; keywords?: string[] }[] = [
  { label: 'Handoffs', path: 'tickets/handoffs', permission: 'tickets.read', keywords: ['take over', 'human'] },
  { label: 'Test retrieval', path: 'knowledge/search', permission: 'knowledge.read', keywords: ['search', 'rag'] },
  { label: 'Model & reply settings', path: 'llm/model', permission: 'bot.read', keywords: ['assistant name', 'bot name', 'temperature', 'max tokens', 'price', 'openrouter'] },
  { label: 'Model usage & costs', path: 'llm/usage', permission: 'usage.read', keywords: ['tokens', 'spend', 'cost'] },
  { label: 'Webhook', path: 'integrations/webhook', permission: 'integrations.read', keywords: ['events'] },
  { label: 'Invitations', path: 'team/invitations', permission: 'members.read' },
  { label: 'Roles & permissions', path: 'team/roles', permission: 'members.read' },
  { label: 'Plan & usage', path: 'settings/plan', permission: 'members.read', keywords: ['limits', 'tokens'] },
  { label: 'Billing', path: 'settings/billing', permission: 'usage.read', keywords: ['balance', 'extra tokens', 'top-up', 'ledger'] },
  { label: 'Bots', path: 'settings/bots', permission: 'members.read' },
  { label: 'Backup & restore', path: 'settings/backup', permission: 'bot.read', keywords: ['export', 'import'] },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const nav = useNavigate();
  const ctx = useContext(ScopeContext);
  const me = useMe();
  const { resolved, toggle } = useTheme();
  const [q, setQ] = useState('');

  const go = (to: string | ReturnType<typeof scopeLink>) => () => {
    onOpenChange(false);
    setQ('');
    if (typeof to === 'string') nav(to);
    else nav(to.to, { state: to.state });
  };
  const allowed = (p?: Permission) => !p || (ctx?.can(p) ?? false);

  const pages: Entry[] = ctx
    ? [
        ...BUSINESS_NAV.flatMap((s) => s.items).map((i) => ({
          id: i.id,
          label: i.label,
          icon: <i.icon />,
          permission: i.permission,
          keywords: i.keywords,
          hint: i.key ? `G ${i.key.toUpperCase()}` : undefined,
          run: go(ctx.href(i.path)),
        })),
        ...SUB_PAGES.map((p) => ({ id: p.path, label: p.label, icon: <ArrowRight />, permission: p.permission, keywords: p.keywords, run: go(ctx.href(p.path)) })),
      ].filter((e) => allowed(e.permission))
    : [];

  const actions: Entry[] = ctx
    ? [
        { id: 'new-ticket', label: 'New ticket', icon: <MessageSquarePlus />, permission: 'tickets.write' as Permission, run: go(ctx.href('tickets?new=1')) },
        { id: 'upload', label: 'Upload documents', icon: <Upload />, permission: 'knowledge.write' as Permission, run: go(ctx.href('knowledge?upload=1')) },
        { id: 'article', label: 'Write an article', icon: <FilePlus2 />, permission: 'knowledge.write' as Permission, run: go(ctx.href('knowledge?article=new')) },
        { id: 'key', label: 'Issue an API key', icon: <KeyRound />, permission: 'integrations.write' as Permission, run: go(ctx.href('api-keys?new=1')) },
        { id: 'invite', label: 'Invite a teammate', icon: <UserPlus />, permission: 'members.write' as Permission, run: go(ctx.href('team/invitations?invite=1')) },
      ].filter((e) => allowed(e.permission))
    : [];

  const theme: Entry = {
    id: 'theme',
    label: resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
    icon: resolved === 'dark' ? <Sun /> : <Moon />,
    keywords: ['dark', 'light', 'theme', 'appearance'],
    run: () => {
      toggle();
      onOpenChange(false);
    },
  };

  const switches: Entry[] = (me.data?.memberships ?? []).flatMap((m) =>
    m.bots.map((b) => ({
      id: `${m.tenant_id}/${b.id}`,
      label: `${m.name} / ${b.name}`,
      icon: <Bot />,
      keywords: [m.tenant_id, b.id],
      run: go(scopeLink({ tenant: m.tenant_id, bot: b.id })),
    })),
  );

  const platform: Entry[] = me.data?.platform_admin
    ? PLATFORM_NAV.flatMap((s) => s.items).map((i) => ({ id: i.id, label: `Platform · ${i.label}`, icon: <i.icon />, run: go(i.path) }))
    : [];

  const group = (heading: string, list: Entry[]) =>
    list.length ? (
      <Command.Group heading={heading}>
        {list.map((e) => (
          <Command.Item key={e.id} value={`${heading} ${e.label} ${e.id}`} keywords={e.keywords} onSelect={e.run}>
            {e.icon}
            <span className="flex-1 truncate">{e.label}</span>
            {e.hint && <span className="font-mono text-[0.65rem] text-ink-faint">{e.hint}</span>}
          </Command.Item>
        ))}
      </Command.Group>
    ) : null;

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px] animate-fade-in" />
        <D.Content className="fixed inset-x-3 top-[12dvh] z-50 mx-auto max-w-[620px] overflow-hidden rounded-[18px] border border-line bg-surface shadow-lg outline-none animate-pop-in">
          <D.Title className="sr-only">Command menu</D.Title>
          <D.Description className="sr-only">Jump to a page, run an action, or switch business.</D.Description>
          <Command
            loop
            className="flex max-h-[min(70dvh,520px)] flex-col [&_[cmdk-group-heading]]:mono [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-ink-faint [&_[cmdk-item]]:flex [&_[cmdk-item]]:h-10 [&_[cmdk-item]]:cursor-pointer [&_[cmdk-item]]:items-center [&_[cmdk-item]]:gap-3 [&_[cmdk-item]]:rounded-[10px] [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:text-[0.8125rem] [&_[cmdk-item]]:font-medium [&_[cmdk-item]]:text-ink [&_[cmdk-item]_svg]:size-4 [&_[cmdk-item]_svg]:text-ink-faint [&_[cmdk-item][data-selected=true]]:bg-surface-2"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-4 text-ink-faint" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search pages, actions, businesses…"
                className="h-[52px] flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-ink-faint"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="flex-1 overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-[0.8125rem] text-ink-faint">Nothing matches “{q}”.</Command.Empty>
              {group('Go to', pages)}
              {group('Actions', [...actions, theme])}
              {group('Switch to', switches)}
              {group('Platform', platform)}
              {/* Last, so a page or action that matches wins Enter. */}
              {ctx && q.trim().length > 1 && ctx.can('tickets.read') && (
                <Command.Group heading="Search">
                  <Command.Item value={`search tickets ${q}`} onSelect={go(ctx.href(`tickets?q=${encodeURIComponent(q.trim())}`))}>
                    <Search />
                    <span className="flex-1 truncate">
                      Search tickets for “<span className="font-semibold">{q.trim()}</span>”
                    </span>
                  </Command.Item>
                </Command.Group>
              )}
            </Command.List>
            <div className="hidden items-center gap-4 border-t border-line bg-surface-2/60 px-4 py-2 text-[0.7rem] text-ink-faint sm:flex">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> move
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>
                  <CornerDownLeft className="size-3" />
                </Kbd>
                open
              </span>
              <span className="ml-auto">Tip: press G then a letter to jump</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
