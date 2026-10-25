import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw, Trash2 } from 'lucide-react';
import { useCommitImport, useDeleteImport, useImport, useProcessImport } from '@/lib/api/endpoints/products';
import type { ImportCommitResult, ProductDraft, ProductInput } from '@/lib/api/types';
import { formatNumber, formatRelative, pluralize } from '@/lib/format';
import { IMPORT_METHOD, IMPORT_STATUS, formatPrice, parsePrice } from '@/lib/products';
import { useScopeCtx } from '@/lib/session/scope-context';
import { Badge, Button, Callout, Card, Checkbox, EmptyState, ErrorState, Input, Page, PageHeader, Select, SkeletonRows, Tip, useConfirm } from '@/components/ui';
import { ProductImage } from './shared';

/** The fields a reviewer can change in the table, as typed. */
interface Row {
  name: string;
  sku: string;
  price: string;
  currency: string;
  stock: string;
}

const rowOf = (d: ProductDraft): Row => ({ name: d.name, sku: d.sku, price: d.price ?? '', currency: d.currency, stock: d.stock === null ? '' : String(d.stock) });

function rowProblem(r: Row): string | undefined {
  if (!r.name.trim()) return 'Needs a name.';
  if (parsePrice(r.price) === undefined) return 'The price isn’t an amount.';
  if (r.currency.trim() && !/^[A-Za-z]{3}$/.test(r.currency.trim())) return 'The currency is a three-letter code.';
  if (r.stock.trim() && !/^\d{1,10}$/.test(r.stock.trim())) return 'Stock is a whole number.';
  return undefined;
}

/** What changed in a row, as product fields. */
function editOf(d: ProductDraft, r: Row): ProductInput | undefined {
  const was = rowOf(d);
  const out: ProductInput = {};
  if (r.name.trim() !== was.name) out.name = r.name.trim();
  if (r.sku.trim() !== was.sku) out.sku = r.sku.trim();
  if (r.price.trim() !== was.price) out.price = parsePrice(r.price) ?? null;
  if (r.currency.trim().toUpperCase() !== was.currency) out.currency = r.currency.trim().toUpperCase();
  if (r.stock.trim() !== was.stock) out.stock = r.stock.trim() === '' ? null : Number(r.stock);
  return Object.keys(out).length ? out : undefined;
}

