import assert from "node:assert";
import type { ObjDesc } from "../index.js";
import { resolveAppearance, UnsupportedAppearanceError, type ResolveAppearanceInput,
  type WearableAppearanceInput } from "./resolveAppearance.js";

const SETUP = 0x02000001;
const OTHER_SETUP = 0x02000002;
const OWN = 0x10000059;
const SHIRT = 0x10000100;
const PANTS = 0x1000001b;
const SHOES = 0x1000001f;
const PALSET = 0x0f000001;
const empty = (): ObjDesc => ({ parts: [], textures: [], palettes: [] });
function words(...values: number[]): Uint8Array {
  const result = new Uint8Array(values.length * 4);
  const view = new DataView(result.buffer);
  values.forEach((v, i) => view.setUint32(i * 4, v, true));
  return result;
}
function setup(id = SETUP, parts = Array.from({ length: 17 }, (_, i) => 0x01000100 + i)): Uint8Array {
  return words(id, 0, parts.length, ...parts);
}
interface Effect { setupId?: number; partIndex: number; gfxObjId: number; textures?: number[] }
function table(id: number, effects: Effect[], templates = [9, 4]): Uint8Array {
  const bySetup = new Map<number, Effect[]>();
  for (const effect of effects) {
    const key = effect.setupId ?? SETUP;
    bySetup.set(key, [...(bySetup.get(key) ?? []), effect]);
  }
  const w = [id, (16 << 16) | bySetup.size];
  for (const [key, objects] of bySetup) {
    w.push(key, objects.length);
    for (const obj of objects) {
      const textures = obj.textures ?? [0x05000001, 0x05000002];
      w.push(obj.partIndex, obj.gfxObjId, textures.length / 2, ...textures);
    }
  }
  w.push((16 << 16) | templates.length);
  // Each template has a distinct second palette range for easy order checks.
  for (const template of templates) w.push(template, 0x06000001, 1, 2,
    192, 64, template * 8, 8, PALSET);
  return words(...w);
}
function fixture() {
  const files = new Map<number, Uint8Array>([
    [SETUP, setup()], [OTHER_SETUP, setup(OTHER_SETUP)],
    [OWN, table(OWN, [{ partIndex: 9, gfxObjId: 0x01000999 }])],
    [SHIRT, table(SHIRT, [{ partIndex: 9, gfxObjId: 0x01000200 }])],
    [PANTS, table(PANTS, [{ partIndex: 1, gfxObjId: 0x01000300 }])],
    [SHOES, table(SHOES, [{ partIndex: 3, gfxObjId: 0x01000400 }])],
    [PALSET, words(PALSET, 3, 0x04000001, 0x04000002, 0x04000003)],
  ]);
  const reads: number[] = [];
  return { files, reads, readFile: async (id: number) => {
    reads.push(id);
    const bytes = files.get(id);
    if (!bytes) throw new Error(`missing ${id.toString(16)}`);
    return bytes;
  } };
}
const shirt = (more: Partial<WearableAppearanceInput> = {}): WearableAppearanceInput => ({
  clothingBaseId: SHIRT, currentWieldedLocation: 14, clothingPriority: 40, ...more,
});

test("generic held WorldObject uses base/own ClothingBase, never creature explicit rows or naked fill", async () => {
  const f = fixture();
  const base: ObjDesc = { ...empty(), paletteBaseId: 0x0400007e };
  const explicit: ObjDesc = { ...empty(), parts: [{ partIndex: 0, gfxObjId: 0x01000bad }] };
  const plain = await resolveAppearance({ setupId: SETUP, mode: "object", baseAppearance: base, explicitAppearance: explicit },
    async () => { assert.fail("generic prop without ClothingBase requires no DAT reads"); });
  assert.deepEqual(plain, base);
  const clothing = await resolveAppearance({ setupId: SETUP, mode: "object", baseAppearance: base,
    explicitAppearance: explicit, clothingBaseId: OWN, shade: 0 }, f.readFile);
  assert.deepEqual(clothing.parts, [{ partIndex: 9, gfxObjId: 0x01000999 }]);
  assert.equal(clothing.palettes.length, 2);
  assert.equal(clothing.paletteBaseId, base.paletteBaseId);
  assert.ok(!f.reads.includes(SETUP), "no creature uncovered-part fill for a generic prop");
});

