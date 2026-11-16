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

describe('toCsv formulas', () => {
  it('shows text a spreadsheet would run as a formula as text', () => {
    const csv = toCsv(['subject'], [['=HYPERLINK("http://evil.example","x")'], ['+1+1'], ['-2+3'], ['@SUM(1)'], ['  =1+1'], ['\t=1+1'], ['\r=1+1']]);
    for (const line of csv.split('\r\n').slice(1, -1).filter((l) => l.length)) expect(line.startsWith(`"'`) || line.startsWith('"\'')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
  });

  it('leaves ordinary text and numbers alone', () => {
    expect(toCsv(['a'], [['Refund = fast'], ['a-b'], ['email@x.com'], [-5], [0.5]])).toBe('﻿"a"\r\n"Refund = fast"\r\n"a-b"\r\n"email@x.com"\r\n"-5"\r\n"0.5"\r\n');
  });
});
