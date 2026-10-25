import { describe, expect, it } from 'vitest';
import { readCsv } from '@/lib/api/mock/products';
import { formatPrice, importFileProblem, parsePrice, readsWithAI } from './products';

describe('prices', () => {
  it('are read the way people type them, as the API stores them', () => {
    expect(parsePrice('19.90')).toBe('19.90');
    expect(parsePrice('$1,299.00')).toBe('1299.00');
    expect(parsePrice('19,90')).toBe('19.90');
    expect(parsePrice('1.299,50 €')).toBe('1299.50');
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('free')).toBeUndefined();
    expect(parsePrice('-3')).toBeUndefined();
  });

  it('are shown with their currency', () => {
    expect(formatPrice('12.5', 'USD')).toBe('$12.50');
    expect(formatPrice('12.5', '')).toBe('12.5');
    expect(formatPrice(null, 'USD')).toBe('—');
    expect(formatPrice('7', 'ZZZ')).toMatch(/7/);
  });
});

describe('import files', () => {
  const file = (name: string, size = 10) => new File(['x'.repeat(size)], name);

  it('ask for CSV instead of a spreadsheet, and check sizes', () => {
    expect(importFileProblem(file('products.xlsx'))).toMatch(/CSV/);
    expect(importFileProblem(file('products.exe'))).toBeDefined();
    expect(importFileProblem(file('products.csv', 0))).toMatch(/empty/);
    expect(importFileProblem(file('products.csv'))).toBeUndefined();
  });

  it('say which are read with AI', () => {
    expect(readsWithAI(file('a.csv'))).toBe(false);
    expect(readsWithAI(file('a.json'))).toBe(false);
    expect(readsWithAI(file('catalog.pdf'))).toBe(true);
  });
});

describe('the demo CSV reader', () => {
  it('reads Shopify-style columns and notes what it left out', () => {
    const read = readCsv('Title,Variant SKU,Variant Price,Image Src\n"Mug, blue",MUG-1,"$12.00",https://cdn.test/a.png\nKettle,KET,free,nope\n,orphan,1,\n', []);
    if (typeof read === 'string') throw new Error(read);
    expect(read.items.map((d) => d.name)).toEqual(['Mug, blue', 'Kettle']);
    expect(read.items[0]).toMatchObject({ sku: 'MUG-1', price: '12.00', image_url: 'https://cdn.test/a.png', problems: [] });
    expect(read.items[1]!.price).toBeNull();
    expect(read.items[1]!.problems).toHaveLength(2);
  });

  it('needs a name column', () => {
    expect(readCsv('sku,price\nA,1\n', [])).toMatch(/name/);
  });
});
