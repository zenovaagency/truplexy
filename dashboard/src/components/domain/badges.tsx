import { AlertTriangle } from 'lucide-react';
import type { DocumentStatus, ReplyStatus, Role, TicketStatus } from '@/lib/api/types';
import { ROLE_LABEL } from '@/lib/permissions';
import { Badge, type Tone } from '@/components/ui';
import { Loader } from '@/components/ui/loader';

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'accent' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export const TICKET_STATUSES = Object.keys(TICKET_STATUS) as TicketStatus[];

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const s = TICKET_STATUS[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

export const DOC_STATUS: Record<DocumentStatus, { label: string; tone: Tone }> = {
  indexed: { label: 'Indexed', tone: 'live' },
  processing: { label: 'Processing', tone: 'accent' },
  failed: { label: 'Failed', tone: 'danger' },
  pending_upload: { label: 'Waiting for upload', tone: 'neutral' },
};

export function DocStatusBadge({ status }: { status: DocumentStatus }) {
  const s = DOC_STATUS[status];
  return (
    <Badge tone={s.tone}>
      {status === 'processing' && <Loader size={12} label={null} />}
      {status === 'failed' && <AlertTriangle className="size-3" />}
      {status !== 'processing' && status !== 'failed' && <span className="size-1.5 rounded-full bg-current" />}
      {s.label}
    </Badge>
  );
}

export const REPLY_STATUS: Record<ReplyStatus, { label: string; tone: Tone }> = {
  answered: { label: 'Answered', tone: 'live' },
  clarification_required: { label: 'Asked to clarify', tone: 'cyan' },
  no_answer: { label: 'No answer found', tone: 'warn' },
  handoff: { label: 'Handed to a person', tone: 'violet' },
  escalated: { label: 'Escalated', tone: 'danger' },
};

export function ReplyStatusBadge({ status }: { status: ReplyStatus }) {
  const s = REPLY_STATUS[status] ?? { label: status, tone: 'neutral' as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const ROLE_TONE: Record<Role, Tone> = { owner: 'violet', admin: 'accent', editor: 'cyan', agent: 'live', viewer: 'neutral' };

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Badge>;
}
