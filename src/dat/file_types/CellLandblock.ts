import BinaryReader from "../../BinaryReader.js";

/** Landblock geometry constants (AC units). */
export const LANDBLOCK_GRID = 9; // 9x9 control points
export const LANDBLOCK_TILES = 8; // 8x8 tiles
export const LANDBLOCK_SIZE = 192; // units per side
export const LANDBLOCK_TILE = LANDBLOCK_SIZE / LANDBLOCK_TILES; // 24

/** terrain u16 bitfields (see CellLandblock / ACE CellLandblock.cs). */
export const terrainRoad = (t: number): number => t & 0x3;
export const terrainType = (t: number): number => (t & 0x7c) >> 2;
export const terrainScenery = (t: number): number => (t & 0xf800) >> 11;

/**
 * A cell DAT LandBlock (id `(blockId << 16) | 0xFFFF`, 252 bytes): a coarse
 * 9x9 control grid for the terrain of one 192x192-unit landblock.
 *
 * Layout: id u32, hasObjects u32, terrain[81] u16, height[81] u8, pad.
 * Grid is X-major (control #ix*9+iy spans west->east then south->north);
 * world Z comes from the Region's 256-entry height table (a `height * 2`
 * approximation is used when the Region is unavailable).
 */
export class CellLandblock {
  id = 0;
  hasObjects = false;
  /** 81 x u16: road(2) | type(5) | unused(4) | scenery(5). */
  terrain: number[] = [];
  /** 81 x u8 control heights; world Z from the Region height table. */
  height: number[] = [];

  static fromBuffer(data: Uint8Array | ArrayBuffer): CellLandblock {
    const reader = new BinaryReader(data);
    const lb = new CellLandblock();
    lb.id = reader.ReadUint32();
    lb.hasObjects = reader.ReadUint32() === 1;
    for (let i = 0; i < 81; i++) lb.terrain.push(reader.ReadUint16());
    for (let i = 0; i < 81; i++) lb.height.push(reader.ReadUint8());
    return lb;
  }

  /** Control index (X-major) for a local (x, y) in landblock-local units. */
  controlIndex(x: number, y: number): number {
    const ix = Math.min(x / LANDBLOCK_TILE, LANDBLOCK_TILES - 1) | 0;
    const iy = Math.min(y / LANDBLOCK_TILE, LANDBLOCK_TILES - 1) | 0;
    return ix * LANDBLOCK_GRID + iy;
  }

  /**
   * Bilinear-interpolated terrain height (world Z units) at a local (x, y).
   * `table` is the Region's 256-entry height table; when omitted the historical
   * `height * 2` approximation is used (exact for bytes 0-200, which is what
   * the offline world-map and the texture-less fallback assume).
   */
  heightAt(x: number, y: number, table?: readonly number[]): number {
    const fx = Math.min(x / LANDBLOCK_TILE, LANDBLOCK_TILES - 0.0001);
    const fy = Math.min(y / LANDBLOCK_TILE, LANDBLOCK_TILES - 0.0001);
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const h = (a: number, b: number) => {
      const raw = this.height[a * LANDBLOCK_GRID + b];
      return table ? table[raw] : raw * 2;
    };
    const h00 = h(ix, iy);
    const h10 = h(ix + 1, iy);
    const h01 = h(ix, iy + 1);
    const h11 = h(ix + 1, iy + 1);
    return (
      h00 * (1 - tx) * (1 - ty) +
      h10 * tx * (1 - ty) +
      h01 * (1 - tx) * ty +
      h11 * tx * ty
    );
  }
}