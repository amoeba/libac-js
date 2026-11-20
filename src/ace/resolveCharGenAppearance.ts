import { CHAR_GEN_FILE_ID, parseCharGen, parsePaletteSet, selectPalette } from "../index.js";
import type { CharGen, CharGenSex, ObjDesc } from "../index.js";

export type ReadCharGenPortalFile = (id: number) => Promise<Uint8Array>;
export interface ResolveCharGenAppearanceInput {
  /** PropertyInt.HeritageGroup (188) and Gender (113), not CreatureType. */
  heritage?: number;
  gender?: number;
  /** PropertyString.HeritageGroup (4), Sex (3); numeric properties win. */
  heritageGroupName?: string;
  sex?: string;
  /** PropertyInt.Hairstyle (9012), an authored body style. NOT random hair. */
  hairStyle?: number;
  /** PropertyDataId IDs 6,9..18, respectively. Presence includes authored zero. */
  paletteBaseId?: number;
  eyesTextureId?: number;
  noseTextureId?: number;
  mouthTextureId?: number;
  defaultEyesTextureId?: number;
  defaultNoseTextureId?: number;
  defaultMouthTextureId?: number;
  hairPaletteId?: number;
  eyesPaletteId?: number;
  skinPaletteId?: number;
  headObjectId?: number;
  /** Required deterministic source: finite 0 <= value < 1. */
  random: () => number;
  /** ACE npc_hairstyle_fullrange, default false (inclusive indices 0..8). */
  fullHairStyleRange?: boolean;
  /** Initial non-player GenerateNewFace by default; false = authored base only. */
  generateFace?: boolean;
  /** Caller may cache the parsed retail portal file across all placements. */
  charGen?: CharGen;
  /** Lazy shared cache: invalid/missing identities must not force a DAT read. */
  getCharGen?: () => Promise<CharGen>;
}
export interface CharGenChoices {
  hairStyle: number;
  hairColor: number;
  hairHue: number;
  eyeColor: number;
  eyes: number;
  mouth: number;
  nose: number;
  skinHue: number;
}
export interface CharGenAppearanceResult {
  /** Pass to resolveAppearance as baseAppearance, BEFORE clothing. */
  appearance: ObjDesc;
  heritage?: number;
  gender?: number;
  generatedFace: boolean;
  choices?: CharGenChoices;
  // Deliberately no Setup/scale overrides: NPC GenerateNewFace does not set them.
}
export class UnsupportedCharGenAppearanceError extends Error {
  constructor(message: string) { super(message); this.name = "UnsupportedCharGenAppearanceError"; }
}

// ACE.Entity.Enum.HeritageGroup / Gender, NOT localized CharGen display names.
// In particular "Umbraen" and "Gear" are not enum aliases in GenerateNewFace.
const HERITAGES = ["Invalid", "Aluvian", "Gharundim", "Sho", "Viamontian", "Shadowbound",
  "Gearknight", "Tumerok", "Lugian", "Empyrean", "Penumbraen", "Undead", "Olthoi", "OlthoiAcid"];
const GENDERS = ["Invalid", "Male", "Female"];
function enumValue(text: string | undefined, names: string[]): number | undefined {
  if (text === undefined || !text.trim()) return undefined;
  const value = text.trim().toLowerCase();
  const index = names.findIndex((name) => name.toLowerCase() === value);
  if (index !== -1) return index;
  // Enum.TryParse also accepts signed numeric strings, even undefined enum values.
  if (/^[+-]?\d+$/.test(value)) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= -0x80000000 && n <= 0x7fffffff) return n;
  }
  return undefined;
}
function unsupported(message: string): never { throw new UnsupportedCharGenAppearanceError(message); }
function nonempty(values: readonly unknown[], label: string): void {
  if (!values.length) unsupported(`CharGen ${label} list is empty; ACE cannot generate this face`);
}

/** Source-backed initial NPC cosmetics: ACE Creature.cs:148-277 then
 * WorldObject_Networking.cs:978-1037 (ACE 3af8377). This is NOT player creation.
 * PaletteBase is the sole unconditional GenerateNewFace overwrite; all other
 * cosmetics are filled only if missing. Generated hairstyle stays local: it is
 * NOT PropertyInt.Hairstyle. Gear/Olthoi body-style parts must not be converted
 * into a fictitious single HeadObject. AlternateSetup, Sex.Scale and BaseObjDesc
 * are deliberately not applied, matching the NPC path (not PlayerFactory).
 */
