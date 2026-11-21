/**
 * Native Asheron's Call landblock, landcell and cell-DAT file identity.
 *
 * These are pure bit-layout facts from ACE's `LandDefs.cs`: a landblock id is
 * `(blockX << 8) | blockY`, a cell-DAT landblock file is
 * `(blockId << 16) | suffix`, and the low 16 bits of an EnvCell/landcell id
 * carry either an outdoor terrain cell or an interior cell number.
 *
 * Outdoor terrain cells are numbered 1..64. Interior EnvCells start at 0x100.
 * The two ranges do not overlap, but they share the same low-16-bit field, so
 * callers must know which archive/context an id belongs to. This module
 * deliberately does not provide a universal `datFor(id)` router: cell and
 * portal resource ids can overlap, and high-resolution/portal fallback is
 * archive policy, not a native bit-layout fact.
 *
 * Loading policy (which blocks form a ring and for how long they stay loaded)
 * and UI formatting also remain application concerns. This module only owns
 * the shared id/coordinate arithmetic.
 */

import {
  LANDBLOCK_SIZE,
  LANDBLOCK_TILE,
  LANDBLOCK_TILES,
} from "../dat/file_types/CellLandblock.js";

/** Cell-DAT suffix for a `CellLandblock` (terrain) file. */
export const LANDBLOCK_SUFFIX = 0xffff;

/** Cell-DAT suffix for a `LandblockInfo` (objects/buildings) file. */
export const LANDBLOCK_INFO_SUFFIX = 0xfffe;

/** First outdoor terrain-cell number in a landblock's low 16 bits. */
export const LANDCELL_OUTDOOR_FIRST = 0x0001;

/** Last outdoor terrain-cell number in a landblock's low 16 bits. */
export const LANDCELL_OUTDOOR_LAST = 0x0040;

/** First interior EnvCell number in a landblock's low 16 bits. */
export const LANDCELL_INTERIOR_FIRST = 0x0100;

/** Last valid interior EnvCell number (`BlockCellID` 0xffff is reserved). */
export const LANDCELL_INTERIOR_LAST = 0xfffd;

/**
 * Encode a landblock id from its grid coordinates. The low byte is Y and the
 * high byte is X; both are masked to 8 bits and the result is an unsigned u32.
 */
export function blockId(blockX: number, blockY: number): number {
  return (((blockX & 0xff) << 8) | (blockY & 0xff)) >>> 0;
}

/** Decode a landblock id into `[blockX, blockY]`. */
export function blockXY(blockId: number): [number, number] {
  return [(blockId >>> 8) & 0xff, blockId & 0xff];
}

/** Landblock X coordinate (the high byte of a landblock id). */
export function blockXOf(blockId: number): number {
  return (blockId >>> 8) & 0xff;
}

/** Landblock Y coordinate (the low byte of a landblock id). */
export function blockYOf(blockId: number): number {
  return blockId & 0xff;
}

/**
 * Build a cell-DAT file id from a landblock id and a low-16-bit suffix
 * (`LANDBLOCK_SUFFIX`, `LANDBLOCK_INFO_SUFFIX`, or a landcell number).
 */
export function landblockFileId(blockId: number, suffix: number): number {
  return ((((blockId >>> 0) & 0xffff) << 16) | (suffix & 0xffff)) >>> 0;
}

/** Extract the landblock id from a cell-DAT file/cell id. */
export function blockIdOfFileId(fileId: number): number {
  return (fileId >>> 16) & 0xffff;
}

/**
 * Terrain-cell index within a landblock, X-major, for a local (east, north)
 * position. Returns 0..63. Both coordinates must be finite and within
 * [0, LANDBLOCK_SIZE); normalization or clamping is application policy.
 */
export function landcellIndex(localX: number, localY: number): number {
  if (!Number.isFinite(localX) || !Number.isFinite(localY) ||
      localX < 0 || localY < 0 ||
      localX >= LANDBLOCK_SIZE || localY >= LANDBLOCK_SIZE) {
    throw new RangeError(`local coordinates must be finite and within [0, ${LANDBLOCK_SIZE})`);
  }
  const ix = Math.floor(localX / LANDBLOCK_TILE);
  const iy = Math.floor(localY / LANDBLOCK_TILE);
  return ix * LANDBLOCK_TILES + iy;
}

/**
 * Native outdoor landcell id for a landblock-local (east, north) position.
 * The cell number is X-major plus one, so the first cell is 0x0001 and the
 * last is 0x0040.
 */
export function outdoorLandcellId(
  blockId: number,
  localX: number,
  localY: number,
): number {
  return landblockFileId(
    blockId,
    LANDCELL_OUTDOOR_FIRST + landcellIndex(localX, localY),
  );
}

/**
 * Native outdoor landcell id for an AC world (east, north) position in
 * `blockId`. `blockId` must be the block that contains the position; local
 * coordinates outside that block throw RangeError.
 */
export function outdoorLandcellIdAtWorld(
  blockId: number,
  worldX: number,
  worldY: number,
): number {
  return outdoorLandcellId(
    blockId,
    worldX - blockXOf(blockId) * LANDBLOCK_SIZE,
    worldY - blockYOf(blockId) * LANDBLOCK_SIZE,
  );
}

/**
 * Interior EnvCell id from a landblock id and a native cell number in
 * `LANDCELL_INTERIOR_FIRST..LANDCELL_INTERIOR_LAST`. Unlike outdoor cells,
 * interior numbers are already full EnvCell ids and are not re-based.
 */
export function interiorLandcellId(
  blockId: number,
  cellNumber: number,
): number {
  if (
    !Number.isInteger(cellNumber) ||
    cellNumber < LANDCELL_INTERIOR_FIRST ||
    cellNumber > LANDCELL_INTERIOR_LAST
  ) {
    throw new RangeError(
      `interior cell number must be an integer in ` +
        `0x${LANDCELL_INTERIOR_FIRST.toString(16)}..0x${LANDCELL_INTERIOR_LAST.toString(16)}`,
    );
  }
  return landblockFileId(blockId, cellNumber);
}

/** Landblock id portion of a landcell/EnvCell id. */
export function landcellBlockId(cellId: number): number {
  return blockIdOfFileId(cellId);
}

/** Low 16-bit cell number of a landcell/EnvCell id. */
export function landcellCellNumber(cellId: number): number {
  return cellId & 0xffff;
}

/** Whether the low 16 bits address an outdoor terrain cell (1..64). */
export function isOutdoorLandcellId(cellId: number): boolean {
  const cell = landcellCellNumber(cellId);
  return cell >= LANDCELL_OUTDOOR_FIRST && cell <= LANDCELL_OUTDOOR_LAST;
}

/** Whether the low 16 bits address an interior EnvCell (0x100..0xfffd). */
export function isInteriorLandcellId(cellId: number): boolean {
  const cell = landcellCellNumber(cellId);
  return cell >= LANDCELL_INTERIOR_FIRST && cell <= LANDCELL_INTERIOR_LAST;
}

