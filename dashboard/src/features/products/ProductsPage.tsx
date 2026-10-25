import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { FileUp, Globe, Lock, Package, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useCreateProduct, useDeleteProduct, useImports, useProduct, useProducts, useUpdateProduct } from '@/lib/api/endpoints/products';
import type { Product, ProductInput, ProductStatus, PropertyDefinition } from '@/lib/api/types';
import { formatNumber, formatRelative } from '@/lib/format';
import { IMPORT_STATUS, PRODUCT_STATUS, formatPrice, isLink, parsePrice } from '@/lib/products';
import { changedValues, filledValues, toField, valueProblem, type FieldValue } from '@/lib/properties';
import { useScopeCtx } from '@/lib/session/scope-context';
import { useDebounce } from '@/hooks';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadMore,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Page,
  PageHeader,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  SkeletonRows,
  Textarea,
  useConfirm,
  type Column,
} from '@/components/ui';
import { PropertyFields, PropertyFilter, filterOf } from '@/components/domain/Properties';
import { ImportDialog } from './ImportDialog';
import { ProductImage, useProductProperties } from './shared';

export { ImportReviewPage } from './ImportReviewPage';

export default function ProductsPage() {
  const { can, bot, href } = useScopeCtx();
  const writable = can('products.write');
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  const [status, setStatus] = useState<ProductStatus | 'all'>('all');
  const [filter, setFilter] = useState('');
  const defs = useProductProperties();
  const list = useProducts({ q: q || undefined, status: status === 'all' ? undefined : status, properties: filterOf(filter) });
  const imports = useImports(writable);
  const [importing, setImporting] = useState<'file' | 'url' | null>(null);
  const products = useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data]);
  // The open product is in the address, so it can be linked to.
  const { productId } = useParams();
  const navigate = useNavigate();
  const { search: query } = useLocation();
  const open = (id: string | null) => navigate({ pathname: href(id ? `products/${id}` : 'products'), search: query });
  const [adding, setAdding] = useState(false);
  const pending = (imports.data ?? []).filter((i) => i.status === 'ready' || i.status === 'failed' || i.status === 'uploading');
  const filtered = Boolean(q || filter || status !== 'all');

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Product',
      cell: (p) => (
        <span className="flex items-center gap-3">
          <ProductImage src={p.image_url} name={p.name} />
          <span className="grid min-w-0">
            <span className="truncate font-semibold text-ink">{p.name}</span>
            {p.sku && <span className="mono truncate text-xs text-ink-faint">{p.sku}</span>}
          </span>
        </span>
      ),
    },
    { key: 'price', header: 'Price', align: 'right', cell: (p) => <span className="whitespace-nowrap tabular-nums">{formatPrice(p.price, p.currency)}</span> },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      cell: (p) =>
        p.stock === null ? <span className="text-ink-faint">—</span> : <span className={p.stock === 0 ? 'font-semibold text-danger' : 'tabular-nums'}>{p.stock === 0 ? 'Sold out' : formatNumber(p.stock)}</span>,
    },
    { key: 'status', header: 'Status', cell: (p) => <Badge tone={PRODUCT_STATUS[p.status].tone}>{PRODUCT_STATUS[p.status].label}</Badge> },
    { key: 'updated', header: 'Changed', align: 'right', hideBelowLg: true, cell: (p) => <span className="whitespace-nowrap text-ink-muted">{formatRelative(p.updated_at)}</span> },
  ];

  return (
    <Page>
      <PageHeader
        title="Products"
        description={`What ${bot.name} can tell customers about: prices, stock and links. Turn on the built-in product search under Tools so the assistant can look them up.`}
        actions={
          writable && (
            <>
              <Menu>
                <MenuTrigger asChild>
                  <Button size="sm" leading={<Upload />}>
                    Import
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem onSelect={() => setImporting('file')}>
                    <FileUp /> From a file (CSV, JSON, PDF…)
                  </MenuItem>
                  <MenuItem onSelect={() => setImporting('url')}>
                    <Globe /> From a web page
                  </MenuItem>
                </MenuContent>
              </Menu>
              <Button variant="accent" size="sm" leading={<Plus />} onClick={() => setAdding(true)}>
                Add product
              </Button>
            </>
          )
        }
      />
      {pending.length > 0 && (
        <Card title="Imports waiting for you" description="Nothing reaches the catalog until you review it.">
          <ul className="grid gap-2">
            {pending.map((i) => (
              <li key={i.id}>
                <Link to={href(`products/imports/${i.id}`)} className="flex items-center gap-3 rounded-[10px] border border-line px-3 py-2.5 text-[0.8125rem] hover:bg-surface-2/60">
                  {i.source === 'url' ? <Globe className="size-4 shrink-0 text-ink-faint" /> : <FileUp className="size-4 shrink-0 text-ink-faint" />}
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{i.name}</span>
                  {i.status === 'ready' && <span className="text-xs text-ink-faint">{formatNumber(i.item_count)} found</span>}
                  <Badge tone={IMPORT_STATUS[i.status].tone}>{IMPORT_STATUS[i.status].label}</Badge>
                  <span className="whitespace-nowrap text-xs text-ink-faint">{formatRelative(i.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value.slice(0, 100))} placeholder="Search by name, SKU or description" aria-label="Search products" />
          </div>
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[{ value: 'all', label: 'All' }, ...(Object.keys(PRODUCT_STATUS) as ProductStatus[]).map((s) => ({ value: s, label: PRODUCT_STATUS[s].label }))]}
          />
          <PropertyFilter defs={defs} value={filter} onChange={setFilter} all="All products" />
        </div>
        {list.isPending ? (
          <SkeletonRows rows={6} className="p-4" />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={products}
            getKey={(p) => p.id}
            onRowClick={(p) => open(p.id)}
            selectedKey={productId}
            empty={
              <EmptyState
                icon={<Package />}
                title={filtered ? 'No products match' : 'No products yet'}
                description={filtered ? 'Try another search or filter.' : 'Add products one by one, or import a CSV file, a document or a page of your shop.'}
                action={
                  !filtered && writable ? (
                    <>
                      <Button leading={<Upload />} onClick={() => setImporting('file')}>
                        Import
                      </Button>
                      <Button variant="accent" leading={<Plus />} onClick={() => setAdding(true)}>
                        Add product
                      </Button>
                    </>
                  ) : undefined
                }
              />
            }
            footer={<LoadMore hasMore={list.hasNextPage} loading={list.isFetchingNextPage} onLoad={() => void list.fetchNextPage()} shown={products.length} />}
          />
        )}
        {!writable && (
          <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs text-ink-faint">
            <Lock className="size-3.5" /> Only editors and above can add, import or change products.
          </p>
        )}
      </Card>
      <ProductSheet id={adding ? 'new' : (productId ?? null)} defs={defs} writable={writable} onClose={() => (adding ? setAdding(false) : open(null))} />
      {importing && <ImportDialog mode={importing} onClose={() => setImporting(null)} />}
    </Page>
  );
}

/* ------------------------------------------------------------------ */

interface Form {
  name: string;
  sku: string;
  description: string;
  price: string;
  currency: string;
  stock: string;
  url: string;
  image_url: string;
  status: ProductStatus;
}

const EMPTY: Form = { name: '', sku: '', description: '', price: '', currency: '', stock: '', url: '', image_url: '', status: 'active' };

const toForm = (p: Product): Form => ({
  name: p.name,
  sku: p.sku,
  description: p.description,
  price: p.price ?? '',
  currency: p.currency,
  stock: p.stock === null ? '' : String(p.stock),
  url: p.url,
  image_url: p.image_url,
  status: p.status,
});

/** The form as product fields; `stock` and `price` are null when empty. */
function fieldsOf(f: Form): ProductInput {
  return {
    name: f.name.trim().replace(/\s+/g, ' '),
    sku: f.sku.trim(),
    description: f.description.trim(),
    price: parsePrice(f.price) ?? null,
    currency: f.currency.trim().toUpperCase(),
    stock: f.stock.trim() === '' ? null : Number(f.stock),
    url: f.url.trim(),
    image_url: f.image_url.trim(),
    status: f.status,
  };
}

function ProductSheet({ id, defs, writable, onClose }: { id: string | 'new' | null; defs: PropertyDefinition[]; writable: boolean; onClose: () => void }) {
  const existing = useProduct(id && id !== 'new' ? id : undefined);
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const del = useDeleteProduct();
  const confirm = useConfirm();
  const product = id && id !== 'new' ? existing.data : undefined;
  const [f, setF] = useState<Form>(EMPTY);
  const [props, setProps] = useState<Record<string, FieldValue>>({});
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (id === 'new') {
      setF(EMPTY);
      setProps(Object.fromEntries(defs.map((d) => [d.key, toField(d, undefined)])));
    } else if (product) {
      setF(toForm(product));
      setProps(Object.fromEntries(defs.filter((d) => !product.masked_properties?.includes(d.key)).map((d) => [d.key, toField(d, product.properties?.[d.key])])));
    }
    setTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, product?.id, product?.updated_at]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const editable = defs.filter((d) => d.key in props);
  const problems = {
    name: !f.name.trim() ? 'Give the product a name.' : undefined,
    price: parsePrice(f.price) === undefined ? 'Enter an amount such as 19.90.' : undefined,
    currency: f.currency.trim() && !/^[A-Za-z]{3}$/.test(f.currency.trim()) ? 'Use a three-letter code such as USD.' : undefined,
    stock: f.stock.trim() && !/^\d{1,10}$/.test(f.stock.trim()) ? 'Enter a whole number, or leave empty when you don’t track stock.' : undefined,
    url: isLink(f.url.trim()) ? undefined : 'Enter an http or https link.',
    image_url: isLink(f.image_url.trim()) ? undefined : 'Enter an http or https link.',
  };
  const propProblems = Object.fromEntries(editable.map((d) => [d.key, valueProblem(d, props[d.key]!)]));
  const valid = !Object.values(problems).some(Boolean) && !Object.values(propProblems).some(Boolean);
  const saving = create.isPending || update.isPending;

  const save = () => {
    setTouched(true);
    if (!valid || !writable) return;
    const fields = fieldsOf(f);
    if (id === 'new') {
      const properties = filledValues(editable, props);
      return create.mutate({ ...fields, ...(Object.keys(properties).length && { properties }) }, { onSuccess: onClose });
    }
    if (!product) return;
    const was = fieldsOf(toForm(product));
    const patch = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v !== was[k as keyof ProductInput])) as ProductInput;
    const properties = changedValues(editable, product.properties ?? {}, props);
    if (Object.keys(properties).length) patch.properties = properties;
    if (!Object.keys(patch).length) return onClose();
    update.mutate({ id: product.id, patch }, { onSuccess: onClose });
  };

  const onDelete = () =>
    product &&
    confirm({
      title: `Delete ${product.name}?`,
      description: 'The assistant stops finding it. Its SKU can be used again.',
      confirmLabel: 'Delete product',
      tone: 'danger',
      onConfirm: async () => {
        await del.mutateAsync(product.id);
        onClose();
      },
    });

  const err = (k: keyof typeof problems) => (touched ? problems[k] : undefined);
  const readonly = !writable;
  return (
    <Sheet
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      title={id === 'new' ? 'Add a product' : (product?.name ?? 'Product')}
      description={product ? `${PRODUCT_STATUS[product.status].label} · changed ${formatRelative(product.updated_at)}` : undefined}
      footer={
        writable ? (
          <>
            {product && (
              <Button variant="ghost" className="mr-auto hover:text-danger" leading={<Trash2 />} onClick={() => void onDelete()}>
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="accent" loading={saving} disabled={touched && !valid} onClick={save}>
              {id === 'new' ? 'Add product' : 'Save product'}
            </Button>
          </>
        ) : undefined
      }
    >
      {id !== 'new' && existing.isPending ? (
        <Skeleton className="h-60 rounded-[12px]" />
      ) : id !== 'new' && (existing.isError || !product) ? (
        <ErrorState compact error={existing.error} onRetry={() => existing.refetch()} />
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex items-start gap-4">
            <ProductImage src={isLink(f.image_url.trim()) ? f.image_url.trim() : undefined} name={f.name} size={72} />
            <div className="grid flex-1 gap-4">
              <Field label="Name" error={err('name')}>
                <Input value={f.name} maxLength={200} readOnly={readonly} onChange={(e) => set('name', e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SKU" optional hint="Unique in your catalog; imports use it to find this product again.">
              <Input className="mono" value={f.sku} maxLength={64} readOnly={readonly} onChange={(e) => set('sku', e.target.value)} />
            </Field>
            <Field label="Status" hint={PRODUCT_STATUS[f.status].hint}>
              <Select value={f.status} disabled={readonly} onChange={(e) => set('status', e.target.value as ProductStatus)} options={(Object.keys(PRODUCT_STATUS) as ProductStatus[]).map((s) => ({ value: s, label: PRODUCT_STATUS[s].label }))} />
            </Field>
            <Field label="Price" optional error={err('price')}>
              <Input inputMode="decimal" value={f.price} readOnly={readonly} onChange={(e) => set('price', e.target.value)} placeholder="19.90" />
            </Field>
            <Field label="Currency" optional error={err('currency')} hint="A code such as USD or EUR.">
              <Input value={f.currency} maxLength={3} readOnly={readonly} onChange={(e) => set('currency', e.target.value.toUpperCase())} placeholder="USD" />
            </Field>
            <Field label="Stock" optional error={err('stock')} hint="Leave empty when you don’t track it.">
              <Input inputMode="numeric" value={f.stock} readOnly={readonly} onChange={(e) => set('stock', e.target.value)} />
            </Field>
            <Field label="Link" optional error={err('url')}>
              <Input type="url" value={f.url} maxLength={2048} readOnly={readonly} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
            </Field>
          </div>
          <Field label="Image link" optional error={err('image_url')}>
            <Input type="url" value={f.image_url} maxLength={2048} readOnly={readonly} onChange={(e) => set('image_url', e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Description" optional aside={`${f.description.length}/5000`} hint="The assistant quotes it, so keep it factual.">
            <Textarea rows={4} value={f.description} maxLength={5000} readOnly={readonly} onChange={(e) => set('description', e.target.value)} />
          </Field>
          {defs.length > 0 && (
            <div className="grid gap-3 border-t border-line pt-4">
              <span className="text-[0.8125rem] font-semibold text-ink">Properties</span>
              <PropertyFields defs={defs} values={props} masked={product?.masked_properties} errors={touched ? propProblems : undefined} disabled={readonly} onChange={(key, v) => setProps((p) => ({ ...p, [key]: v }))} />
            </div>
          )}
          <button type="submit" hidden />
        </form>
      )}
    </Sheet>
  );
}
