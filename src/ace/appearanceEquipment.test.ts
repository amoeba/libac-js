import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  EquipmentDestination as D, EquipmentMask as M, selectInitialEquipment,
  type EquipmentCreateRow, type EquipmentItemProperties, type EquipmentSelectionInput,
  type EquipmentTreasureRow,
} from './appearanceEquipment.js';

type Row = Record<string, number | string>;
const fixture = JSON.parse(readFileSync(new URL('./fixtures/appearance-equipment.json', import.meta.url), 'utf8'));
const intKeys: Record<number, keyof EquipmentItemProperties> = {
  1: 'itemType', 3: 'paletteTemplate', 4: 'clothingPriority', 9: 'validLocations',
  12: 'stackSize', 28: 'armorLevel', 46: 'defaultCombatStyle', 48: 'weaponSkill', 50: 'ammoType', 51: 'combatUse',
};
const realItems = new Map<number, EquipmentItemProperties>();
for (const r of [...fixture.types, ...fixture.types198, ...fixture.types1404]) realItems.set(r.class_Id, { weenieClassId: r.class_Id, weenieType: r.type });
for (const r of [...fixture.ints, ...fixture.ints198, ...fixture.ints1404]) {
  const item = realItems.get(r.object_Id), key = intKeys[r.type];
  if (item && key) Object.assign(item, { [key]: r.value });
}
for (const r of fixture.floats) Object.assign(realItems.get(r.object_Id)!, { [{ 12: 'shade', 84: 'shade2', 85: 'shade3', 86: 'shade4' }[r.type as 12]]: r.value });
for (const r of fixture.armor) realItems.set(r.class_Id, { weenieClassId: r.class_Id, weenieType: r.type, validLocations: r.locations, clothingPriority: r.coverage, armorLevel: r.armorLevel });
const createFromSql = (r: Row): EquipmentCreateRow => ({ id: +r.id, destinationType: +r.destination_Type, weenieClassId: +r.weenie_Class_Id, stackSize: +r.stack_Size, palette: +r.palette, shade: +r.shade });
const treasureFromSql = (r: Row): EquipmentTreasureRow => ({
  id: +r.id, treasureType: +r.treasure_Type, weenieClassId: +r.weenie_Class_Id, paletteId: +r.palette_Id,
  shade: +r.shade, stackSize: +r.stack_Size, stackSizeVariance: +r.stack_Size_Variance, probability: +r.probability,
  setStart: !!r.set_Start, hasSubSet: !!r.has_Sub_Set, continuesPreviousSet: !!r.continues_Previous_Set,
});
const create = (id: number, extra: Partial<EquipmentCreateRow> = {}): EquipmentCreateRow => ({ id, weenieClassId: id, destinationType: 2, stackSize: 0, palette: 0, shade: 0, ...extra });
const treasure = (id: number, extra: Partial<EquipmentTreasureRow> = {}): EquipmentTreasureRow => ({ id, weenieClassId: id, treasureType: 1, paletteId: 0, shade: 0, stackSize: 0, stackSizeVariance: 0, probability: 1, setStart: false, hasSubSet: false, continuesPreviousSet: false, ...extra });
const item = (id: number, extra: Partial<EquipmentItemProperties> = {}): EquipmentItemProperties => ({ weenieClassId: id, weenieType: 6, validLocations: M.MeleeWeapon, ...extra });
const input = (items: EquipmentItemProperties[], extra: Partial<EquipmentSelectionInput> = {}): EquipmentSelectionInput => ({ createList: [], treasure: [], items: new Map(items.map(i => [i.weenieClassId, i])), creature: { itemCapacity: -1, containerCapacity: -1 }, ...extra });
const run = (i: EquipmentSelectionInput, random: () => number = () => 0) => {
  const result = selectInitialEquipment(i, random);
  assert.equal(result.status, 'ok', JSON.stringify(result.diagnostics));
  return result;
};
const ids = (r: ReturnType<typeof run>) => r.selected.map(i => i.weenieClassId);
const draws = (...values: number[]) => { let index = 0; return () => { assert.ok(index < values.length, 'unexpected RNG draw'); return values[index++]; }; };
const seeded = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };

