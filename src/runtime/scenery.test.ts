import assert from "node:assert";
import { CellLandblock, Region, Scene } from "../index.js";
import type { ObjectDesc } from "../index.js";
import {
  cellCutIsNe,
  displace,
  generateScenery,
  rotateObjHeading,
  sampleTerrain,
  scaleObj,
} from "./index.js";

/**
 * The scenery hashes are defined over wrapping 32-bit arithmetic. This file
 * reimplements them with BigInt as an independent oracle so a refactor that
 * silently widens a product to 64-bit (or reorders a subtraction) fails here
 * rather than only showing up as objects in the wrong place at runtime.
 */

const B = BigInt;
const SCALE = 2.3283064e-10;
const wrap = (v: bigint) => BigInt.asIntN(32, v);
const frac = (v: bigint) => Number(BigInt.asUintN(32, v)) * SCALE;

function refShuffleHashes(a: number, c: number, offset: number): bigint {
  let inner = wrap(B(1360117743) * B(a));
  inner = wrap(inner * B(c));
  inner = wrap(inner + B(1888038839));
  const product = wrap(B(offset) * inner);
  let v = wrap(B(1813693831) * B(a));
  v = wrap(v - product);
  v = wrap(v - wrap(B(1109124029) * B(c)));
  return v;
}

function refDisplace(obj: ObjectDesc, ix: number, iy: number, iq: number) {
  const loc = obj.baseLoc.origin;
  const x = obj.displaceX <= 0
    ? loc.x
    : frac(refShuffleHashes(iy, ix, iq + 45773)) * obj.displaceX + loc.x;
  const y = obj.displaceY <= 0
    ? loc.y
    : frac(refShuffleHashes(iy, ix, iq + 72719)) * obj.displaceY + loc.y;

  let q = wrap(B(1813693831) * B(iy));
  let inner = wrap(B(1870387557) * B(iy));
  inner = wrap(inner + B(1109124029));
  inner = wrap(B(ix) * inner);
  q = wrap(q - inner);
  q = wrap(q - B(402451965));
  const quadrant = frac(q);

  if (quadrant >= 0.75) return { x: y, y: -x, z: loc.z };
  if (quadrant >= 0.5) return { x: -x, y: -y, z: loc.z };
  if (quadrant >= 0.25) return { x: -y, y: x, z: loc.z };
  return { x, y, z: loc.z };
}

