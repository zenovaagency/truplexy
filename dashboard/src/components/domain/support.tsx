import { useState } from 'react';
import { useTenant } from '@/lib/api/endpoints/business';
import { ChevronDown } from 'lucide-react';
import type { Member, SupportCategory } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { CATEGORY_DESCRIPTION, CATEGORY_LABEL, CATEGORY_SHORT, PRESENCE_LABEL, presenceOf, type Presence, SUPPORT_CATEGORIES } from '@/lib/support';
import { Badge, Button, Checkbox, Popover, PopoverContent, PopoverTrigger, Select } from '@/components/ui';

/** Whether the API assigns tickets and knows categories and availability (it reports the business's auto_assign). */
export function useTeamAssignment() {
  return useTenant().data?.auto_assign !== undefined;
}

const DOT: Record<Presence, string> = {
  online: 'bg-live',
  idle: 'bg-warn',
  away: 'bg-warn',
  offline: 'bg-ink-faint',
};

/** A member's status: available and online, away (set, or not seen lately) or offline. */
export function StatusDot({ member, className }: { member: Pick<Member, 'availability' | 'online'>; className?: string }) {
  const p = presenceOf(member);
  return (
    <span
      role="img"
      aria-label={PRESENCE_LABEL[p]}
      title={PRESENCE_LABEL[p]}
      className={cn('inline-block size-2 shrink-0 rounded-full', DOT[p], p === 'offline' && 'opacity-60', className)}
    />
  );
}

export function PresenceLabel({ member }: { member: Pick<Member, 'availability' | 'online'> }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-muted">
      <StatusDot member={member} />
      {PRESENCE_LABEL[presenceOf(member)]}
    </span>
  );
}

export function CategoryBadge({ category, className }: { category?: SupportCategory; className?: string }) {
  if (!category) return null;
  return (
    <Badge tone="outline" className={cn('px-1.5 py-px text-[0.68rem]', className)} title={CATEGORY_LABEL[category]}>
      {CATEGORY_SHORT[category]}
    </Badge>
  );
}

export const CATEGORY_OPTIONS = SUPPORT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

export function CategorySelect({
  value,
  onChange,
  disabled,
  className,
  size,
}: {
  value?: SupportCategory;
  onChange: (c: SupportCategory) => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <Select
      aria-label="Category"
      size={size}
      className={className}
      value={value ?? 'general'}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as SupportCategory)}
      options={CATEGORY_OPTIONS}
    />
  );
}

/** A member's support roles as small badges; none reads as General. */
export function SupportRoleList({ roles }: { roles?: SupportCategory[] }) {
  const shown = roles?.length ? roles : (['general'] as SupportCategory[]);
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((r) => (
        <CategoryBadge key={r} category={r} />
      ))}
    </span>
  );
}

/** Picks a member's support roles; saves when the popover closes with a change. */
export function SupportRolesPicker({
  name,
  roles,
  onSave,
  disabled,
}: {
  name: string;
  roles?: SupportCategory[];
  onSave: (roles: SupportCategory[]) => void;
  disabled?: boolean;
}) {
  const current = roles ?? [];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SupportCategory[]>(current);
  const toggle = (c: SupportCategory, on: boolean) => setDraft((d) => (on ? [...d, c] : d.filter((x) => x !== c)));
  const changed = draft.length !== current.length || draft.some((c) => !current.includes(c));
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(current);
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        aria-label={`Support roles for ${name}`}
        className="group flex min-h-8 max-w-64 items-center gap-1.5 rounded-[9px] px-1.5 py-1 text-left hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <SupportRoleList roles={current} />
        {!disabled && <ChevronDown className="size-3.5 shrink-0 text-ink-faint" />}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3">
        <p className="mb-2 text-xs text-ink-faint">Tickets in these categories go to {name} in turn. None means general support.</p>
        <div className="grid gap-2">
          {SUPPORT_CATEGORIES.map((c) => (
            <Checkbox
              key={c}
              checked={draft.includes(c)}
              onChange={(e) => toggle(c, e.target.checked)}
              className="items-start"
              label={
                <span className="grid">
                  <span className="font-medium">{CATEGORY_LABEL[c]}</span>
                  <span className="text-[0.7rem] text-ink-faint">{CATEGORY_DESCRIPTION[c]}</span>
                </span>
              }
            />
          ))}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="quiet" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="accent"
            disabled={!changed}
            onClick={() => {
              onSave(SUPPORT_CATEGORIES.filter((c) => draft.includes(c)));
              setOpen(false);
            }}
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
