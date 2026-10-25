import { describe, expect, it } from 'vitest';
import type { PropertyDefinition } from '@/lib/api/types';
import { changedValues, filledValues, formatValue, keyFromLabel, keyProblem, toField, valueProblem } from './properties';

const def = (key: string, type: PropertyDefinition['type'], extra: Partial<PropertyDefinition> = {}): PropertyDefinition => ({
  id: `prp_${key}`,
  entity: 'customer',
  key,
  label: key,
  description: '',
  type,
  options: [],
  required: false,
  sensitive: false,
  sort_order: 0,
  created_at: '',
  updated_at: '',
  ...extra,
});

const tier = def('tier', 'select', { label: 'Tier', options: [{ value: 'gold', label: 'Gold' }, { value: 'silver', label: 'Silver' }] });

describe('keys', () => {
  it('come from labels the way the API accepts them', () => {
    expect(keyFromLabel('Loyalty tier')).toBe('loyalty_tier');
    expect(keyFromLabel('  Café — notes! ')).toBe('cafe_notes');
    expect(keyFromLabel('2nd address')).toBe('nd_address');
    expect(keyFromLabel('x'.repeat(60))).toHaveLength(40);
  });

  it('refuse built-in fields and bad shapes', () => {
    expect(keyProblem('email')).toMatch(/built-in/);
    expect(keyProblem('Tier')).toBeDefined();
    expect(keyProblem('')).toBeDefined();
    expect(keyProblem('loyalty_tier')).toBeUndefined();
  });
});

describe('values', () => {
  const defs = [def('seats', 'number'), def('vip', 'boolean'), tier, def('tags', 'multi_select', { options: [{ value: 'a', label: 'A' }] }), def('notes', 'text')];

  it('send only what changed, with null for a cleared field', () => {
    const stored = { seats: 5, vip: true, tier: 'bronze', notes: 'hi' };
    const fields = { seats: '5', vip: true, tier: 'bronze', tags: [], notes: '' };
    // The removed option "bronze" is left alone because it didn't change.
    expect(changedValues(defs, stored, fields)).toEqual({ notes: null });
    expect(changedValues(defs, stored, { ...fields, seats: '1,200', vip: false })).toEqual({ seats: 1200, vip: false, notes: null });
  });

  it('send filled fields on create, skipping an unticked yes/no', () => {
    expect(filledValues(defs, { seats: '', vip: false, tier: 'gold', tags: ['a'], notes: ' x ' })).toEqual({ tier: 'gold', tags: ['a'], notes: 'x' });
    expect(filledValues([def('ok', 'boolean', { required: true })], { ok: false })).toEqual({ ok: false });
  });

  it('read stored values into fields', () => {
    expect(toField(tier, 'gold')).toBe('gold');
    expect(toField(def('vip', 'boolean'), undefined)).toBe(false);
    expect(toField(def('tags', 'multi_select'), ['a'])).toEqual(['a']);
    expect(toField(def('seats', 'number'), 3)).toBe('3');
  });

  it('catch obvious mistakes before saving', () => {
    expect(valueProblem(def('n', 'number'), 'many')).toBeDefined();
    expect(valueProblem(def('e', 'email'), 'nope')).toBeDefined();
    expect(valueProblem(def('u', 'url'), 'javascript:alert(1)')).toBeDefined();
    expect(valueProblem(def('p', 'phone'), '+1 (555) 010-0100')).toBeUndefined();
    expect(valueProblem(def('r', 'text', { required: true, label: 'Ref' }), ' ')).toBe('Ref is required.');
  });

  it('are shown in words', () => {
    expect(formatValue(tier, 'gold')).toBe('Gold');
    expect(formatValue(tier, 'bronze')).toBe('bronze');
    expect(formatValue(def('vip', 'boolean'), false)).toBe('No');
    expect(formatValue(def('tags', 'multi_select', { options: [{ value: 'a', label: 'Alpha' }] }), ['a'])).toBe('Alpha');
    expect(formatValue(def('d', 'date'), '1990-04-01')).toBe('Apr 1, 1990');
    expect(formatValue(def('x', 'text'), undefined)).toBe('—');
  });
});
