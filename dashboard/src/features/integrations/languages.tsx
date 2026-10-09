import { useQuery } from '@tanstack/react-query';
import { useStoredState } from '@/hooks';
import { CodeBlock, Segmented, Select } from '@/components/ui';
import { LANG_LABEL, PACKS, type Lang } from './snippets/types';
import type { Recipe } from './snippets/web-sdk';

/** The website SDK's framework recipes, fetched when a widget guide first opens. */
export function useWebRecipes() {
  return useQuery({
    queryKey: ['snippets', 'web-sdk'],
    queryFn: () => import('./snippets/web-sdk'),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** A framework picker; the choice is remembered across guides. */
export function useRecipe(key: string, fallback: string) {
  return useStoredState<string>(`truplexy.integrations.${key}`, fallback);
}

export function RecipePicker({ label, recipes, value, onChange, other }: { label: string; recipes: Recipe[]; value: string; onChange: (id: string) => void; other?: string }) {
  const options = recipes.map((r) => ({ value: r.id, label: r.label }));
  if (other) options.push({ value: 'other', label: other });
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="text-[0.8125rem] text-ink-muted">{label}</span>
      <Select size="sm" className="w-auto min-w-[200px]" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} options={options} />
    </div>
  );
}

/** A recipe's install command, files and note. */
export function RecipeCode({ recipe }: { recipe: Recipe }) {
  return (
    <>
      {recipe.install && <CodeBlock title="Terminal" code={recipe.install} />}
      <CodeBlock key={recipe.id} samples={recipe.files.map((f) => ({ label: f.name, code: f.code }))} />
      {recipe.note && <p className="text-xs text-ink-faint">{recipe.note}</p>}
    </>
  );
}

/** One language's code samples. Each pack is its own chunk, fetched when first picked. */
export function useLangPack(lang: Lang) {
  return useQuery({
    queryKey: ['snippets', lang],
    queryFn: () => PACKS[lang]().then((m) => m.default),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** The person's server language, remembered across guides; falls back to the first a guide offers. */
export function useLang(offered: readonly Lang[]) {
  const [pref, setPref] = useStoredState<Lang>('truplexy.integrations.lang', 'node');
  const lang = offered.includes(pref) ? pref : (offered[0] ?? 'node');
  return [lang, setPref] as const;
}

export function LangPicker({ langs, value, onChange }: { langs: readonly Lang[]; value: Lang; onChange: (l: Lang) => void }) {
  if (langs.length < 2) {
    return <span className="text-[0.8125rem] font-semibold text-ink">{LANG_LABEL[value]}</span>;
  }
  return <Segmented size="xs" label="Server language" value={value} onChange={onChange} options={langs.map((l) => ({ value: l, label: LANG_LABEL[l] }))} />;
}

export const ALL_LANGS = Object.keys(LANG_LABEL) as Lang[];
