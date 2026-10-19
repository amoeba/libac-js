import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BinaryReader from './BinaryReader.js';
import SeekableFileReader from './node/SeekableFileReader.js';
import type { Reader } from './Reader.js';

// ─── little-endian byte builders ─────────────────────────────────────

const le16 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff];

const le32 = (v: number): number[] => [
  v & 0xff,
  (v >>> 8) & 0xff,
  (v >>> 16) & 0xff,
  (v >>> 24) & 0xff,
];

const f32 = (v: number): number[] => {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, v, true);
  return [...new Uint8Array(buffer)];
};

const f64 = (v: number): number[] => {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, v, true);
  return [...new Uint8Array(buffer)];
};

/** 7-bit encoded length prefix (C# BinaryReader.ReadString / AC read_ac_string). */
const acString = (value: string): number[] => {
  const utf8 = [...Buffer.from(value, 'utf8')];
  const prefix: number[] = [];
  let len = utf8.length;
  while (len >= 0x80) {
    prefix.push((len & 0x7f) | 0x80);
    len = Math.floor(len / 0x80);
  }
  prefix.push(len);
  return [...prefix, ...utf8];
};

/** u16 byte length, Latin-1 bytes, then pad to a 4-byte boundary. */
const pstring = (value: string): number[] => {
  const body = [...Buffer.from(value, 'latin1')];
  const out = [...le16(body.length), ...body];
  while (out.length % 4 !== 0) out.push(0);
  return out;
};

// ─── helpers ─────────────────────────────────────────────────────────

type Op = (r: Reader) => unknown;

/** Run a script of operations and capture both results and final position. */
function trace(reader: Reader, ops: Op[]): { results: unknown[]; position: number } {
  const results = ops.map((op) => op(reader));
  return { results, position: reader.position };
}

