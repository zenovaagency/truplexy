import { describe, expect, it } from 'vitest';
import type { PropertyDefinition } from '@/lib/api/types';
import { PropertyError, applyValues, changeDefinition, matchesFilters, newDefinition, visibleValues } from './properties';

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

const defs = [
  def('company', 'text'),
  def('seats', 'number', { required: true }),
  def('vip', 'boolean'),
  def('dob', 'date', { sensitive: true }),
  def('tier', 'select', { options: [{ value: 'gold', label: 'Gold' }] }),
  def('tags', 'multi_select', { options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }] }),
];

describe('mock property definitions', () => {
  it('refuse what the API refuses', () => {
    const base = { entity: 'customer', key: 'tier', label: 'Tier', type: 'text' };
    for (const b of [
      { ...base, entity: 'planet' },
      { ...base, key: 'Tier' },
      { ...base, key: 'email' },
      { ...base, type: 'colour' },
      { ...base, label: '' },
      { ...base, type: 'select' },
      { ...base, options: [{ value: 'x' }] },
    ]) {
      expect(() => newDefinition(b, []), JSON.stringify(b)).toThrow(PropertyError);
    }
    const d = newDefinition({ ...base, type: 'select', options: [{ value: 'gold' }] }, []);
    expect(d.options).toEqual([{ value: 'gold', label: 'gold' }]);
    expect(() => changeDefinition(d, { key: 'level' })).toThrow(/key can't change/);
    expect(() => changeDefinition(d, { type: 'text' })).toThrow(/type can't change/);
  });
});

describe('mock property values', () => {
  it('normalize and merge like the API', () => {
    const v = applyValues(defs, {}, { company: ' Acme   Inc ', seats: '1,200', vip: 'yes', tier: 'GOLD', tags: 'Beta, a', dob: '1990-04-01' }, true);
    expect(v).toEqual({ company: 'Acme Inc', seats: 1200, vip: true, tier: 'gold', tags: ['b', 'a'], dob: '1990-04-01' });
    expect(applyValues(defs, v, { company: null, tier: '' }, false)).toEqual({ seats: 1200, vip: true, tags: ['b', 'a'], dob: '1990-04-01' });
    // A stale value isn't checked again when it isn't sent.
    expect(applyValues(defs, { seats: 1, tier: 'bronze' }, { company: 'x' }, false)).toMatchObject({ tier: 'bronze' });
  });

  it('refuse unknown keys, bad values and clearing a required one', () => {
    expect(() => applyValues(defs, { seats: 1 }, { plan: 'pro' }, false)).toThrow(/No property/);
    expect(() => applyValues(defs, { seats: 1 }, { tier: 'platinum' }, false)).toThrow(/options/);
    expect(() => applyValues(defs, { seats: 1 }, { seats: null }, false)).toThrow(/required/);
    expect(() => applyValues(defs, {}, { company: 'x' }, true)).toThrow(/required/);
  });

  it('hide sensitive values from readers and refuse filtering by them', () => {
    expect(visibleValues(defs, { dob: '1990-04-01', company: 'Acme', gone: 1 }, false)).toEqual({ properties: { company: 'Acme' }, masked_properties: ['dob'] });
    const q = (s: string) => new URLSearchParams(s);
    expect(matchesFilters(defs, { tier: 'gold', tags: ['a'] }, q('property[tier]=Gold&property[tags]=a'), false)).toBe(true);
    expect(matchesFilters(defs, { tier: 'gold' }, q('property[vip]=true'), false)).toBe(false);
    expect(() => matchesFilters(defs, {}, q('property[dob]=1990-04-01'), false)).toThrow(/sensitive/);
  });
});
