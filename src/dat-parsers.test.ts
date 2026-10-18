import { readFileSync } from "node:fs";
import BinaryReader, { toExactArrayBuffer } from "./BinaryReader.js";
import { CellLandblock, terrainRoad, terrainScenery, terrainType } from "./dat/file_types/CellLandblock.js";
import { Surface, SurfaceType } from "./dat/file_types/Surface.js";
import { SurfaceTexture } from "./dat/file_types/SurfaceTexture.js";
import { Texture, SurfacePixelFormat } from "./dat/file_types/Texture.js";
import { Setup } from "./dat/file_types/Setup.js";
import { AnimationFrame } from "./dat/types/AnimationFrame.js";
import { Polygon, POLYGON_STIPPLING_NO_POS, hasPositiveFace } from "./dat/types/Polygon.js";

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));

function bytes(size: number, fill: (view: DataView) => void): Uint8Array {
  const buffer = new ArrayBuffer(size);
  fill(new DataView(buffer));
  return new Uint8Array(buffer);
}

// ─── BinaryReader helpers ────────────────────────────────────────────

test("toExactArrayBuffer copies a view with a byte offset", () => {
  const padded = new Uint8Array([0, 0, 0x78, 0x56, 0x34, 0x12]);
  const exact = toExactArrayBuffer(padded.subarray(2));
  expect(new BinaryReader(exact).ReadUint32()).toBe(0x12345678);
});

test("BinaryReader reports remaining and slices", () => {
  const reader = new BinaryReader(bytes(8, (view) => {
    view.setUint32(0, 0x01020304, true);
    view.setUint32(4, 0x05060708, true);
  }));
  expect(reader.remaining).toBe(8);
  expect([...new Uint8Array(reader.slice(0, 4))]).toEqual([4, 3, 2, 1]);
  reader.ReadUint32();
  expect(reader.remaining).toBe(4);
});

test("ReadPString reads a u16 length, Latin-1 bytes, and aligns to 4", () => {
  // length 5 + "hello" + one pad byte to reach an 8-byte boundary.
  const reader = new BinaryReader(new Uint8Array([5, 0, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0]));
  expect(reader.ReadPString()).toBe("hello");
  expect(reader.position).toBe(8);
});

// ─── Polygon ─────────────────────────────────────────────────────────

test("hasPositiveFace follows the NoPos stippling flag", () => {
  const polygon = new Polygon();
  expect(hasPositiveFace(polygon)).toBe(true);

  polygon.stippling = POLYGON_STIPPLING_NO_POS;
  expect(hasPositiveFace(polygon)).toBe(false);

  // NoPos is bit 0x04; 0x0c has other bits set but not NoPos.
  polygon.stippling = 0x0c;
  expect(hasPositiveFace(polygon)).toBe(true);
});

// ─── Surface / SurfaceTexture / Texture ──────────────────────────────

test("parses image-backed surfaces and indexed textures", () => {
  const surface = Surface.fromBuffer(bytes(24, (view) => {
    view.setUint32(0, SurfaceType.Base1Image, true);
    view.setUint32(4, 0x06001234, true);
    view.setUint32(8, 0x04005678, true);
    view.setFloat32(12, 0.25, true);
    view.setFloat32(16, 0.5, true);
    view.setFloat32(20, 0.75, true);
  }));
  expect(surface.hasImage).toBe(true);
  expect(surface.textureId).toBe(0x06001234);
  expect(surface.paletteId).toBe(0x04005678);
  expect(surface.translucency).toBeCloseTo(0.25);

  const texture = Texture.fromBuffer(bytes(33, (view) => {
    view.setUint32(0, 0x06001234, true);
    view.setInt32(4, 0, true);
    view.setInt32(8, 2, true);
    view.setInt32(12, 1, true);
    view.setUint32(16, SurfacePixelFormat.P8, true);
    view.setInt32(20, 2, true);
    view.setUint8(24, 4);
    view.setUint8(25, 5);
    view.setUint32(26, 0x04005678, true);
  }));
  expect(texture.width).toBe(2);
  expect(texture.height).toBe(1);
  expect([...texture.sourceData]).toEqual([4, 5]);
  expect(texture.defaultPaletteId).toBe(0x04005678);
});

test("parses a SurfaceTexture reference to its base texture", () => {
  const surfaceTexture = SurfaceTexture.fromBuffer(bytes(17, (view) => {
    view.setUint32(0, 0x0500180a, true);
    view.setInt32(4, 0, true);
    view.setUint8(8, 2);
    view.setUint32(9, 1, true);
    view.setUint32(13, 0x06003966, true);
  }));
  expect(surfaceTexture.id).toBe(0x0500180a);
  expect(surfaceTexture.unknownByte).toBe(2);
  expect(surfaceTexture.textures).toEqual([0x06003966]);
});

// ─── CellLandblock ───────────────────────────────────────────────────

test("CellLandblock parses its terrain and height grids", () => {
  const lb = CellLandblock.fromBuffer(bytes(252, (view) => {
    view.setUint32(0, 0xb34affff, true);
    view.setUint32(4, 1, true);
    // terrain word 0: type 7, road 1, scenery 3
    view.setUint16(8, ((3 & 0x1f) << 11) | ((7 & 0x1f) << 2) | (1 & 0x3), true);
    view.setUint8(8 + 162, 100);
  }));
  expect(lb.id).toBe(0xb34affff);
  expect(lb.hasObjects).toBe(true);
  expect(lb.terrain).toHaveLength(81);
  expect(lb.height).toHaveLength(81);
  expect(terrainRoad(lb.terrain[0])).toBe(1);
  expect(terrainType(lb.terrain[0])).toBe(7);
  expect(terrainScenery(lb.terrain[0])).toBe(3);
  expect(lb.heightAt(0, 0)).toBeCloseTo(200);
});

// ─── Setup ───────────────────────────────────────────────────────────

test("Setup.fromBuffer parses an exact buffer", () => {
  const setup = Setup.fromBuffer(fixture("setup-0x02000116.bin"));
  expect(setup.id).toBe(0x02000116);
  expect(setup.numParts).toBe(1);
  expect(setup.parts).toEqual([0x010006a9]);
});

test("Setup.fromBuffer ignores a view's byteOffset", () => {
  const raw = fixture("setup-0x02000116.bin");
  const padded = new Uint8Array(raw.byteLength + 8);
  padded.set(raw, 8);

  const fromView = Setup.fromBuffer(padded.subarray(8));
  const fromExact = Setup.fromBuffer(raw);
  expect(fromView.id).toBe(fromExact.id);
  expect(fromView.numParts).toBe(fromExact.numParts);
  expect(fromView.parts).toEqual(fromExact.parts);
});

test("Setup.getPlacementFrames prefers Resting, then falls back to Default", () => {
  const setup = Setup.fromBuffer(fixture("setup-0x02000065.bin"));
  expect(setup.getPlacementFrames()).toBe(setup.placementFrames.get(0x65));
  expect(setup.getPlacementFrames()).not.toBe(setup.placementFrames.get(0));

  const withoutResting = new Setup();
  const fallback = new AnimationFrame();
  withoutResting.placementFrames.set(0, fallback);
  expect(withoutResting.getPlacementFrames()).toBe(fallback);
  expect(new Setup().getPlacementFrames()).toBeUndefined();
});
