import assert from "node:assert";
import { readFileSync } from "node:fs";
import { CHAR_GEN_FILE_ID, parseCharGen } from "../index.js";
import { parseClothingTable, parsePaletteSet } from "../index.js";
import { resolveAppearance } from "./resolveAppearance.js";
import { resolveCharGenAppearance, UnsupportedCharGenAppearanceError,
  type ResolveCharGenAppearanceInput } from "./resolveCharGenAppearance.js";

const root = new URL("./fixtures/npc-chargen/", import.meta.url);
const file = (id: number): Buffer => readFileSync(new URL(`0x${id.toString(16).padStart(8, "0")}.bin`, root));
const read = async (id: number): Promise<Uint8Array> => file(id);
const cg = parseCharGen(file(CHAR_GEN_FILE_ID));
const human = cg.heritageGroups.get(1)!.genders.get(1)!;
const high = 1 - Number.EPSILON / 2;
const neverRandom = (): never => { throw new Error("unexpected random draw"); };
const neverRead = async (): Promise<Uint8Array> => { throw new Error("unexpected DAT read"); };
const input = (extra: Partial<ResolveCharGenAppearanceInput> = {}): ResolveCharGenAppearanceInput =>
  ({ heritage: 1, gender: 1, random: () => 0, charGen: cg, ...extra });

test("lazy parsed CharGen is requested only after a usable identity is resolved", async () => {
  let loads = 0;
  const getCharGen = async () => { loads++; return cg; };
  const skipped = await resolveCharGenAppearance({
    heritageGroupName: "Fiun", sex: "Male", paletteBaseId: 0x0400007e,
    random: neverRandom, getCharGen,
  }, neverRead);
  assert.equal(skipped.generatedFace, false);
  assert.equal(loads, 0);
  const generated = await resolveCharGenAppearance({ heritage: 1, gender: 1, random: () => 0, getCharGen }, read);
  assert.equal(generated.generatedFace, true);
  assert.equal(loads, 1);
  await resolveCharGenAppearance(input({ getCharGen }), read);
  assert.equal(loads, 1, "explicit parsed table wins over lazy provider");
});

test("real human male lower-bound snapshot has bald eyes and NPC-only head/face changes", async () => {
  const out = await resolveCharGenAppearance(input(), read);
  assert.equal(out.generatedFace, true);
  assert.deepEqual(out.choices, { hairStyle: 0, hairColor: 0, hairHue: 0, eyeColor: 0, eyes: 0, mouth: 0, nose: 0, skinHue: 0 });
  assert.deepEqual(out.appearance, {
    parts: [{ partIndex: 16, gfxObjId: 0x010047f6 }],
    textures: [
      { partIndex: 16, oldTextureId: 0x0500024c, newTextureId: 0x050010ff },
      { partIndex: 16, oldTextureId: 0x050002f5, newTextureId: 0x05001156 },
      { partIndex: 16, oldTextureId: 0x0500025c, newTextureId: 0x0500118f },
    ],
    palettes: [
      { paletteId: 0x04001fb1, offset: 24, length: 8 },
      { paletteId: 0x040002b6, offset: 0, length: 24 },
      { paletteId: 0x040002bc, offset: 32, length: 8 },
    ], paletteBaseId: 0x0400007e,
  });
  assert.equal(out.appearance.textures.some(t => t.oldTextureId === human.hairStyles[0].objDesc.textures[0].oldTextureId), false,
    "NPC does not execute the Player hair-texture branch");
});

test("upper-bound retail RNG choices are inclusive, in ACE order, with exact hue precision", async () => {
  const draws = [high, 0.26, 0.123456789012345, high, high, 0.5, 0.11, 0.654321098765432];
  let at = 0;
  const out = await resolveCharGenAppearance(input({ random: () => draws[at++] }), read);
  assert.equal(at, 8);
  assert.deepEqual(out.choices, { hairStyle: 8, hairColor: 1, hairHue: draws[2], eyeColor: 7, eyes: 18,
    mouth: 21, nose: 2, skinHue: draws[7] });
  assert.deepEqual(out.appearance.parts, human.hairStyles[8].objDesc.parts);
  const skin = parsePaletteSet(file(human.skinPaletteSetId));
  assert.equal(out.appearance.palettes[1].paletteId, skin.palettes[Math.trunc((skin.palettes.length - 0.000001) * draws[7])]);
  const max = await resolveCharGenAppearance(input({ random: () => high }), read);
  assert.deepEqual(max.choices, { hairStyle: 8, hairColor: 3, hairHue: high, eyeColor: 7, eyes: 18, mouth: 41, nose: 19, skinHue: high });
  assert.deepEqual(max.appearance.palettes.map(p => p.paletteId), [0x04002018, 0x040002ba, 0x040004b1]);
  const full = await resolveCharGenAppearance(input({ random: () => high, fullHairStyleRange: true }), read);
  assert.equal(full.choices!.hairStyle, 50);
  assert.deepEqual(full.appearance.parts, human.hairStyles[50].objDesc.parts);
});