test('destination constants: Treasure=8, Shop=4; shade is color for bit4 and probability for bit8', () => {
  assert.deepEqual(D, { Contain: 1, Wield: 2, Treasure: 8, Shop: 4 });
  const base = input([item(1, { shade: 0.75, paletteTemplate: 20 })]);
  const shop = run({ ...base, createList: [create(1, { destinationType: 6, shade: 0.25 })] }, () => 0.99);
  assert.equal(shop.selected[0].shade, 0.25);
  const probability = run({ ...base, createList: [create(1, { destinationType: 10, shade: 0.25 })] }, () => 0.25);
  assert.deepEqual(ids(probability), []); // equality excludes, not <=
  const selected = run({ ...base, createList: [create(1, { destinationType: 10, shade: 0.25 })] });
  assert.equal(selected.selected[0].shade, 0.75);
});

test('real Ulgrim create row equips generic Mug only for ACE IsNPC, including -1 capacities', () => {
  const base = input([], { items: realItems, createList: fixture.ulgrimCreate.map(createFromSql), creature: { attackable: false, itemCapacity: -1, containerCapacity: -1 } });
  const npc = run(base);
  assert.deepEqual(ids(npc), [161]);
  assert.equal(npc.selected[0].currentWieldedLocation, 4194304);
  assert.equal(npc.selected[0].paletteTemplate, 20);
  assert.equal(npc.selected[0].shade, 0);
  assert.deepEqual(ids(run({ ...base, creature: { attackable: true, itemCapacity: 255 } })), []);
  assert.deepEqual(ids(run({ ...base, creature: { attackable: false, targetingTactic: 1, itemCapacity: 255 } })), []);
});

test('real create 1404: contain-only trophy rows do not fill capacity; independent guaranteed weapon/shield sets', () => {
  const result = run(input([], { items: realItems, createList: fixture.create1404.map(createFromSql), creature: { itemCapacity: 2 } }));
  assert.deepEqual(ids(result), [24598, 1457]);
  assert.deepEqual(result.selected.map(i => i.currentWieldedLocation), [M.MeleeWeapon, M.Shield]);
  assert.equal(result.selected[1].paletteTemplate, 1);
  assert.equal(result.randomDraws, 3); // initial, next probability chunk, shield selection
});

test('shade endpoints: non-Treasure zero overrides; Treasure zero is unconditional and inherits all shades', () => {
  const properties = item(1, { paletteTemplate: 4, shade: 0.8, shade2: 0, shade3: 0.7, shade4: 1 });
  const base = input([properties]);
  const color = run({ ...base, createList: [create(1)] }).selected[0];
  assert.equal(color.shade, 0);
  const inherited = run({ ...base, createList: [create(1, { destinationType: 10, shade: 0 })] }, () => 0.999).selected[0];
  assert.equal(inherited.shade, 0.8);
  assert.equal(inherited.shade2, 0); assert.equal(inherited.shade3, 0.7); assert.equal(inherited.shade4, 1);
  assert.equal(inherited.paletteTemplate, 4);
  const overridden = run({ ...base, createList: [create(1, { palette: 9, shade: 1 })] }).selected[0];
  assert.equal(overridden.paletteTemplate, 9); assert.equal(overridden.shade, 1);
});

test('real non-Treasure create rows use out-of-range shade values verbatim, not normalized weights', () => {
  // SQL ids 49119 (shade1.2), 49477 (shade14), 60507 (shade-1).
  for (const row of fixture.extremeCreate.map(createFromSql) as EquipmentCreateRow[]) {
    const selected = run(input([item(row.weenieClassId)], { createList: [row] })).selected[0];
    assert.equal(selected.shade, Math.fround(row.shade));
  }
});

test('Treasure-bit create list retains WCID0 alternatives and does not equip every candidate', () => {
  const base = input([item(1), item(2)], { createList: [create(1, { destinationType: 10, shade: 0.5 }), create(2, { weenieClassId: 0, destinationType: 10, shade: 0.5 })] });
  assert.deepEqual(ids(run(base, () => 0)), [1]);
  const none = run(base, () => 0.5);
  assert.deepEqual(ids(none), []); assert.ok(none.diagnostics.some(d => d.code === 'none-row'));
  const nextSet = run({ ...base, createList: [...base.createList, create(3, { weenieClassId: 2, destinationType: 10, shade: 1 })] }, draws(0.5, 0));
  assert.deepEqual(ids(nextSet), [2]);
});

