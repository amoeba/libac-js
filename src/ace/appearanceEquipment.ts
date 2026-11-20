/** Pure, placement-local ACE initial equipment selection. See research/npc-equipment-selection.md. */
export interface EquipmentCreateRow {
  id: number;
  /** Captured ACE insertion ordinal. Defaults to SQL primary-key order, NOT caller array order. */
  sourceOrder?: number;
  destinationType: number;
  weenieClassId: number;
  stackSize: number;
  palette: number;
  shade: number;
}
export interface EquipmentTreasureRow {
  id: number;
  sourceOrder?: number;
  treasureType: number;
  weenieClassId: number;
  paletteId: number;
  shade: number;
  stackSize: number;
  stackSizeVariance: number;
  probability: number;
  setStart: boolean;
  hasSubSet: boolean;
  continuesPreviousSet: boolean;
  unknown1?: number;
  unknown3?: number;
  unknown4?: number;
  unknown5?: number;
  unknown9?: number;
  unknown10?: number;
  unknown11?: number;
  unknown12?: number;
}
export interface EquipmentItemProperties {
  weenieClassId: number;
  weenieType: number;
  itemType?: number | null;
  validLocations?: number | null;
  clothingPriority?: number | null;
  armorLevel?: number | null;
  paletteTemplate?: number | null;
  shade?: number | null;
  shade2?: number | null;
  shade3?: number | null;
  shade4?: number | null;
  defaultCombatStyle?: number | null;
  weaponSkill?: number | null;
  ammoType?: number | null;
  combatUse?: number | null;
  autoWieldLeft?: boolean;
  stackSize?: number | null;
  /** Derive from WeenieType.Container (21) OR PropertyBool.RequiresBackpackSlot (81). */
  useBackpackSlot?: boolean;
  /** True for item initialization not represented here, e.g. a populated side pack. */
  hasInitialInventory?: boolean;
}
export interface EquipmentSelectionInput {
  createList: readonly EquipmentCreateRow[];
  wieldedTreasureType?: number | null;
  /** Complete rows for the referenced table; empty array means a known empty table. */
  treasure: readonly EquipmentTreasureRow[];
  items: ReadonlyMap<number, EquipmentItemProperties>;
  creature?: {
    attackable?: boolean;
    targetingTactic?: number;
    aiAllowedCombatStyle?: number;
    itemCapacity?: number;
    containerCapacity?: number;
  };
  trophyDropRate?: number;
}
export interface SelectedEquipmentItem extends EquipmentItemProperties {
  instanceId: string;
  source: { kind: 'create-list' | 'wielded-treasure'; rowId: number };
  currentWieldedLocation: number;
}
export interface EquipmentDiagnostic {
  code: string; message: string; rowId?: number;
  itemClassId?: number; source?: 'create-list' | 'wielded-treasure';
}
export type EquipmentSelection = {
  status: 'ok' | 'unsupported';
  selected: SelectedEquipmentItem[];
  diagnostics: EquipmentDiagnostic[];
  randomDraws: number;
};
export const EQUIPMENT_LIMITS = { rows: 10_000, subsetDepth: 64, instances: 20_000 } as const;
/** ACE.Entity/Enum/DestinationType.cs: Treasure=8, Shop=4 (not the other way around). */
export const EquipmentDestination = { Contain: 1, Wield: 2, Treasure: 8, Shop: 4 } as const;
export const EquipmentMask = {
  HeadWear: 1, ChestWear: 2, UpperArmWear: 8, LowerArmWear: 16, HandWear: 32,
  UpperLegWear: 64, LowerLegWear: 128, FootWear: 256, ChestArmor: 512,
  AbdomenArmor: 1024, UpperArmArmor: 2048, LowerArmArmor: 4096,
  UpperLegArmor: 8192, LowerLegArmor: 16384, MeleeWeapon: 0x100000,
  Shield: 0x200000, MissileWeapon: 0x400000, MissileAmmo: 0x800000,
  Held: 0x1000000, TwoHanded: 0x2000000, Cloak: 0x8000000,
} as const;
const M = EquipmentMask;
const SELECTABLE = M.MeleeWeapon | M.Shield | M.MissileWeapon | M.Held | M.TwoHanded;
const WEAPON_TYPES = new Set([3, 4, 6, 35]);
const UNKNOWN_KEYS = ['unknown1', 'unknown3', 'unknown4', 'unknown5', 'unknown9', 'unknown10', 'unknown11', 'unknown12'] as const;
const f32 = Math.fround;
class Unsupported extends Error {
  constructor(readonly code: string, message: string, readonly rowId?: number) { super(message); }
}
function requireInput(ok: boolean, message: string, rowId?: number): asserts ok {
  if (!ok) throw new Unsupported('invalid-input', message, rowId);
}
function ordered<T extends { id: number; sourceOrder?: number }>(rows: readonly T[]): T[] {
  requireInput(rows.length <= EQUIPMENT_LIMITS.rows, 'Row limit exceeded');
  const ids = new Set<number>();
  for (const row of rows) {
    requireInput(Number.isSafeInteger(row.id) && row.id >= 0 && !ids.has(row.id), 'Invalid or duplicate row id', row.id);
    requireInput(row.sourceOrder == null || Number.isSafeInteger(row.sourceOrder), 'Invalid source ordinal', row.id);
    ids.add(row.id);
  }
  // JS sort is stable: equal explicit ordinals preserve real caller insertion order.
  return [...rows].sort((a, b) => (a.sourceOrder ?? a.id) - (b.sourceOrder ?? b.id));
}
function popCount(value: number): number {
  let n = value >>> 0, count = 0;
  while (n) { n &= n - 1; count++; }
  return count;
}