test("face palette hue remains double precision at a real PaletteSet selection boundary", async () => {
  // For the five-entry retail human skin set, float-rounding this double would
  // select index 3 (0x040002b9) instead of ACE's index 2 (0x040002b8).
  const hue = 0.600000119999024;
  let draws = 0;
  const out = await resolveCharGenAppearance(input({ random: () => ++draws === 8 ? hue : 0 }), read);
  assert.equal(out.appearance.palettes[1].paletteId, 0x040002b8);
  assert.equal(Math.trunc((5 - 0.000001) * Math.fround(hue)), 3);
});

test("every retail race/sex resolves at both RNG extremes without invented tables", async () => {
  for (const [heritage, group] of cg.heritageGroups) for (const [gender, sex] of group.genders)
    for (const n of [0, high]) {
      let draws = 0;
      const out = await resolveCharGenAppearance(input({ heritage, gender, random: () => { draws++; return n; } }), read);
      assert.equal(out.generatedFace, true, `${heritage}/${gender}`);
      assert.equal(draws, 8);
      assert.equal(out.appearance.paletteBaseId, sex.basePaletteId);
      assert.equal(out.choices!.hairStyle, n === 0 ? 0 : Math.min(sex.hairStyles.length - 1, 8));
      assert.equal(out.appearance.parts.length, [6, 12, 13].includes(heritage) ? 0 : 1,
        "multi-part random hair is NOT persisted as body-style property");
    }
});

test("authored cosmetic presence wins independently, including zero; ACE replaces only base palette", async () => {
  let draws = 0;
  const props = input({ paletteBaseId: 0x04009999, headObjectId: 0,
    eyesTextureId: 0, defaultEyesTextureId: 0x05000111,
    noseTextureId: 0x05000222, defaultNoseTextureId: 0,
    mouthTextureId: 0x05000333, defaultMouthTextureId: 0x05000444,
    hairPaletteId: 0, skinPaletteId: 0x04000555, eyesPaletteId: 0x04000666,
    random: () => { draws++; return high; } });
  const before = structuredClone({ ...props, random: undefined });
  const out = await resolveCharGenAppearance(props, read);
  assert.equal(draws, 8, "preservation must not shift subsequent seeded draws");
  assert.equal(out.appearance.paletteBaseId, human.basePaletteId);
  assert.deepEqual(out.appearance.parts, [{ partIndex: 16, gfxObjId: 0 }]);
  assert.deepEqual(out.appearance.textures, [
    { partIndex: 16, oldTextureId: 0x05000111, newTextureId: 0 },
    { partIndex: 16, oldTextureId: 0, newTextureId: 0x05000222 },
    { partIndex: 16, oldTextureId: 0x05000444, newTextureId: 0x05000333 },
  ]);
  assert.deepEqual(out.appearance.palettes, [
    { paletteId: 0, offset: 24, length: 8 }, { paletteId: 0x04000555, offset: 0, length: 24 },
    { paletteId: 0x04000666, offset: 32, length: 8 },
  ]);
  assert.deepEqual({ ...props, random: undefined }, before);
  const partial = await resolveCharGenAppearance(input({ eyesTextureId: 0x05009999 }), read);
  assert.deepEqual(partial.appearance.textures[0], { partIndex: 16, oldTextureId: 0x0500024c, newTextureId: 0x05009999 });
});

test("race-specific HairStyle emits ALL Gear/Olthoi body parts/textures, never HeadObject fallback", async () => {
  for (const [heritage, count, textures] of [[6, 17, 16], [12, 25, 31], [13, 31, 0]]) {
    const style = cg.heritageGroups.get(heritage)!.genders.get(1)!.hairStyles[1];
    const out = await resolveCharGenAppearance(input({ heritage, hairStyle: 1, generateFace: false,
      headObjectId: 0x01009999, random: neverRandom }), neverRead);
    assert.equal(out.generatedFace, false);
    assert.equal(out.appearance.parts.length, count);
    assert.equal(out.appearance.textures.length, textures);
    assert.deepEqual(out.appearance.parts, style.objDesc.parts);
    assert.deepEqual(out.appearance.textures, style.objDesc.textures);
    assert.deepEqual(out.appearance.palettes, []);
    assert.equal(out.appearance.parts.some(p => p.gfxObjId === 0x01009999), false);
  }
  const gear = await resolveCharGenAppearance(input({ heritage: 6, headObjectId: 0x01009999,
    generateFace: false, random: neverRandom }), neverRead);
  assert.deepEqual(gear.appearance.parts, [], "Gearknight suppresses even authored HeadObject without HairStyle");
  const withGeneration = await resolveCharGenAppearance(input({ heritage: 6, hairStyle: 1, random: () => high }), read);
  assert.equal(withGeneration.choices!.hairStyle, 6, "random local choice need not equal authored body style");
  assert.deepEqual(withGeneration.appearance.parts, cg.heritageGroups.get(6)!.genders.get(1)!.hairStyles[1].objDesc.parts);
});