/** /products/imports/:importId — review what an import found, then save the products kept. */
export function ImportReviewPage() {
  const { importId } = useParams();
  const { href, can } = useScopeCtx();
  const writable = can('products.write');
  const navigate = useNavigate();
  const q = useImport(importId);
  const commit = useCommitImport();
  const discard = useDeleteImport();
  const retry = useProcessImport();
  const confirm = useConfirm();
  const imp = q.data;
  const drafts = useMemo(() => imp?.items ?? [], [imp?.items]);
  const [rows, setRows] = useState<Row[]>([]);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [onDuplicate, setOnDuplicate] = useState<'skip' | 'update'>('skip');
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  useEffect(() => {
    setRows(drafts.map(rowOf));
    // Drafts without a name can't be saved; the rest start ticked.
    setPicked(drafts.map((d) => Boolean(d.name)));
  }, [drafts]);

  const problems = rows.map(rowProblem);
  const chosen = picked.flatMap((p, i) => (p ? [i] : []));
  const blocked = chosen.filter((i) => problems[i]);
  const existing = chosen.filter((i) => drafts[i]?.exists).length;

  const save = () => {
    if (!imp || !chosen.length || blocked.length) return;
    const edits: Record<string, ProductInput> = {};
    for (const i of chosen) {
      const e = editOf(drafts[i]!, rows[i]!);
      if (e) edits[i] = e;
    }
    commit.mutate({ id: imp.id, body: { indexes: chosen, edits, on_duplicate: onDuplicate } }, { onSuccess: setResult });
  };

  const onDiscard = () =>
    imp &&
    confirm({
      title: 'Discard this import?',
      description: 'Nothing from it has been added to your catalog. Its file is deleted.',
      confirmLabel: 'Discard',
      tone: 'danger',
      onConfirm: async () => {
        await discard.mutateAsync(imp.id);
        navigate(href('products'));
      },
    });

  const back = (
    <Button asChild size="sm" variant="ghost" leading={<ArrowLeft />}>
      <Link to={href('products')}>Products</Link>
    </Button>
  );

  if (q.isPending) {
    return (
      <Page>
        <SkeletonRows rows={8} />
      </Page>
    );
  }
  if (q.isError || !imp) {
    return (
      <Page>
        <ErrorState error={q.error} onRetry={() => q.refetch()} notFound={{ title: 'This import doesn’t exist', description: 'It may have been discarded.', back: { to: href('products'), label: 'Back to products' } }} />
      </Page>
    );
  }

  const done = result?.import ?? (imp.status === 'committed' ? imp : null);
  return (
    <Page>
      <PageHeader
        title="Review import"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="max-w-[46ch] truncate">{imp.name}</span>
            <Badge tone={IMPORT_STATUS[imp.status].tone}>{IMPORT_STATUS[imp.status].label}</Badge>
            <span className="text-ink-faint">{formatRelative(imp.created_at)}</span>
          </span>
        }
        actions={
          <>
            {back}
            {writable && !done && (
              <Button size="sm" variant="ghost" className="hover:text-danger" leading={<Trash2 />} onClick={() => void onDiscard()}>
                Discard
              </Button>
            )}
          </>
        }
      />

      {done ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 className="text-live" />}
            title="Saved to your catalog"
            description={`${pluralize(done.created, 'product')} added, ${formatNumber(done.updated)} updated, ${formatNumber(done.skipped)} skipped because their SKU was already in the catalog.`}
            action={
              <Button asChild variant="accent">
                <Link to={href('products')}>Go to products</Link>
              </Button>
            }
          />
          {result && result.errors.length > 0 && (
            <Callout tone="warn" icon={<AlertTriangle />} title={`${pluralize(result.errors.length, 'product')} couldn’t be saved`}>
              <ul className="mt-1 grid gap-0.5">
                {result.errors.map((e) => (
                  <li key={e.index}>
                    <span className="font-semibold text-ink">{drafts[e.index]?.name || `Row ${e.index + 1}`}</span>: {e.message}
                  </li>
                ))}
              </ul>
            </Callout>
          )}
        </Card>
      ) : imp.status === 'failed' || imp.status === 'uploading' ? (
        <Card>
          <EmptyState
            icon={<AlertTriangle className="text-danger" />}
            title={imp.status === 'uploading' ? 'The file never finished uploading' : 'No products could be read'}
            description={imp.error ?? 'Import the file again.'}
            action={
              writable &&
              imp.source === 'file' && (
                <Button leading={<RefreshCw />} loading={retry.isPending} onClick={() => retry.mutate(imp.id)}>
                  Try reading it again
                </Button>
              )
            }
          />
        </Card>
      ) : imp.status === 'processing' ? (
        <Card>
          <EmptyState title="Reading…" description="This page updates when it's done." />
        </Card>
      ) : (
        <>
          {imp.method && <Callout tone={imp.method === 'ai' ? 'warn' : 'neutral'}>{IMPORT_METHOD[imp.method]}</Callout>}
          {imp.truncated && (
            <Callout tone="warn" icon={<AlertTriangle />}>
              The source had more than one import reads, so only the first {formatNumber(drafts.length)} products are here. Split it and import the rest.
            </Callout>
          )}
          <Card
            flush
            title={`${pluralize(drafts.length, 'product')} found`}
            description="Untick what you don't want, and fix anything that looks wrong. Nothing is saved until you press Save."
            actions={
              <span className="flex gap-2">
                <Button size="xs" variant="ghost" onClick={() => setPicked(drafts.map((d) => Boolean(d.name)))}>
                  Select all
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setPicked(drafts.map(() => false))}>
                  Select none
                </Button>
              </span>
            }
          >
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-8">
                      <span className="sr-only">Save</span>
                    </th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th className="text-right">Price</th>
                    <th>Currency</th>
                    <th className="text-right">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d, i) => {
                    const r = rows[i];
                    if (!r) return null;
                    const set = (patch: Partial<Row>) => setRows((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    const problem = problems[i];
                    return (
                      <tr key={i} className={picked[i] ? undefined : 'opacity-55'}>
                        <td className="align-top">
                          <Checkbox aria-label={`Save ${r.name || `row ${i + 1}`}`} checked={Boolean(picked[i])} disabled={!writable} onChange={(e) => setPicked((p) => p.map((x, j) => (j === i ? e.target.checked : x)))} />
                        </td>
                        <td className="min-w-[240px] align-top">
                          <div className="flex items-start gap-2.5">
                            <ProductImage src={d.image_url} name={d.name} size={32} />
                            <div className="grid flex-1 gap-1">
                              <Input size="sm" aria-label="Name" value={r.name} maxLength={200} readOnly={!writable} onChange={(e) => set({ name: e.target.value })} />
                              <div className="flex flex-wrap items-center gap-1.5">
                                {d.exists && (
                                  <Tip content="Your catalog already has a product with this SKU">
                                    <Badge tone="accent" tabIndex={0}>
                                      In catalog
                                    </Badge>
                                  </Tip>
                                )}
                                {picked[i] && problem && <span className="text-xs font-medium text-danger">{problem}</span>}
                                {d.problems.map((p) => (
                                  <span key={p} className="text-xs text-warn">
                                    {p}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="align-top">
                          <Input size="sm" className="mono w-32" aria-label="SKU" value={r.sku} maxLength={64} readOnly={!writable} onChange={(e) => set({ sku: e.target.value })} />
                        </td>
                        <td className="align-top">
                          <Input size="sm" className="w-24 text-right" aria-label="Price" inputMode="decimal" value={r.price} readOnly={!writable} onChange={(e) => set({ price: e.target.value })} />
                          {r.price && parsePrice(r.price) && <p className="mt-1 text-right text-xs text-ink-faint">{formatPrice(parsePrice(r.price)!, r.currency.trim().toUpperCase())}</p>}
                        </td>
                        <td className="align-top">
                          <Input size="sm" className="w-16" aria-label="Currency" value={r.currency} maxLength={3} readOnly={!writable} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} />
                        </td>
                        <td className="align-top">
                          <Input size="sm" className="w-20 text-right" aria-label="Stock" inputMode="numeric" value={r.stock} readOnly={!writable} onChange={(e) => set({ stock: e.target.value })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          {writable && (
            <div className="sticky bottom-0 z-10 -mx-[var(--page-x)] flex flex-wrap items-center justify-end gap-3 border-t border-line bg-surface/95 px-[var(--page-x)] py-3 backdrop-blur">
              {existing > 0 && (
                <label className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
                  {pluralize(existing, 'product')} already in your catalog:
                  <Select size="sm" className="w-auto" value={onDuplicate} onChange={(e) => setOnDuplicate(e.target.value as 'skip' | 'update')}>
                    <option value="skip">Skip them</option>
                    <option value="update">Update them</option>
                  </Select>
                </label>
              )}
              {blocked.length > 0 && <span className="text-xs font-medium text-danger">Fix or untick {pluralize(blocked.length, 'row')} first.</span>}
              <Button variant="accent" loading={commit.isPending} disabled={!chosen.length || blocked.length > 0} onClick={save}>
                Save {pluralize(chosen.length, 'product')}
              </Button>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