function withTempFile<T>(bytes: number[], fn: (filePath: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'libac-reader-'));
  const file = join(dir, 'sample.bin');
  try {
    writeFileSync(file, Buffer.from(bytes));
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A single stream exercising scalars, compressed uints, strings, PString,
// arrays, vectors, quaternions, and obfuscated strings.
const STREAM: number[] = [
  ...pstring('hello'), // 8
  ...le32(0x12345678), // 12
  ...le32(0xfffffffe), // 16
  ...le16(0xfffe), // 18
  0xab, // 19
  0x00, // 20 (consumed by AlignBoundary)
  ...le16(0xbeef), // 22
  ...f32(1.5), // 26
  ...f64(2.5), // 34
  0x12, // 35 compressed u32 (1 byte)
  0x92, 0x34, // 37 compressed u32 (2 bytes)
  0xd2, 0x10, 0xff, 0xee, // 41 compressed u32 (4 bytes)
  ...acString('café'), // 47
  1, 2, 3, // 50 ReadUint8Array(3)
  4, 5, // 52 ReadBytes(2)
  ...le16(0x0102), ...le16(0x0304), // 56 ReadUint16Array(2)
  ...le32(0x0a0b0c0d), ...le32(0x11223344), // 64 ReadUint32Array(2)
  ...f32(1), ...f32(2), ...f32(3), // 76 ReadVector3
  ...f32(1), ...f32(2), ...f32(3), ...f32(4), // 92 ReadQuaternion (w,x,y,z)
  ...le16(2), 0x14, 0x24, // 96 ReadObfuscatedString -> "AB"
];

const OPS: Op[] = [
  (r) => r.ReadPString(),
  (r) => r.ReadUint32(),
  (r) => r.ReadInt32(),
  (r) => r.ReadInt16(),
  (r) => r.ReadUint8(),
  (r) => {
    r.AlignBoundary();
    return r.position;
  },
  (r) => r.ReadUint16(),
  (r) => r.ReadSingle(),
  (r) => r.ReadDouble(),
  (r) => r.ReadCompressedUInt(),
  (r) => r.ReadCompressedUInt(),
  (r) => r.ReadCompressedUInt(),
  (r) => r.ReadString(),
  (r) => r.ReadUint8Array(3),
  (r) => r.ReadBytes(2),
  (r) => r.ReadUint16Array(2),
  (r) => r.ReadUint32Array(2),
  (r) => r.ReadVector3(),
  (r) => r.ReadQuaternion(),
  (r) => r.ReadObfuscatedString(),
];

// ─── #3 / parity: both readers behave identically ────────────────────

describe('Reader parity', () => {
  test('BinaryReader and SeekableFileReader agree across the full API', () => {
    const binary = trace(new BinaryReader(Uint8Array.from(STREAM)), OPS);
    const file = withTempFile(STREAM, (path) => {
      const reader = new SeekableFileReader(path);
      try {
        return trace(reader, OPS);
      } finally {
        reader.close();
      }
    });

    expect(file).toEqual(binary);
    expect(binary.position).toBe(STREAM.length);
    expect(file.position).toBe(STREAM.length);

    // Spot-check concrete values so a shared regression can't hide.
    expect(binary.results[0]).toBe('hello');
    expect(binary.results[1]).toBe(0x12345678);
    expect(binary.results[2]).toBe(-2);
    expect(binary.results[9]).toBe(0x12);
    expect(binary.results[10]).toBe(0x1234);
    expect(binary.results[11]).toBe(0x1210eeff);
    expect(binary.results[12]).toBe('café');
    expect([...(binary.results[15] as Uint16Array)]).toEqual([0x0102, 0x0304]);
    expect([...(binary.results[16] as Uint32Array)]).toEqual([0x0a0b0c0d, 0x11223344]);
    expect(binary.results[17]).toEqual({ x: 1, y: 2, z: 3 });
    expect(binary.results[18]).toEqual({ x: 2, y: 3, z: 4, w: 1 });
    expect(binary.results[19]).toBe('AB');
  });

  test('SeekableFileReader exposes the previously-missing API (#3)', () => {
    const methods = [
      'ReadCompressedUInt',
      'ReadBytes',
      'ReadPString',
      'ReadVector3',
      'ReadQuaternion',
    ] as const;

    withTempFile([0], (path) => {
      const reader = new SeekableFileReader(path);
      try {
        for (const name of methods) {
          expect(typeof reader[name]).toBe('function');
        }
      } finally {
        reader.close();
      }
    });
  });
});

// ─── #5: alignment-safe little-endian typed arrays ───────────────────

describe('ReadUint16Array / ReadUint32Array (#5)', () => {
  test('BinaryReader returns correct LE values at offset 0 and non-zero', () => {
    const aligned = new BinaryReader(Uint8Array.from([1, 0, 2, 0, 3, 0]));
    expect([...aligned.ReadUint16Array(3)]).toEqual([1, 2, 3]);
    expect(aligned.position).toBe(6);

    // Advance one byte first: any naive `new Uint16Array(view.buffer)` would
    // be misaligned and throw (or read the wrong elements).
    const offset = new BinaryReader(Uint8Array.from([0xff, 1, 0, 2, 0]));
    expect(offset.ReadUint8()).toBe(0xff);
    expect([...offset.ReadUint16Array(2)]).toEqual([1, 2]);

    const u32 = new BinaryReader(
      Uint8Array.from([1, 0, 0, 0, 2, 0, 0, 0]),
    );
    expect([...u32.ReadUint32Array(2)]).toEqual([1, 2]);
  });

  test('SeekableFileReader returns correct LE values', () => {
    withTempFile([1, 0, 2, 0, 3, 0], (path) => {
      const reader = new SeekableFileReader(path);
      try {
        expect([...reader.ReadUint16Array(3)]).toEqual([1, 2, 3]);
      } finally {
        reader.close();
      }
    });

    withTempFile([0xff, 1, 0, 2, 0], (path) => {
      const reader = new SeekableFileReader(path);
      try {
        expect(reader.ReadUint8()).toBe(0xff);
        expect([...reader.ReadUint16Array(2)]).toEqual([1, 2]);
      } finally {
        reader.close();
      }
    });

    withTempFile([1, 0, 0, 0, 2, 0, 0, 0], (path) => {
      const reader = new SeekableFileReader(path);
      try {
        expect([...reader.ReadUint32Array(2)]).toEqual([1, 2]);
      } finally {
        reader.close();
      }
    });
  });
});

// ─── #7: DataView must honor a view's byteOffset ─────────────────────

describe('DataView byteOffset handling (#7)', () => {
  test('BinaryReader accepts a subarray view at a non-zero offset', () => {
    const padded = new Uint8Array([0xff, 0x78, 0x56, 0x34, 0x12]);
    const reader = new BinaryReader(padded.subarray(1));
    expect(reader.ReadUint32()).toBe(0x12345678);
  });

  test('BinaryReader reads correctly from a non-zero view after advancing', () => {
    // After ReadUint8 the next `read()` returns a view at byteOffset 1; a
    // `new DataView(view.buffer)` would read from offset 0 of the backing store.
    const reader = new BinaryReader(Uint8Array.from([0xaa, 0x78, 0x56, 0x34, 0x12]));
    expect(reader.ReadUint8()).toBe(0xaa);
    expect(reader.ReadUint32()).toBe(0x12345678);
  });

  test('SeekableFileReader reads correctly after a seek', () => {
    withTempFile([0xff, 0x78, 0x56, 0x34, 0x12], (path) => {
      const reader = new SeekableFileReader(path);
      try {
        reader.seek(1);
        expect(reader.ReadUint32()).toBe(0x12345678);
      } finally {
        reader.close();
      }
    });
  });
});

// ─── #4: read() returns an independent Uint8Array ────────────────────

describe('read() return type and copy semantics (#4)', () => {
  test('BinaryReader.read returns a Uint8Array and advances position', () => {
    const reader = new BinaryReader(Uint8Array.from([1, 2, 3, 4]));
    const bytes = reader.read(2);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual([1, 2]);
    expect(reader.position).toBe(2);
  });

  test('read is short at EOF and clamps position', () => {
    const reader = new BinaryReader(Uint8Array.from([1, 2, 3]));
    const bytes = reader.read(10);
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(reader.position).toBe(3);
    expect([...reader.read(1)]).toEqual([]);
    expect(reader.position).toBe(3);
  });

  test('mutating the result of read() cannot corrupt the reader or its input', () => {
    const input = Uint8Array.from([1, 2, 3, 4]);
    const reader = new BinaryReader(input);

    const bytes = reader.read(4);
    bytes[0] = 99;

    // The caller's original buffer is untouched, and a fresh reader over it
    // still sees the original bytes.
    expect(input[0]).toBe(1);
    expect(new BinaryReader(input).read(4)[0]).toBe(1);
  });

  test('ReadUint8Array/ReadBytes return copies', () => {
    const reader = new BinaryReader(Uint8Array.from([1, 2, 3]));
    const slice = reader.ReadBytes(3);
    slice[0] = 99;
    expect(new BinaryReader(Uint8Array.from([1, 2, 3])).ReadUint8Array(3)[0]).toBe(1);
  });
});

// ─── typed arrays: length reflects available bytes; guarded counts ────

describe('ReadUint16Array/ReadUint32Array sizing and guards', () => {
  test('short read returns only the available elements (no zero padding)', () => {
    // 3 bytes -> only one whole uint16 is available.
    const u16 = new BinaryReader(Uint8Array.from([1, 0, 2]));
    expect([...u16.ReadUint16Array(4)]).toEqual([1]);

    // 5 bytes -> only one whole uint32 is available.
    const u32 = new BinaryReader(Uint8Array.from([1, 0, 0, 0, 2]));
    expect([...u32.ReadUint32Array(3)]).toEqual([1]);
  });

  test('non-positive counts return empty arrays without throwing', () => {
    const reader = new BinaryReader(Uint8Array.from([1, 2, 3, 4]));
    expect(reader.ReadUint16Array(0).length).toBe(0);
    expect(reader.ReadUint32Array(0).length).toBe(0);
    expect(reader.ReadUint16Array(-1).length).toBe(0);
    expect(reader.ReadUint32Array(-1).length).toBe(0);
    expect(reader.read(-5).length).toBe(0);
    expect(reader.position).toBe(0);
  });

  test('SeekableFileReader short read returns only available elements', () => {
    withTempFile([1, 0, 2], (path) => {
      const reader = new SeekableFileReader(path);
      try {
        expect([...reader.ReadUint16Array(4)]).toEqual([1]);
      } finally {
        reader.close();
      }
    });
  });
});