test("real Undead style retains alternate Setup as metadata only, and uses first face-strip texture", async () => {
  const undead = cg.heritageGroups.get(11)!.genders.get(1)!;
  assert.equal(undead.eyes[0].objDesc.textures.length, 2);
  assert.notEqual(undead.hairStyles[0].alternateSetupId, 0);
  const out = await resolveCharGenAppearance(input({ heritage: 11, hairStyle: 0 }), read);
  assert.deepEqual(out.appearance.parts, undead.hairStyles[0].objDesc.parts);
  assert.equal(out.appearance.textures.length, 4, "style plus first eye/nose/mouth, not all face-strip textures");
  assert.equal("setupId" in out, false);
  assert.equal("scale" in out, false);
  assert.equal("setupOverride" in out, false);
});

test("string fallback matches ACE enum parse, numeric props win, display-name aliases are not invented", async () => {
  const out = await resolveCharGenAppearance(input({ heritage: undefined, gender: undefined,
    heritageGroupName: "gHaRu'nDiM", sex: "fEmAlE" }), read);
  assert.equal(out.heritage, 2); assert.equal(out.gender, 2); assert.equal(out.generatedFace, true);
  const numeric = await resolveCharGenAppearance(input({ heritageGroupName: "Sho", sex: "Female" }), read);
  assert.equal(numeric.heritage, 1); assert.equal(numeric.gender, 1);
  const stringNumbers = await resolveCharGenAppearance(input({ heritage: undefined, gender: undefined,
    heritageGroupName: " +1 ", sex: "2" }), read);
  assert.equal(stringNumbers.heritage, 1); assert.equal(stringNumbers.gender, 2);
  for (const heritageGroupName of ["Umbraen", "Gear", "human", "Gharu ndim"]) {
    const skipped = await resolveCharGenAppearance(input({ heritage: undefined, heritageGroupName, random: neverRandom }), neverRead);
    assert.equal(skipped.generatedFace, false); assert.equal(skipped.heritage, undefined);
  }
});

test("absent/invalid heritage or gender skips generation without inventing a head/race", async () => {
  for (const extra of [{ heritage: undefined }, { gender: undefined }, { heritage: 0 }, { heritage: 999 }, { gender: 99 }]) {
    const out = await resolveCharGenAppearance(input({ ...extra, random: neverRandom, headObjectId: 0x01001111 }), neverRead);
    assert.equal(out.generatedFace, false);
    assert.equal(out.choices, undefined);
    assert.equal(out.appearance.parts.length, extra.heritage === undefined && "heritage" in extra ? 0 : 1);
  }
  const incompleteStyle = await resolveCharGenAppearance(input({ heritage: undefined, hairStyle: 1, headObjectId: 0x01001111,
    random: neverRandom }), neverRead);
  assert.deepEqual(incompleteStyle.appearance.parts, [], "HairStyle presence never falls back to HeadObject");
  const disabled = await resolveCharGenAppearance(input({ generateFace: false, paletteBaseId: 0x04009999,
    random: neverRandom }), neverRead);
  assert.equal(disabled.appearance.paletteBaseId, 0x04009999);
});

test("pure authored cosmetics with missing identity need no DAT or RNG, even without parsed CharGen", async () => {
  const out = await resolveCharGenAppearance({ random: neverRandom, headObjectId: 0x01009999,
    paletteBaseId: 0x04000111, hairPaletteId: 0x04000222,
    eyesTextureId: 0x05000333, defaultEyesTextureId: 0x05000444 }, neverRead);
  assert.equal(out.generatedFace, false);
  assert.deepEqual(out.appearance, {
    paletteBaseId: 0x04000111, parts: [],
    palettes: [{ paletteId: 0x04000222, offset: 24, length: 8 }],
    textures: [{ partIndex: 16, oldTextureId: 0x05000444, newTextureId: 0x05000333 }],
  });
  const disabled = await resolveCharGenAppearance({ heritage: 1, gender: 1, generateFace: false,
    random: neverRandom, headObjectId: 0x01009999 }, neverRead);
  assert.deepEqual(disabled.appearance.parts, [{ partIndex: 16, gfxObjId: 0x01009999 }]);
});