export async function resolveCharGenAppearance(
  input: ResolveCharGenAppearanceInput,
  readPortalFile: ReadCharGenPortalFile,
): Promise<CharGenAppearanceResult> {
  for (const key of ["heritage", "gender", "hairStyle"] as const) {
    const n = input[key];
    if (n !== undefined && (!Number.isInteger(n) || n < -0x80000000 || n > 0x7fffffff))
      throw new Error(`CharGen invalid ${key}`);
  }
  const didFields = ["paletteBaseId", "eyesTextureId", "noseTextureId", "mouthTextureId",
    "defaultEyesTextureId", "defaultNoseTextureId", "defaultMouthTextureId", "hairPaletteId",
    "eyesPaletteId", "skinPaletteId", "headObjectId"] as const;
  for (const key of didFields) {
    const n = input[key];
    if (n !== undefined && (!Number.isInteger(n) || n < 0 || n > 0xffffffff))
      throw new Error(`CharGen invalid ${key}`);
  }
  const heritage = input.heritage ?? enumValue(input.heritageGroupName?.replaceAll("'", ""), HERITAGES);
  const gender = input.gender ?? enumValue(input.sex, GENDERS);
  let sex: CharGenSex | undefined;
  // Missing heritage/gender means ACE skips generation and cannot use body style.
  if (heritage !== undefined && gender !== undefined &&
      (input.generateFace !== false || input.hairStyle !== undefined)) {
    const cg = input.charGen ?? await input.getCharGen?.() ?? parseCharGen(await readPortalFile(CHAR_GEN_FILE_ID));
    if (cg.id !== CHAR_GEN_FILE_ID) throw new Error("CharGen: mismatched parsed file id");
    sex = cg.heritageGroups.get(heritage)?.genders.get(gender);
    if (!sex && input.hairStyle !== undefined)
      unsupported(`CharGen body style has no heritage/gender entry (${heritage}/${gender})`);
  }
  const appearance: ObjDesc = { parts: [], textures: [], palettes: [] };
  const result: CharGenAppearanceResult = { appearance, heritage, gender, generatedFace: false };
  const props = Object.fromEntries(didFields.map((key) => [key, input[key]])) as
    { [K in typeof didFields[number]]: number | undefined };
  if (sex && input.generateFace !== false) {
    nonempty(sex.hairStyles, "hairstyle");
    nonempty(sex.hairColors, "hair color");
    nonempty(sex.eyeColors, "eye color");
    nonempty(sex.eyes, "eye strip");
    nonempty(sex.mouths, "mouth strip");
    nonempty(sex.noses, "nose strip");
    const draw = (): number => {
      const n = input.random();
      if (!Number.isFinite(n) || n < 0 || n >= 1) throw new Error("CharGen random must return a finite value in [0,1)");
      return n;
    };
    // ThreadSafeRandom.Next(int,int) is INCLUSIVE. Even singleton color/strip
    // choices consume a draw; hairstyle is the only explicit singleton exception.
    const index = (max: number): number => Math.floor(draw() * (max + 1));
    const hairStyle = sex.hairStyles.length > 1
      ? index(input.fullHairStyleRange ? sex.hairStyles.length - 1 : Math.min(sex.hairStyles.length - 1, 8)) : 0;
    const choices: CharGenChoices = {
      hairStyle, hairColor: index(sex.hairColors.length - 1), hairHue: draw(),
      eyeColor: index(sex.eyeColors.length - 1), eyes: index(sex.eyes.length - 1),
      mouth: index(sex.mouths.length - 1), nose: index(sex.noses.length - 1), skinHue: draw(),
    };
    const hairstyle = sex.hairStyles[hairStyle];
    const eyes = hairstyle.bald ? sex.eyes[choices.eyes].baldObjDesc : sex.eyes[choices.eyes].objDesc;
    const pair = (desc: ObjDesc, oldKey: "defaultEyesTextureId" | "defaultNoseTextureId" | "defaultMouthTextureId",
      newKey: "eyesTextureId" | "noseTextureId" | "mouthTextureId"): void => {
      if (props[oldKey] !== undefined && props[newKey] !== undefined) return;
      const texture = desc.textures[0]; // SexCG.Get*Texture uses only first change.
      if (!texture) unsupported(`CharGen selected ${newKey} strip has no texture change`);
      props[oldKey] ??= texture.oldTextureId;
      props[newKey] ??= texture.newTextureId;
    };
    pair(eyes, "defaultEyesTextureId", "eyesTextureId");
    pair(sex.noses[choices.nose].objDesc, "defaultNoseTextureId", "noseTextureId");
    pair(sex.mouths[choices.mouth].objDesc, "defaultMouthTextureId", "mouthTextureId");
    // SexCG.GetHeadObject returns null for zero/multiple part changes, not part16.
    if (hairstyle.objDesc.parts.length === 1) props.headObjectId ??= hairstyle.objDesc.parts[0].gfxObjId;
    // Both property accessors alias DID 6: WorldObject_Properties.cs:1919,2139.
    props.paletteBaseId = sex.basePaletteId;
    const palette = async (id: number, hue: number): Promise<number> => {
      const set = parsePaletteSet(await readPortalFile(id));
      if (set.id !== id) throw new Error(`CharGen PaletteSet id mismatch for 0x${id.toString(16)}`);
      const selected = selectPalette(set, hue); // double precision, NOT float-rounded clothing Shade
      if (!selected) unsupported(`CharGen PaletteSet 0x${id.toString(16)} has no palette`);
      return selected;
    };
    // ACE reads both sets even when authored palettes win. Selection here is also
    // validated, so malformed/empty dependencies are not silently called parity.
    const skinPalette = await palette(sex.skinPaletteSetId, choices.skinHue);
    const hairPalette = await palette(sex.hairColors[choices.hairColor], choices.hairHue);
    props.skinPaletteId ??= skinPalette;
    props.hairPaletteId ??= hairPalette;
    props.eyesPaletteId ??= sex.eyeColors[choices.eyeColor];
    result.generatedFace = true;
    result.choices = choices;
  }

  // AddBaseModelData: the HeadObject path does not require Gender, but DOES
  // require Heritage and excludes Gearknight. HairStyle presence suppresses it,
  // even with missing gender/heritage. No guessed fallback to a CharGen head.
  if (props.headObjectId !== undefined && input.hairStyle === undefined && heritage !== undefined && heritage !== 6) {
    appearance.parts.push({ partIndex: 16, gfxObjId: props.headObjectId });
  } else if (input.hairStyle !== undefined && heritage !== undefined && gender !== undefined) {
    const style = sex?.hairStyles[input.hairStyle];
    if (!style) unsupported(`CharGen HairStyle ${input.hairStyle} outside heritage/gender ${heritage}/${gender}`);
    appearance.textures.push(...style.objDesc.textures.map((t) => ({ ...t })));
    appearance.parts.push(...style.objDesc.parts.map((p) => ({ ...p })));
    // ACE intentionally does NOT copy the style's palette operations/base palette.
  }
  // These constants are ALREADY blocks of eight. SerializeModelData writes them
  // verbatim (:237-239); ACViewer Model/ObjDesc.AddPaletteChange multiplies by 8.
  if (props.hairPaletteId !== undefined) appearance.palettes.push({ paletteId: props.hairPaletteId, offset: 24, length: 8 });
  if (props.paletteBaseId !== undefined) appearance.paletteBaseId = props.paletteBaseId;
  if (props.skinPaletteId !== undefined) appearance.palettes.push({ paletteId: props.skinPaletteId, offset: 0, length: 24 });
  const texture = (oldTextureId: number | undefined, newTextureId: number | undefined): void => {
    if (oldTextureId !== undefined && newTextureId !== undefined) appearance.textures.push({ partIndex: 16, oldTextureId, newTextureId });
  };
  texture(props.defaultEyesTextureId, props.eyesTextureId);
  if (props.eyesPaletteId !== undefined) appearance.palettes.push({ paletteId: props.eyesPaletteId, offset: 32, length: 8 });
  texture(props.defaultNoseTextureId, props.noseTextureId);
  texture(props.defaultMouthTextureId, props.mouthTextureId);
  return result;
}