test('create probabilities use float32 accumulation at exact boundaries', () => {
  const base = input([item(1), item(2)], { createList: [create(1, { destinationType: 10, shade: 0.1 }), create(2, { destinationType: 10, shade: 0.9 })] });
  assert.deepEqual(ids(run(base, () => 0.1)), [1]); // float32(.1) > double(.1)
  assert.deepEqual(ids(run(base, () => Math.fround(0.1))), [2]);
});

test('real armor: AL wins first, overlapping coverage blocks inferior coat, unoccupied pieces survive', () => {
  const result = run(input([], { items: realItems, createList: [47, 51, 36, 37, 57].map(id => create(id)) }));
  assert.deepEqual(ids(result), [51, 37, 57]);
  assert.equal(result.selected[0].currentWieldedLocation, 1536);
  assert.ok(result.diagnostics.some(d => d.code === 'equip-conflict' && d.rowId === 47));
});

test('coverage, not overlapping ValidLocations, controls clothing conflicts', () => {
  const a = item(1, { weenieType: 2, validLocations: M.ChestArmor, clothingPriority: 0x400 });
  const b = item(2, { weenieType: 2, validLocations: M.ChestArmor, clothingPriority: 0x800 });
  const c = item(3, { weenieType: 2, validLocations: M.UpperArmArmor, clothingPriority: 0x400 });
  const result = run(input([a, b, c], { createList: [create(1), create(2), create(3)] }));
  assert.deepEqual(ids(result), [2, 1]); // equal AL ties retain ACE insertion/placement/sort effects
  assert.equal(result.selected.length, 2);
});

test('underwear pants, shirt, cloak are equipped before armor; greater covered-area count is preferred', () => {
  const properties = [
    item(1, { weenieType: 2, validLocations: 2, clothingPriority: 8 }),
    item(2, { weenieType: 2, validLocations: 2 | 8 | 16, clothingPriority: 8 | 32 | 64 }),
    item(3, { weenieType: 2, validLocations: 64 | 128, clothingPriority: 2 | 4 }),
    item(4, { weenieType: 2, validLocations: M.Cloak, clothingPriority: 0 }),
  ];
  assert.deepEqual(ids(run(input(properties, { createList: properties.map(i => create(i.weenieClassId)) }))), [3, 2, 4]);
});

test('equal armor rank uses real insertion order, including .NET Reverse operations; no WCID sorting', () => {
  const properties = [item(1, { weenieType: 2, validLocations: 512, clothingPriority: 1024 }), item(2, { weenieType: 2, validLocations: 512, clothingPriority: 1024 })];
  const base = input(properties, { createList: [create(20, { weenieClassId: 1 }), create(10, { weenieClassId: 2 })] });
  assert.deepEqual(ids(run(base)), [1]); // last SQL insertion -> placement zero -> wins equal armor tie
  assert.deepEqual(ids(run({ ...base, createList: [...base.createList].reverse() })), [1]);
  assert.deepEqual(ids(run({ ...base, createList: [create(20, { weenieClassId: 1, sourceOrder: 0 }), create(10, { weenieClassId: 2, sourceOrder: 1 })] })), [2]);
});

test('large tied armor lists use ACE introsort deterministically, not input-array sorting artifacts', () => {
  const properties = Array.from({ length: 40 }, (_, i) => item(i + 1, { weenieType: 2, validLocations: 512, clothingPriority: 1024 }));
  const base = input(properties, { createList: properties.map(i => create(i.weenieClassId)) });
  const result = run(base);
  assert.equal(result.selected.length, 1);
  assert.deepEqual(result, run({ ...base, createList: [...base.createList].reverse() }));
});

test('two constructor passes keep create gear in place instead of globally replacing with treasure armor', () => {
  const properties = [item(1, { weenieType: 2, validLocations: 512, clothingPriority: 1024, armorLevel: 1 }), item(2, { weenieType: 2, validLocations: 512, clothingPriority: 1024, armorLevel: 999 })];
  const result = run(input(properties, { createList: [create(1)], wieldedTreasureType: 1, treasure: [treasure(2)] }));
  assert.deepEqual(ids(result), [1]);
});

