import { BoundedReader } from "../BoundedReader.js";
import type { ObjDesc } from "../dat/types/ObjDesc.js";

/** Retail portal DAT 0x0e000002. Source: ACE.DatLoader FileTypes/CharGen.cs,
 * Entity/{HeritageGroupCG,SexCG,HairStyleCG,ObjDesc}.cs. Names are embedded UTF-8,
 * not language-DAT string references. Unused creation UI/skill data is still
 * walked and bounded, so a plausible prefix is not mistaken for a valid file. */
export const CHAR_GEN_FILE_ID = 0x0e000002;
export interface CharGenHairStyle {
  iconId: number;
  bald: boolean;
  alternateSetupId: number;
  objDesc: ObjDesc;
}
export interface CharGenFaceStrip { iconId: number; objDesc: ObjDesc }
export interface CharGenEyeStrip extends CharGenFaceStrip {
  baldIconId: number;
  baldObjDesc: ObjDesc;
}
export interface CharGenSex {
  name: string;
  /** Raw u32, as read by ACE SexCG (not an NPC scale override). */
  scale: number;
  setupId: number;
  soundTableId: number;
  iconId: number;
  basePaletteId: number;
  skinPaletteSetId: number;
  physicsTableId: number;
  motionTableId: number;
  combatTableId: number;
  baseObjDesc: ObjDesc;
  hairColors: number[];
  hairStyles: CharGenHairStyle[];
  eyeColors: number[];
  eyes: CharGenEyeStrip[];
  noses: CharGenFaceStrip[];
  mouths: CharGenFaceStrip[];
}
export interface CharGenHeritage {
  name: string;
  iconId: number;
  setupId: number;
  environmentSetupId: number;
  attributeCredits: number;
  skillCredits: number;
  genders: Map<number, CharGenSex>;
}
export interface CharGen {
  id: number;
  heritageGroups: Map<number, CharGenHeritage>;
}

/** CharGen uses ACE's compressed counts throughout its nested collections. */
class CharGenReader extends BoundedReader {
  constructor(bytes: Uint8Array) { super(bytes, "CharGen"); }
  count(minBytes: number): number { return this.readCount(minBytes, "compressed"); }

  map<T>(minBytes: number, read: () => T): Map<number, T> {
    const count = this.count(minBytes + 4), out = new Map<number, T>();
    for (let i = 0; i < count; i++) {
      const key = this.u32();
      if (out.has(key)) this.fail(`duplicate key ${key}`);
      out.set(key, read());
    }
    return out;
  }
  private objDesc(): ObjDesc {
    this.align();
    if (this.u8() !== 0x11) this.fail("invalid ObjDesc marker");
    const palettes = this.u8(), textures = this.u8(), parts = this.u8();
    const out: ObjDesc = { parts: [], textures: [], palettes: [] };
    if (palettes) out.paletteBaseId = this.did(0x04000000);
    this.need(palettes * 4 + textures * 5 + parts * 3);
    for (let i = 0; i < palettes; i++) {
      const paletteId = this.did(0x04000000), offset = this.u8(), length = this.u8();
      out.palettes.push({ paletteId, offset, length: length || 256 });
    }
    for (let i = 0; i < textures; i++) out.textures.push({
      partIndex: this.u8(), oldTextureId: this.did(0x05000000), newTextureId: this.did(0x05000000),
    });
    for (let i = 0; i < parts; i++) out.parts.push({ partIndex: this.u8(), gfxObjId: this.did(0x01000000) });
    this.align();
    return out;
  }
  private face(): CharGenFaceStrip { return { iconId: this.u32(), objDesc: this.objDesc() }; }
  private sex(): CharGenSex {
    const name = this.string(), scale = this.u32(), setupId = this.u32();
    const soundTableId = this.u32(), iconId = this.u32(), basePaletteId = this.u32();
    const skinPaletteSetId = this.u32(), physicsTableId = this.u32();
    const motionTableId = this.u32(), combatTableId = this.u32(), baseObjDesc = this.objDesc();
    const hairColors = this.words();
    const hairStyles = this.array(13, (): CharGenHairStyle => {
      const iconId = this.u32(), baldByte = this.u8(), alternateSetupId = this.u32();
      if (baldByte > 1) this.fail("invalid hairstyle bald flag");
      return { iconId, bald: baldByte === 1, alternateSetupId, objDesc: this.objDesc() };
    });
    const eyeColors = this.words();
    const eyes = this.array(16, (): CharGenEyeStrip => ({
      iconId: this.u32(), baldIconId: this.u32(), objDesc: this.objDesc(), baldObjDesc: this.objDesc(),
    }));
    const noses = this.array(8, () => this.face()), mouths = this.array(8, () => this.face());
    for (let i = 0; i < 4; i++) this.array(9, () => { this.string(); this.skip(8); });
    this.words();
    return { name, scale, setupId, soundTableId, iconId, basePaletteId, skinPaletteSetId,
      physicsTableId, motionTableId, combatTableId, baseObjDesc, hairColors, hairStyles, eyeColors, eyes, noses, mouths };
  }
  heritage(): CharGenHeritage {
    const name = this.string(), iconId = this.u32(), setupId = this.u32(), environmentSetupId = this.u32();
    const attributeCredits = this.u32(), skillCredits = this.u32();
    this.words(); this.words();
    this.array(12, () => this.skip(12));
    this.array(35, () => { this.string(); this.skip(32); this.words(); this.words(); });
    this.u8();
    const genders = this.map(1, () => this.sex());
    return { name, iconId, setupId, environmentSetupId, attributeCredits, skillCredits, genders };
  }
}

export function parseCharGen(data: Uint8Array): CharGen {
  const r = new CharGenReader(data), id = r.u32();
  if (id !== CHAR_GEN_FILE_ID) r.fail(`invalid file id 0x${id.toString(16)}`);
  r.u32(); // unknown header word, skipped by ACE (retail repeats file ID)
  r.array(2, () => { r.string(); r.array(32, () => r.skip(32)); }); // StarterArea / Position
  r.u8(); // unknown dictionary marker, skipped by ACE
  const heritageGroups = r.map(1, () => r.heritage());
  r.finish();
  return { id, heritageGroups };
}
