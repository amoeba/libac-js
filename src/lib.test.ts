
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BinaryReader from './BinaryReader.js';
import SeekableFileReader from './node/SeekableFileReader.js';

const rdr = function (values: number[]): BinaryReader {
  const buf = Buffer.from(values);
  const array = new Uint8Array(buf);

  return new BinaryReader(array.buffer)
}

test('BinaryReader smoke test', () => {
  expect(rdr([0x01, 0x00, 0x00, 0x00]).ReadUint32()).toBe(1);
  expect(rdr([0xFF, 0x00, 0x00, 0x00]).ReadUint32()).toBe(255);
  expect(rdr([0x03, 0x02, 0x01, 0x00]).ReadUint32()).toBe(66051);
});

test('SeekableFileReader reads bytes, advances position, and truncates at EOF', () => {
  const dir = mkdtempSync(join(tmpdir(), 'libac-'));
  const file = join(dir, 'sample.bin');

  try {
    writeFileSync(file, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));

    const reader = new SeekableFileReader(file);
    expect(reader.position).toBe(0);

    const first = reader.read(4);
    expect(Array.from(first)).toEqual([1, 2, 3, 4]);
    expect(reader.position).toBe(4);

    reader.seek(2);
    expect(reader.position).toBe(2);
    const mid = reader.read(2);
    expect(Array.from(mid)).toEqual([3, 4]);
    expect(reader.position).toBe(4);

    // Reading past the end returns only the available bytes.
    reader.seek(6);
    const tail = reader.read(10);
    expect(Array.from(tail)).toEqual([7, 8]);
    expect(reader.position).toBe(8);

    reader.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Encode a JS string into the AC wire format: a 7-bit encoded length prefix
// (C# BinaryReader.ReadString / AC read_ac_string) followed by UTF-8 bytes.
const encodeAcString = (value: string): number[] => {
  const utf8 = Array.from(Buffer.from(value, 'utf8'));
  const prefix: number[] = [];
  let len = utf8.length;
  while (len >= 0x80) {
    prefix.push((len & 0x7f) | 0x80);
    len = Math.floor(len / 0x80);
  }
  prefix.push(len);

  return [...prefix, ...utf8];
};

test('SeekableFileReader.ReadString decodes a short (single-byte length) string', () => {
  const dir = mkdtempSync(join(tmpdir(), 'libac-'));
  const file = join(dir, 'short-string.bin');
  const value = 'hello';

  try {
    const encoded = encodeAcString(value);
    expect(encoded[0]).toBe(value.length); // single-byte length prefix
    writeFileSync(file, Buffer.from(encoded));

    const reader = new SeekableFileReader(file);
    expect(reader.position).toBe(0);

    expect(reader.ReadString()).toBe(value);
    expect(reader.position).toBe(encoded.length);

    reader.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SeekableFileReader.ReadString decodes a 200+ byte UTF-8 string (multi-byte length prefix)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'libac-'));
  const file = join(dir, 'long-string.bin');
  // "é" is 2 UTF-8 bytes; 120 of them = 240 bytes, forcing a 2-byte 7-bit length prefix.
  const value = 'é'.repeat(120);

  try {
    const encoded = encodeAcString(value);
    expect(Buffer.byteLength(value, 'utf8')).toBeGreaterThanOrEqual(200);
    expect(encoded[0]).toBeGreaterThanOrEqual(0x80); // multi-byte length prefix
    writeFileSync(file, Buffer.from(encoded));

    const reader = new SeekableFileReader(file);
    expect(reader.ReadString()).toBe(value);
    expect(reader.position).toBe(encoded.length);

    reader.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SeekableFileReader.ReadString matches BinaryReader.ReadString over the same bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'libac-'));
  const file = join(dir, 'parity-string.bin');
  // Mix of ASCII and non-ASCII, long enough to exercise the multi-byte prefix.
  const value = `café-${'x'.repeat(220)}-é`;

  try {
    const encoded = encodeAcString(value);
    writeFileSync(file, Buffer.from(encoded));

    const fileReader = new SeekableFileReader(file);
    const binaryReader = new BinaryReader(Uint8Array.from(encoded));

    expect(fileReader.ReadString()).toBe(value);
    expect(binaryReader.ReadString()).toBe(value);
    expect(fileReader.position).toBe(encoded.length);
    expect(binaryReader.position).toBe(encoded.length);

    fileReader.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