test("non-covering armor shield suppresses creature explicit fallback just like ACE eo", async () => {
  const f = fixture();
  const out = await resolveAppearance({ setupId: SETUP,
    explicitAppearance: { ...empty(), parts: [{ partIndex: 9, gfxObjId: 0x01000bad }] },
    wearables: [{ itemType: 2, currentWieldedLocation: 0x200000 }],
  }, f.readFile);
  assert.equal(out.parts.length, 16);
  assert.ok(!out.parts.some(p => p.gfxObjId === 0x01000bad));
});

test("fixed shirt/pants/shoes resolve part swaps, old/new textures, ordered multi-palettes and naked fill", async () => {
  const f = fixture();
  const input: ResolveAppearanceInput = { setupId: SETUP, clothingBaseId: OWN,
    wearables: [shirt({ paletteTemplate: 4, shade: 0.8 }),
      { clothingBaseId: PANTS, currentWieldedLocation: 68, clothingPriority: 19, paletteTemplate: 9, shade: 0 },
      { clothingBaseId: SHOES, currentWieldedLocation: 256, clothingPriority: 65536, paletteTemplate: 9, shade: 1 }],
  };
  const before = structuredClone(input);
  const out = await resolveAppearance(input, f.readFile);
  assert.deepEqual(out.parts.slice(0, 3), [
    { partIndex: 1, gfxObjId: 0x01000300 }, { partIndex: 9, gfxObjId: 0x01000200 },
    { partIndex: 3, gfxObjId: 0x01000400 },
  ]);
  assert.equal(out.parts.length, 16);
  assert.equal(out.parts.some((p) => p.partIndex === 16), false);
  assert.deepEqual(out.textures[1], { partIndex: 9, oldTextureId: 0x05000001, newTextureId: 0x05000002 });
  assert.deepEqual(out.palettes, [
    { paletteId: 0x04000001, offset: 24, length: 8 }, { paletteId: 0x04000001, offset: 9, length: 1 },
    { paletteId: 0x04000003, offset: 24, length: 8 }, { paletteId: 0x04000003, offset: 4, length: 1 },
    { paletteId: 0x04000003, offset: 24, length: 8 }, { paletteId: 0x04000003, offset: 9, length: 1 },
  ]);
  assert.equal(f.reads.includes(OWN), false, "own ClothingBase is NOT applied below gear");
  assert.equal(f.reads.filter((id) => id === PALSET).length, 1);
  assert.deepEqual(input, before);
});

test("own ClothingBase fallback needs property presence to apply palettes, preserves zero shade", async () => {
  const f = fixture();
  const noColor = await resolveAppearance({ setupId: SETUP, clothingBaseId: OWN }, f.readFile);
  assert.equal(noColor.parts.length, 1);
  assert.deepEqual(noColor.palettes, []);
  assert.equal(f.reads.includes(SETUP), false);
  assert.equal(f.reads.includes(PALSET), false);
  const color = await resolveAppearance({ setupId: SETUP, clothingBaseId: OWN, shade: 0 }, f.readFile);
  assert.deepEqual(color.palettes[0], { paletteId: 0x04000001, offset: 24, length: 8 });
  assert.equal(color.palettes[1].offset, 9, "missing palette template chooses first file entry");
});

test("worn clothing defaults to shade zero and first-entry fallback, unlike own base path", async () => {
  const f = fixture();
  const out = await resolveAppearance({ setupId: SETUP, wearables: [shirt({ paletteTemplate: 999 })] }, f.readFile);
  assert.deepEqual(out.palettes[0], { paletteId: 0x04000001, offset: 24, length: 8 });
  assert.equal(out.palettes[1].offset, 9);
});

