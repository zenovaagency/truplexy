import { describe, expect, it } from 'vitest';
import type { AuditEvent } from '@/lib/api/types';
import { auditCategory, describeAudit } from './audit';

const event = (action: string, details: Record<string, unknown> | null = { name: 'Clinic website' }): AuditEvent => ({
  id: 'aud_1',
  actor: 'usr_1',
  action,
  target: 'chn_1',
  details,
  created_at: '2026-10-25T10:00:00Z',
});

describe('channel activity', () => {
  it('describes the API’s channel actions', () => {
    expect(describeAudit(event('channel.create'))).toEqual({ verb: 'added channel', target: 'Clinic website', extra: '' });
    expect(describeAudit(event('channel.update')).verb).toBe('changed channel');
    expect(describeAudit(event('channel.delete')).verb).toBe('deleted channel');
  });

  it('says when a platform admin turned a channel off or on', () => {
    expect(describeAudit(event('channel.platform_disabled'))).toEqual({ verb: 'turned off channel', target: 'Clinic website', extra: ' as a platform admin' });
    expect(describeAudit(event('channel.platform_enabled')).verb).toBe('turned back on channel');
  });

  it('files channel and channel type actions under Channels', () => {
    for (const a of ['channel.create', 'channel.platform_disabled', 'channel_type.update', 'channel.created']) expect(auditCategory(a)).toBe('channels');
  });

  it('still reads events recorded under the old names', () => {
    expect(describeAudit(event('channel.created')).verb).toBe('added channel');
  });
});
