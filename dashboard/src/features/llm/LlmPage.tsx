import { Outlet } from 'react-router';
import { BarChart3, Cpu, History, Lock, MessageSquareText, RotateCcw } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import { Badge, Button, Callout, Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger, Page, PageHeader, SubNav, useConfirm } from '@/components/ui';
import { useBotDraft } from './draft';

/** The bot's instructions, model and model usage. Tools and the playground have their own pages. */
export default function LlmPage() {
  const { href, can, bot } = useScopeCtx();
  const { ws, setDraft, canWrite } = useBotDraft();
  const confirm = useConfirm();

  const restore = (botCfg: typeof ws.bot, label: string) =>
    confirm({
      title: `Restore ${label}?`,
      description: 'This fills the form with that version. Nothing changes for customers until you save.',
      confirmLabel: 'Restore',
      onConfirm: () => setDraft((d) => ({ ...d, bot: { ...botCfg, prompt: d.bot.prompt && !botCfg.promptTemplateId ? d.bot.prompt : botCfg.prompt } })),
    });

  return (
    <Page>
      <PageHeader
        eyebrow={ws.revision ? `Revision ${ws.revision} · saved ${formatDateTime(ws.updated_at)}` : 'Starting configuration'}
        title="LLM"
        description={`${bot.name}'s instructions, model and reply settings, and what the model costs.`}
        actions={
          canWrite && (
            <>
              <Menu>
                <MenuTrigger asChild>
                  <Button size="sm" leading={<History />} disabled={!ws.history.length}>
                    Versions {ws.history.length > 0 && <span className="text-ink-faint">{ws.history.length}</span>}
                  </Button>
                </MenuTrigger>
                <MenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
                  <MenuLabel>Saved versions</MenuLabel>
                  {ws.history.map((v, i) => (
                    <MenuItem key={v.id} onSelect={() => void restore(v.bot, `the version from ${formatDateTime(v.savedAt)}`)}>
                      <History />
                      <span className="grid flex-1">
                        <span>{formatDateTime(v.savedAt)}</span>
                        <span className="truncate text-[0.7rem] font-normal text-ink-faint">
                          {v.bot.model?.split('/').pop() || 'Default model'} · temp {v.bot.temperature ?? '—'}
                        </span>
                      </span>
                      {i === 0 && <Badge tone="accent">Latest</Badge>}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
              <Button size="sm" leading={<RotateCcw />} onClick={() => void restore(ws.defaults.bot, 'the defaults for your business type')}>
                Reset to defaults
              </Button>
            </>
          )
        }
      />
      <SubNav
        items={[
          { to: href('llm/prompt'), label: 'System prompt', icon: <MessageSquareText /> },
          { to: href('llm/model'), label: 'Model', icon: <Cpu /> },
          { to: href('llm/usage'), label: 'Usage & costs', icon: <BarChart3 />, hidden: !can('usage.read') },
        ]}
      />
      <Outlet />
    </Page>
  );
}

export function ViewOnly() {
  const { canWrite } = useBotDraft();
  if (canWrite) return null;
  return (
    <Callout tone="neutral" icon={<Lock />} title="View only">
      Your role can see the configuration but not change it.
    </Callout>
  );
}