test("explicit DB operations short-circuit only without eligible equipment; base face palette stays authoritative", async () => {
  const f = fixture();
  const base = { ...empty(), paletteBaseId: 0x0400007e,
    parts: [{ partIndex: 16, gfxObjId: 0x01000555 }],
    palettes: [{ paletteId: 0x04000011, offset: 0, length: 24 }] };
  const explicit = { ...empty(), paletteBaseId: 0x040000ff,
    parts: [{ partIndex: 9, gfxObjId: 0x01000666 }] };
  const before = structuredClone({ base, explicit });
  const out = await resolveAppearance({ setupId: SETUP, clothingBaseId: OWN,
    baseAppearance: base, explicitAppearance: explicit }, f.readFile);
  assert.deepEqual(out, { ...base, parts: [...base.parts, ...explicit.parts] });
  assert.deepEqual(f.reads, []);
  const worn = await resolveAppearance({ setupId: SETUP, baseAppearance: base,
    explicitAppearance: explicit, wearables: [shirt()] }, f.readFile);
  assert.equal(worn.parts.some((p) => p.gfxObjId === 0x01000666), false);
  assert.deepEqual(worn.parts[0], base.parts[0]);
  assert.deepEqual({ base, explicit }, before);
});

test("empty explicit rows do not suppress own base or naked body", async () => {
  const f = fixture();
  const out = await resolveAppearance({ setupId: SETUP, explicitAppearance: empty() }, f.readFile);
  assert.equal(out.parts.length, 16);
});

test("incompatible clothing produces no coverage then falls back to creature's own ClothingBase", async () => {
  const f = fixture();
  f.files.set(SHIRT, table(SHIRT, [{ setupId: OTHER_SETUP, partIndex: 9, gfxObjId: 0x010000aa }]));
  const out = await resolveAppearance({ setupId: SETUP, clothingBaseId: OWN,
    wearables: [shirt()] }, f.readFile);
  assert.deepEqual(out.parts, [{ partIndex: 9, gfxObjId: 0x01000999 }]);
  assert.deepEqual(out.palettes, []);
});

test("own ClothingBase fallback discards palette-only non-covering equipment", async () => {
  const f = fixture();
  // A compatible effect with zero part coverage can still have palette ranges.
  f.files.set(SHIRT, words(SHIRT, (16 << 16) | 1, SETUP, 0,
    (16 << 16) | 1, 9, 0, 1, 1, 192, 64, PALSET));
  const output = await resolveAppearance({ setupId: SETUP, clothingBaseId: OWN, shade: 0,
    wearables: [shirt({ shade: 1 })],
  }, f.readFile);
  assert.equal(output.parts.length, 1);
  assert.ok(output.palettes.length > 0);
  assert.ok(output.palettes.every(p => p.paletteId === 0x04000001),
    "returning base.CalculateObjDesc discards the non-covering garment's shade-one palette");
});

test("optional alternate setup lookup uses original first and original naked body", async () => {
  const f = fixture();
  f.files.set(SHIRT, table(SHIRT, [
    { setupId: SETUP, partIndex: 9, gfxObjId: 0x010000aa },
    { setupId: OTHER_SETUP, partIndex: 9, gfxObjId: 0x010000bb },
  ]));
  const out = await resolveAppearance({ setupId: OTHER_SETUP, compatibilitySetupId: SETUP,
    wearables: [shirt()] }, f.readFile);
  assert.equal(out.parts[0].gfxObjId, 0x010000bb);
  f.files.set(SHIRT, table(SHIRT, [{ partIndex: 9, gfxObjId: 0x010000aa }]));
  const aliased = await resolveAppearance({ setupId: OTHER_SETUP, compatibilitySetupId: SETUP,
    wearables: [shirt()] }, f.readFile);
  assert.equal(aliased.parts[0].gfxObjId, 0x010000aa);
  assert.equal(aliased.parts[1].gfxObjId, 0x01000100);
});

