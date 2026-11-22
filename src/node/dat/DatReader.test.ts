import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import SeekableFileReader from '../SeekableFileReader.js';
import { DatReader } from './DatReader.js';

describe.each([16, 256, 1024])('DAT sectors of %i bytes', blockSize => {
  const payload = blockSize - 4;
  const sizes = [...new Set([0, payload - 1, payload, payload + 1, payload + 2, payload + 3,
    blockSize, payload * 2 - 1, payload * 2, payload * 2 + 1, payload * 2 + 2,
    payload * 2 + 3, payload * 3 + 3])];
  test.each(sizes)('returns every file byte for length %i, excluding link words and sector padding', size => {
    const expected = Uint8Array.from({ length: size }, (_, i) => (i * 13 + 73) % 256);
    const count = Math.max(1, Math.ceil(size / payload));
    const first = blockSize * 2, stride = blockSize * 3;
    const disk = Buffer.alloc(first + stride * count, 0xee);
    for (let i = 0; i < count; i++) {
      const offset = first + stride * i;
      disk.writeUInt32LE(i + 1 < count ? offset + stride : 0, offset);
      disk.set(expected.subarray(i * payload, (i + 1) * payload), offset + 4);
    }
    const dir = mkdtempSync(join(tmpdir(), 'libac-dat-sector-'));
    const file = join(dir, 'sectors.dat');
    writeFileSync(file, disk);
    const reader = new SeekableFileReader(file);
    try {
      expect(new DatReader(reader).read(first, size, blockSize)).toEqual(expected);
    } finally {
      reader.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
