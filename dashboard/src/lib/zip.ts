/* A small zip writer: enough for exports, with no library to load. */

export interface ZipEntry {
  /** The path inside the archive, with `/` between folders. */
  name: string;
  data: string | Uint8Array;
  date?: Date;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Raw deflate through the browser's CompressionStream, or undefined where it has none. */
async function deflate(data: Uint8Array): Promise<Uint8Array | undefined> {
  if (typeof CompressionStream === 'undefined') return undefined;
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return undefined;
  }
}

/** The MS-DOS time and date a zip stores, in local time; 1980 is the earliest it can hold. */
function dosDateTime(d: Date) {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const MAX_ENTRIES = 0xffff;
const MAX_BYTES = 0xffffffff;

/**
 * Packs `entries` into a zip. Each file is deflated when the browser can and
 * that makes it smaller, and stored as it is otherwise. Names are UTF-8.
 */
export async function makeZip(entries: ZipEntry[], opts: { deflate?: boolean } = {}): Promise<Blob> {
  if (entries.length > MAX_ENTRIES) throw new Error(`A zip holds at most ${MAX_ENTRIES} files.`);
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const raw = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const packed = opts.deflate === false ? undefined : await deflate(raw);
    const deflated = Boolean(packed && packed.length < raw.length);
    const body = deflated ? packed! : raw;
    if (raw.length > MAX_BYTES || offset + body.length > MAX_BYTES) throw new Error('The export is too large for one zip.');
    const crc = crc32(raw);
    const { time, date } = dosDateTime(e.date && !Number.isNaN(e.date.getTime()) ? e.date : new Date());

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed: 2.0
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, deflated ? 8 : 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, body);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true); // made by: 2.0
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, deflated ? 8 : 0, true);
    dir.setUint16(12, time, true);
    dir.setUint16(14, date, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, body.length, true);
    dir.setUint32(24, raw.length, true);
    dir.setUint16(28, name.length, true);
    // Extra field, comment, disk, internal and external attributes stay 0.
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);

    offset += 30 + name.length + body.length;
  }

  const dirSize = central.reduce((n, p) => n + p.length, 0);
  if (offset + dirSize > MAX_BYTES) throw new Error('The export is too large for one zip.');
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}