/** .NET List<T>.Sort + Reverse, not JS stable-sort + descending comparator.
 * ACE runs this twice for armor; reversing equal runs is observable even below 17 items.
 * Introsort above that threshold also intentionally preserves .NET's tie permutations.
 */
function aceSort<T>(a: T[], compare: (a: T, b: T) => number): void {
  const swap = (i: number, j: number) => { [a[i], a[j]] = [a[j], a[i]]; };
  const swapIfGreater = (i: number, j: number) => { if (i !== j && compare(a[i], a[j]) > 0) swap(i, j); };
  const downHeap = (i: number, n: number, lo: number) => {
    const d = a[lo + i - 1];
    while (i <= Math.floor(n / 2)) {
      let child = 2 * i;
      if (child < n && compare(a[lo + child - 1], a[lo + child]) < 0) child++;
      if (compare(d, a[lo + child - 1]) >= 0) break;
      a[lo + i - 1] = a[lo + child - 1]; i = child;
    }
    a[lo + i - 1] = d;
  };
  const intro = (lo: number, hi: number, depth: number): void => {
    while (hi > lo) {
      const size = hi - lo + 1;
      if (size <= 16) {
        if (size === 2) swapIfGreater(lo, hi);
        else if (size === 3) { swapIfGreater(lo, hi - 1); swapIfGreater(lo, hi); swapIfGreater(hi - 1, hi); }
        else {
          for (let i = lo; i < hi; i++) {
            const t = a[i + 1]; let j = i;
            while (j >= lo && compare(t, a[j]) < 0) { a[j + 1] = a[j]; j--; }
            a[j + 1] = t;
          }
        }
        return;
      }
      if (depth === 0) {
        const n = size;
        for (let i = Math.floor(n / 2); i >= 1; i--) downHeap(i, n, lo);
        for (let i = n; i > 1; i--) { swap(lo, lo + i - 1); downHeap(1, i - 1, lo); }
        return;
      }
      depth--;
      const middle = lo + Math.floor((hi - lo) / 2);
      swapIfGreater(lo, middle); swapIfGreater(lo, hi); swapIfGreater(middle, hi);
      const pivot = a[middle]; swap(middle, hi - 1);
      let left = lo, right = hi - 1;
      while (true) {
        do { left++; } while (compare(a[left], pivot) < 0);
        do { right--; } while (compare(pivot, a[right]) < 0);
        if (left >= right) break;
        swap(left, right);
      }
      swap(left, hi - 1);
      intro(left + 1, hi, depth); hi = left - 1;
    }
  };
  if (a.length > 1) intro(0, a.length - 1, 2 * (Math.floor(Math.log2(a.length)) + 1));
  a.reverse();
}

