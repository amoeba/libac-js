import { Setup, SetupPartsLimitError, parseClothingTable, parsePaletteSet, selectPalette } from "../index.js";
import type { ClothingTable, ObjDesc } from "../index.js";

export type ReadAppearanceFile = (id: number) => Promise<Uint8Array>;
export interface WearableAppearanceInput {
  clothingBaseId?: number;
  /** Used only by ACE's no-ClothingBase pseudo-clothing fallback. */
  setupId?: number;
  paletteTemplate?: number;
  shade?: number;
  /** PropertyInt.ItemType, NOT weenie.type. Defaults to Clothing (4). */
  itemType?: number;
  currentWieldedLocation: number;
  clothingPriority?: number;
  topLayerPriority?: boolean;
}
export interface ResolveAppearanceInput {
  setupId: number;
  /** Generic held WorldObjects do not use Creature's explicit-row/naked-fill paths. */
  mode?: "creature" | "object";
  clothingBaseId?: number;
  paletteTemplate?: number;
  shade?: number;
  /** Authored head/face/skin contributions, applied before clothing. */
  baseAppearance?: ObjDesc;
  /** Raw DB ObjDesc rows; ACE uses these only with no eligible equipment. */
  explicitAppearance?: ObjDesc;
  /** Already selected/equipped items, including seeded initial choices; never all possible inventory items. */
  wearables?: readonly WearableAppearanceInput[];
  /** This composer requires selected inputs; the offline exporter owns random selection. */
  equipmentSelection?: "fixed" | "random";
  /** Optional explicit alias for alternate player setups; original wins. */
  compatibilitySetupId?: number;
}
export class UnsupportedAppearanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedAppearanceError";
  }
}

const ARMOR = 0x00007f00;
const EXTREMITY = 0x00000121;
const CLOTHING_ARMOR_CLOAK = 0x88007fff;
const MAX_WEARABLES = 256;
const clone = (value?: ObjDesc): ObjDesc => ({
  ...(value?.paletteBaseId === undefined ? {} : { paletteBaseId: value.paletteBaseId }),
  parts: (value?.parts ?? []).map((v) => ({ ...v })),
  textures: (value?.textures ?? []).map((v) => ({ ...v })),
  palettes: (value?.palettes ?? []).map((v) => ({ ...v })),
});
const hasOps = (value?: ObjDesc): boolean => !!value &&
  !!(value.parts.length || value.textures.length || value.palettes.length);

/** ACE ClothingTable.GetVisualPriority (default setup 0x02000001), not the
 * wearer's setup. Coverage bits are distinct from EquipMask slot bits.
 * Source: ACE.DatLoader/FileTypes/ClothingTable.cs:50-101.
 */
function visualPriority(table: ClothingTable, fallback: number): number {
  const effect = table.clothingBaseEffects.get(0x02000001);
  if (!effect) return fallback;
  const bits = [0x800, 0x100, 0x200, 0x10000, 0x10000,
    0x100, 0x200, 0x10000, 0x10000, 0x400,
    0x1000, 0x2000, 0x8000, 0x1000, 0x2000, 0x8000, 0x4000];
  return effect.objects.reduce((mask, part) => mask | (bits[part.partIndex] ?? 0), 0);
}

/** Deterministic initial clothing composition, modeled on ACE
 * WorldObjects/Creature_Networking.cs:35-293 and WorldObject_Networking.cs:906-1036.
 * This is not an equipment selector: the exporter selects inventory/conflicts
 * and resolves CharGen before calling. Held child Setups are composed separately.
 * No live shard state or player visibility options are invented.
 * Errors are deliberate: caller can record a skipped appearance, not silently
 * pretend a missing clothing DAT was a correctly rendered naked creature.
 */
