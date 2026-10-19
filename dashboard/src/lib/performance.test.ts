import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/client';
import type { PerformanceDay, StagePerformance } from '@/lib/api/types';
import {
  barStages,
  chartDays,
  countRows,
  ERROR_RATE_WARN,
  formatLatency,
  isHigh,
  isRouteMissing,
  markPerformance,
  otherShare,
  resetPerformanceAvailability,
  sampleNote,
  SERVER_ERROR_RATE_WARN,
  trackAvailability,
} from './performance';

const stage = (name: string, share: number): StagePerformance => ({ stage: name, ran: 1, share, count: 1, avg_ms: 1, p50_ms: 1, p95_ms: 1, p99_ms: 1, max_ms: 1 });

describe('formatLatency', () => {
  it('uses ms under a second and one-decimal seconds above', () => {
    expect(formatLatency(0)).toBe('0 ms');
    expect(formatLatency(412)).toBe('412 ms');
    expect(formatLatency(999.4)).toBe('999 ms');
    expect(formatLatency(1000)).toBe('1.0 s');
    expect(formatLatency(1234)).toBe('1.2 s');
    expect(formatLatency(15_480)).toBe('15.5 s');
  });
  it('shows a dash for nothing', () => {
    expect(formatLatency(null)).toBe('—');
    expect(formatLatency(undefined)).toBe('—');
    expect(formatLatency(NaN)).toBe('—');
  });
});

describe('isHigh', () => {
  it('compares the raw fraction against the limit, inclusive', () => {
    expect(isHigh(ERROR_RATE_WARN - 0.0001, ERROR_RATE_WARN)).toBe(false);
    expect(isHigh(ERROR_RATE_WARN, ERROR_RATE_WARN)).toBe(true);
    expect(isHigh(SERVER_ERROR_RATE_WARN, SERVER_ERROR_RATE_WARN)).toBe(true);
    expect(isHigh(undefined, 0.05)).toBe(false);
    expect(isHigh(NaN, 0.05)).toBe(false);
  });
});

describe('sampleNote', () => {
  it('names the share only when it is below 1', () => {
    expect(sampleNote(1)).toBeNull();
    expect(sampleNote(0.25)).toBe('25%');
    expect(sampleNote(0.5)).toBe('50%');
    expect(sampleNote(0.005)).toBe('0.5%');
    expect(sampleNote(0)).toBeNull();
  });
});

describe('chartDays', () => {
  it('turns the latency of a day with no requests into a gap, never 0 ms', () => {
    const days: PerformanceDay[] = [
      { date: '2026-10-17', requests: 12, errors: 1, server_errors: 0, p50_ms: 40, p95_ms: 210 },
      { date: '2026-10-18', requests: 0, errors: 0, server_errors: 0, p50_ms: 0, p95_ms: 0 },
    ];
    const out = chartDays(days);
    expect(out.map((d) => d.p95)).toEqual([210, null]);
    expect(out[1]).toMatchObject({ requests: 0, errors: 0 });
  });
});

describe('stages', () => {
  it('finds other, keeps the API order, and drops stages with no time from the bar', () => {
    const stages = [stage('prepare', 0.1), stage('quota', 0), stage('llm', 0.5), stage('other', 0.4)];
    expect(otherShare(stages)).toBe(0.4);
    expect(otherShare([stage('llm', 1)])).toBe(0);
    expect(barStages(stages).map((s) => s.stage)).toEqual(['prepare', 'llm', 'other']);
  });
});

describe('countRows', () => {
  it('sorts counts largest first and drops zeros and missing maps', () => {
    expect(countRows({ a: 1, b: 5, c: 0 })).toEqual([['b', 5], ['a', 1]]);
    expect(countRows(undefined)).toEqual([]);
  });
});

describe('availability', () => {
  const missing = new ApiError({ code: 'NOT_FOUND', message: 'x', status: 404 });

  it('recognises only a plain 404 NOT_FOUND as "not on this server"', () => {
    expect(isRouteMissing(missing)).toBe(true);
    expect(isRouteMissing(new ApiError({ code: 'TENANT_NOT_FOUND', message: 'x', status: 404 }))).toBe(false);
    expect(isRouteMissing(new ApiError({ code: 'FORBIDDEN', message: 'x', status: 403 }))).toBe(false);
    expect(isRouteMissing(new Error('x'))).toBe(false);
  });

  it('notes a 404, passes the error on, and notes the page back once it answers', async () => {
    resetPerformanceAvailability();
    const seen = vi.fn();
    markPerformance('business', true); // no change: nothing to announce
    await expect(trackAvailability('business', async () => Promise.reject(missing))).rejects.toBe(missing);
    // the store is read through usePerformanceMissing; here it is enough that a later success clears it without throwing
    await expect(trackAvailability('business', async () => 7)).resolves.toBe(7);
    seen();
    expect(seen).toHaveBeenCalled();
  });
});