interface Instance extends SelectedEquipmentItem { placementPosition: number | null }
/** .NET Dictionary enumeration visits entry slots; Remove/Add reuses its LIFO free list. */
class Inventory {
  private slots: (Instance | undefined)[] = [];
  private free: number[] = [];
  values(): Instance[] { return this.slots.filter((v): v is Instance => v !== undefined); }
  add(item: Instance): void {
    const index = this.free.pop() ?? this.slots.length;
    const pack = isPack(item);
    for (const other of this.values()) if (isPack(other) === pack) other.placementPosition = (other.placementPosition ?? 0) + 1;
    item.placementPosition = 0;
    this.slots[index] = item;
  }
  remove(item: Instance): boolean {
    const index = this.slots.indexOf(item);
    if (index < 0) return false;
    this.slots[index] = undefined; this.free.push(index);
    const position = item.placementPosition ?? 0;
    for (const other of this.values()) if (isPack(other) === isPack(item) && (other.placementPosition ?? 0) > position) other.placementPosition!--;
    item.placementPosition = null;
    return true;
  }
}
function isPack(item: EquipmentItemProperties): boolean { return item.weenieType === 21 || !!item.useBackpackSlot; }
function parentLocation(item: EquipmentItemProperties, location: number): string | null {
  switch (location) {
    case M.MeleeWeapon: case M.Held: case M.TwoHanded: return 'right';
    case M.Shield: return item.itemType === 2 ? 'shield' : 'left-weapon';
    case M.MissileWeapon: return item.defaultCombatStyle === 16 || item.defaultCombatStyle === 32 ? 'left' : 'right';
    default: return null;
  }
}
function isLauncher(item: EquipmentItemProperties): boolean { return [16, 32, 1024].includes(item.defaultCombatStyle ?? 0); }
function isRanged(item: EquipmentItemProperties): boolean { return isLauncher(item) || item.defaultCombatStyle === 128; }

