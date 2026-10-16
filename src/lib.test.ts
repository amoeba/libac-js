
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
