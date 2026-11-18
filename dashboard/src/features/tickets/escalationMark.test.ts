import { describe, expect, it } from 'vitest';
import { ticketEscalation } from './shared';

const base = { escalated: false, handed_off: false } as const;

describe('ticketEscalation', () => {
  it('says what an open ticket has right now', () => {
    expect(ticketEscalation({ ...base, status: 'open' })).toBeUndefined();
    expect(ticketEscalation({ ...base, status: 'open', escalated: true })).toBe('taken_over');
    expect(ticketEscalation({ ...base, status: 'open', handed_off: true })).toBe('waiting');
    expect(ticketEscalation({ ...base, status: 'open', escalated: true, handed_off: true })).toBe('taken_over');
  });

  it('keeps a mark on a closed ticket that had a person, and nothing on one that did not', () => {
    expect(ticketEscalation({ ...base, status: 'closed', was_escalated: true })).toBe('was');
    expect(ticketEscalation({ ...base, status: 'closed', was_escalated: false })).toBeUndefined();
    expect(ticketEscalation({ ...base, status: 'closed' })).toBeUndefined();
  });

  it('shows live state, not the mark, on an open ticket', () => {
    expect(ticketEscalation({ ...base, status: 'open', was_escalated: true })).toBeUndefined();
  });
});
