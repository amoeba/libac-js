import assert from "node:assert/strict";
import {
  blockId,
  blockIdOfFileId,
  blockXOf,
  blockXY,
  blockYOf,
  interiorLandcellId,
  isInteriorLandcellId,
  isOutdoorLandcellId,
  LANDBLOCK_INFO_SUFFIX,
  LANDBLOCK_SUFFIX,
  landblockFileId,
  landcellBlockId,
  landcellCellNumber,
  LANDCELL_INTERIOR_FIRST,
  LANDCELL_INTERIOR_LAST,
  LANDCELL_OUTDOOR_FIRST,
  LANDCELL_OUTDOOR_LAST,
  landcellIndex,
  outdoorLandcellId,
  outdoorLandcellIdAtWorld,
} from "./landblock.js";
import { LANDBLOCK_TILE, LANDBLOCK_TILES } from "../dat/file_types/CellLandblock.js";

const BLOCK = 0xaab4; // Holtburg, matching the application's existing tests.

test("landblock ids round-trip and stay unsigned u32 values", () => {
  assert.equal(blockId(0xaa, 0xb4), BLOCK);
  assert.deepEqual(blockXY(BLOCK), [0xaa, 0xb4]);
  assert.equal(blockXOf(BLOCK), 0xaa);
  assert.equal(blockYOf(BLOCK), 0xb4);
  assert.deepEqual(blockXY(blockId(254, 0)), [254, 0]);
  assert.equal(blockId(-1, -1), 0xffff);
  assert.equal(blockId(0x1aa, 0x1b4), BLOCK);
});

test("cell-DAT file ids use (landblock << 16) | suffix", () => {
  assert.equal(landblockFileId(BLOCK, LANDBLOCK_SUFFIX), 0xaab4ffff);
  assert.equal(landblockFileId(BLOCK, LANDBLOCK_INFO_SUFFIX), 0xaab4fffe);
  assert.equal(blockIdOfFileId(0xaab4ffff), BLOCK);
  assert.equal(blockIdOfFileId(0xaab4fffe), BLOCK);
  assert.equal(landblockFileId(0xffff, 0xffff), 0xffffffff);
});

test("terrain cell indices are X-major within the owning block", () => {
  assert.equal(landcellIndex(0, 0), 0);
  assert.equal(landcellIndex(LANDBLOCK_TILE, 0), LANDBLOCK_TILES);
  assert.equal(landcellIndex(0, LANDBLOCK_TILE), 1);
  assert.equal(landcellIndex(7 * LANDBLOCK_TILE, 7 * LANDBLOCK_TILE), 63);

});

test("native outdoor landcells are numbered 1..64, not 0x100..0x13f", () => {
  assert.equal(outdoorLandcellId(BLOCK, 0, 0), 0xaab40001);
  assert.equal(outdoorLandcellId(BLOCK, 23.9, 23.9), 0xaab40001);
  assert.equal(outdoorLandcellId(BLOCK, 191.9, 191.9), 0xaab40040);
  assert.equal(outdoorLandcellId(BLOCK, 168, 168), 0xaab40040);

  assert.equal(LANDCELL_OUTDOOR_FIRST, 1);
  assert.equal(LANDCELL_OUTDOOR_LAST, 64);
  assert.equal(landcellCellNumber(outdoorLandcellId(BLOCK, 0, 0)), 1);
  assert.equal(landcellCellNumber(outdoorLandcellId(BLOCK, 191.9, 191.9)), 64);
  assert.equal(isOutdoorLandcellId(0xaab40001), true);
  assert.equal(isOutdoorLandcellId(0xaab40040), true);
  assert.equal(isOutdoorLandcellId(0xaab40100), false);
});

test("world-position mapping subtracts the owning block origin", () => {
  assert.equal(
    outdoorLandcellIdAtWorld(BLOCK, 0xaa * 192, 0xb4 * 192),
    0xaab40001,
  );
  assert.equal(
    outdoorLandcellIdAtWorld(BLOCK, 0xaa * 192 + 96, 0xb4 * 192 + 96),
    0xaab40025,
  );
});

test("interior EnvCell numbers remain 0x100..0xfffd and are not re-based", () => {
  assert.equal(interiorLandcellId(BLOCK, LANDCELL_INTERIOR_FIRST), 0xaab40100);
  assert.equal(interiorLandcellId(BLOCK, 0x1234), 0xaab41234);
  assert.equal(interiorLandcellId(BLOCK, LANDCELL_INTERIOR_LAST), 0xaab4fffd);
  assert.equal(landcellCellNumber(0xaab40100), 0x0100);
  assert.equal(landcellBlockId(0xaab40100), BLOCK);
  assert.equal(isInteriorLandcellId(0xaab40100), true);
  assert.equal(isOutdoorLandcellId(0xaab40100), false);

  assert.throws(() => interiorLandcellId(BLOCK, 0x0001), RangeError);
  assert.throws(() => interiorLandcellId(BLOCK, 0x00ff), RangeError);
  assert.throws(() => interiorLandcellId(BLOCK, 0xfffe), RangeError);
  assert.throws(() => interiorLandcellId(BLOCK, 0xffff), RangeError);
  assert.throws(() => interiorLandcellId(BLOCK, 256.5), RangeError);
});

test("0xffff remains the reserved block-cell id, not an interior cell", () => {
  assert.equal(isOutdoorLandcellId(0xaab4ffff), false);
  assert.equal(isInteriorLandcellId(0xaab4ffff), false);
});


test("local and world positions reject invalid or out-of-block coordinates", () => {
  for (const invalid of [-1, 192, 500, NaN, Infinity, -Infinity]) {
    assert.throws(() => landcellIndex(invalid, 0), RangeError);
    assert.throws(() => landcellIndex(0, invalid), RangeError);
    assert.throws(() => outdoorLandcellId(BLOCK, invalid, 0), RangeError);
    assert.throws(() => outdoorLandcellId(BLOCK, 0, invalid), RangeError);
    assert.throws(() => outdoorLandcellIdAtWorld(BLOCK, 0xaa * 192 + invalid, 0xb4 * 192), RangeError);
    assert.throws(() => outdoorLandcellIdAtWorld(BLOCK, 0xaa * 192, 0xb4 * 192 + invalid), RangeError);
  }
});
