import { useState } from 'react';
import { useTenant } from '@/lib/api/endpoints/business';
import { ChevronDown } from 'lucide-react';
import type { Availability, Member, SupportCategory } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { AVAILABILITIES, AVAILABILITY_LABEL, CATEGORY_DESCRIPTION, CATEGORY_LABEL, CATEGORY_SHORT, PRESENCE_LABEL, presenceOf, type Presence, SUPPORT_CATEGORIES } from '@/lib/support';
import { Badge, Button, Checkbox, Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger, Popover, PopoverContent, PopoverTrigger, Select, Tip } from '@/components/ui';

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

/** What each availability means for new tickets, under its name in status menus. */
export const AVAILABILITY_HINT: Record<Availability, string> = {
  available: 'Gets new tickets while the dashboard is open.',
  away: 'Stepped out. Keeps tickets, gets no new ones.',
  offline: 'Done for now. Keeps tickets, gets no new ones.',
};

const IDLE_TIP = "Set to Available, but hasn't had the dashboard open in the last 15 minutes, so gets no new tickets.";

const pill =
  'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface pl-2.5 pr-2 text-xs font-medium text-ink';

/** The radio items of a status menu: a dot, the name and what it means. */
export function AvailabilityItems({ value, onChange }: { value: Availability; onChange: (a: Availability) => void }) {
  return (
    <MenuRadioGroup value={value} onValueChange={(v) => onChange(v as Availability)}>
      {AVAILABILITIES.map((a) => (
        <MenuRadioItem key={a} value={a} className="items-start gap-2.5 py-2">
          <span className="grid h-[1.15rem] place-items-center">
            <StatusDot member={{ availability: a, online: true }} />
          </span>
          <span className="grid gap-0.5">
            <span>{AVAILABILITY_LABEL[a]}</span>
            <span className="text-[0.7rem] font-normal leading-snug text-ink-faint">{AVAILABILITY_HINT[a]}</span>
          </span>
        </MenuRadioItem>
      ))}
    </MenuRadioGroup>
  );
}

/**
 * A member's status as one pill: dot and label (Inactive when set to available but not seen lately). With
 * `onChange` it opens a menu to change it; without, it only shows it.
 */
export function StatusPill({
  member,
  name,
  onChange,
}: {
  member: Pick<Member, 'availability' | 'online'>;
  name: string;
  onChange?: (a: Availability) => void;
}) {
  const p = presenceOf(member);
  const label = p === 'idle' ? 'Inactive' : PRESENCE_LABEL[p];
  const body = (
    <>
      <StatusDot member={member} />
      <span className={cn(p === 'idle' && 'text-ink-muted')}>{label}</span>
    </>
  );
  const shown = onChange ? (
    <Menu>
      <MenuTrigger aria-label={`Status for ${name}: ${label}`} className={cn(pill, 'transition-colors hover:border-line-strong data-[state=open]:border-line-strong')}>
        {body}
        <ChevronDown className="size-3.5 text-ink-faint" />
      </MenuTrigger>
      <MenuContent align="start" className="w-[272px]">
        <AvailabilityItems value={member.availability ?? 'available'} onChange={onChange} />
      </MenuContent>
    </Menu>
  ) : (
    <span className={cn(pill, 'pr-2.5')}>{body}</span>
  );
  return p === 'idle' ? (
    <Tip content={IDLE_TIP}>
      <span className="inline-flex">{shown}</span>
    </Tip>
  ) : (
    shown
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
