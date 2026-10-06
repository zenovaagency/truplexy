import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, MoreHorizontal, Pencil, Play, Plus, Trash2, Wrench, XCircle } from 'lucide-react';
import { hasCode } from '@/lib/api/client';
import { useDeleteTool, useSaveTool, useTestTool, useTools } from '@/lib/api/endpoints/bot';
import type { HttpMethod, JsonSchema, Tool, ToolRun } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMs, formatRelative } from '@/lib/format';
import { useScopeCtx } from '@/lib/session/scope-context';
import {
  Badge,
  Button,
  Callout,
  Card,
  CodeBlock,
  CopyField,
  DataTable,
  DescList,
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
  Segmented,
  Select,
  Sheet,
  SkeletonRows,
  Switch,
  Textarea,
  useConfirm,
  type Column,
} from '@/components/ui';
import { BotToolsCard } from './BotToolsCard';
import { MAX_PARAMS, ParamsForm, newRow, rowsToSchema, schemaToRows, validateRows, type ParamRow } from './ParamsEditor';

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

function AccessBadge({ tool }: { tool: Tool }) {
  return tool.read_only ? <Badge tone="outline">Read only</Badge> : <Badge tone="warn">Changes data</Badge>;
}

const paramCount = (t: Tool) => Object.keys(t.parameters.properties ?? {}).length;

