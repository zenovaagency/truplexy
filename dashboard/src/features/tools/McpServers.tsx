import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, KeyRound, MoreHorizontal, Pencil, Plug, PlusCircle, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { hasCode } from '@/lib/api/client';
import { useDeleteMcpServer, useMcpServers, useSaveMcpServer, useSyncMcpServer } from '@/lib/api/endpoints/bot';
import type { McpServer, McpServerInput } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { MAX_BOT_TOOLS, SLUG_PATTERN, slugFrom, urlError, withServerTools } from '@/lib/mcp';
import { useScopeCtx } from '@/lib/session/scope-context';
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Sheet,
  useConfirm,
} from '@/components/ui';
import { useBotDraft } from '@/features/llm/draft';

/**
 * The business's MCP servers: remote servers whose tools bots call like built-in tools. Hidden on an API without
 * the endpoint (or before its migration), so the Tools page looks as it did.
 */
export function McpServersCard() {
  const { can, bot, href } = useScopeCtx();
  const servers = useMcpServers();
  const sync = useSyncMcpServer();
  const del = useDeleteMcpServer();
  const confirm = useConfirm();
  const { draft, patchBot, canWrite: canEditBot } = useBotDraft();
  const [editing, setEditing] = useState<McpServer | 'new' | null>(null);
  const writable = can('tools.write');

  // Until the API answers, and on one without MCP servers, the section stays out of the page.
  if (!servers.isSuccess || !servers.data.database_configured) return null;
  const { data: list, plan_includes: planIncludes, auth_supported: authSupported, max_servers: maxServers } = servers.data;
  const full = list.length >= maxServers;
  const chosen = draft.bot.tools ?? [];

  const chooseAll = (s: McpServer) => {
    const { tools, added } = withServerTools(chosen, s);
    if (added.length) patchBot({ tools, toolsEnabled: true });
  };
  const unused = (s: McpServer) => s.tools.filter((t) => t.available && !chosen.includes(t.name)).length;

  const remove = (s: McpServer) =>
    confirm({
      title: `Remove ${s.name}?`,
      description: `Its ${s.tools.length} ${s.tools.length === 1 ? 'tool leaves' : 'tools leave'} the library, and bots that use them answer without them.`,
      confirmLabel: 'Remove server',
      tone: 'danger',
      onConfirm: () => del.mutateAsync(s.id),
    });

  const add = writable && planIncludes && !full && (
    <Button size="sm" variant="ghost" leading={<Plus />} onClick={() => setEditing('new')}>
      Add MCP server
    </Button>
  );

  return (
    <Card
      flush
      title={
        <span className="flex items-center gap-2">
          <Plug className="size-4 text-accent" /> MCP servers
        </span>
      }
      description="Connect remote MCP servers, such as Stripe's or your own, and bots can call their tools. Their tools join the library below."
      actions={add}
    >
      {!planIncludes ? (
        <div className="p-4">
          <Callout
            tone="accent"
            icon={<Sparkles />}
            title="MCP servers come with Pro"
            action={
              <Button asChild size="xs" variant="ghost">
                <Link to={href('settings/plan')}>See plans</Link>
              </Button>
            }
          >
            {list.length
              ? `Your plan doesn't include MCP servers, so bots skip the tools of the ${list.length === 1 ? 'server' : `${list.length} servers`} below. Upgrade to turn them back on.`
              : 'Upgrade to connect MCP servers and let your bots use their tools.'}
          </Callout>
        </div>
      ) : null}
      {!list.length ? (
        planIncludes && (
          <EmptyState
            icon={<Plug />}
            title="No MCP servers yet"
            description="Add a server's Streamable HTTP address, and an API key if it needs one. Its tools are listed when you add it."
            action={writable && <Button variant="accent" leading={<Plus />} onClick={() => setEditing('new')}>Add MCP server</Button>}
          />
        )
      ) : (
        <ul className="divide-y divide-line">
          {list.map((s) => {
            const usable = s.tools.filter((t) => t.available).length;
            const left = unused(s);
            return (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3.5">
                <span className={cn('mt-1 size-2.5 shrink-0 rounded-full', s.disabled ? 'bg-ink-faint' : s.status === 'ok' ? 'bg-live' : 'bg-danger')} aria-hidden />
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink">{s.name}</span>
                    <code className="rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-mono text-[0.68rem] text-ink-muted">mcp_{s.slug}_…</code>
                    {s.has_auth && (
                      <Badge tone="outline" title={`${s.auth_header}: ${s.auth_hint ?? ''}`}>
                        <KeyRound className="size-3" /> {s.auth_header}
                      </Badge>
                    )}
                    {s.disabled && <Badge tone="danger">Turned off by the platform</Badge>}
                    {!s.disabled && s.status === 'error' && <Badge tone="danger">Can't connect</Badge>}
                  </div>
                  <p className="truncate font-mono text-xs text-ink-faint" title={s.url}>
                    {s.url}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {usable} of {s.tools.length} {s.tools.length === 1 ? 'tool' : 'tools'} usable
                    {s.server_name ? ` · ${s.server_name}${s.server_version ? ` ${s.server_version}` : ''}` : ''}
                    {s.synced_at && (
                      <>
                        {' · synced '}
                        <time dateTime={s.synced_at} title={formatDateTime(s.synced_at)}>
                          {formatRelative(s.synced_at)}
                        </time>
                      </>
                    )}
                  </p>
                  {s.status === 'error' && s.last_error && <p className="text-xs text-danger">{s.last_error} The tools listed before still work if the server comes back.</p>}
                </div>
                {writable && (
                  <Menu>
                    <MenuTrigger asChild>
                      <Button size="xs" icon variant="quiet" aria-label={`Actions for ${s.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      {canEditBot && planIncludes && (
                        <MenuItem onSelect={() => chooseAll(s)} disabled={!left || chosen.length >= MAX_BOT_TOOLS}>
                          <PlusCircle /> Let {bot.name} use {left === 1 ? 'its tool' : left ? `its ${left} tools` : 'its tools'}
                        </MenuItem>
                      )}
                      <MenuItem onSelect={() => sync.mutate(s.id)} disabled={sync.isPending || !planIncludes}>
                        <RefreshCw /> Sync tools
                      </MenuItem>
                      <MenuItem onSelect={() => setEditing(s)}>
                        <Pencil /> Edit
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem danger onSelect={() => void remove(s)}>
                        <Trash2 /> Remove
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {full && writable && planIncludes && <p className="border-t border-line px-4 py-2.5 text-xs text-ink-faint">A business can connect up to {maxServers} MCP servers. Remove one to add another.</p>}
      <McpServerEditor server={editing} authSupported={authSupported} onClose={() => setEditing(null)} />
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export function McpServerEditor({ server, authSupported, onClose }: { server: McpServer | 'new' | null; authSupported: boolean; onClose: () => void }) {
  const save = useSaveMcpServer();
  const existing = server && server !== 'new' ? server : undefined;
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [url, setUrl] = useState('');
  const [header, setHeader] = useState('Authorization');
  const [value, setValue] = useState('');
  const [clearAuth, setClearAuth] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (!server) return;
    setName(existing?.name ?? '');
    setSlug(existing?.slug ?? '');
    setSlugTouched(Boolean(existing));
    setUrl(existing?.url ?? 'https://');
    setHeader(existing?.auth_header || 'Authorization');
    setValue('');
    setClearAuth(false);
    setError(null);
  }, [server, existing]);

  const effectiveSlug = slugTouched ? slug : name.trim() ? slugFrom(name) : '';
  const slugOk = SLUG_PATTERN.test(effectiveSlug);
  const urlProblem = urlError(url);
  const headerOk = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(header);
  const nameOk = name.trim().length >= 1 && name.trim().length <= 80;
  const valid = nameOk && slugOk && !urlProblem && (!value || headerOk);
  const renames = existing && existing.slug !== effectiveSlug;

  const submit = () => {
    if (!valid) return;
    setError(null);
    const input: McpServerInput = { name: name.trim(), slug: effectiveSlug, url: url.trim() };
    if (value) {
      input.auth_header = header;
      input.auth_value = value;
    } else if (clearAuth) {
      input.auth_value = '';
    } else if (existing?.has_auth && header !== existing.auth_header) {
      input.auth_header = header;
    }
    save.mutate(
      { id: existing?.id, input },
      {
        onSuccess: onClose,
        onError: (e) => {
          if (hasCode(e, 'MCP_CONNECT_FAILED')) setError({ title: "Couldn't connect to the server", message: (e as Error).message });
          else if (hasCode(e, 'INVALID_MCP_SERVER', 'MCP_SERVER_EXISTS')) setError({ title: "The server wasn't saved", message: (e as Error).message });
        },
      },
    );
  };

  return (
    <Sheet
      open={Boolean(server)}
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={existing ? `Edit ${existing.name}` : 'Add MCP server'}
      description="Saving connects to the server and lists its tools. Nothing is called until a bot uses a tool."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={save.isPending} disabled={!valid} onClick={submit}>
            {save.isPending ? 'Connecting…' : existing ? 'Save server' : 'Connect server'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        {error && (
          <Callout tone="danger" icon={<AlertTriangle />} title={error.title}>
            {error.message}
          </Callout>
        )}
        <Field label="Name" hint="Shown in the tool library and at the start of each tool's description." error={name && !nameOk ? 'Use 1 to 80 characters.' : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Stripe" />
        </Field>
        <Field
          label="Server URL"
          hint="The server's Streamable HTTP endpoint, often ending in /mcp."
          error={url.length > 8 && urlProblem ? urlProblem : undefined}
        >
          <Input value={url} onChange={(e) => setUrl(e.target.value.trim())} className="font-mono text-xs" placeholder="https://mcp.example.com/mcp" />
        </Field>
        <Field
          label="Tool prefix"
          hint={
            <>
              Tools are named <code className="font-mono">mcp_{effectiveSlug || 'slug'}_&lt;tool&gt;</code>. Lowercase letters and digits, starting with a letter.
              {renames && ' Changing it renames the tools: bots that use them skip them until they are picked again.'}
            </>
          }
          error={effectiveSlug && !slugOk ? 'Use a-z and 0-9, starting with a letter (at most 20).' : undefined}
        >
          <Input
            value={effectiveSlug}
            onChange={(e) => (setSlugTouched(true), setSlug(e.target.value.toLowerCase().slice(0, 20)))}
            className="font-mono"
            placeholder="stripe"
          />
        </Field>

        <section className="grid gap-3 rounded-[12px] border border-line p-3.5">
          <div className="grid gap-0.5">
            <h3 className="flex items-center gap-1.5 text-[0.8125rem] font-bold text-ink">
              <KeyRound className="size-3.5" /> Authentication
            </h3>
            <p className="text-xs text-ink-muted">
              {existing?.has_auth && !clearAuth
                ? `A ${existing.auth_header} header is stored (${existing.auth_hint ?? '…'}). Leave the value empty to keep it.`
                : 'Optional. One header sent with every request, such as Authorization: Bearer <API key>. It is stored encrypted and never shown again.'}
            </p>
          </div>
          {!authSupported ? (
            <Callout tone="warn" icon={<AlertTriangle />}>
              This server can't store auth headers yet (MCP_TOKEN_KEY isn't set). Add servers that need no key, or ask your platform admin.
            </Callout>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
              <Field label="Header" error={value && !headerOk ? 'A header name, such as X-API-Key.' : undefined}>
                <Input value={header} onChange={(e) => setHeader(e.target.value.trim().slice(0, 64))} className="font-mono text-xs" placeholder="Authorization" />
              </Field>
              <Field label="Value" optional>
                <Input
                  type="password"
                  autoComplete="off"
                  value={value}
                  onChange={(e) => (setValue(e.target.value), setClearAuth(false))}
                  className="font-mono text-xs"
                  placeholder={header.toLowerCase() === 'authorization' ? 'Bearer sk_live_…' : 'your API key'}
                />
              </Field>
            </div>
          )}
          {existing?.has_auth && !value && (
            <div>
              <Button size="xs" variant={clearAuth ? 'ghost' : 'danger-ghost'} onClick={() => setClearAuth(!clearAuth)}>
                {clearAuth ? 'Keep the stored header' : 'Remove the stored header'}
              </Button>
            </div>
          )}
        </section>

        <p className="text-xs text-ink-faint">
          Tools from a server are run with its answers passed to the model. Only connect servers you trust, and pick which tools each bot may call.
        </p>
      </div>
    </Sheet>
  );
}
