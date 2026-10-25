import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { ImportCommit, ImportCommitResult, Product, ProductImport, ProductImportUpload, ProductInput, ProductList, ProductStatus } from '@/lib/api/types';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';
import { putObject } from '@/lib/upload';

/* The bot's product catalog and its imports. Scope headers are required; these act on the bot. */

export interface ProductFilter {
  q?: string;
  status?: ProductStatus;
  /** Exact property values, sent as property[key]=value. */
  properties?: Record<string, string>;
}

export function useProducts(f: ProductFilter) {
  const scope = useScope();
  const filters = Object.fromEntries(Object.entries(f.properties ?? {}).map(([k, v]) => [`property[${k}]`, v]));
  return useInfiniteQuery({
    queryKey: qk.bot(scope, 'products', 'list', f.q ?? '', f.status ?? '', filters),
    queryFn: ({ pageParam, signal }) =>
      api<ProductList>('/products', { scope, signal, query: { limit: 50, q: f.q || undefined, status: f.status, ...filters, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor,
    placeholderData: (prev) => prev,
  });
}

export function useProduct(id: string | undefined) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'products', 'detail', id),
    queryFn: ({ signal }) => api<Product>(`/products/${id}`, { scope, signal }),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

function useInvalidateProducts() {
  const scope = useScope();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.bot(scope, 'products') });
}

export function useCreateProduct() {
  const scope = useScope();
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (body: ProductInput) => api<Product>('/products', { method: 'POST', body, scope }),
    onSuccess: invalidate,
    meta: { success: 'Product added' },
  });
}

export function useUpdateProduct() {
  const scope = useScope();
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProductInput }) => api<Product>(`/products/${id}`, { method: 'PATCH', body: patch, scope }),
    onSuccess: invalidate,
    meta: { success: 'Product saved' },
  });
}

export function useDeleteProduct() {
  const scope = useScope();
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/products/${id}`, { method: 'DELETE', scope }),
    onSuccess: invalidate,
    meta: { success: 'Product deleted' },
  });
}

/* Imports -------------------------------------------------------------- */

export function useImports(enabled = true) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'products', 'imports'),
    queryFn: ({ signal }) => api<{ data: ProductImport[] }>('/products/imports', { scope, signal }).then((r) => r.data),
    enabled,
    staleTime: 15_000,
  });
}

export function useImport(id: string | undefined) {
  const scope = useScope();
  return useQuery({
    queryKey: qk.bot(scope, 'products', 'import', id),
    queryFn: ({ signal }) => api<ProductImport>(`/products/imports/${id}`, { scope, signal }),
    enabled: Boolean(id),
    // A file still uploading or being read is checked again.
    refetchInterval: (q) => (q.state.data?.status === 'processing' ? 3000 : false),
  });
}

export type ImportStep = 'uploading' | 'reading';

/** Imports a file: register it, PUT it to storage, then have it read. Answers the read import. */
export function useImportFile() {
  const scope = useScope();
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: async ({ file, onStep }: { file: File; onStep?: (step: ImportStep, progress: number) => void }) => {
      const upload = await api<ProductImportUpload>('/products/imports', { method: 'POST', body: { source: 'file', filename: file.name, size: file.size }, scope });
      onStep?.('uploading', 0);
      await putObject(upload.url, upload.headers, file, (p) => onStep?.('uploading', p));
      onStep?.('reading', 0);
      return api<ProductImport>(`/products/imports/${upload.import.id}/process`, { method: 'POST', scope });
    },
    onSettled: invalidate,
  });
}

/** Reads the products on a web page. Answers the read import, which may have failed. */
export function useImportPage() {
  const scope = useScope();
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (url: string) => api<ProductImport>('/products/imports', { method: 'POST', body: { source: 'url', url }, scope }),
    onSettled: invalidate,
  });
}

/** Reads an uploaded file again, after a failure. */
export function useProcessImport() {
  const scope = useScope();
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (id: string) => api<ProductImport>(`/products/imports/${id}/process`, { method: 'POST', scope }),
    onSettled: invalidate,
  });
}

export function useCommitImport() {
  const scope = useScope();
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ImportCommit }) => api<ImportCommitResult>(`/products/imports/${id}/commit`, { method: 'POST', body, scope }),
    onSettled: invalidate,
  });
}

export function useDeleteImport() {
  const scope = useScope();
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/products/imports/${id}`, { method: 'DELETE', scope }),
    onSuccess: invalidate,
    meta: { success: 'Import discarded' },
  });
}