test('real lugian table439 chooses one row from each set then shuffles competing weapons', () => {
  const base = input([], { items: realItems, wieldedTreasureType: 439, treasure: fixture.treasure439.map(treasureFromSql) });
  // create-list draw; table-entry draw; set1 draw; set2 draw; Fisher-Yates swap.
  assert.deepEqual(ids(run(base, draws(0, 0, 0, 0, 0))), [23741]);
  assert.deepEqual(ids(run(base, draws(0, 0, 0, 0, 0.999))), [23747]);
  assert.deepEqual(ids(run(base, draws(0, 0, 0.95, 0, 0.999))), [7578]);
});

test('real nested table198: selected parent gates ammo, skipped subsets still consume entry RNG', () => {
  const base = input([], { items: realItems, wieldedTreasureType: 198, treasure: fixture.treasure198.map(treasureFromSql) });
  let calls = 0;
  const result = run(base, () => { calls++; return calls <= 6 ? 0 : 0.999; });
  assert.deepEqual(ids(result), [23733, 15431]);
  assert.equal(result.selected[1].stackSize, 18);
  assert.equal(result.randomDraws, 20);
  assert.equal(result.selected[1].paletteTemplate, 61);
  const skipped = run(base, () => 0.999);
  assert.deepEqual(ids(skipped), []);
  assert.equal(skipped.randomDraws, 18); // initial + table + 8 parent resets + 8 skipped-subset entries
});

test('nested subsets return to a parent continuation; zero probability never wins at draw zero', () => {
  const properties = [item(1), item(2), item(3), item(4), item(5)];
  const base = input(properties, { wieldedTreasureType: 1, treasure: [
    treasure(1, { probability: 0, hasSubSet: true }),
    treasure(2, { hasSubSet: true }), treasure(3),
    treasure(4, { probability: 1, continuesPreviousSet: true }),
    treasure(5, { probability: 1, continuesPreviousSet: true }),
  ] });
  assert.deepEqual(ids(run(base)), [5]);
});

test('wielded treasure palette/shade override only when >0; stack variance includes both integer endpoints', () => {
  const base = input([item(1, { shade: 0.4, paletteTemplate: 7, stackSize: 90 })], { wieldedTreasureType: 1, treasure: [treasure(1, { stackSize: 5, stackSizeVariance: 0.5 })] });
  const low = run(base).selected[0];
  assert.equal(low.stackSize, 3); assert.equal(low.shade, 0.4); assert.equal(low.paletteTemplate, 7);
  const high = run(base, () => 0.999).selected[0]; assert.equal(high.stackSize, 5);
  const override = run({ ...base, treasure: [treasure(1, { shade: 1, paletteId: 9 })] }).selected[0];
  assert.equal(override.shade, 1); assert.equal(override.paletteTemplate, 9); assert.equal(override.stackSize, 90);
});

test('weapon hand conflicts use parent location, including casters, combined masks and offhand flags', () => {
  const base = input([item(1), item(2, { weenieType: 35, validLocations: M.Held })], { createList: [create(1)], wieldedTreasureType: 1, treasure: [treasure(2)] });
  assert.deepEqual(ids(run(base)), [1]);
  const combined = M.MeleeWeapon | M.Shield;
  const result = run(input([item(1, { validLocations: combined }), item(2, { autoWieldLeft: true, validLocations: M.MeleeWeapon })], { createList: [create(1), create(2)], creature: { itemCapacity: 255, aiAllowedCombatStyle: 256 } }));
  assert.deepEqual(ids(result), [1, 2]);
  assert.deepEqual(result.selected.map(i => i.currentWieldedLocation), [combined, M.MeleeWeapon]); // no guessed narrowing/left-hand conversion
});

test('ammo launcher without ammo is rejected for monsters, accepted for NPCs; shield can equip on second NPC pass', () => {
  const properties = [item(1, { weenieType: 3, validLocations: M.MissileWeapon, defaultCombatStyle: 16, ammoType: 1 }), item(2, { weenieType: 1, validLocations: M.Shield, itemType: 2, combatUse: 4 })];
  const base = input(properties, { createList: [create(1), create(2)] });
  assert.deepEqual(ids(run(base)), [2]);
  // Pass1 suppresses the shield, but pass2 treats the remaining generic shield as an NPC weapon.
  assert.deepEqual(ids(run({ ...base, creature: { itemCapacity: 255, attackable: false } }, () => 0.999)), [1, 2]);
  assert.deepEqual(ids(run({ ...base, createList: [create(1)], creature: { itemCapacity: 255, attackable: false } })), [1]);
});

