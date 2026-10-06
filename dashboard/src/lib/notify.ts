import { toast } from 'sonner';
import { describeError } from '@/lib/errors';

/** An error toast with the request ID one click away, as the API asks. */
export function notifyError(e: unknown, fallbackTitle?: string) {
  const d = describeError(e);
  toast.error(fallbackTitle && d.title === 'Something went wrong' ? fallbackTitle : d.title, {
    description: [d.detail, d.requestId && `Request ${d.requestId}`].filter(Boolean).join(' · ') || undefined,
    action: d.requestId
      ? { label: 'Copy ID', onClick: () => void navigator.clipboard?.writeText(d.requestId!) }
      : undefined,
  });
}

export const notifySuccess = (title: string, description?: string) => toast.success(title, { description });

export const notifyInfo = (title: string, description?: string) => toast(title, { description });
