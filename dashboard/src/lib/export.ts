/* Files the dashboard hands people: CSV, names, and the download itself. */

/** Saves `blob` as `filename` through the browser's download. */
export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * A spreadsheet runs a cell that starts with = + - or @ as a formula, quoted or not, and
 * customers write many of these cells (ticket subjects, messages, names). A leading
 * apostrophe makes the program show such text as text. Numbers are not text and stay as they are.
 */
const FORMULA = /^[\t\r]|^\s*[=+\-@]/;
const cell = (v: unknown) => {
  const text = String(v ?? '');
  const safe = typeof v === 'string' && FORMULA.test(text) ? "'" + text : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** RFC 4180 CSV, every cell quoted. The byte-order mark makes Excel read it as UTF-8. */
export function toCsv(head: string[], rows: unknown[][]) {
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Text that is safe as part of a file name on Windows, macOS and Linux. */
export function safeFileName(s: string, max = 60) {
  const clean = s
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return [...clean].slice(0, max).join('').trim();
}