test("armor layer priority orders false, absent, true regardless of numeric coverage", async () => {
  const f = fixture();
  const A = SHIRT + 1, B = SHIRT + 2;
  f.files.set(A, table(A, [{ partIndex: 9, gfxObjId: 0x010000aa }]));
  f.files.set(B, table(B, [{ partIndex: 9, gfxObjId: 0x010000bb }]));
  const out = await resolveAppearance({ setupId: SETUP, wearables: [
    shirt({ currentWieldedLocation: 0x200, topLayerPriority: true }),
    shirt({ clothingBaseId: A, currentWieldedLocation: 0x200 }),
    shirt({ clothingBaseId: B, currentWieldedLocation: 0x200, topLayerPriority: false }),
  ] }, f.readFile);
  assert.deepEqual(out.parts.slice(0, 3).map((p) => p.gfxObjId), [0x010000bb, 0x010000aa, 0x01000200]);
});

test("armor visual priority is derived from human-male DAT coverage, not declared coverage or wearer", async () => {
  const f = fixture();
  f.files.set(SHIRT, table(SHIRT, [
    { setupId: SETUP, partIndex: 3, gfxObjId: 0x01000200 }, // feet => 0x10000
    { setupId: OTHER_SETUP, partIndex: 9, gfxObjId: 0x01000200 },
  ]));
  f.files.set(PANTS, table(PANTS, [
    { setupId: SETUP, partIndex: 9, gfxObjId: 0x01000300 }, // chest => 0x400
    { setupId: OTHER_SETUP, partIndex: 9, gfxObjId: 0x01000300 },
  ]));
  const out = await resolveAppearance({ setupId: OTHER_SETUP, wearables: [
    shirt({ currentWieldedLocation: 0x200, clothingPriority: 0 }),
    shirt({ clothingBaseId: PANTS, currentWieldedLocation: 0x200, clothingPriority: 999999 }),
  ] }, f.readFile);
  assert.deepEqual(out.parts.slice(0, 2).map((p) => p.gfxObjId), [0x01000300, 0x01000200]);
});

test("no-ClothingBase wearable grafts Setup parts and skips the null head", async () => {
  const f = fixture();
  const gearSetup = 0x02000010;
  const parts = Array.from({ length: 17 }, (_, i) => i === 16 ? 0x010001ec : 0x01000800 + i);
  f.files.set(gearSetup, setup(gearSetup, parts));
  const out = await resolveAppearance({ setupId: SETUP,
    baseAppearance: { ...empty(), parts: [{ partIndex: 16, gfxObjId: 0x01000555 }] },
    wearables: [shirt({ clothingBaseId: undefined, setupId: gearSetup })] }, f.readFile);
  assert.equal(out.parts.length, 17);
  assert.deepEqual(out.parts[0], { partIndex: 16, gfxObjId: 0x01000555 });
  assert.equal(out.parts.filter((p) => p.partIndex === 16).length, 1);
  assert.deepEqual(out.textures, []);
});

test("held/selectable gear is not turned into clothing and nonwearables are ignored", async () => {
  const f = fixture();
  const out = await resolveAppearance({ setupId: SETUP, wearables: [
    { currentWieldedLocation: 0x100000, itemType: 1, clothingBaseId: 0x1000ffff },
    { currentWieldedLocation: 0x1000000, clothingBaseId: 0x1000fffe },
  ] }, f.readFile);
  assert.equal(out.parts.length, 16);
  assert.deepEqual(f.reads, [SETUP]);
});

test("ACE armor shield still suppresses explicit-row fallback before being skipped as clothing", async () => {
  const f = fixture();
  const out = await resolveAppearance({ setupId: SETUP,
    explicitAppearance: { ...empty(), parts: [{ partIndex: 9, gfxObjId: 0x01000fff }] },
    wearables: [{ itemType: 2, currentWieldedLocation: 0x00200000 }],
  }, f.readFile);
  assert.equal(out.parts.some((p) => p.gfxObjId === 0x01000fff), false);
  assert.equal(out.parts.length, 16);
});

test("pseudo-clothing beyond wearer part range is explicitly unsupported, not silently dropped", async () => {
  const f = fixture();
  const gearSetup = 0x02000010;
  f.files.set(gearSetup, setup(gearSetup, Array.from({ length: 18 }, (_, i) => 0x01000800 + i)));
  await assert.rejects(resolveAppearance({ setupId: SETUP,
    wearables: [shirt({ clothingBaseId: undefined, setupId: gearSetup })],
  }, f.readFile), /18 parts but wearer has 17/);
});

