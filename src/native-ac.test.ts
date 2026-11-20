import assert from "node:assert/strict";
import BinaryReader from "./BinaryReader.js";
import { Palette } from "./dat/file_types/Palette.js";
import { Region, readRegionSky } from "./dat/file_types/Region.js";
import { Setup } from "./dat/file_types/Setup.js";
import { decodePixelData, decodePixelDataCooperative, mergePalette, bakeTerrainPixels, bakeTerrainPixelsCooperative } from "./pixels/index.js";
import { SurfacePixelFormat } from "./dat/file_types/Texture.js";

test("Palette bulk parser preserves sliced views, trailing bytes, and truncated-read failure", () => {
  const source = new Uint8Array(8 + 12 + 3 * 4 + 3).fill(0xee);
  const view = new DataView(source.buffer);
  view.setUint32(8, 0x04000001, true);
  view.setUint32(12, 3, true);
  view.setUint32(16, 0x11223344, true);
  view.setUint32(20, 0x55667788, true);
  view.setUint32(24, 0x99aabbcc, true);
  const parsed = Palette.fromBuffer(source.subarray(8));
  assert.deepEqual(parsed.colors, [0x11223344, 0x55667788, 0x99aabbcc]);
  assert.equal(parsed.id, 0x04000001);
  assert.throws(() => Palette.fromBuffer(source.subarray(8, 19)), RangeError);
  assert.throws(() => Palette.fromBuffer(new Uint8Array(7)), RangeError);
});

test("Setup.readParts is offset-safe, ignores later sections, and supports caller caps", () => {
  const bytes = new Uint8Array(27);
  const v = new DataView(bytes.buffer);
  v.setUint32(0, 0x02000001, true); v.setUint32(4, 3, true); v.setUint32(8, 2, true);
  v.setUint32(12, 0x010000aa, true); v.setUint32(16, 0x010000bb, true);
  bytes.set([1, 2, 3], 24);
  const carrier = new Uint8Array(bytes.length + 9); carrier.set(bytes, 5);
  assert.deepEqual(Setup.readParts(carrier.subarray(5, 5 + bytes.length)), {
    id: 0x02000001, flags: 3, numParts: 2, parts: [0x010000aa, 0x010000bb],
  });
  assert.throws(() => Setup.readParts(bytes, { maxParts: 1 }), /exceeds limit/);
  assert.throws(() => Setup.readParts(bytes, { expectedId: 0x02000002, maxParts: 1 }), /invalid\/mismatched id/);
  const oversized = new Uint8Array(12 + 257 * 4);
  const oversizedView = new DataView(oversized.buffer);
  oversizedView.setUint32(0, 0x02000001, true); oversizedView.setUint32(8, 257, true);
  assert.throws(() => Setup.readParts(oversized, { expectedId: 0x02000002, maxParts: 256 }), /invalid\/mismatched id/);
  assert.throws(() => Setup.readParts(bytes.subarray(0, 18)), /truncated parts/);
  const wrong = bytes.slice(); new DataView(wrong.buffer).setUint32(0, 0x01000001, true);
  assert.throws(() => Setup.readParts(wrong), /invalid file id/);
});

class Writer {
  bytes: number[] = [];
  word(value: number, type: "u32" | "f32" | "f64" = "u32") {
    const b = new ArrayBuffer(type === "f64" ? 8 : 4), d = new DataView(b);
    if (type === "f64") d.setFloat64(0, value, true);
    else if (type === "f32") d.setFloat32(0, value, true);
    else d.setUint32(0, value, true);
    this.bytes.push(...new Uint8Array(b));
  }
  align() { while (this.bytes.length % 4) this.bytes.push(0); }
  string(value: string) {
    const body = [...new TextEncoder().encode(value)];
    this.bytes.push(body.length & 255, body.length >> 8, ...body); this.align();
  }
}
function regionFixture(withSky = true): Uint8Array {
  const w = new Writer();
  w.word(0x13000000); w.word(1); w.word(2); w.string("Dereth");
  for (let i = 0; i < 264; i++) w.word(0);
  w.word(0, "f64"); w.word(1); w.word(7620, "f32"); w.word(360); w.string("PY");
  w.word(1); w.word(.25, "f32"); w.word(0); w.string("Morning");
  w.word(1); w.string("Day"); w.word(1); w.word(0); w.string("Spring");
  w.word(withSky ? 0x10 : 0);
  if (withSky) {
    w.word(.8, "f64"); w.word(15, "f64"); w.align(); w.word(1);
    w.word(5, "f32"); w.string("Sunny"); w.word(1);
    for (const x of [0, 0, -20, 190, -.013, .013]) w.word(x, "f32");
    w.word(0x01004c36); w.word(0); w.word(2); w.align(); w.word(0);
  }
  // Empty TerrainDesc and an empty TexMerge.
  for (let i = 0; i < 7; i++) w.word(0);
  return Uint8Array.from(w.bytes);
}

test("Region owns GameTime and SkyDesc and shares prefix parsing with readRegionSky", () => {
  const bytes = regionFixture();
  const carrier = new Uint8Array(bytes.length + 9); carrier.set(bytes, 5);
  const view = carrier.subarray(5, 5 + bytes.length);
  const region = Region.fromBuffer(view);
  const prefix = readRegionSky(view);
  assert.equal(region.gameTime.dayLength, 7620);
  assert.equal(region.gameTime.timesOfDay[0].name, "Morning");
  assert.equal(region.sky?.days[0].name, "Sunny");
  assert.deepEqual(prefix.days, region.sky?.days);
  assert.equal(Region.fromBuffer(regionFixture(false)).sky, undefined);
  assert.deepEqual(readRegionSky(regionFixture(false)).days, []);
});

test("pixels entry preserves cooperative decode parity and palette block clipping", async () => {
  const pixels = new Uint8Array(256 * 256 * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = i & 255;
  const input = { format: SurfacePixelFormat.R8G8B8, width: 256, height: 256, bytes: pixels };
  const result = await decodePixelDataCooperative(input, undefined, false, 17);
  assert.equal(result.length, 256 * 256 * 4);
  assert.deepEqual(result, decodePixelData(input, undefined));
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 0);
  await assert.rejects(decodePixelDataCooperative(input, undefined, false, 1, controller.signal), { name: "AbortError" });
  assert.deepEqual(mergePalette([0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 3, 4, 5, 6, 7, 10], 1, 2),
    [0, 1, 2, 3, 4, 5, 6, 7, 10]);
  const image = { data: new Uint8Array([10, 20, 30, 255]), width: 1, height: 1 };
  const direct = bakeTerrainPixels(image, [], undefined, 1);
  const cooperative = await bakeTerrainPixelsCooperative(image, [], undefined, 1, 1);
  assert.deepEqual(cooperative, direct);
  assert.equal(new BinaryReader(new Uint8Array([1, 2, 3, 4])).ReadUint32(), 0x04030201);
});
