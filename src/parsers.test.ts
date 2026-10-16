import { GfxObj } from "./dat/file_types/GfxObj.js";
import { Setup, SetupFlags, Placement } from "./dat/file_types/Setup.js";
import BinaryReader from "./BinaryReader.js";
import { parseMultipartMixed, extractBoundary } from "./multipart.js";

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

// ─── Live-endpoint integration tests ─────────────────────────────────
//
// These parse real binaries fetched from https://dats.treestats.net. They are
// opt-in because the external host is not reachable from CI (it returns 403 to
// GitHub runners), so the default `npm test` must stay hermetic.
//
// Run them locally with: npm run test:integration

const RUN_LIVE_TESTS = process.env.LIBAC_INTEGRATION === "1";
const liveDescribe = RUN_LIVE_TESTS ? describe : describe.skip;

liveDescribe("live endpoint integration (set LIBAC_INTEGRATION=1)", () => {
  const GFXOBJ_URL = "https://dats.treestats.net/dats/portal/files/0x010008AB";
  const SETUP_URL = "https://dats.treestats.net/dats/portal/files/0x02000108";
  const MULTIPART_URL =
    "https://dats.treestats.net/setups/0x02000108?include=gfxobjs";

  // ─── GfxObj parser tests (using real binary from live endpoint) ────

  test("parse real GfxObj 0x010008AB from live endpoint", async () => {
    const res = await fetch(GFXOBJ_URL);
    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    const data = new Uint8Array(buf);

    const gfxobj = GfxObj.fromBuffer(data);

    expect(gfxobj.id).toBe(0x010008ab);
    expect(gfxobj.hasDrawing).toBe(true);
    expect(gfxobj.vertexArray).toBeDefined();
    expect(gfxobj.polygons.size).toBeGreaterThan(0);
  }, 15000);

  test("GfxObj vertex array has keyed vertices", async () => {
    const res = await fetch(GFXOBJ_URL);
    const buf = await res.arrayBuffer();
    const gfxobj = GfxObj.fromBuffer(new Uint8Array(buf));

    expect(gfxobj.vertexArray).toBeDefined();
    expect(gfxobj.vertexArray!.vertices.size).toBeGreaterThan(0);

    // Vertices should have origin and normal
    for (const [, v] of gfxobj.vertexArray!.vertices) {
      expect(v.origin).toBeDefined();
      expect(v.normal).toBeDefined();
      expect(v.uvs.length).toBeGreaterThanOrEqual(0);
    }
  }, 15000);

  test("GfxObj polygons have vertex IDs", async () => {
    const res = await fetch(GFXOBJ_URL);
    const buf = await res.arrayBuffer();
    const gfxobj = GfxObj.fromBuffer(new Uint8Array(buf));

    expect(gfxobj.polygons.size).toBeGreaterThan(0);
    for (const [, poly] of gfxobj.polygons) {
      expect(poly.vertexIds.length).toBeGreaterThanOrEqual(3);
      expect(poly.posSurface).toBeGreaterThanOrEqual(0);
    }
  }, 15000);

  // ─── Setup parser tests ────────────────────────────────────────────

  test("parse real Setup 0x02000108 from live endpoint", async () => {
    const res = await fetch(SETUP_URL);
    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    const data = new Uint8Array(buf);

    const setup = Setup.fromBuffer(data);

    expect(setup.id).toBe(0x02000108);
    expect(setup.numParts).toBeGreaterThan(0);
    expect(setup.parts.length).toBe(setup.numParts);
    expect(setup.getDefaultFrames()).toBeDefined();
  }, 15000);

  test("Setup parts are nonzero GfxObj IDs", async () => {
    const res = await fetch(SETUP_URL);
    const buf = await res.arrayBuffer();
    const setup = Setup.fromBuffer(new Uint8Array(buf));

    // From the implementation notes: 0x02000108 references GfxObj 0x010008AB
    const nonzeroParts = setup.parts.filter((p) => p !== 0);
    expect(nonzeroParts.length).toBeGreaterThan(0);
    expect(nonzeroParts.every((p) => p >= 0x01000000)).toBe(true);
  }, 15000);

  test("Setup default placement frame has one Frame per part", async () => {
    const res = await fetch(SETUP_URL);
    const buf = await res.arrayBuffer();
    const setup = Setup.fromBuffer(new Uint8Array(buf));

    const defaultFrame = setup.getDefaultFrames();
    expect(defaultFrame).toBeDefined();
    expect(defaultFrame!.frames.length).toBe(setup.numParts);
  }, 15000);

  // ─── Multipart parser tests ────────────────────────────────────────

  test("parse multipart/mixed response from /setups/:id?include=gfxobjs", async () => {
    const res = await fetch(MULTIPART_URL);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("multipart/mixed");

    const contentType = res.headers.get("content-type")!;
    const boundary = extractBoundary(contentType);
    expect(boundary).not.toBeNull();
    expect(boundary).toBe("acdatservice-02000108-0");

    const buf = await res.arrayBuffer();
    const parts = parseMultipartMixed(new Uint8Array(buf), boundary!);

    // Should have 2 parts: Setup + 1 GfxObj
    expect(parts.length).toBe(2);

    // First part should be the Setup (0x02000108)
    const setupPart = parts.find((p) => p.fileId === 0x02000108);
    expect(setupPart).toBeDefined();
    expect(setupPart!.contentType).toBe("application/octet-stream");
    expect(setupPart!.contentLocation).toBe("/dats/portal/files/0x02000108");

    // Second part should be the GfxObj (0x010008AB)
    const gfxobjPart = parts.find((p) => p.fileId === 0x010008ab);
    expect(gfxobjPart).toBeDefined();
    expect(gfxobjPart!.contentLocation).toBe("/dats/portal/files/0x010008AB");
  }, 15000);

  test("multipart parts parse as valid GfxObj and Setup", async () => {
    const res = await fetch(MULTIPART_URL);
    const contentType = res.headers.get("content-type")!;
    const boundary = extractBoundary(contentType)!;
    const buf = await res.arrayBuffer();
    const parts = parseMultipartMixed(new Uint8Array(buf), boundary);

    const setupPart = parts.find((p) => p.fileId === 0x02000108)!;
    const gfxobjPart = parts.find((p) => p.fileId === 0x010008ab)!;

    const setup = Setup.fromBuffer(setupPart.body);
    const gfxobj = GfxObj.fromBuffer(gfxobjPart.body);

    expect(setup.id).toBe(0x02000108);
    expect(gfxobj.id).toBe(0x010008ab);
    expect(setup.parts).toContain(0x010008ab);
    expect(gfxobj.hasDrawing).toBe(true);
    expect(gfxobj.polygons.size).toBeGreaterThan(0);
    expect(gfxobj.vertexArray!.vertices.size).toBeGreaterThan(0);
  }, 15000);
});
