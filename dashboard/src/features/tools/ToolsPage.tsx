import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, MoreHorizontal, Pencil, Play, Plus, Trash2, Wrench, XCircle } from 'lucide-react';
import { hasCode } from '@/lib/api/client';
import { useDeleteTool, useSaveTool, useTestTool, useTools } from '@/lib/api/endpoints/bot';
import type { HttpMethod, JsonSchema, Tool, ToolRun } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatMs, formatRelative } from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Page,
  PageHeader,
  Select,
  Sheet,
  SkeletonRows,
  Switch,
  Textarea,
  useConfirm,
} from '@/components/ui';
import { BotToolsCard } from './BotToolsCard';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const METHOD_TONE: Record<HttpMethod, string> = {
  GET: 'bg-live-soft text-live',
  POST: 'bg-accent-soft text-accent',
  PUT: 'bg-warn-soft text-warn',
  PATCH: 'bg-violet-soft text-violet-ink',
  DELETE: 'bg-danger-soft text-danger',
};

function MethodTag({ m }: { m: HttpMethod }) {
  return <span className={cn('rounded-[6px] px-1.5 py-0.5 font-mono text-[0.65rem] font-bold', METHOD_TONE[m])}>{m}</span>;
}

export default function ToolsPage() {
  const { can, bot } = useScopeCtx();
  const tools = useTools();
  const del = useDeleteTool();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Tool | 'new' | null>(null);
  const [testing, setTesting] = useState<Tool | null>(null);
  const writable = can('tools.write');

  const remove = (t: Tool) =>
    confirm({
      title: `Delete ${t.name}?`,
      description: "Bots that use it stop offering it to the model. Past runs stay recorded.",
      confirmLabel: 'Delete tool',
      tone: 'danger',
      onConfirm: () => del.mutateAsync(t.name),
    });

  return (
    <Page>
      <PageHeader
        title="Tools"
        description={`Let ${bot.name} look things up or take actions through your own HTTPS APIs, such as an order lookup or a returns endpoint.`}
        actions={
          writable && (
            <Button variant="accent" leading={<Plus />} onClick={() => setEditing('new')}>
              New tool
            </Button>
          )
        }
      />

      <BotToolsCard />

      <div className="grid gap-1">
        <h2 className="text-[1rem] font-bold text-ink">Tool library</h2>
        <p className="text-[0.8125rem] text-ink-muted">Shared by every bot in this business. Each bot picks the ones it may call, above.</p>
      </div>

      {tools.data && !tools.data.database_configured && (
        <Callout tone="warn" icon={<AlertTriangle />} title="Tools are unavailable on this server">
          The API has no database configured, so tools can't be saved or run.
        </Callout>
      )}

      {tools.isPending ? (
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      ) : tools.isError ? (
        <Card>
          <ErrorState error={tools.error} onRetry={() => tools.refetch()} />
        </Card>
      ) : !tools.data.data.length ? (
        <Card>
          <EmptyState
            icon={<Wrench />}
            title="No tools yet"
            description="Give the assistant a way to check order status, book a slot or look up stock, using an API you already have."
            action={writable && <Button variant="accent" leading={<Plus />} onClick={() => setEditing('new')}>Add a tool</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {tools.data.data.map((t) => (
            <article key={t.name} className={cn('panel grid content-start gap-3 p-4', !t.available && 'opacity-75')}>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-accent">
                  <Wrench className="size-4" />
                </span>
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-mono text-[0.8125rem] font-bold text-ink">{t.name}</h3>
                    {t.read_only ? <Badge tone="outline">Read only</Badge> : <Badge tone="warn">Changes data</Badge>}
                    {!t.available && <Badge tone="danger">Unavailable</Badge>}
                  </div>
                  <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink-faint">
                    <MethodTag m={t.api.method} />
                    <span className="truncate font-mono">{t.api.url}</span>
                  </p>
                </div>
                {writable && (
                  <Menu>
                    <MenuTrigger asChild>
                      <Button size="xs" icon variant="quiet" aria-label={`Actions for ${t.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => setTesting(t)} disabled={!t.available}>
                        <Play /> Run a test
                      </MenuItem>
                      <MenuItem onSelect={() => setEditing(t)}>
                        <Pencil /> Edit
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem danger onSelect={() => void remove(t)}>
                        <Trash2 /> Delete
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                )}
              </div>
              <p className="line-clamp-3 text-[0.8125rem] text-ink-muted">{t.description}</p>
              {!t.available && t.unavailable_reason && <p className="text-xs text-danger">{t.unavailable_reason}</p>}
              <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-xs text-ink-faint">
                {Object.keys(t.parameters.properties ?? {}).length ? (
                  Object.keys(t.parameters.properties ?? {}).map((p) => (
                    <code key={p} className="rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-mono text-[0.68rem] text-ink-muted">
                      {p}
                      {t.parameters.required?.includes(p) && <span className="text-danger">*</span>}
                    </code>
                  ))
                ) : (
                  <span>No parameters</span>
                )}
                <span className="ml-auto">Updated {formatRelative(t.api.updated_at)}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {!writable && tools.data?.data.length ? (
        <p className="flex items-center gap-2 text-xs text-ink-faint">
          <Lock className="size-3.5" /> Your role can see tools but not change or run them.
        </p>
      ) : null}

      <ToolEditor tool={editing} onClose={() => setEditing(null)} />
      <ToolTester tool={testing} onClose={() => setTesting(null)} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */

const EXAMPLE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { order_id: { type: 'string', description: 'The order number, e.g. A-10482' } },
  required: ['order_id'],
  additionalProperties: false,
};

function ToolEditor({ tool, onClose }: { tool: Tool | 'new' | null; onClose: () => void }) {
  const save = useSaveTool();
  const existing = tool && tool !== 'new' ? tool : undefined;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('');
  const [schema, setSchema] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tool) return;
    setName(existing?.name ?? '');
    setDescription(existing?.description ?? '');
    setMethod(existing?.api.method ?? 'GET');
    setUrl(existing?.api.url ?? 'https://');
    setSchema(JSON.stringify(existing?.parameters ?? EXAMPLE_SCHEMA, null, 2));
    setReadOnly(existing?.read_only ?? true);
    setError(null);
  }, [tool, existing]);

  const parsed = useMemo(() => {
    try {
      const v = JSON.parse(schema || '{}');
      return v && typeof v === 'object' && v.type === 'object' ? { ok: true as const, v: v as JsonSchema } : { ok: false as const, msg: 'The schema needs "type": "object".' };
    } catch (e) {
      return { ok: false as const, msg: `Not valid JSON: ${(e as Error).message}` };
    }
  }, [schema]);

  const nameOk = /^[a-z][a-z0-9_]{0,63}$/.test(name);
  const urlOk = /^https:\/\/[^\s]+$/.test(url) && url.length <= 2000;
  const placeholders = [...url.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]!);
  const missingParams = parsed.ok ? placeholders.filter((p) => !parsed.v.properties?.[p] || !parsed.v.required?.includes(p)) : [];
  const valid = nameOk && urlOk && description.trim() && parsed.ok && !missingParams.length;

  const submit = () => {
    if (!valid || !parsed.ok) return;
    setError(null);
    save.mutate(
      { original: existing?.name, input: { name, description: description.trim(), method, url, parameters: parsed.v, read_only: readOnly } },
      {
        onSuccess: onClose,
        onError: (e) => {
          if (hasCode(e, 'INVALID_TOOL', 'TOOL_EXISTS')) setError((e as Error).message);
        },
      },
    );
  };

  return (
    <Sheet
      open={Boolean(tool)}
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={existing ? `Edit ${existing.name}` : 'New tool'}
      description="Saving doesn't run anything. Use “Run a test” afterwards to call your endpoint."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={save.isPending} disabled={!valid} onClick={submit}>
            {existing ? 'Save tool' : 'Create tool'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        {error && <Callout tone="danger" icon={<AlertTriangle />} title="The tool wasn't saved">{error}</Callout>}
        <Field label="Name" hint="Lowercase letters, digits and underscores, starting with a letter. The model sees this name." error={name && !nameOk ? 'Use a-z, 0-9 and _ only, starting with a letter.' : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value.toLowerCase().slice(0, 64))} placeholder="lookup_order" className="font-mono" />
        </Field>
        <Field label="When should the assistant use it?" hint="Describe what it does and when to call it. This is the model's only guide." aside={`${description.length}/1000`}>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value.slice(0, 1000))} placeholder="Look up an order's status and tracking link by its order number. Use when a customer asks where their order is." />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as HttpMethod)} options={METHODS.map((m) => ({ value: m, label: m }))} />
          </Field>
          <Field label="URL" hint="HTTPS only. {placeholders} after the host are filled from parameters of the same name." error={url.length > 8 && !urlOk ? 'Enter an https:// URL.' : undefined}>
            <Input value={url} onChange={(e) => setUrl(e.target.value.trim())} className="font-mono text-xs" placeholder="https://api.example.com/orders/{order_id}" />
          </Field>
        </div>
        <Field
          label="Parameters (JSON Schema)"
          hint={`Allowed keywords: type, description, properties, required, enum, items, additionalProperties: false. Arguments not in the URL go in the ${method === 'GET' || method === 'DELETE' ? 'query string' : 'JSON body'}.`}
          error={!parsed.ok ? parsed.msg : missingParams.length ? `Add a required parameter for {${missingParams.join('}, {')}}.` : undefined}
        >
          <Textarea rows={12} value={schema} onChange={(e) => setSchema(e.target.value)} className="font-mono text-xs" spellCheck={false} />
        </Field>
        <Switch
          checked={readOnly}
          onCheckedChange={setReadOnly}
          label="Read only"
          description="Turn off if calling it changes data, such as starting a return. It's labelled so your team knows."
        />
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

function ToolTester({ tool, onClose }: { tool: Tool | null; onClose: () => void }) {
  const test = useTestTool();
  const [args, setArgs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ToolRun | null>(null);
  const props = Object.entries(tool?.parameters.properties ?? {});

  useEffect(() => {
    setArgs({});
    setResult(null);
    test.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  const coerce = (schema: JsonSchema, v: string): unknown => {
    if (schema.type === 'integer' || schema.type === 'number') return v === '' ? undefined : Number(v);
    if (schema.type === 'boolean') return v === 'true';
    if (schema.type === 'array' || schema.type === 'object') {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }
    return v;
  };

  const run = () => {
    if (!tool) return;
    const out = Object.fromEntries(props.map(([k, s]) => [k, coerce(s, args[k] ?? '')]).filter(([, v]) => v !== '' && v !== undefined));
    test.mutate({ name: tool.name, args: out }, { onSuccess: setResult });
  };

  return (
    <Sheet
      open={Boolean(tool)}
      onOpenChange={(o) => !o && onClose()}
      title={tool ? `Test ${tool.name}` : 'Test'}
      description="This calls your endpoint for real and records the run."
      footer={
        <Button variant="accent" leading={<Play />} loading={test.isPending} onClick={run}>
          Run test
        </Button>
      }
    >
      {tool && (
        <div className="grid gap-5">
          {!tool.read_only && (
            <Callout tone="warn" icon={<AlertTriangle />} title="This tool changes data">
              A test makes the same change a real call would.
            </Callout>
          )}
          {props.length ? (
            props.map(([k, s]) => (
              <Field key={k} label={<span className="font-mono">{k}</span>} optional={!tool.parameters.required?.includes(k)} hint={s.description}>
                {s.enum ? (
                  <Select value={args[k] ?? ''} placeholder="Choose…" onChange={(e) => setArgs({ ...args, [k]: e.target.value })} options={s.enum.map((v) => ({ value: String(v), label: String(v) }))} />
                ) : s.type === 'boolean' ? (
                  <Select value={args[k] ?? ''} placeholder="—" onChange={(e) => setArgs({ ...args, [k]: e.target.value })} options={[{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }]} />
                ) : (
                  <Input
                    value={args[k] ?? ''}
                    type={s.type === 'integer' || s.type === 'number' ? 'number' : 'text'}
                    onChange={(e) => setArgs({ ...args, [k]: e.target.value })}
                    placeholder={s.type === 'array' || s.type === 'object' ? 'JSON' : s.type}
                  />
                )}
              </Field>
            ))
          ) : (
            <p className="text-[0.8125rem] text-ink-faint">This tool takes no parameters.</p>
          )}

          {result && (
            <div className="grid gap-2 animate-fade-in">
              <div className="flex items-center gap-2">
                {result.status === 'ok' ? <CheckCircle2 className="size-4 text-live" /> : <XCircle className="size-4 text-danger" />}
                <span className={cn('text-[0.8125rem] font-semibold', result.status === 'ok' ? 'text-live' : 'text-danger')}>
                  {result.status === 'ok' ? 'Succeeded' : 'Failed'}
                </span>
                <span className="ml-auto text-xs text-ink-faint">{formatMs(result.latency_ms)}</span>
              </div>
              <p className="text-xs text-ink-faint">What the model would receive:</p>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-[12px] border border-line bg-surface-2 p-3 font-mono text-xs text-ink">{result.output || '(empty)'}</pre>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