export async function resolveAppearance(
  input: ResolveAppearanceInput,
  readFile: ReadAppearanceFile,
): Promise<ObjDesc> {
  if (input.equipmentSelection !== undefined && input.equipmentSelection !== "fixed")
    throw new UnsupportedAppearanceError("Random/treasure equipment selection is unsupported; supply selected fixed wearables");
  const wearables = input.wearables ?? [];
  if (wearables.length > MAX_WEARABLES)
    throw new UnsupportedAppearanceError("Appearance wearable count exceeds 256");
  const files = new Map<number, Promise<Uint8Array>>();
  const tables = new Map<number, Promise<ClothingTable>>();
  const file = (id: number): Promise<Uint8Array> => {
    if (!files.has(id)) files.set(id, (async () => {
      try { return await readFile(id); }
      catch (error) { throw new Error(`Appearance DAT 0x${id.toString(16)}: ${String(error)}`); }
    })());
    return files.get(id)!;
  };
  const clothing = (id: number): Promise<ClothingTable> => {
    if (!tables.has(id)) tables.set(id, file(id).then((data) => {
      const table = parseClothingTable(data);
      if (table.id !== id) throw new Error(`Appearance: ClothingTable id mismatch for 0x${id.toString(16)}`);
      return table;
    }));
    return tables.get(id)!;
  };
  // Only the Setup header/part array is needed; no unbounded full-model parser.
  // ACE.DatLoader/FileTypes/SetupModel.cs:48-58: id, flags, numParts, GfxObj DIDs.
  const setupParts = async (id: number): Promise<number[]> => {
    const bytes = await file(id);
    let setup: ReturnType<typeof Setup.readParts>;
    try {
      // The shared native projection validates the record and bounds its list;
      // the 256-part ceiling is this ACE snapshot subset's explicit policy.
      setup = Setup.readParts(bytes, { expectedId: id, maxParts: 256 });
    } catch (error) {
      if (error instanceof SetupPartsLimitError && error.maxParts === 256)
        throw new UnsupportedAppearanceError(`Appearance Setup 0x${id.toString(16)}: more than 256 parts`);
      throw error;
    }
    return setup.parts;
  };
  let output = clone(input.baseAppearance);
  const addPart = (partIndex: number, gfxObjId: number): void => {
    if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex > 255)
      throw new UnsupportedAppearanceError(`Appearance part index ${partIndex} exceeds ObjDesc byte range`);
    // ACE Entity/ObjDesc.cs: same index AND same model is moved to the end.
    const old = output.parts.findIndex((p) => p.partIndex === partIndex && p.gfxObjId === gfxObjId);
    if (old !== -1) output.parts.splice(old, 1);
    output.parts.push({ partIndex, gfxObjId });
  };
  const apply = async (table: ClothingTable, paletteTemplate: number | undefined,
    shade: number | undefined, setupId: number, coverage?: Set<number>): Promise<void> => {
    const effect = table.clothingBaseEffects.get(setupId)
      ?? (coverage && input.compatibilitySetupId !== undefined
        ? table.clothingBaseEffects.get(input.compatibilitySetupId) : undefined);
    if (!effect) return;
    for (const part of effect.objects) {
      if (coverage) { addPart(part.partIndex, part.gfxObjId); coverage.add(part.partIndex); }
      else output.parts.push({ partIndex: part.partIndex, gfxObjId: part.gfxObjId });
      for (const texture of part.textures) {
        const op = { partIndex: part.partIndex, ...texture };
        if (!coverage || !output.textures.some((t) => t.partIndex === op.partIndex &&
          t.oldTextureId === op.oldTextureId && t.newTextureId === op.newTextureId)) output.textures.push(op);
      }
    }
    // Equipped clothing always applies palettes; WorldObject's own ClothingBase
    // requires the presence (not truthiness) of Shade or PaletteTemplate.
    if (!coverage && shade === undefined && paletteTemplate === undefined) return;
    const paletteEffect = table.clothingSubPalEffects.get(paletteTemplate ?? 0)
      ?? table.clothingSubPalEffects.values().next().value;
    if (!paletteEffect) return;
    for (const sub of paletteEffect.subPalettes) {
      const set = parsePaletteSet(await file(sub.paletteSetId));
      if (set.id !== sub.paletteSetId) throw new Error("Appearance: PaletteSet id mismatch");
      // ACE casts the database double to float before selecting the palette.
      if (!set.palettes.length) throw new Error(`Appearance: empty PaletteSet 0x${sub.paletteSetId.toString(16)}`);
      const selectedShade = Math.fround(shade ?? 0);
      const paletteId = selectPalette(set, selectedShade);
      // Real create rows author -1, 1.2 and 14. ACE PaletteSet.GetPaletteID
      // returns its invalid-DID sentinel (0) for a shade outside [0,1] (or a
      // nonfinite shade); the retail client's Palette::Modify treats sub-palette
      // 0 as a no-op. Keep the clothing/held child and omit only this invalid
      // palette range; never clamp to an invented first/last color or drop the model.
      if (!paletteId) continue;
      for (const range of sub.ranges) output.palettes.push({
        paletteId, offset: Math.trunc(range.offset / 8), length: Math.trunc(range.length / 8),
      });
    }
  };

  // WorldObject_Networking.cs:906-975: generic props have authored base + their
  // own ClothingBase, not Creature's explicit Biota fallback or naked-body fill.
  if (input.mode === "object") {
    if (wearables.length) throw new UnsupportedAppearanceError("Generic WorldObject appearance cannot compose creature wearables");
    if (input.clothingBaseId) await apply(await clothing(input.clothingBaseId), input.paletteTemplate, input.shade, input.setupId);
    return output;
  }

  // Creature_Networking.cs:110-127. JS stable sort preserves source order on ties.
  const armor: Array<{ item: WearableAppearanceInput; priority: number }> = [];
  const clothes: WearableAppearanceInput[] = [];
  for (const item of wearables) {
    const armorSlot = (item.currentWieldedLocation & (ARMOR | EXTREMITY)) !== 0;
    if (item.itemType === 2 || armorSlot) {
      const priority = armorSlot && item.clothingBaseId
        ? visualPriority(await clothing(item.clothingBaseId), item.clothingPriority ?? 0)
        : item.clothingPriority ?? 0;
      armor.push({ item, priority });
    } else if ((item.itemType ?? 4) === 4) clothes.push(item);
  }
  clothes.sort((a, b) => (a.clothingPriority ?? 0) - (b.clothingPriority ?? 0));
  const layer = (item: WearableAppearanceInput): number => item.topLayerPriority === false
    ? 0 : item.topLayerPriority === true ? 2 : 1;
  armor.sort((a, b) => layer(a.item) - layer(b.item) || a.priority - b.priority);
  const equipment = [...clothes, ...armor.map((v) => v.item)];
  if (!equipment.length && hasOps(input.explicitAppearance)) {
    const explicit = clone(input.explicitAppearance);
    output.parts.push(...explicit.parts);
    output.textures.push(...explicit.textures);
    output.palettes.push(...explicit.palettes);
    return output;
  }
  const coverage = new Set<number>();
  for (const item of equipment) {
    // Held/selectable items have no clothing slots and need separate attachments.
    if (!(item.currentWieldedLocation & CLOTHING_ARMOR_CLOAK)) continue;
    if (item.clothingBaseId) {
      await apply(await clothing(item.clothingBaseId), item.paletteTemplate,
        item.shade, input.setupId, coverage);
    } else {
      if (!item.setupId) throw new UnsupportedAppearanceError("Wearable has neither ClothingBase nor fallback Setup");
      const parts = await setupParts(item.setupId);
      const wearerParts = await setupParts(input.setupId);
      // ACViewer skips missing wearer part indices (PhysicsObj.cs:4456-4463).
      // A fixed-clothing export must not silently emit an unrenderable guise.
      if (parts.length > wearerParts.length)
        throw new UnsupportedAppearanceError(`Wearable Setup has ${parts.length} parts but wearer has ${wearerParts.length}`);
      parts.forEach((gfxObjId, partIndex) => {
        if (partIndex !== 16 || gfxObjId !== 0x010001ec)
          output.parts.push({ partIndex, gfxObjId });
      });
      // ACE includes all existing base/head changes in coverage after this path.
      for (const part of output.parts) coverage.add(part.partIndex);
    }
  }
  if (!coverage.size && input.clothingBaseId) {
    // ACE returns base.CalculateObjDesc(), which starts a fresh description.
    // Discard even palette-only contributions from non-covering equipment.
    output = clone(input.baseAppearance);
    await apply(await clothing(input.clothingBaseId), input.paletteTemplate,
      input.shade, input.setupId);
    return output;
  }
  const parts = await setupParts(input.setupId);
  parts.forEach((gfxObjId, partIndex) => {
    if (!coverage.has(partIndex) && partIndex !== 16)
      output.parts.push({ partIndex, gfxObjId });
  });
  return output;
}
