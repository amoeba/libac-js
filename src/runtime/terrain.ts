import { CellLandblock, terrainRoad, terrainType } from "../index.js";
import type { Region, TerrainTex, TexMerge, TMTerrainDesc } from "../index.js";

/**
 * Pure AC terrain-code and TexMerge texture selection from ACE/ACViewer.
 * Texture decoding, compositing, caching, and material creation remain renderer
 * responsibilities.
 */

/** AC road terrain type: the TMTerrainDesc entry holding the shared road texture. */
const ROAD_TERRAIN_TYPE = 32;
/** palCode bit 28: "use the full landscape texture" (AC always sets it). */
const PAL_CODE_SIZE_BIT = 0x10000000;
/** Landblock-local control word for grid corner (ix, iy) (x-major 9x9 grid). */
function word(lb: CellLandblock, ix: number, iy: number): number {
  return lb.terrain[ix * 9 + iy] ?? 0;
}

/**
 * Pack a cell's four corner terrain types (5 bits each) and road codes (2 bits
 * each) into AC's landscape palCode. Corner order matches
 * LandblockStruct::GetCellRotation: (x,y)=t1, (x+1,y)=t2, (x+1,y+1)=t3,
 * (x,y+1)=t4.
 */
export function computePalCode(lb: CellLandblock, cx: number, cy: number): number {
  const t1 = terrainType(word(lb, cx, cy));
  const t2 = terrainType(word(lb, cx + 1, cy));
  const t3 = terrainType(word(lb, cx + 1, cy + 1));
  const t4 = terrainType(word(lb, cx, cy + 1));
  const r1 = terrainRoad(word(lb, cx, cy));
  const r2 = terrainRoad(word(lb, cx + 1, cy));
  const r3 = terrainRoad(word(lb, cx + 1, cy + 1));
  const r4 = terrainRoad(word(lb, cx, cy + 1));
  return (
    PAL_CODE_SIZE_BIT |
    (r1 << 26) | (r2 << 24) | (r3 << 22) | (r4 << 20) |
    (t1 << 15) | (t2 << 10) | (t3 << 5) | t4
  ) >>> 0;
}

// ─── palCode -> texture selection (TexMerge::BuildTexture) ───────────────────

/** An alpha mask plus the UV rotation that aligns it with its terrain code. */
export interface AlphaChoice {
  texGID: number;
  rotation: number;
}

export interface TerrainSelection {
  base: TerrainTex;
  /** Up to three corner/side overlays, each with its own rotated alpha mask. */
  overlays: { tex: TerrainTex; alpha: AlphaChoice }[];
  /** Shared road texture with up to two alpha masks, when the cell has roads. */
  road?: { tex: TerrainTex; alphas: AlphaChoice[] };
}

/**
 * Deterministic fraction derived from palCode. TexMerge uses the 32-bit product
 * `1379576222 * palCode - 1372186442` scaled to [0,1); BigInt keeps the full
 * 64-bit product before the C#-style double conversion.
 */
function prngFraction(palCode: number): number {
  const value = 1379576222n * BigInt(palCode >>> 0) - 1372186442n;
  return Number(value) * 2.3283064e-10;
}

/** terrainDesc lookup, falling back to the first entry for unknown types. */
function terrainTexFor(texMerge: TexMerge, type: number): TerrainTex | undefined {
  const match = texMerge.terrainDesc.find((d: TMTerrainDesc) => d.terrainType === type);
  return (match ?? texMerge.terrainDesc[0])?.terrainTex;
}

/** The four per-corner terrain type indices packed into a palCode. */
function terrainCodes(palCode: number): number[] {
  return [
    (palCode >>> 15) & 0x1f,
    (palCode >>> 10) & 0x1f,
    (palCode >>> 5) & 0x1f,
    palCode & 0x1f,
  ];
}

/** Select the corner/side alpha mask whose tCode cycle matches `tCode`. */
function findTerrainAlpha(texMerge: TexMerge, palCode: number, tCode: number): AlphaChoice | undefined {
  const corner = tCode === 1 || tCode === 2 || tCode === 4 || tCode === 8;
  const maps = corner ? texMerge.cornerTerrainMaps : texMerge.sideTerrainMaps;
  const count = maps.length;
  if (count === 0) return undefined;
  let index = Math.floor(prngFraction(palCode) * count);
  if (!Number.isFinite(index) || index < 0 || index >= count) index = 0;
  const alpha = maps[index];
  let code = alpha.tCode;
  let rotation = 0;
  while (code !== tCode) {
    code *= 2;
    if (code >= 16) code -= 15;
    if (++rotation >= 4) return undefined;
  }
  return { texGID: alpha.texGID, rotation };
}

/** Select the road alpha mask whose rCode cycle matches `rCode`. */
function findRoadAlpha(texMerge: TexMerge, palCode: number, rCode: number): AlphaChoice | undefined {
  const maps = texMerge.roadMaps;
  const count = maps.length;
  if (count === 0) return undefined;
  const base = Math.floor(prngFraction(palCode) * count);
  for (let i = 0; i < count; i++) {
    const index = (((i + base) % count) + count) % count;
    const alpha = maps[index];
    let code = alpha.rCode;
    for (let rotation = 0; rotation < 4; rotation++) {
      if (code === rCode) return { texGID: alpha.roadTexGID, rotation };
      code *= 2;
      if (code >= 16) code -= 15;
    }
  }
  return undefined;
}

