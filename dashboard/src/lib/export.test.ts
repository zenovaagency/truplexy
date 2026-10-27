import { describe, expect, it } from 'vitest';
import { safeFileName, toCsv } from './export';

describe('toCsv', () => {
  it('quotes every cell and escapes quotes', () => {
    expect(toCsv(['a', 'b'], [['x, y', 'say "hi"'], [null, 3]])).toBe('﻿"a","b"\r\n"x, y","say ""hi"""\r\n"","3"\r\n');
  });

  it('keeps line breaks inside a cell', () => {
    expect(toCsv(['note'], [['one\ntwo']])).toBe('﻿"note"\r\n"one\ntwo"\r\n');
  });
});

describe('safeFileName', () => {
  it('drops characters file systems reject', () => {
    expect(safeFileName('Refund: order #12/34 <urgent>?')).toBe('Refund order #12 34 urgent');
  });

  it('trims trailing dots and spaces, and long names', () => {
    expect(safeFileName('Hello...  ')).toBe('Hello');
    expect(safeFileName('x'.repeat(100))).toHaveLength(60);
    expect(safeFileName('\u0000\t')).toBe('');
  });
});