export function selectInitialEquipment(input: EquipmentSelectionInput, random: () => number): EquipmentSelection {
  const diagnostics: EquipmentDiagnostic[] = [];
  let randomDraws = 0;
  const draw = () => {
    const n = random(); randomDraws++;
    requireInput(Number.isFinite(n) && n >= 0 && n < 1, 'RNG must return finite values in [0,1)');
    return n;
  };
  const integer = (min: number, max: number) => min + Math.floor(draw() * (max - min + 1));
  const note = (code: string, message: string, rowId?: number,
    details: Pick<EquipmentDiagnostic, 'itemClassId' | 'source'> = {}) =>
    diagnostics.push({ code, message, ...(rowId == null ? {} : { rowId }), ...details });
  try {
    if ((input.trophyDropRate ?? 1) !== 1) throw new Unsupported('trophy-drop-rate', 'Nondefault server trophy_drop_rate is not modeled');
    const createRows = ordered(input.createList).filter(row => (row.destinationType & 2) !== 0);
    const treasureRows = ordered(input.treasure.filter(row => row.treasureType === input.wieldedTreasureType));
    for (const row of createRows) {
      requireInput(Number.isInteger(row.destinationType) && row.destinationType >= 0 && row.destinationType <= 63, 'Unknown destination bits', row.id);
      // Real source rows include -1 and 14. ACE neither clamps color shades nor normalizes these weights.
      requireInput(Number.isFinite(f32(row.shade)), 'Nonfinite create-list shade/probability', row.id);
    }
    for (const row of treasureRows) {
      requireInput(Number.isFinite(row.probability) && row.probability >= 0 && row.probability <= 1, 'Invalid treasure probability', row.id);
      requireInput(Number.isFinite(row.shade) && row.shade >= 0 && row.shade <= 1, 'Invalid treasure shade', row.id);
      requireInput(Number.isFinite(row.stackSizeVariance) && row.stackSizeVariance >= 0 && row.stackSizeVariance <= 1, 'Invalid stack variance', row.id);
      requireInput(typeof row.setStart === 'boolean' && typeof row.hasSubSet === 'boolean' && typeof row.continuesPreviousSet === 'boolean', 'Treasure flags must be booleans', row.id);
      if (UNKNOWN_KEYS.some(key => (row[key] ?? 0) !== 0)) throw new Unsupported('unknown-treasure-fields', 'Nonzero unknown treasure fields', row.id);
    }
    const creature = input.creature ?? {};
    for (const capacity of [creature.itemCapacity ?? 0, creature.containerCapacity ?? 0]) requireInput(Number.isInteger(capacity) && capacity >= -0x80000000 && capacity <= 0x7fffffff, 'Inventory capacity must be a SQL int');
    // ACE casts nullable PropertyInt capacities to byte (notably SQL -1 becomes 255).
    const itemCapacity = (creature.itemCapacity ?? 0) & 255;
    const containerCapacity = (creature.containerCapacity ?? 0) & 255;
    const npc = creature.attackable === false && (creature.targetingTactic ?? 0) === 0;
    const inventory = new Inventory();
    const equipped: Instance[] = [];
    let generated = 0;
    const instantiate = (row: EquipmentCreateRow | EquipmentTreasureRow, kind: 'create-list' | 'wielded-treasure'): Instance | undefined => {
      if (row.weenieClassId === 0) { note('none-row', 'Selected explicit no-item row', row.id); return; }
      const template = input.items.get(row.weenieClassId);
      // ACE CreateNewWorldObject returns null for an absent WCID; both wield-list
      // and wielded-treasure callers skip it and continue the remaining selection.
      if (!template) {
        note('missing-template', `ACE skips missing item template ${row.weenieClassId}`, row.id,
          { itemClassId: row.weenieClassId, source: kind });
        return;
      }
      if (template.weenieType === 0) { note('uncreatable-template', 'ACE Undef item is not created', row.id); return; }
      if (template.hasInitialInventory || [10, 12, 15, 69, 71].includes(template.weenieType)) throw new Unsupported('item-initial-inventory', `Generated template ${row.weenieClassId} has unmodeled nested initialization`, row.id);
      requireInput(template.weenieClassId === row.weenieClassId, 'Template map key mismatch', row.id);
      requireInput(template.validLocations == null || (Number.isInteger(template.validLocations) && template.validLocations >= -0x80000000 && template.validLocations <= 0xffffffff), 'Invalid equip mask', row.id);
      requireInput(Number.isInteger(row.stackSize) && Number.isInteger('palette' in row ? row.palette : row.paletteId), 'Invalid stack/palette', row.id);
      if (++generated > EQUIPMENT_LIMITS.instances) throw new Unsupported('instance-limit', 'Generated instance bound exceeded');
      const item: Instance = { ...template, instanceId: `${kind}:${row.id}`, source: { kind, rowId: row.id }, currentWieldedLocation: 0, placementPosition: null };
      if (kind === 'create-list') {
        const r = row as EquipmentCreateRow;
        if (r.palette > 0) item.paletteTemplate = r.palette;
        // Unlike treasure rows, non-Treasure create entries override shade EVEN at zero.
        if ((r.destinationType & EquipmentDestination.Treasure) === 0) item.shade = f32(r.shade);
        if (r.stackSize > 1) item.stackSize = r.stackSize;
      } else {
        const r = row as EquipmentTreasureRow;
        if (r.paletteId > 0) item.paletteTemplate = r.paletteId;
        if (r.shade > 0) item.shade = f32(r.shade);
        if (r.stackSize > 0) {
          const variance = f32(r.stackSizeVariance);
          const min = Math.max(1, Math.floor(f32(r.stackSize * f32(1 - variance)) + 0.5));
          item.stackSize = variance > 0 ? integer(min, r.stackSize) : r.stackSize;
        }
      }
      return item;
    };
    const add = (item: Instance | undefined) => {
      if (!item) return;
      const pack = isPack(item);
      const count = inventory.values().filter(other => isPack(other) === pack).length;
      const capacity = pack ? containerCapacity : itemCapacity;
      if (count >= capacity) {
        if (!pack && inventory.values().some(other => other.weenieType === 21)) throw new Unsupported('side-pack-overflow', 'Side-pack overflow routing is not modeled', item.source.rowId);
        note('inventory-full', 'ACE destroys generated item: no inventory capacity', item.source.rowId); return;
      }
      inventory.add(item);
    };
    const equip = (item: Instance): boolean => {
      const location = item.validLocations ?? 0;
      const parent = parentLocation(item, location);
      const conflict = equipped.some(other => parent !== null
        ? parentLocation(other, other.currentWieldedLocation) === parent && other.currentWieldedLocation !== M.MissileAmmo
        : item.weenieType === 2
          ? ((other.clothingPriority ?? 0) & (item.clothingPriority ?? 0)) !== 0
          : (other.currentWieldedLocation & location) !== 0);
      if (conflict) { note('equip-conflict', 'ACE wield location/coverage is occupied', item.source.rowId); return false; }
      item.currentWieldedLocation = location >>> 0;
      if (!equipped.includes(item)) equipped.push(item);
      return true;
    };
    const shuffle = (items: Instance[]) => {
      for (let n = items.length - 1; n > 0; n--) { const k = integer(0, n); [items[k], items[n]] = [items[n], items[k]]; }
    };
    const findWeapon = (items: Instance[]) => { shuffle(items); return items.find(item => !item.autoWieldLeft); };
    const equipmentPass = () => {
      // GetInventoryItemsOfTypeWeenieType orders by PlacementPosition (new insertions at zero).
      const clothingInventory = () => inventory.values().filter(i => i.weenieType === 2).sort((a, b) => (a.placementPosition ?? 0) - (b.placementPosition ?? 0));
      const clothing = clothingInventory().filter(i => ((i.clothingPriority ?? 0) & 0x7e) !== 0 || ((i.validLocations ?? 0) & M.Cloak) !== 0);
      aceSort(clothing, (a, b) => popCount(a.validLocations ?? 0) - popCount(b.validLocations ?? 0));
      const pants = clothing.find(i => ((i.clothingPriority ?? 0) & 0x6) !== 0);
      const shirt = clothing.find(i => ((i.clothingPriority ?? 0) & 0x68) !== 0);
      const cloak = clothing.find(i => ((i.validLocations ?? 0) & M.Cloak) !== 0);
      for (const item of [pants, shirt, cloak]) if (item) { inventory.remove(item); equip(item); }
      const armor = clothingInventory().filter(i => ((i.clothingPriority ?? 0) & 0x1ff00) !== 0);
      aceSort(armor, (a, b) => popCount(a.validLocations ?? 0) - popCount(b.validLocations ?? 0));
      aceSort(armor, (a, b) => (a.armorLevel ?? 0) - (b.armorLevel ?? 0));
      const slots = [M.HeadWear, M.ChestArmor | M.ChestWear, M.UpperArmArmor | M.UpperArmWear,
        M.LowerArmArmor | M.LowerArmWear, M.HandWear, M.UpperLegArmor | M.UpperLegWear,
        M.AbdomenArmor, M.LowerLegArmor | M.LowerLegWear, M.FootWear];
      // Lists are snapshots; duplicate attempts and removal of failed candidates are ACE behavior.
      for (const item of slots.flatMap(mask => armor.filter(i => ((i.validLocations ?? 0) & mask) !== 0))) { inventory.remove(item); equip(item); }
      const allWeapons: Instance[] = [], ammo: Instance[] = [];
      for (const item of inventory.values()) {
        if (WEAPON_TYPES.has(item.weenieType)) allWeapons.push(item);
        else if (item.weenieType === 5) ammo.push(item);
        else if (npc && ((item.validLocations ?? 0) & SELECTABLE) !== 0) allWeapons.push(item);
      }
      let weapons: Instance[] = [];
      while (allWeapons.length) {
        const weapon = findWeapon(allWeapons);
        if (!weapon) break;
        if (isLauncher(weapon)) {
          const currentAmmo = findWeapon(ammo.filter(i => (i.ammoType ?? null) === (weapon.ammoType ?? null)));
          if (!currentAmmo && !npc) { allWeapons.splice(allWeapons.indexOf(weapon), 1); continue; }
          weapons = currentAmmo ? [weapon, currentAmmo] : [weapon]; break;
        }
        weapons = [weapon];
        if (((creature.aiAllowedCombatStyle ?? 0) & 256) !== 0 && weapon.weenieType === 6 && weapon.weaponSkill !== 41) {
          const left = allWeapons.find(i => i.autoWieldLeft); if (left) weapons.push(left);
        }
        break;
      }
      const shields = inventory.values().filter(i => i.combatUse === 4);
      // Shield RNG is consumed even when the selected ranged weapon suppresses it.
      const shield = shields.length ? shields[integer(0, shields.length - 1)] : undefined;
      if (shield && (!weapons.length || !isRanged(weapons[0]))) weapons.push(shield);
      for (const item of weapons) {
        if (item.validLocations == null || !inventory.remove(item)) continue;
        if (!equip(item)) add(item);
      }
    };
    // CreateListSelect always consumes an initial draw, including an empty list.
    let rng = draw(), probability = 0, rolled = false;
    for (const row of createRows) {
      if ((row.destinationType & EquipmentDestination.Treasure) !== 0 && row.shade !== 0) {
        if (probability >= 1) { probability = 0; rng = draw(); rolled = false; }
        probability = f32(probability + f32(row.shade));
        if (rolled || rng >= probability) continue;
        rolled = true;
      }
      add(instantiate(row, 'create-list'));
    }
    equipmentPass();
    if (input.wieldedTreasureType != null) {
      let index = 0;
      const generatedTreasure: Instance[] = [];
      const visit = (skip: boolean, depth: number): void => {
        if (depth > EQUIPMENT_LIMITS.subsetDepth) throw new Unsupported('subset-depth', 'Treasure subset recursion bound exceeded', treasureRows[index]?.id);
        let rng = draw(), probability = 0, rolled = false, continued = false;
        for (; index < treasureRows.length; index++) {
          const row = treasureRows[index];
          if (row.continuesPreviousSet) {
            if (!continued) {
              // ACE returns even at root depth; some shipped tables deliberately end this way.
              if (depth === 0) note('treasure-root-return', 'ACE stops the table at an unowned continuation', row.id);
              index--; return;
            }
            continued = false;
          }
          let skipNext = true;
          if (!skip) {
            if (row.setStart || probability >= 1) { rng = draw(); probability = 0; rolled = false; }
            probability = f32(probability + f32(row.probability));
            if (rng < probability && !rolled) {
              rolled = true; skipNext = false;
              const item = instantiate(row, 'wielded-treasure'); if (item) generatedTreasure.push(item);
            }
          }
          if (row.hasSubSet) {
            // A terminal HasSubSet is an empty subset, but still consumes its entry RNG draw.
            index++; visit(skipNext, depth + 1); continued = true;
          }
        }
      };
      visit(false, 0);
      for (const item of generatedTreasure) add(item);
    }
    equipmentPass();
    return { status: 'ok', selected: equipped.map(({ placementPosition: _, ...item }) => item), diagnostics, randomDraws };
  } catch (error) {
    if (!(error instanceof Unsupported)) throw error;
    note(error.code, error.message, error.rowId);
    return { status: 'unsupported', selected: [], diagnostics, randomDraws };
  }
}