function objectDesc(overrides: Partial<ObjectDesc> = {}): ObjectDesc {
  return {
    objId: 0x02000100,
    baseLoc: {
      origin: { x: 1.5, y: -2.5, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
    freq: 0.5,
    displaceX: 19.14,
    displaceY: 18.5,
    minScale: 0.8,
    maxScale: 1.4,
    maxRotation: 360,
    minSlope: -1,
    maxSlope: 1,
    align: 0,
    orient: 0,
    weenieObj: 0,
    ...overrides,
  };
}

function assertVecClose(actual: { x: number; y: number; z: number }, expected: { x: number; y: number; z: number }): void {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-6, `x ${actual.x} != ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-6, `y ${actual.y} != ${expected.y}`);
  assert.ok(Math.abs(actual.z - expected.z) < 1e-6, `z ${actual.z} != ${expected.z}`);
}

test("displace matches the 32-bit reference across quadrant-bearing coordinates", () => {
  const obj = objectDesc();
  // A spread that exercises every quadrant branch and large (wrapping) coords.
  const coords: [number, number][] = [
    [0, 0], [1, 1], [5, 9], [64, 64], [200, 13], [1432, 592],
    [2031, 2032], [1000, 3], [3, 1000], [977, 811],
  ];
  for (const [ix, iy] of coords) {
    for (const iq of [0, 1, 7, 42]) {
      assertVecClose(displace(obj, ix, iy, iq), refDisplace(obj, ix, iy, iq));
    }
  }
});

test("scaleObj and rotateObjHeading match the reference and stay in bounds", () => {
  const obj = objectDesc();
  for (const [x, y] of [[10, 20], [500, 900], [2000, 1500]] as [number, number][]) {
    const scale = scaleObj(obj, x, y, 3);
    const expectedScale =
      Math.pow(obj.maxScale / obj.minScale, frac(refShuffleHashes(y, x, 3 + 32593))) *
      obj.minScale;
    assert.ok(Math.abs(scale - expectedScale) < 1e-6);
    assert.ok(scale >= obj.minScale && scale <= obj.maxScale, `scale ${scale} out of range`);

    const heading = rotateObjHeading(obj, x, y, 3);
    const expectedHeading = frac(refShuffleHashes(y, x, 3 + 63127)) * obj.maxRotation;
    assert.ok(Math.abs(heading - expectedHeading) < 1e-4);
    assert.ok(heading >= 0 && heading < obj.maxRotation, `heading ${heading} out of range`);
  }
  // maxRotation 0 is the identity heading.
  assert.equal(rotateObjHeading(objectDesc({ maxRotation: 0 }), 3, 4, 5), 0);
});

test("cellCutIsNe matches the reference split direction", () => {
  for (let x = 0; x < 2040; x += 137) {
    for (let y = 0; y < 2040; y += 149) {
      const seedA = Number(BigInt.asUintN(32, B(x * 214614067)));
      const seedB = Number(BigInt.asUintN(32, B(x * 1109124029)));
      const value = y * (seedA + 1813693831) - seedB - 1369149221;
      const expected = Number(BigInt.asUintN(32, B(Math.round(value)))) >= 2147483648;
      assert.equal(cellCutIsNe(x, y), expected, `cut mismatch at ${x},${y}`);
    }
  }
});

test("sampleTerrain returns the plane of the coarse AC triangle mesh", () => {
  const lb = new CellLandblock();
  lb.height = new Array(81).fill(0);
  lb.terrain = new Array(81).fill(0);
  const table = Array.from({ length: 256 }, (_, i) => i * 2);
  const flat = sampleTerrain(lb, table, 1, 1, 12, 12);
  assert.ok(flat);
  assert.ok(Math.abs(flat.normal.z - 1) < 1e-6);
  assert.ok(Math.abs(flat.z - 0) < 1e-6);

  // A single raised control point tilts the triangle containing it.
  lb.height[0] = 50; // corner (0,0)
  const tilted = sampleTerrain(lb, table, 1, 1, 1, 1);
  assert.ok(tilted);
  assert.ok(tilted.normal.z > 0 && tilted.normal.z < 1);
});

function syntheticRegion(): Region {
  const region = new Region();
  region.landHeightTable = Array.from({ length: 256 }, (_, i) => i * 2);
  region.terrainTypes = [
    { name: "grass", color: 0, sceneTypes: [0] },
  ];
  region.sceneTypes = [{ stbIndex: 0, scenes: [0x12000001] }];
  return region;
}

function syntheticCell(): CellLandblock {
  const lb = new CellLandblock();
  // Terrain type 0 with scene type 0, no road and no scenery override bits.
  lb.terrain = new Array(81).fill(0);
  lb.height = new Array(81).fill(20);
  return lb;
}

test("generateScenery is deterministic, in-block and clamped", async () => {
  const region = syntheticRegion();
  const lb = syntheticCell();
  const objects: ObjectDesc[] = [objectDesc({ freq: 1, objId: 0x01000001 })];
  const fakeScene = { id: 0x12000001, objects } as Scene;
  const readScene = async () => fakeScene;

  const first = await generateScenery(region, lb, 0x12, 0x34, [], readScene);
  const second = await generateScenery(region, lb, 0x12, 0x34, [], readScene);
  assert.ok(first.length > 0, "some scenery should generate");
  assert.deepEqual(first, second, "generation is deterministic");

  for (const p of first) {
    assert.ok(p.origin.x >= 0 && p.origin.x < 192, `x in block: ${p.origin.x}`);
    assert.ok(p.origin.y >= 0 && p.origin.y < 192, `y in block: ${p.origin.y}`);
    assert.ok(Number.isFinite(p.origin.z));
    assert.ok(p.scale >= 0.8 && p.scale <= 1.4);
  }
});

test("generateScenery never spawns inside a building cell", async () => {
  const region = syntheticRegion();
  const lb = syntheticCell();
  const fakeScene = { id: 0x12000001, objects: [objectDesc({ freq: 1 })] } as Scene;
  const readScene = async () => fakeScene;
  // A building at the origin occupies cell (0,0); its control points must be bare.
  const placements = await generateScenery(
    region,
    lb,
    0x12,
    0x34,
    [{ frame: { origin: { x: 5, y: 5, z: 0 } } }],
    readScene,
  );
  for (const p of placements) {
    const cell = Math.min((p.origin.x / 24) | 0, 7) * 8 + Math.min((p.origin.y / 24) | 0, 7);
    assert.notEqual(cell, 0, "no scenery in the building's cell");
  }
});
