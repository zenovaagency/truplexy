/* Files the dashboard hands people: CSV, names, and the download itself. */

/** Saves `blob` as `filename` through the browser's download. */
export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

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
