import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useBlocker } from 'react-router';
import { Loader2, Save, Undo2 } from 'lucide-react';
import { hasCode } from '@/lib/api/client';
import { useSaveWorkspace, useWorkspace } from '@/lib/api/endpoints/bot';
import type { BotConfig, Workspace } from '@/lib/api/types';
import { scopePath, useScopeCtx } from '@/lib/session/scope-context';
import { Button, Card, ErrorState, Page, Skeleton, SkeletonRows, useConfirm } from '@/components/ui';

export interface Draft {
  name: string;
  bot: BotConfig;
}

export interface BotDraftCtx {
  ws: Workspace;
  draft: Draft;
  setDraft: (d: Draft | ((d: Draft) => Draft)) => void;
  patchBot: (p: Partial<BotConfig>) => void;
  dirty: boolean;
  canWrite: boolean;
}

const BotDraftContext = createContext<BotDraftCtx | null>(null);

export function useBotDraft() {
  const ctx = useContext(BotDraftContext);
  if (!ctx) throw new Error('useBotDraft needs BotDraftLayout above it.');
  return ctx;
}

/** The pages that edit the bot's configuration, and so share one unsaved draft. */
const DRAFT_PAGES = new Set(['llm', 'tools', 'playground']);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const toDraft = (ws: Workspace): Draft => ({ name: ws.name, bot: { ...ws.bot } });

/**
 * LLM, Tools and Playground share one draft of the bot's configuration,
 * so a change can be tried in the playground before customers get it.
 * Keyed by bot: switching bots starts from that bot's saved settings.
 */
export default function BotDraftLayout() {
  const { scope } = useScopeCtx();
  return <DraftScope key={`${scope.tenant}/${scope.bot}`} />;
}

function DraftScope() {
  const { scope, can } = useScopeCtx();
  const ws = useWorkspace();
  const save = useSaveWorkspace();
  const confirm = useConfirm();
  const [draft, setDraftState] = useState<Draft | null>(null);
  const base = useRef<Draft | null>(null);

  // Take the server copy whenever we have no edits on top of it.
  useEffect(() => {
    if (!ws.data) return;
    const fresh = toDraft(ws.data);
    if (!draft || (base.current && same(draft, base.current))) setDraftState(fresh);
    base.current = fresh;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.data]);

  const dirty = Boolean(draft && base.current && !same(draft, base.current));

  const setDraft = useCallback((d: Draft | ((d: Draft) => Draft)) => setDraftState((cur) => (cur ? (typeof d === 'function' ? d(cur) : d) : cur)), []);
  const patchBot = useCallback((p: Partial<BotConfig>) => setDraft((d) => ({ ...d, bot: { ...d.bot, ...p } })), [setDraft]);

  // Moving between this bot's LLM, Tools and Playground keeps the draft; anywhere else asks first.
  const prefix = `${scopePath(scope, '')}/`;
  const blocker = useBlocker(({ nextLocation }) => {
    if (!dirty) return false;
    const p = nextLocation.pathname;
    return !(p.startsWith(prefix) && DRAFT_PAGES.has(p.slice(prefix.length).split('/')[0]!));
  });
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirm({
      title: 'Leave without saving?',
      description: 'Your changes to this bot are not saved. Customers keep the current settings.',
      confirmLabel: 'Discard changes',
      tone: 'danger',
    }).then((ok) => (ok ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const onSave = () => {
    if (!draft || !ws.data) return;
    save.mutate(
      { name: draft.name, bot: draft.bot, revision: ws.data.revision },
      {
        onSuccess: (saved) => {
          base.current = toDraft(saved);
          setDraftState(toDraft(saved));
        },
        onError: async (e) => {
          if (!hasCode(e, 'WORKSPACE_CONFLICT')) return;
          const reload = await confirm({
            title: 'Someone else saved first',
            description: 'A teammate saved this bot after you opened it. Reload to get their version; your unsaved changes here are discarded, so note anything you want to apply again.',
            confirmLabel: 'Reload their version',
            cancelLabel: 'Keep editing',
          });
          if (reload) {
            const fresh = await ws.refetch();
            if (fresh.data) {
              const d = toDraft(fresh.data);
              base.current = d;
              setDraftState(d);
            }
          }
        },
      },
    );
  };

  const ctx = useMemo<BotDraftCtx | null>(
    () => (ws.data && draft ? { ws: ws.data, draft, setDraft, patchBot, dirty, canWrite: can('bot.write') } : null),
    [ws.data, draft, setDraft, patchBot, dirty, can],
  );

  if (!ctx) {
    return (
      <Page>
        {ws.isError ? (
          <Card>
            <ErrorState error={ws.error} onRetry={() => ws.refetch()} />
          </Card>
        ) : (
          <>
            <div className="grid gap-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <Card>
              <SkeletonRows rows={6} />
            </Card>
          </>
        )}
      </Page>
    );
  }

  return (
    <BotDraftContext.Provider value={ctx}>
      <Outlet />
      {dirty && ctx.canWrite && (
        <>
          <div className="h-24" aria-hidden />
          <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6" style={{ paddingLeft: 'calc(var(--shell-sidebar) + 12px)' }}>
            <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-3 rounded-[16px] border border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur animate-pop-in">
              <span className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink">
                {save.isPending ? <Loader2 className="size-4 animate-spin text-accent" /> : <span className="size-2 rounded-full bg-warn" />}
                Unsaved changes
              </span>
              <span className="hidden text-xs text-ink-faint md:inline">Try them in the Playground first; customers get them when you save.</span>
              <div className="ml-auto flex gap-2">
                <Button size="xs" variant="ghost" leading={<Undo2 />} disabled={save.isPending} onClick={() => base.current && setDraftState(base.current)}>
                  Discard
                </Button>
                <Button size="xs" variant="accent" leading={<Save />} loading={save.isPending} onClick={onSave}>
                  Save for customers
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </BotDraftContext.Provider>
  );
}