export default function ToolsPage() {
  const { can, bot } = useScopeCtx();
  const tools = useTools();
  const del = useDeleteTool();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Tool | 'new' | null>(null);
  const [testing, setTesting] = useState<Tool | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const writable = can('tools.write');
  // Read from the list so the view stays current after an edit.
  const viewed = tools.data?.data.find((t) => t.name === viewing) ?? null;

  const remove = (t: Tool) =>
    confirm({
      title: `Delete ${t.name}?`,
      description: "Bots that use it stop offering it to the model. Past runs stay recorded.",
      confirmLabel: 'Delete tool',
      tone: 'danger',
      onConfirm: () => del.mutateAsync(t.name),
    });

  const actions = (t: Tool) =>
    writable && (
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
    );

  const columns: Column<Tool>[] = [
    {
      key: 'tool',
      header: 'Tool',
      cell: (t) => (
        <div className={cn('flex min-w-0 items-center gap-3', !t.available && 'opacity-60')}>
          <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-surface-2 text-accent">
            <Wrench className="size-4" />
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[0.8125rem] font-bold text-ink">{t.name}</span>
              {!t.available && <Badge tone="danger">Unavailable</Badge>}
            </span>
            <span className="line-clamp-1 max-w-[52ch] text-xs text-ink-faint">{t.available ? t.description : t.unavailable_reason || t.description}</span>
          </span>
        </div>
      ),
    },
    {
      key: 'endpoint',
      header: 'Endpoint',
      hideBelowLg: true,
      cell: (t) => (
        <span className="flex min-w-0 max-w-[280px] items-center gap-1.5" title={t.api.url}>
          <MethodTag m={t.api.method} />
          <span className="truncate font-mono text-xs text-ink-faint">{t.api.url}</span>
        </span>
      ),
    },
    { key: 'access', header: 'Access', cell: (t) => <AccessBadge tool={t} /> },
    {
      key: 'params',
      header: 'Parameters',
      hideBelowLg: true,
      cell: (t) => <span className="whitespace-nowrap text-xs text-ink-muted">{paramCount(t) || 'None'}</span>,
    },
    {
      key: 'updated',
      header: 'Updated',
      cell: (t) => (
        <time dateTime={t.api.updated_at} title={formatDateTime(t.api.updated_at)} className="whitespace-nowrap text-xs text-ink-faint">
          {formatRelative(t.api.updated_at)}
        </time>
      ),
    },
    ...(writable ? [{ key: 'actions', header: <span className="sr-only">Actions</span>, align: 'right' as const, cell: actions }] : []),
  ];

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

      {tools.data && !tools.data.database_configured && (
        <Callout tone="warn" icon={<AlertTriangle />} title="Tools are unavailable on this server">
          The API has no database configured, so tools can't be saved or run.
        </Callout>
      )}

      <Card flush title="Tool library" description="Shared by every bot in this business. Each bot picks the ones it may call, above. Select a tool to see its details.">
        {tools.isPending ? (
          <SkeletonRows rows={3} className="p-4" />
        ) : tools.isError ? (
          <ErrorState error={tools.error} onRetry={() => tools.refetch()} />
        ) : !tools.data.data.length ? (
          <EmptyState
            icon={<Wrench />}
            title="No tools yet"
            description="Give the assistant a way to check order status, book a slot or look up stock, using an API you already have."
            action={writable && <Button variant="accent" leading={<Plus />} onClick={() => setEditing('new')}>Add a tool</Button>}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={tools.data.data}
            getKey={(t) => t.name}
            onRowClick={(t) => setViewing(t.name)}
            selectedKey={viewed?.name}
            card={(t) => (
              <div className={cn('flex items-start gap-3', !t.available && 'opacity-60')}>
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[0.8125rem] font-bold text-ink">{t.name}</span>
                    <AccessBadge tool={t} />
                    {!t.available && <Badge tone="danger">Unavailable</Badge>}
                  </div>
                  <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink-faint">
                    <MethodTag m={t.api.method} />
                    <span className="truncate font-mono">{t.api.url}</span>
                  </p>
                  <p className="line-clamp-2 text-xs text-ink-muted">{t.description}</p>
                </div>
                {actions(t)}
              </div>
            )}
          />
        )}
      </Card>

      {!writable && tools.data?.data.length ? (
        <p className="flex items-center gap-2 text-xs text-ink-faint">
          <Lock className="size-3.5" /> Your role can see tools but not change or run them.
        </p>
      ) : null}

      <ToolViewer
        tool={viewed}
        writable={writable}
        onClose={() => setViewing(null)}
        onEdit={(t) => (setViewing(null), setEditing(t))}
        onTest={(t) => (setViewing(null), setTesting(t))}
        onDelete={(t) => (setViewing(null), void remove(t))}
      />
      <ToolEditor tool={editing} onClose={() => setEditing(null)} />
      <ToolTester tool={testing} onClose={() => setTesting(null)} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */

const typeLabel = (s: JsonSchema) => (s.type === 'array' ? `${s.items?.type ?? 'any'}[]` : (s.type ?? 'any'));

function ToolViewer({
  tool,
  writable,
  onClose,
  onEdit,
  onTest,
  onDelete,
}: {
  tool: Tool | null;
  writable: boolean;
  onClose: () => void;
  onEdit: (t: Tool) => void;
  onTest: (t: Tool) => void;
  onDelete: (t: Tool) => void;
}) {
  const props = Object.entries(tool?.parameters.properties ?? {});
  return (
    <Sheet
      open={Boolean(tool)}
      onOpenChange={(o) => !o && onClose()}
      title={tool ? <span className="font-mono">{tool.name}</span> : 'Tool'}
      description={tool && `Updated ${formatRelative(tool.api.updated_at)}`}
      footer={
        writable &&
        tool && (
          <>
            <Button variant="danger-ghost" leading={<Trash2 />} className="mr-auto" onClick={() => onDelete(tool)}>
              Delete
            </Button>
            <Button variant="ghost" leading={<Play />} disabled={!tool.available} onClick={() => onTest(tool)}>
              Run a test
            </Button>
            <Button variant="accent" leading={<Pencil />} onClick={() => onEdit(tool)}>
              Edit
            </Button>
          </>
        )
      }
    >
      {tool && (
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-1.5">
            <AccessBadge tool={tool} />
            {!tool.available && <Badge tone="danger">Unavailable</Badge>}
          </div>
          {!tool.available && tool.unavailable_reason && (
            <Callout tone="danger" icon={<AlertTriangle />} title="Bots can't call this tool right now">
              {tool.unavailable_reason}
            </Callout>
          )}

          <section className="grid gap-1.5">
            <h3 className="text-[0.8125rem] font-bold text-ink">When the assistant uses it</h3>
            <p className="whitespace-pre-wrap text-[0.8125rem] text-ink-muted">{tool.description}</p>
          </section>

          <section className="grid gap-3">
            <h3 className="text-[0.8125rem] font-bold text-ink">Endpoint</h3>
            <CopyField value={tool.api.url} />
            <DescList
              items={[
                { label: 'Method', value: <MethodTag m={tool.api.method} /> },
                { label: 'Arguments go in', value: tool.api.method === 'GET' || tool.api.method === 'DELETE' ? 'The query string' : 'The JSON body' },
                { label: 'Created', value: formatDateTime(tool.api.created_at) },
                { label: 'Updated', value: formatDateTime(tool.api.updated_at) },
              ]}
            />
          </section>

          <section className="grid gap-2">
            <h3 className="text-[0.8125rem] font-bold text-ink">Parameters</h3>
            {props.length ? (
              <ul className="divide-y divide-line rounded-[12px] border border-line">
                {props.map(([k, s]) => (
                  <li key={k} className="grid gap-1 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <code className="font-mono text-xs font-semibold text-ink">{k}</code>
                      <span className="font-mono text-[0.68rem] text-ink-faint">{typeLabel(s)}</span>
                      {tool.parameters.required?.includes(k) && <Badge tone="outline" className="px-1.5 py-0 text-[0.65rem]">Required</Badge>}
                    </div>
                    {s.description && <p className="text-xs text-ink-muted">{s.description}</p>}
                    {s.enum && (
                      <p className="flex flex-wrap items-center gap-1 text-xs text-ink-faint">
                        One of:
                        {s.enum.map((v) => (
                          <code key={String(v)} className="rounded-[5px] bg-surface-2 px-1.5 py-0.5 font-mono text-[0.68rem] text-ink-muted">
                            {String(v)}
                          </code>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.8125rem] text-ink-faint">This tool takes no parameters.</p>
            )}
            <details>
              <summary className="cursor-pointer select-none text-xs font-semibold text-ink-muted hover:text-ink">JSON Schema</summary>
              <CodeBlock code={JSON.stringify(tool.parameters, null, 2)} className="mt-2" maxHeight={320} />
            </details>
          </section>
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

const EXAMPLE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { order_id: { type: 'string', description: 'The order number, e.g. A-10482' } },
  required: ['order_id'],
  additionalProperties: false,
};

const JSON_ONLY = "This schema uses options the form can't show, such as nested objects. Keep editing it as JSON.";

type Parsed = { ok: true; v: JsonSchema } | { ok: false; msg: string };

function parseSchema(text: string): Parsed {
  try {
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' && v.type === 'object' ? { ok: true, v: v as JsonSchema } : { ok: false, msg: 'The schema needs "type": "object".' };
  } catch (e) {
    return { ok: false, msg: `Not valid JSON: ${(e as Error).message}` };
  }
}

function ToolEditor({ tool, onClose }: { tool: Tool | 'new' | null; onClose: () => void }) {
  const save = useSaveTool();
  const existing = tool && tool !== 'new' ? tool : undefined;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [rows, setRows] = useState<ParamRow[]>([]);
  const [schema, setSchema] = useState('');
  const [modeError, setModeError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tool) return;
    const params = existing?.parameters ?? EXAMPLE_SCHEMA;
    const formRows = schemaToRows(params);
    setName(existing?.name ?? '');
    setDescription(existing?.description ?? '');
    setMethod(existing?.api.method ?? 'GET');
    setUrl(existing?.api.url ?? 'https://');
    setRows(formRows ?? []);
    setMode(formRows ? 'form' : 'json');
    setSchema(JSON.stringify(params, null, 2));
    setModeError(null);
    setReadOnly(existing?.read_only ?? true);
    setError(null);
  }, [tool, existing]);

  const rowErrors = useMemo(() => validateRows(rows), [rows]);
  const parsedJson = useMemo(() => parseSchema(schema), [schema]);
  const parsed: Parsed =
    mode === 'json'
      ? parsedJson
      : Object.keys(rowErrors).length
        ? { ok: false, msg: 'Fix the parameters marked above.' }
        : rows.length > MAX_PARAMS
          ? { ok: false, msg: `Use at most ${MAX_PARAMS} parameters.` }
          : { ok: true, v: rowsToSchema(rows) };

  const switchMode = (next: 'form' | 'json') => {
    if (next === mode) return;
    if (next === 'json') {
      setSchema(JSON.stringify(rowsToSchema(rows), null, 2));
      setModeError(null);
      setMode('json');
      return;
    }
    if (!parsedJson.ok) return setModeError(parsedJson.msg);
    const formRows = schemaToRows(parsedJson.v);
    if (!formRows) return setModeError(JSON_ONLY);
    setRows(formRows);
    setModeError(null);
    setMode('form');
  };

  const nameOk = /^[a-z][a-z0-9_]{0,63}$/.test(name);
  const urlOk = /^https:\/\/[^\s]+$/.test(url) && url.length <= 2000;
  const placeholders = [...new Set([...url.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]!))];
  // Each {placeholder} needs a required string or integer parameter of the same name.
  const needsFix = (s: { type?: string } | undefined, required: boolean) => !s || !required || (s.type !== 'string' && s.type !== 'integer');
  const missingParams = parsed.ok ? placeholders.filter((p) => needsFix(parsed.v.properties?.[p], Boolean(parsed.v.required?.includes(p)))) : [];
  const valid = nameOk && urlOk && description.trim() && parsed.ok && !missingParams.length;

  // In the form, read the rows directly so the fix is offered even while another row has an error.
  const missingInForm =
    mode === 'form'
      ? placeholders.filter((p) => {
          const r = rows.find((x) => x.name === p);
          return needsFix(r, Boolean(r?.required));
        })
      : [];
  const fixPlaceholders = () => {
    const fixed = rows.map((r) => (missingInForm.includes(r.name) ? { ...r, required: true, type: r.type === 'integer' ? r.type : ('string' as const) } : r));
    const absent = missingInForm.filter((p) => !rows.some((r) => r.name === p));
    setRows([...fixed, ...absent.map((p) => newRow({ name: p, required: true }))]);
  };

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

  const argsGoIn = method === 'GET' || method === 'DELETE' ? 'query string' : 'JSON body';

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
          <Field label="URL" error={url.length > 8 && !urlOk ? 'Enter an https:// URL.' : undefined}>
            <Input value={url} onChange={(e) => setUrl(e.target.value.trim())} className="font-mono text-xs" placeholder="https://api.example.com/orders/{order_id}" />
          </Field>
        </div>
        <Field
          label="Parameters"
          aside={
            <Segmented
              size="xs"
              label="Parameters editor"
              value={mode}
              onChange={switchMode}
              options={[
                { value: 'form', label: 'Form' },
                { value: 'json', label: 'JSON' },
              ]}
            />
          }
          hint={
            mode === 'form'
              ? `The model fills these in when it calls the tool. Ones not in the URL go in the ${argsGoIn}.`
              : `JSON Schema. Allowed keywords: type, description, properties, required, enum, items, additionalProperties: false. Arguments not in the URL go in the ${argsGoIn}.`
          }
          error={modeError ?? (!parsed.ok ? parsed.msg : missingParams.length ? `Add a required text or whole-number parameter for {${missingParams.join('}, {')}}.` : undefined)}
        >
          {mode === 'form' ? (
            <div className="grid gap-2">
              <ParamsForm rows={rows} onChange={setRows} errors={rowErrors} />
              {missingInForm.length > 0 && (
                <Callout tone="warn" icon={<AlertTriangle />} title="The URL uses parameters that aren't set up">
                  <div className="grid justify-items-start gap-2">
                    <span>Each {'{placeholder}'} in the URL needs a required text or whole-number parameter.</span>
                    <Button size="xs" variant="ghost" leading={<Plus />} onClick={fixPlaceholders}>
                      {missingInForm.some((p) => rows.some((r) => r.name === p)) ? 'Fix' : 'Add'} {missingInForm.map((p) => `{${p}}`).join(', ')}
                    </Button>
                  </div>
                </Callout>
              )}
            </div>
          ) : (
            <Textarea rows={12} value={schema} onChange={(e) => (setSchema(e.target.value), setModeError(null))} className="font-mono text-xs" spellCheck={false} />
          )}
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