test("exact duplicate part/texture changes are deduplicated as ACE, different models retain order", async () => {
  const f = fixture();
  const out = await resolveAppearance({ setupId: SETUP, wearables: [shirt(), shirt()] }, f.readFile);
  assert.equal(out.parts.filter((p) => p.partIndex === 9).length, 1);
  assert.equal(out.textures.length, 1);
  assert.equal(out.palettes.length, 4, "palettes are not deduplicated/pruned");
  assert.equal(f.reads.filter((id) => id === SHIRT).length, 1);
});

test("unsupported random/oversized gear and missing pseudo-clothing setups fail explicitly", async () => {
  const f = fixture();
  await assert.rejects(resolveAppearance({ setupId: SETUP, equipmentSelection: "random" }, f.readFile), UnsupportedAppearanceError);
  await assert.rejects(resolveAppearance({ setupId: SETUP, wearables: Array.from({ length: 257 }, () => shirt()) }, f.readFile), /exceeds 256/);
  await assert.rejects(resolveAppearance({ setupId: SETUP, wearables: [shirt({ clothingBaseId: undefined })] }, f.readFile), /neither ClothingBase/);
});

test("authored out-of-range shades use ACE's palette-zero no-op, never clamping or dropping the model", async () => {
  const f = fixture();
  const baseline = await resolveAppearance({ setupId: SETUP, wearables: [shirt()] }, f.readFile);
  for (const shade of [-1, 1.2, Math.fround(1.2), 14, NaN, Infinity, -Infinity]) {
    const out = await resolveAppearance({ setupId: SETUP, wearables: [shirt({ shade })] }, f.readFile);
    assert.deepEqual(out.parts, baseline.parts, `parts survive shade ${shade}`);
    assert.deepEqual(out.textures, baseline.textures, `textures survive shade ${shade}`);
    assert.deepEqual(out.palettes, [], `palette-zero sentinel contributes no override for shade ${shade}`);
  }
  f.files.set(PALSET, words(PALSET, 0));
  await assert.rejects(resolveAppearance({ setupId: SETUP, wearables: [shirt()] }, f.readFile),
    error => error instanceof Error && !(error instanceof UnsupportedAppearanceError) && /empty PaletteSet/.test(error.message));
});

test("missing/corrupt/wrong-id DAT assets produce actionable failures", async () => {
  const f = fixture();
  await assert.rejects(resolveAppearance({ setupId: SETUP, clothingBaseId: 0x1000ffff }, f.readFile), /Appearance DAT 0x1000ffff/);
  f.files.set(SHIRT, table(OWN, [{ partIndex: 9, gfxObjId: 0x010000aa }]));
  await assert.rejects(resolveAppearance({ setupId: SETUP, wearables: [shirt()] }, f.readFile), /id mismatch/);
  f.files.set(SHIRT, table(SHIRT, [{ partIndex: 9, gfxObjId: 0x010000aa }]));
  f.files.set(PALSET, words(PALSET + 1, 1, 0x04000001));
  await assert.rejects(resolveAppearance({ setupId: SETUP, wearables: [shirt()] }, f.readFile), /PaletteSet id mismatch/);
  f.files.set(SETUP, words(SETUP, 0, 256));
  await assert.rejects(resolveAppearance({ setupId: SETUP }, f.readFile), /truncated parts/);
  f.files.set(SETUP, words(SETUP, 0, 257));
  await assert.rejects(resolveAppearance({ setupId: SETUP }, f.readFile), /more than 256 parts/);
  f.files.set(SETUP, words(OTHER_SETUP, 0, 257));
  await assert.rejects(resolveAppearance({ setupId: SETUP }, f.readFile),
    error => error instanceof Error && !(error instanceof UnsupportedAppearanceError) && /invalid\/mismatched id/.test(error.message));
  f.files.set(SETUP, words(SETUP, 0));
  await assert.rejects(resolveAppearance({ setupId: SETUP }, f.readFile), /truncated header/);
});
