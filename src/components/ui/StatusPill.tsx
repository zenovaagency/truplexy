import { STATUS_LABEL, type InboxStatus } from '@/data/demo';

const TONE: Record<InboxStatus, string> = {
  ai: 'bg-ai-soft text-ai',
  qualified: 'bg-qualified-soft text-qualified',
  resolved: 'bg-resolved-soft text-resolved',
  human: 'bg-human-soft text-human',
};

const DOT: Record<InboxStatus, string> = {
  ai: 'bg-ai',
  qualified: 'bg-qualified',
  resolved: 'bg-resolved',
  human: 'bg-human',
};

export default function StatusPill({ status, className = '' }: { status: InboxStatus; className?: string }) {
  return (
    <span className={`chip ${TONE[status]} !px-2 !py-[3px] text-[0.72rem] ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