test('initial capacity defaults zero; dropped clothing candidates are not re-added; weapon failures are re-added', () => {
  const empty = run(input([item(1)], { creature: {}, createList: [create(1)] }));
  assert.deepEqual(ids(empty), []); assert.ok(empty.diagnostics.some(d => d.code === 'inventory-full'));
  const capped = run(input([item(1), item(2)], { creature: { itemCapacity: 1 }, createList: [create(1), create(2)] }));
  assert.deepEqual(ids(capped), [1]);
});

test('stable placement RNG and canonical row ordering do not mutate input or depend on Map order', () => {
  const base = input([], { items: realItems, wieldedTreasureType: 198, treasure: fixture.treasure198.map(treasureFromSql) });
  const before = JSON.stringify({ ...base, items: [...base.items] });
  for (let seed = 0; seed < 50; seed++) {
    const a = run(base, seeded(seed));
    const b = run({ ...base, items: new Map([...base.items].reverse()), treasure: [...base.treasure].reverse() }, seeded(seed));
    assert.deepEqual(a, b);
  }
  assert.equal(JSON.stringify({ ...base, items: [...base.items] }), before);
});

test('real class 35780 create rows skip every absent template exactly as ACE CreateNewWorldObject null', () => {
  const rows = fixture.ascendantDrudgeCreate.map(createFromSql) as EquipmentCreateRow[];
  const result = run(input([], { createList: rows }));
  assert.deepEqual(ids(result), []);
  assert.deepEqual(result.diagnostics.filter(d => d.code === 'missing-template'), [
    { code: 'missing-template', message: 'ACE skips missing item template 47257', rowId: 44015, itemClassId: 47257, source: 'create-list' },
    { code: 'missing-template', message: 'ACE skips missing item template 47352', rowId: 44016, itemClassId: 47352, source: 'create-list' },
    { code: 'missing-template', message: 'ACE skips missing item template 47238', rowId: 44017, itemClassId: 47238, source: 'create-list' },
    { code: 'missing-template', message: 'ACE skips missing item template 47333', rowId: 44018, itemClassId: 47333, source: 'create-list' },
    { code: 'missing-template', message: 'ACE skips missing item template 47409', rowId: 44019, itemClassId: 47409, source: 'create-list' },
    { code: 'missing-template', message: 'ACE skips missing item template 47276', rowId: 44020, itemClassId: 47276, source: 'create-list' },
    { code: 'missing-template', message: 'ACE skips missing item template 47314', rowId: 44021, itemClassId: 47314, source: 'create-list' },
    { code: 'missing-template', message: 'ACE skips missing item template 47371', rowId: 44022, itemClassId: 47371, source: 'create-list' },
  ]);
});

test('missing create and wielded-treasure templates skip individually; remaining selected gear is preserved', () => {
  const createBase = input([item(1)], { createList: [create(2), create(1)] });
  const created = run(createBase);
  assert.deepEqual(ids(created), [1]);
  assert.ok(created.diagnostics.some(d => d.code === 'missing-template' && d.rowId === 2 && d.itemClassId === 2 && d.source === 'create-list'));
  const treasureBase = input([item(1)], { createList: [create(1)], wieldedTreasureType: 1,
    treasure: [treasure(3, { probability: 1 }), treasure(1, { probability: 1, setStart: true })] });
  const treasured = run(treasureBase, () => 0.999);
  assert.deepEqual(ids(treasured), [1]);
  assert.ok(treasured.diagnostics.some(d => d.code === 'missing-template' && d.rowId === 3 && d.itemClassId === 3 && d.source === 'wielded-treasure'));
});

