import { useMemo, useState } from 'react';
import { Check, ChevronDown, UserRound, UserX } from 'lucide-react';
import { Command } from 'cmdk';
import { useMembers } from '@/lib/api/endpoints/business';
import type { Ticket, TicketFlag } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { canBeAssigned } from '@/lib/permissions';
import { Avatar, Badge, Popover, PopoverContent, PopoverTrigger, type Tone } from '@/components/ui';

export const FLAG_LABEL: Record<TicketFlag, string> = {
  needs_reply: 'Needs reply',
  escalated: 'Escalated',
  handed_off: 'Handed off',
  unassigned: 'Unassigned',
  overdue: 'Overdue',
  reopened: 'Reopened',
};

const FLAG_TONE: Partial<Record<TicketFlag, Tone>> = {
  escalated: 'danger',
  overdue: 'warn',
  handed_off: 'violet',
  reopened: 'cyan',
};

/** The flags worth a badge (needs_reply and unassigned show elsewhere). */
export function TicketFlags({ ticket, className }: { ticket: Ticket; className?: string }) {
  const shown = (['escalated', 'overdue', 'handed_off', 'reopened'] as const).filter((f) => ticket.flags?.[f]);
  if (!shown.length) return null;
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {shown.map((f) => (
        <Badge key={f} tone={FLAG_TONE[f]} className="px-1.5 py-px text-[0.68rem]">
          {FLAG_LABEL[f]}
        </Badge>
      ))}
    </span>
  );
}

/** Members who can be assigned tickets (agent and above). */
export function useAssignees() {
  const members = useMembers();
  return useMemo(() => (members.data ?? []).filter((m) => canBeAssigned(m.role)), [members.data]);
}

/** Searchable assignee picker. */
export function AssigneePicker({
  value,
  name,
  onChange,
  disabled,
  className,
}: {
  value?: string;
  name?: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const assignees = useAssignees();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          'input flex items-center gap-2 text-left disabled:cursor-not-allowed',
          className,
        )}
      >
        {value ? <Avatar name={name} size={20} /> : <UserRound className="size-4 text-ink-faint" />}
        <span className={cn('flex-1 truncate', !value && 'text-ink-faint')}>{value ? (name ?? 'Assigned') : 'Unassigned'}</span>
        {!disabled && <ChevronDown className="size-4 text-ink-faint" />}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command className="[&_[cmdk-item]]:flex [&_[cmdk-item]]:h-9 [&_[cmdk-item]]:cursor-pointer [&_[cmdk-item]]:items-center [&_[cmdk-item]]:gap-2.5 [&_[cmdk-item]]:rounded-[9px] [&_[cmdk-item]]:px-2.5 [&_[cmdk-item]]:text-[0.8125rem] [&_[cmdk-item][data-selected=true]]:bg-surface-2">
          <Command.Input placeholder="Assign to…" className="h-10 w-full border-b border-line bg-transparent px-3 text-[0.8125rem] outline-none placeholder:text-ink-faint" />
          <Command.List className="max-h-64 overflow-y-auto p-1.5">
            <Command.Empty className="py-6 text-center text-xs text-ink-faint">No one matches.</Command.Empty>
            <Command.Item
              value="unassigned"
              onSelect={() => {
                onChange('');
                setOpen(false);
              }}
            >
              <UserX className="size-4 text-ink-faint" />
              <span className="flex-1">Unassigned</span>
              {!value && <Check className="size-4 text-accent" />}
            </Command.Item>
            {assignees.map((m) => (
              <Command.Item
                key={m.user_id}
                value={`${m.name} ${m.email}`}
                onSelect={() => {
                  onChange(m.user_id);
                  setOpen(false);
                }}
              >
                <Avatar name={m.name} email={m.email} size={22} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium text-ink">{m.name}</span>
                  <span className="truncate text-[0.7rem] text-ink-faint">{m.email}</span>
                </span>
                {value === m.user_id && <Check className="size-4 text-accent" />}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
