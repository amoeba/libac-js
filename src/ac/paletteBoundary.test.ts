import assert from "node:assert/strict";
import { Palette } from "../index.js";

const encode = (count: number, colors: number[]): Uint8Array => {
  const bytes = new Uint8Array(8 + colors.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04000001, true);
  view.setUint32(4, count, true);
  colors.forEach((value, index) => view.setUint32(8 + index * 4, value, true));
  return bytes;
};

test("Palette bulk reads preserve empty, unaligned, and hostile-count boundaries", () => {
  const colors = [0, 1, 0xff00ff00, 0x80000000, 0xffffffff];
  const bytes = encode(colors.length, colors);
  const backing = new Uint8Array(bytes.length + 8).fill(0xee);
  backing.set(bytes, 3);
  const palette = Palette.fromBuffer(backing.subarray(3));
  assert.equal(palette.id, 0x04000001);
  assert.ok(Array.isArray(palette.colors));
  assert.deepEqual(palette.colors, colors);
  assert.deepEqual(Palette.fromBuffer(encode(0, [])).colors, []);
  for (const length of [0, 7, bytes.length - 1, bytes.length - 2]) {
    assert.throws(() => Palette.fromBuffer(bytes.subarray(0, length)), RangeError);
  }
  assert.throws(() => Palette.fromBuffer(encode(0xffffffff, [1])), RangeError);
});