/** Road code pair + a flag for "the whole cell is road". Port of GetRoadCode. */
function roadCode(palCode: number): { codes: number[]; allRoad: boolean } {
  let mask = 0;
  if (palCode & 0x0c000000) mask = 1;
  if (palCode & 0x03000000) mask |= 2;
  if (palCode & 0x00c00000) mask |= 4;
  if (palCode & 0x00300000) mask |= 8;
  const codes = [0, 0];
  let allRoad = false;
  switch (mask) {
    case 0xf: allRoad = true; break;
    case 0xe: codes[0] = 6; codes[1] = 12; break;
    case 0xd: codes[0] = 9; codes[1] = 12; break;
    case 0xb: codes[0] = 9; codes[1] = 3; break;
    case 0x7: codes[0] = 3; codes[1] = 6; break;
    case 0x0: break;
    default: codes[0] = mask; break;
  }
  return { codes, allRoad };
}

/** When two corners share a type, that type becomes the base (BuildTCodes). */
function buildTCodes(
  texMerge: TexMerge,
  pcodes: number[],
  tcode: number[],
  first: number,
): { texes: TerrainTex[]; tcode: number[] } {
  const texes: TerrainTex[] = [];
  const t1 = pcodes[first];
  let t2 = 0;
  texes[0] = terrainTexFor(texMerge, t1)!;
  for (let k = 0; k < 4; k++) {
    if (t1 === pcodes[k]) continue;
    if (tcode[0] === 0) {
      tcode[0] = 1 << k;
      t2 = pcodes[k];
      texes[1] = terrainTexFor(texMerge, t2)!;
    } else {
      if (t2 === pcodes[k] && tcode[0] === (1 << (k - 1))) {
        tcode[0] += 1 << k;
      } else {
        texes[2] = terrainTexFor(texMerge, pcodes[k])!;
        tcode[1] = 1 << k;
      }
      break;
    }
  }
  return { texes, tcode };
}

/** Base + overlay textures for a palCode (TexMerge::GetTerrain). */
function getTerrain(texMerge: TexMerge, palCode: number): { texes: TerrainTex[]; tcode: number[] } {
  const tcode = [0, 0, 0];
  const pcodes = terrainCodes(palCode);
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (pcodes[i] === pcodes[j]) return buildTCodes(texMerge, pcodes, tcode, i);
    }
  }
  const texes = pcodes.map((type) => terrainTexFor(texMerge, type)!);
  for (let i = 0; i < 3; i++) tcode[i] = 1 << (i + 1);
  return { texes, tcode };
}

/** Full per-cell texture selection (TexMerge::BuildTexture). */
export function selectTerrainTextures(texMerge: TexMerge, palCode: number): TerrainSelection | undefined {
  if (texMerge.terrainDesc.length === 0) return undefined;
  const { texes, tcode } = getTerrain(texMerge, palCode);
  const { codes: rcode, allRoad } = roadCode(palCode);

  if (allRoad) {
    const roadTex = terrainTexFor(texMerge, ROAD_TERRAIN_TYPE);
    return roadTex ? { base: roadTex, overlays: [] } : undefined;
  }

  const overlays: { tex: TerrainTex; alpha: AlphaChoice }[] = [];
  for (let i = 0; i < 3; i++) {
    if (tcode[i] === 0) break;
    const alpha = findTerrainAlpha(texMerge, palCode, tcode[i]);
    if (!alpha) break; // degrade to whatever layers resolved so far
    overlays.push({ tex: texes[i + 1], alpha });
  }

  let road: TerrainSelection["road"];
  const roadTex = terrainTexFor(texMerge, ROAD_TERRAIN_TYPE);
  if (roadTex && rcode[0] !== 0) {
    const alphas: AlphaChoice[] = [];
    for (let i = 0; i < 2; i++) {
      if (rcode[i] === 0) break;
      const alpha = findRoadAlpha(texMerge, palCode, rcode[i]);
      if (alpha) alphas.push(alpha);
    }
    if (alphas.length > 0) road = { tex: roadTex, alphas };
  }

  return { base: texes[0], overlays, road };
}

/** Collect raw texture ids used by complete landblocks without decoding pixels. */
export function terrainTextureIds(region: Region, landblocks: readonly CellLandblock[]): number[] {
  const ids = new Set<number>();
  for (const lb of landblocks) for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    const selection = selectTerrainTextures(region.landSurf.texMerge, computePalCode(lb, x, y));
    if (!selection) continue;
    ids.add(selection.base.texGID);
    for (const overlay of selection.overlays) {
      ids.add(overlay.tex.texGID);
      ids.add(overlay.alpha.texGID);
    }
    if (selection.road) {
      ids.add(selection.road.tex.texGID);
      for (const alpha of selection.road.alphas) ids.add(alpha.texGID);
    }
  }
  return [...ids].filter((id) => id !== 0).sort((a, b) => a - b);
}
