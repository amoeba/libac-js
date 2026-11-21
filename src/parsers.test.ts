import { readFileSync } from "node:fs";
import { GfxObj } from "./dat/file_types/GfxObj.js";
import { Setup } from "./dat/file_types/Setup.js";
import BinaryReader from "./BinaryReader.js";

const rdr = function (values: number[]): BinaryReader {
  const buf = Buffer.from(values);
  const array = new Uint8Array(buf);
  return new BinaryReader(array.buffer);
};

// ─── BinaryReader unit tests ─────────────────────────────────────────

test("ReadCompressedUInt: 1-byte encoding", () => {
  // 0x12 & 0x80 == 0 → single byte
  expect(rdr([0x12]).ReadCompressedUInt()).toBe(0x12);
});

test("ReadCompressedUInt: 2-byte encoding", () => {
  // 0x92: 0x80 set, 0x40 not set → 2 bytes
  // value = ((0x92 & 0x7f) << 8) | 0x34 = (0x12 << 8) | 0x34 = 0x1234
  expect(rdr([0x92, 0x34]).ReadCompressedUInt()).toBe(0x1234);
});

test("ReadCompressedUInt: 4-byte encoding", () => {
  // 0xD2: both 0x80 and 0x40 set → 4 bytes
  // b0=0xD2, b1=0x10, hi=ReadUint16() over [0xFF, 0xEE] → LE uint16 = 0xEEFF
  // value = (((0xD2 & 0x3f) << 8 | 0x10) << 16) | 0xEEFF = 0x1210EEFF
  expect(rdr([0xD2, 0x10, 0xFF, 0xEE]).ReadCompressedUInt()).toBe(0x1210EEFF);
});

test("ReadVector3", () => {
  const reader = rdr([
    0x00, 0x00, 0x80, 0x3f, // 1.0
    0x00, 0x00, 0x00, 0x40, // 2.0
    0x00, 0x00, 0x40, 0x40, // 3.0
  ]);
  const v = reader.ReadVector3();
  expect(v.x).toBeCloseTo(1.0);
  expect(v.y).toBeCloseTo(2.0);
  expect(v.z).toBeCloseTo(3.0);
});

test("ReadQuaternion reads w,x,y,z order", () => {
  // w=1.0, x=2.0, y=3.0, z=4.0
  const reader = rdr([
    0x00, 0x00, 0x80, 0x3f, // 1.0
    0x00, 0x00, 0x00, 0x40, // 2.0
    0x00, 0x00, 0x40, 0x40, // 3.0
    0x00, 0x00, 0x80, 0x40, // 4.0
  ]);
  const q = reader.ReadQuaternion();
  expect(q.w).toBeCloseTo(1.0);
  expect(q.x).toBeCloseTo(2.0);
  expect(q.y).toBeCloseTo(3.0);
  expect(q.z).toBeCloseTo(4.0);
});

test("ReadString (7-bit encoded length)", () => {
  // length = 5 (0x05), then "hello"
  const strBytes = Array.from(Buffer.from("hello", "utf8"));
  const bytes = [5, ...strBytes];
  const reader = rdr(bytes);
  expect(reader.ReadString()).toBe("hello");
});

test("ReadBytes", () => {
  const reader = rdr([1, 2, 3, 4, 5]);
  const bytes = reader.ReadBytes(3);
  expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
});

test("BinaryReader honors Uint8Array byte offsets", () => {
  const bytes = Buffer.from([0xff, 0x78, 0x56, 0x34, 0x12]);
  const reader = new BinaryReader(bytes.subarray(1));
  expect(reader.ReadUint32()).toBe(0x12345678);
});

// ─── Recorded-fixture parser tests ───────────────────────────────────
//
// These parse real Asheron's Call binaries captured from
// https://dats.treestats.net and committed under src/__fixtures__ so the suite
// stays hermetic (the live host returns 403 to CI runners). See
// src/__fixtures__/README.md for provenance and refresh instructions.

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));

const GFXOBJ_FIXTURE = "gfxobj-0x010008AB.bin";
const SETUP_FIXTURE = "setup-0x02000108.bin";

// ─── GfxObj parser tests (from recorded fixture) ─────────────────────

test("parse real GfxObj 0x010008AB", () => {
  const gfxobj = GfxObj.fromBuffer(fixture(GFXOBJ_FIXTURE));

  expect(gfxobj.id).toBe(0x010008ab);
  expect(gfxobj.hasDrawing).toBe(true);
  expect(gfxobj.vertexArray).toBeDefined();
  expect(gfxobj.polygons.size).toBeGreaterThan(0);
  expect(gfxobj.drawingBsp).toBeDefined();
});

test("GfxObj vertex array has keyed vertices", () => {
  const gfxobj = GfxObj.fromBuffer(fixture(GFXOBJ_FIXTURE));

  expect(gfxobj.vertexArray).toBeDefined();
  expect(gfxobj.vertexArray!.vertices.size).toBeGreaterThan(0);

  // Vertices should have origin and normal
  for (const [, v] of gfxobj.vertexArray!.vertices) {
    expect(v.origin).toBeDefined();
    expect(v.normal).toBeDefined();
    expect(v.uvs.length).toBeGreaterThanOrEqual(0);
  }
});

test("GfxObj polygons have vertex IDs", () => {
  const gfxobj = GfxObj.fromBuffer(fixture(GFXOBJ_FIXTURE));

  expect(gfxobj.polygons.size).toBeGreaterThan(0);
  for (const [, poly] of gfxobj.polygons) {
    expect(poly.vertexIds.length).toBeGreaterThanOrEqual(3);
    expect(poly.posSurface).toBeGreaterThanOrEqual(0);
  }
});

// ─── Setup parser tests (from recorded fixture) ──────────────────────

test("parse real Setup 0x02000108", () => {
  const setup = Setup.fromBuffer(fixture(SETUP_FIXTURE));

  expect(setup.id).toBe(0x02000108);
  expect(setup.numParts).toBeGreaterThan(0);
  expect(setup.parts.length).toBe(setup.numParts);
  expect(setup.getDefaultFrames()).toBeDefined();
});

test("Setup parts are nonzero GfxObj IDs", () => {
  const setup = Setup.fromBuffer(fixture(SETUP_FIXTURE));

  // From the implementation notes: 0x02000108 references GfxObj 0x010008AB
  const nonzeroParts = setup.parts.filter((p) => p !== 0);
  expect(nonzeroParts.length).toBeGreaterThan(0);
  expect(nonzeroParts.every((p) => p >= 0x01000000)).toBe(true);
});

test("Setup default placement frame has one Frame per part", () => {
  const setup = Setup.fromBuffer(fixture(SETUP_FIXTURE));

  const defaultFrame = setup.getDefaultFrames();
  expect(defaultFrame).toBeDefined();
  expect(defaultFrame!.frames.length).toBe(setup.numParts);
});