test('unknown inputs fail atomically; unsupported unused templates do not poison the chosen subset', () => {
  const missing = run(input([], { createList: [create(1)] }));
  assert.deepEqual(missing.selected, []);
  assert.ok(missing.diagnostics.some(d => d.code === 'missing-template' && d.itemClassId === 1));
  const base = input([item(1), item(2, { hasInitialInventory: true })], { wieldedTreasureType: 1, treasure: [treasure(1, { probability: 0.5 }), treasure(2, { probability: 0.5 })] });
  assert.deepEqual(ids(run(base)), [1]);
  assert.equal(selectInitialEquipment(base, () => 0.75).status, 'unsupported');
  const unknown = selectInitialEquipment({ ...base, treasure: [treasure(1, { unknown1: 1 })] }, () => 0);
  assert.equal(unknown.status, 'unsupported'); assert.ok(unknown.diagnostics.some(d => d.code === 'unknown-treasure-fields'));
  assert.equal(selectInitialEquipment({ ...base, trophyDropRate: 2 }, () => 0).status, 'unsupported');
});

test('real table337 terminal empty subset and table5920 root return follow ACE rather than rejecting data', () => {
  for (const [type, rows] of [[337, fixture.terminal337], [5920, fixture.rootContinuation5920]] as const) {
    const treasureRows = (rows as Row[]).map(treasureFromSql);
    const properties = treasureRows.filter(r => r.weenieClassId).map(r => item(r.weenieClassId));
    const result = run(input(properties, { wieldedTreasureType: type, treasure: treasureRows }));
    if (type === 5920) assert.ok(result.diagnostics.some(d => d.code === 'treasure-root-return'));
    assert.deepEqual(ids(result), type === 337 ? [8524] : []);
  }
});

test('dictionary free-slot reuse preserves insertion enumeration across both equipment passes', () => {
  const properties = [1, 2, 3, 4].map(id => item(id));
  const result = run(input(properties, { createList: [1, 2, 3].map(id => create(id)), wieldedTreasureType: 1, treasure: [treasure(4)] }), () => 0.999);
  assert.deepEqual(ids(result), [1]);
  assert.ok(result.diagnostics.some(d => d.code === 'equip-conflict' && d.rowId === 4));
});

// Opt-in corpus smoke uses a read-only downloaded SQL snapshot and synthetic item metadata.
// It tests traversal acceptance/termination, not full item appearance or shard parity.
if (process.env.NPC_EQUIPMENT_TREASURE_CORPUS) test('optional complete SQL treasure corpus: every table traverses without unsupported semantics', () => {
  const all: Row[] = JSON.parse(readFileSync(process.env.NPC_EQUIPMENT_TREASURE_CORPUS!, 'utf8'));
  const tables = new Map<number, EquipmentTreasureRow[]>();
  for (const row of all.map(treasureFromSql)) { const table = tables.get(row.treasureType) ?? []; table.push(row); tables.set(row.treasureType, table); }
  for (const [type, rows] of tables) {
    const properties = rows.filter(r => r.weenieClassId).map(r => item(r.weenieClassId));
    const base = input(properties, { wieldedTreasureType: type, treasure: rows });
    for (let seed = 0; seed < 20; seed++) run(base, seeded(seed));
  }
  assert.ok(tables.size > 0);
});

test('invalid RNG, duplicate IDs and excessive recursion fail; ACE terminal markers are not errors', () => {
  const base = input([item(1)]);
  for (const n of [-1, 1, NaN, Infinity]) assert.equal(selectInitialEquipment(base, () => n).status, 'unsupported');
  assert.equal(selectInitialEquipment({ ...base, createList: [create(1), create(1)] }, () => 0).status, 'unsupported');
  const emptySubset = run({ ...base, wieldedTreasureType: 1, treasure: [treasure(1, { hasSubSet: true })] });
  assert.deepEqual(ids(emptySubset), [1]); assert.equal(emptySubset.randomDraws, 3);
  const earlyReturn = run({ ...base, wieldedTreasureType: 1, treasure: [treasure(1, { continuesPreviousSet: true })] });
  assert.deepEqual(ids(earlyReturn), []); assert.ok(earlyReturn.diagnostics.some(d => d.code === 'treasure-root-return'));
  const deep = Array.from({ length: 66 }, (_, i) => treasure(i + 1, { weenieClassId: 0, hasSubSet: i < 65 }));
  const result = selectInitialEquipment({ ...base, wieldedTreasureType: 1, treasure: deep }, () => 0);
  assert.equal(result.status, 'unsupported'); assert.ok(result.diagnostics.some(d => d.code === 'subset-depth'));
});