test("portal reader contract supports memoized parsed CharGen and does not request language DAT", async () => {
  const reads: number[] = [];
  const reader = async (id: number) => { reads.push(id); return read(id); };
  const raw = await resolveCharGenAppearance(input({ charGen: undefined }), reader);
  assert.deepEqual(reads, [CHAR_GEN_FILE_ID, 0x0f000013, human.hairColors[0]]);
  reads.length = 0;
  const parsed = await resolveCharGenAppearance(input(), reader);
  assert.deepEqual(parsed, raw);
  assert.deepEqual(reads, [0x0f000013, human.hairColors[0]]);
});

test("real CharGen face composes BEFORE real retail clothing without clobbering clothing operations", async () => {
  const base = (await resolveCharGenAppearance(input(), read)).appearance;
  const before = structuredClone(base);
  const table = parseClothingTable(file(0x100000a4));
  const effect = table.clothingBaseEffects.get(0x02000001)!;
  const out = await resolveAppearance({ setupId: 0x02000001, baseAppearance: base,
    wearables: [{ clothingBaseId: table.id, currentWieldedLocation: 14, paletteTemplate: 1, shade: 0 }] }, read);
  assert.deepEqual(out.parts[0], base.parts[0]);
  assert.deepEqual(out.textures.slice(0, 3), base.textures);
  assert.deepEqual(out.palettes.slice(0, 3), base.palettes);
  assert.equal(out.palettes.length > base.palettes.length, true);
  assert.deepEqual(out.parts.slice(1, 1 + effect.objects.length), effect.objects.map(({ partIndex, gfxObjId }) => ({ partIndex, gfxObjId })));
  assert.deepEqual(base, before, "composition must not mutate reusable base or parsed table");
});

test("invalid authored styles are explicit unsupported errors, not fabricated single heads", async () => {
  for (const extra of [{ hairStyle: -1 }, { hairStyle: 51 }, { heritage: 999, hairStyle: 0 }, { gender: 99, hairStyle: 0 }]) {
    await assert.rejects(resolveCharGenAppearance(input({ ...extra, generateFace: false, headObjectId: 0x01009999 }), neverRead),
      UnsupportedCharGenAppearanceError);
  }
});

test("empty required lists/face textures, corrupt dependencies and invalid RNG fail explicitly", async () => {
  for (const list of ["hairStyles", "hairColors", "eyeColors", "eyes", "mouths", "noses"] as const) {
    const altered = structuredClone(cg);
    altered.heritageGroups.get(1)!.genders.get(1)![list] = [];
    await assert.rejects(resolveCharGenAppearance(input({ charGen: altered }), read), UnsupportedCharGenAppearanceError);
  }
  const missingTexture = structuredClone(cg);
  missingTexture.heritageGroups.get(1)!.genders.get(1)!.eyes[0].baldObjDesc.textures = [];
  await assert.rejects(resolveCharGenAppearance(input({ charGen: missingTexture }), read), /strip has no texture/);
  for (const n of [1, -Number.MIN_VALUE, NaN, Infinity, -Infinity])
    await assert.rejects(resolveCharGenAppearance(input({ random: () => n }), read), /random.*\[0,1\)/);
  await assert.rejects(resolveCharGenAppearance(input({ charGen: undefined }), async () => new Uint8Array(3)), /CharGen: truncated/);
  await assert.rejects(resolveCharGenAppearance(input(), async () => file(human.hairColors[0])), /PaletteSet id mismatch/);
  await assert.rejects(resolveCharGenAppearance(input(), async () => { throw new Error("offline IO failure"); }), /offline IO failure/);
  for (const extra of [{ hairStyle: 1.5 }, { heritage: NaN }, { headObjectId: -1 }, { skinPaletteId: 2 ** 32 }])
    await assert.rejects(resolveCharGenAppearance(input(extra), read), /CharGen invalid/);
});

test("singleton hairstyle skips its draw, other singleton choices still consume RNG", async () => {
  const altered = structuredClone(cg), sex = altered.heritageGroups.get(1)!.genders.get(1)!;
  sex.hairStyles = [sex.hairStyles[0]];
  sex.hairColors = [sex.hairColors[0]]; sex.eyeColors = [sex.eyeColors[0]];
  sex.eyes = [sex.eyes[0]]; sex.mouths = [sex.mouths[0]]; sex.noses = [sex.noses[0]];
  let draws = 0;
  const out = await resolveCharGenAppearance(input({ charGen: altered, random: () => { draws++; return high; } }), read);
  assert.equal(draws, 7);
  assert.deepEqual(out.choices, { hairStyle: 0, hairColor: 0, hairHue: high, eyeColor: 0, eyes: 0, mouth: 0, nose: 0, skinHue: high });
});
