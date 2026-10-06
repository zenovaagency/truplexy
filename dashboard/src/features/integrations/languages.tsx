import { useQuery } from '@tanstack/react-query';
import { useStoredState } from '@/hooks';
import { Segmented } from '@/components/ui';
import { LANG_LABEL, PACKS, type Lang } from './snippets/types';

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
