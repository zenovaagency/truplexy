import { useMemo, useState } from 'react';
import { Check, ChevronDown, UserRound, UserX } from 'lucide-react';
import { Command } from 'cmdk';
import { useMembers } from '@/lib/api/endpoints/business';
import type { Ticket } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { canBeAssigned } from '@/lib/permissions';
import { Avatar, Badge, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { StatusDot } from '@/components/domain/support';

/**
 * Whether a person is needed or already has the conversation: the one thing a ticket's badge says.
 * `handed_off` means the assistant asked for a person and keeps replying; `escalated` means a person
 * has taken over and the assistant is paused. Both are one badge, and the title says which.
 * Closing ends both, so a closed ticket keeps the badge as a mark (`was_escalated`) of what it had.
 */
export function ticketEscalation(
  ticket: Pick<Ticket, 'status' | 'escalated' | 'handed_off' | 'was_escalated'>,
): 'taken_over' | 'waiting' | 'was' | undefined {
  if (ticket.status === 'closed') return ticket.was_escalated ? 'was' : undefined;
  return ticket.escalated ? 'taken_over' : ticket.handed_off ? 'waiting' : undefined;
}

export const ESCALATION_TEXT = {
  taken_over: 'Taken over',
  waiting: 'Waiting for a person',
  was: 'Was escalated',
} as const;

const ESCALATION_HINT = {
  taken_over: 'A person has this conversation. The assistant is paused.',
  waiting: 'The assistant asked for a person. It keeps replying until someone answers.',
  was: 'A person was needed or had this conversation before it closed.',
} as const;

/** The list says "Escalated"; with `detailed`, the ticket's own header says which kind. */
export function EscalatedBadge({ ticket, detailed, className }: { ticket: Ticket; detailed?: boolean; className?: string }) {
  const state = ticketEscalation(ticket);
  if (!state) return null;
  return (
    <Badge tone={state === 'was' ? 'neutral' : 'danger'} title={`${ESCALATION_TEXT[state]}. ${ESCALATION_HINT[state]}`} className={cn('px-1.5 py-px text-[0.68rem]', className)}>
      {detailed ? ESCALATION_TEXT[state] : 'Escalated'}
    </Badge>
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
                  <span className="flex items-center gap-1.5 truncate font-medium text-ink">
                    {m.availability && <StatusDot member={m} />}
                    {m.name}
                  </span>
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
