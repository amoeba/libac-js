/** Portal DAT clothing structures, not the network ObjDesc wire format.
 * Layout references: ACE.DatLoader/FileTypes/ClothingTable.cs:28-35,
 * UnpackableExtensions.cs:122-137 (u16 count + ignored u16 bucket count),
 * Entity/{CloObjectEffect,CloTextureEffect,CloSubPalette,CloSubPaletteRange}.cs.
 * Maps preserve file order: ACE falls back to the first palette-template entry.
 */
export interface ClothingObjectEffect {
  partIndex: number;
  gfxObjId: number;
  textures: Array<{ oldTextureId: number; newTextureId: number }>;
}
export interface ClothingBaseEffect {
  objects: ClothingObjectEffect[];
}
/** Range in raw palette-entry units (not ObjDesc's blocks of eight). */
export interface ClothingSubPaletteRange { offset: number; length: number }
export interface ClothingSubPalette {
  paletteSetId: number;
  ranges: ClothingSubPaletteRange[];
}
export interface ClothingSubPaletteEffect {
  iconId: number;
  subPalettes: ClothingSubPalette[];
}
import { BoundedReader } from "../BoundedReader.js";

export interface ClothingTable {
  id: number;
  clothingBaseEffects: Map<number, ClothingBaseEffect>;
  clothingSubPalEffects: Map<number, ClothingSubPaletteEffect>;
}
export interface PaletteSet {
  id: number;
  palettes: number[];
}

// Every allocation is constrained by remaining bytes AND an explicit work cap.
// No BinaryReader buffer-offset ambiguity, including HTTP/cache subarray views.
class Reader extends BoundedReader {
  constructor(data: Uint8Array, label: string) { super(data, label); }
  count(minBytes: number, packed = false): number {
    return this.readCount(minBytes, packed ? "packed-u16" : "u32");
  }
}
function checkId(id: number, type: number, label: string): void {
  if (id >>> 24 !== type) throw new Error(`${label}: invalid file id 0x${id.toString(16)}`);
}
function addUnique<T>(map: Map<number, T>, key: number, value: T): void {
  if (map.has(key)) throw new Error(`ClothingTable: duplicate key 0x${key.toString(16)}`);
  map.set(key, value);
}

export function parseClothingTable(data: Uint8Array): ClothingTable {
  const reader = new Reader(data, "ClothingTable");
  const id = reader.u32();
  checkId(id, 0x10, "ClothingTable");
  const clothingBaseEffects = new Map<number, ClothingBaseEffect>();
  const baseCount = reader.count(8, true);
  for (let i = 0; i < baseCount; i++) {
    const setupId = reader.u32();
    const objects: ClothingObjectEffect[] = [];
    const objectCount = reader.count(12);
    for (let j = 0; j < objectCount; j++) {
      const partIndex = reader.u32();
      const gfxObjId = reader.u32();
      const textures: ClothingObjectEffect["textures"] = [];
      const textureCount = reader.count(8);
      for (let k = 0; k < textureCount; k++)
        textures.push({ oldTextureId: reader.u32(), newTextureId: reader.u32() });
      objects.push({ partIndex, gfxObjId, textures });
    }
    addUnique(clothingBaseEffects, setupId, { objects });
  }
  const clothingSubPalEffects = new Map<number, ClothingSubPaletteEffect>();
  const paletteCount = reader.count(12, true);
  for (let i = 0; i < paletteCount; i++) {
    const template = reader.u32();
    const iconId = reader.u32();
    const subPalettes: ClothingSubPalette[] = [];
    const subCount = reader.count(8);
    for (let j = 0; j < subCount; j++) {
      const ranges: ClothingSubPalette["ranges"] = [];
      const rangeCount = reader.count(8);
      for (let k = 0; k < rangeCount; k++)
        ranges.push({ offset: reader.u32(), length: reader.u32() });
      // ACE CloSubPalette unpacks ranges BEFORE the PaletteSet DID.
      subPalettes.push({ ranges, paletteSetId: reader.u32() });
    }
    addUnique(clothingSubPalEffects, template, { iconId, subPalettes });
  }
  reader.finish();
  return { id, clothingBaseEffects, clothingSubPalEffects };
}

/** ACE.DatLoader/FileTypes/PaletteSet.cs:17-24: id, i32 count, u32 DIDs. */
export function parsePaletteSet(data: Uint8Array): PaletteSet {
  const reader = new Reader(data, "PaletteSet");
  const id = reader.u32();
  checkId(id, 0x0f, "PaletteSet");
  const count = reader.count(4); // negative i32 counts become out-of-bound u32
  const palettes: number[] = [];
  for (let i = 0; i < count; i++) palettes.push(reader.u32());
  reader.finish();
  return { id, palettes };
}

/** ACE PaletteSet.GetPaletteID: truncation, NOT rounding; shade=1 picks last.
 * Empty lists and finite out-of-range shades return 0, ACE's invalid-DID
 * sentinel that the retail client treats as a no-op. Nonfinite input also
 * returns 0 here rather than attempting an unspecified integral conversion.
 */
export function selectPalette(set: PaletteSet, shade = 0): number {
  if (!set.palettes.length || !Number.isFinite(shade) || shade < 0 || shade > 1) return 0;
  return set.palettes[Math.trunc((set.palettes.length - 0.000001) * shade)];
}
