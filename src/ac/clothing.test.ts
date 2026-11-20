import assert from "node:assert/strict";
import { parseClothingTable, parsePaletteSet, selectPalette } from "./clothing";

function words(...values: number[]): Uint8Array {
  const result = new Uint8Array(values.length * 4);
  const view = new DataView(result.buffer);
  values.forEach((v, i) => view.setUint32(i * 4, v, true));
  return result;
}
// Packed hash headers are two u16s; 0x00100002 means 2 entries, 16 buckets.
const fixture = words(
  0x10000100, 0x00100002,
  0x02000001, 1, 9, 0x010000ab, 2, 0x05000011, 0x05000012, 0x05000021, 0x05000022,
  0x02000002, 0,
  0x00400002,
  9, 0x06000010, 1, 2, 192, 64, 256, 128, 0x0f000001,
  4, 0x06000011, 0,
);

test("ClothingTable decodes packed hashes, nested effects and file-order template keys", () => {
  const table = parseClothingTable(fixture);
  assert.equal(table.id, 0x10000100);
  assert.deepEqual([...table.clothingBaseEffects.keys()], [0x02000001, 0x02000002]);
  assert.deepEqual([...table.clothingSubPalEffects.keys()], [9, 4]);
  assert.deepEqual(table.clothingBaseEffects.get(0x02000001), { objects: [{
    partIndex: 9, gfxObjId: 0x010000ab, textures: [
      { oldTextureId: 0x05000011, newTextureId: 0x05000012 },
      { oldTextureId: 0x05000021, newTextureId: 0x05000022 },
    ],
  }] });
  assert.deepEqual(table.clothingBaseEffects.get(0x02000002), { objects: [] });
  assert.deepEqual(table.clothingSubPalEffects.get(9), {
    iconId: 0x06000010,
    subPalettes: [{ paletteSetId: 0x0f000001, ranges: [
      { offset: 192, length: 64 }, { offset: 256, length: 128 },
    ] }],
  });
});

test("parser honors sliced Uint8Array offsets and never modifies source", () => {
  const padded = new Uint8Array(fixture.length + 11).fill(0xff);
  padded.set(fixture, 5);
  const before = padded.slice();
  assert.deepEqual(parseClothingTable(padded.subarray(5, 5 + fixture.length)), parseClothingTable(fixture));
  assert.deepEqual(padded, before);
});

test("empty tables and PaletteSets are valid", () => {
  const table = parseClothingTable(words(0x10000001, 0, 0));
  assert.equal(table.clothingBaseEffects.size, 0);
  assert.equal(table.clothingSubPalEffects.size, 0);
  assert.deepEqual(parsePaletteSet(words(0x0f000001, 0)), { id: 0x0f000001, palettes: [] });
});

test("ClothingTable rejects every truncated prefix, trailing garbage, wrong types and duplicate keys", () => {
  for (let n = 0; n < fixture.length; n++)
    assert.throws(() => parseClothingTable(fixture.subarray(0, n)), /truncated/, `prefix ${n}`);
  assert.throws(() => parseClothingTable(new Uint8Array([...fixture, 0])), /trailing/);
  assert.throws(() => parseClothingTable(words(0x02000001, 0, 0)), /invalid file id/);
  assert.throws(() => parseClothingTable(words(0x10000001, 2,
    0x02000001, 0, 0x02000001, 0, 0)), /duplicate key/);
  assert.throws(() => parseClothingTable(words(0x10000001, 0, 2,
    4, 0, 0, 4, 0, 0)), /duplicate key/);
});

test("count and size bounds stop hostile list allocations before looping", () => {
  assert.throws(() => parseClothingTable(words(0x10000001, 1, 0x02000001, 0xffffffff)), /exceeds bound/);
  assert.throws(() => parseClothingTable(words(0x10000001, 65535, 0)), /truncated/);
  assert.throws(() => parsePaletteSet(words(0x0f000001, 0xffffffff)), /exceeds bound/);
  assert.throws(() => parsePaletteSet(words(0x0f000001, 65537)), /exceeds bound/);
  assert.throws(() => parseClothingTable(new Uint8Array(16 * 1024 * 1024 + 1)), /size bound/);
});

test("PaletteSet parses ordered palette DIDs and validates every prefix", () => {
  const bytes = words(0x0f000001, 3, 0x04000001, 0x04000002, 0x04000003);
  assert.deepEqual(parsePaletteSet(bytes), {
    id: 0x0f000001, palettes: [0x04000001, 0x04000002, 0x04000003],
  });
  const padded = new Uint8Array(bytes.length + 3);
  padded.set(bytes, 3);
  assert.deepEqual(parsePaletteSet(padded.subarray(3)), parsePaletteSet(bytes));
  for (let n = 0; n < bytes.length; n++)
    assert.throws(() => parsePaletteSet(bytes.subarray(0, n)), /truncated/);
  assert.throws(() => parsePaletteSet(new Uint8Array([...bytes, 0])), /trailing/);
  assert.throws(() => parsePaletteSet(words(0x04000001, 0)), /invalid file id/);
});

test("palette selection uses ACE truncation and epsilon including shade endpoints", () => {
  const set = { id: 0x0f000001, palettes: [11, 22, 33, 44] };
  assert.equal(selectPalette(set), 11);
  assert.equal(selectPalette(set, 0.24), 11);
  assert.equal(selectPalette(set, 0.25), 11); // epsilon: not round(4 * shade)
  assert.equal(selectPalette(set, 0.251), 22);
  assert.equal(selectPalette(set, 0.5), 22);
  assert.equal(selectPalette(set, 0.8), 44);
  assert.equal(selectPalette(set, 1), 44);
  for (const shade of [-0.1, 1.1, NaN, Infinity, -Infinity]) assert.equal(selectPalette(set, shade), 0);
  assert.equal(selectPalette({ id: 0x0f000001, palettes: [] }, 0.5), 0);
});
