import { describe, expect, it } from 'vitest';
import { crc32, makeZip } from './zip';

interface Read {
  name: string;
  method: number;
  crc: number;
  text: string;
}

/** Reads an archive back through its central directory, as an unzip tool does. */
async function unzip(blob: Blob): Promise<Read[]> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const v = new DataView(buf.buffer);
  const end = buf.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out: Read[] = [];
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const method = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const packed = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    let body = buf.subarray(start, start + packed);
    if (method === 8) body = new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    expect(crc32(body)).toBe(crc);
    out.push({ name, method, crc, text: dec.decode(body) });
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return out;
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('makeZip', () => {
  const files = [
    { name: 'README.txt', data: 'hello' },
    { name: 'tickets/tkt_1 - Où est ma commande.md', data: '# Où est ma commande ?\n\n' + 'Bonjour. '.repeat(200) },
    { name: 'bytes.bin', data: new Uint8Array([0, 1, 2, 255]) },
  ];

  it('stores files an unzip tool reads back', async () => {
    const got = await unzip(await makeZip(files, { deflate: false }));
    expect(got.map((f) => f.name)).toEqual(files.map((f) => f.name));
    expect(got.every((f) => f.method === 0)).toBe(true);
    expect(got[1].text).toBe(files[1].data);
  });

  it('deflates text when that is smaller', async () => {
    const blob = await makeZip(files);
    expect(blob.type).toBe('application/zip');
    const got = await unzip(blob);
    expect(got[1].method).toBe(8);
    expect(got[1].text).toBe(files[1].data);
    // Five bytes don't shrink: kept as they are.
    expect(got[0].method).toBe(0);
    expect(got[0].text).toBe('hello');
  });

  it('marks names as UTF-8', async () => {
    const buf = new DataView(await (await makeZip([files[1]], { deflate: false })).arrayBuffer());
    expect(buf.getUint16(6, true) & 0x0800).toBe(0x0800);
  });

  it('makes an empty archive', async () => {
    expect(await unzip(await makeZip([]))).toEqual([]);
  });
});
