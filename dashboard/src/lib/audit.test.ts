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

describe('Shopify store activity', () => {
  it('names the connect actions', () => {
    expect(describeAudit(event('channel.connect_started', { name: 'acme.myshopify.com' }))).toEqual({ verb: 'started connecting a Shopify store', target: '', extra: ' (acme.myshopify.com)' });
    expect(describeAudit(event('channel.connect', { name: 'Acme' }))).toEqual({ verb: 'connected a Shopify store', target: '', extra: ' (Acme)' });
    expect(auditCategory('channel.connect')).toBe('channels');
  });

  it('says why a store was disconnected', () => {
    expect(describeAudit(event('channel.disconnect', { name: 'Acme', reason: 'app/uninstalled' }))).toEqual({
      verb: 'Shopify store disconnected',
      target: '',
      extra: ' (Acme: the app was uninstalled in Shopify)',
    });
    expect(describeAudit(event('channel.disconnect', { reason: 'shop/redact' })).extra).toBe(" (Shopify asked to erase the store's data)");
    expect(describeAudit(event('channel.disconnect', null)).extra).toBe('');
  });
});
