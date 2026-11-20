/** Conservative offline initial-spawn subset of ACE WorldObject_Links,
 * WorldObject_Generators and Entity/GeneratorProfile. No clock or physics.
 * All initial profiles are assumed available; RNG is deterministic, not .NET's.
 * Unsupported profiles consume their slots but never become guessed placements.
 */
export interface SpawnFrame {
  cell: number;
  originX: number; originY: number; originZ: number;
  quatW: number; quatX: number; quatY: number; quatZ: number;
}
export interface SpawnPlacement extends SpawnFrame {
  classId: number;
  /** Only authored world links retain a GUID; generator-created objects do not. */
  guid?: number;
}
export interface SpawnProfile extends SpawnFrame {
  classId: number;
  probability: number;
  init: number;
  max: number;
  where: number;
  /** Appearance overrides need palette-template resolution, not raw palette DIDs. */
  appearanceOverride?: boolean;
}
export interface SpawnClass {
  profiles: readonly SpawnProfile[];
  init: number;
  max: number;
  gated?: boolean;
  generatorType?: number;
}
export const GENERATOR_LIMITS = { depth: 8, perGenerator: 256, perBlock: 4096, total: 100000 } as const;
export interface SpawnGraph {
  classes: ReadonlyMap<number, SpawnClass>;
  links: ReadonlyMap<number, readonly SpawnPlacement[]>;
}

export type SpawnMode = "treasure" | "specific" | "scatter" | "contain" | "shop" | "default" | "unsupported";

/** ACE.Server/Entity/GeneratorProfile.cs, Spawn(): Treasure changes object
 * creation (IDs are tables, never WCIDs), then placement dispatch is
 * Specific > Scatter > Contain > Shop > default. Testing flags in this order
 * matters: Specific|Contain is a world placement, not container inventory.
 * Surprising but source-faithful: Spawn() has NO Wield branch, so Wield alone
 * calls Spawn_Default, like Undef/OnTop. Do not infer inventory from its name.
 * Unknown bits are rejected rather than guessing an unverified dispatch.
 * Source closure shares this helper: an exact where===Specific check would
 * omit nested generator classes reached by combined flags or default modes;
 * admitting Treasure would instead query table IDs as unrelated WCIDs.
 */
export function classifySpawnMode(where: number): SpawnMode {
  if (!Number.isInteger(where) || where < 0 || where > 0x7f) return "unsupported";
  if (where & 64) return "treasure";
  if (where & 4) return "specific";
  if (where & 2) return "scatter";
  if (where & 8) return "contain";
  if (where & 32) return "shop";
  return "default";
}

export const DEFAULT_SPAWN_SEED = 0;
export interface SpawnRandomOptions {
  seed?: number;
  /** Override the seeded streams for boundary tests; each draw must be in [0, 1). */
  random?: () => number;
}

function validateSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("invalid spawn seed: expected uint32");
}

/** Seeded FNV-1a over UTF-16 code units, used to isolate root/path streams.
 * This hash and the PRNG below are our reproducible offline convention, not
 * ACE/.NET Random (ACE uses thread-local new Random(), without a fixed seed).
 */
export function hashSpawnSeed(identity: string, seed = DEFAULT_SPAWN_SEED): number {
  validateSeed(seed);
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 0x01000193) >>> 0;
  return hash;
}

/** Mulberry32: uint32 state, yielding a double in [0, 1), including seed zero. */
export function createSpawnRandom(seed = DEFAULT_SPAWN_SEED): () => number {
  validateSeed(seed);
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function placementIdentity(p: SpawnPlacement): string {
  return JSON.stringify([p.guid ?? null, p.classId, p.cell, p.originX, p.originY, p.originZ,
    p.quatW, p.quatX, p.quatY, p.quatZ]);
}

/** ACE default use_generator_rotation_offset=true; q = profile * parent. */
export function specificSpawnFrame(parent: SpawnFrame, profile: SpawnFrame, relative: boolean): SpawnFrame | undefined {
  if (profile.cell !== 0) {
    if ((profile.cell >>> 16) !== (parent.cell >>> 16)) return undefined;
    const { cell, originX, originY, originZ, quatW, quatX, quatY, quatZ } = profile;
    return { cell, originX, originY, originZ, quatW, quatX, quatY, quatZ };
  }
  const x = parent.quatX, y = parent.quatY, z = parent.quatZ, w = parent.quatW;
  const a = profile.originX, b = profile.originY, c = profile.originZ;
  // System.Numerics.Vector3.Transform, including its non-normalizing behavior.
  const originX = parent.originX + (1 - 2*y*y - 2*z*z)*a + (2*x*y - 2*z*w)*b + (2*x*z + 2*y*w)*c;
  const originY = parent.originY + (2*x*y + 2*z*w)*a + (1 - 2*x*x - 2*z*z)*b + (2*y*z - 2*x*w)*c;
  const originZ = parent.originZ + (2*x*z - 2*y*w)*a + (2*y*z + 2*x*w)*b + (1 - 2*x*x - 2*y*y)*c;
  const p = profile;
  const rotation = relative ? {
    quatW: p.quatW*w - p.quatX*x - p.quatY*y - p.quatZ*z,
    quatX: p.quatW*x + p.quatX*w + p.quatY*z - p.quatZ*y,
    quatY: p.quatW*y - p.quatX*z + p.quatY*w + p.quatZ*x,
    quatZ: p.quatW*z + p.quatX*y - p.quatY*x + p.quatZ*w,
  } : { quatW: p.quatW, quatX: p.quatX, quatY: p.quatY, quatZ: p.quatZ };
  // Outdoor offsets crossing the block boundary would fail ACE VerifyLandblock.
  if ((parent.cell & 0xffff) < 0x100 && (originX < 0 || originX >= 192 || originY < 0 || originY >= 192)) return undefined;
  return { cell: parent.cell, originX, originY, originZ, ...rotation };
}

export function resolveGeneratorSpawns(roots: readonly SpawnPlacement[], graph: SpawnGraph,
  limits: { depth: number; perGenerator: number; perBlock: number; total: number } = GENERATOR_LIMITS,
  options: SpawnRandomOptions = {},
): { placements: SpawnPlacement[]; skipped: Record<string, number> } {
  const seed = options.seed ?? DEFAULT_SPAWN_SEED;
  validateSeed(seed);
  for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid generator limit");
  const placements: SpawnPlacement[] = [];
  const skipped: Record<string, number> = {};
  const counts = new Map<number, number>();
  const note = (reason: string) => { skipped[reason] = (skipped[reason] ?? 0) + 1; };
  const emit = (p: SpawnPlacement): boolean => {
    const block = p.cell >>> 16;
    if (placements.length >= limits.total) { note("total-cap"); return false; }
    if ((counts.get(block) ?? 0) >= limits.perBlock) { note("block-cap"); return false; }
    counts.set(block, (counts.get(block) ?? 0) + 1);
    placements.push(p);
    return true;
  };
  const visit = (parent: SpawnPlacement, depth: number, ancestors: ReadonlySet<string>, streamPath: string) => {
    const cls = graph.classes.get(parent.classId);
    const links = parent.guid === undefined ? [] : graph.links.get(parent.guid) ?? [];
    if (!cls?.profiles.length && !links.length) return;
    const key = parent.guid === undefined ? `class:${parent.classId}` : `guid:${parent.guid}`;
    if (ancestors.has(key)) { note("cycle"); return; }
    if (depth >= limits.depth) { note("depth-cap"); return; }
    const path = new Set(ancestors).add(key);
    if (!cls?.profiles.length) {
      for (const [index, child] of links.entries()) {
        if ((child.cell >>> 16) !== (parent.cell >>> 16)) { note("cross-block-link"); continue; }
        const childKey = `guid:${child.guid}`;
        if (path.has(childKey)) { note("cycle"); continue; }
        if (emit({ ...child })) visit(child, depth + 1, path, `${streamPath}/link:${index}:${placementIdentity(child)}`);
      }
      return;
    }
    if (cls.gated) { note("gated-generator"); return; }
    // Track generator classes as well as authored GUIDs: a fresh dynamic GUID
    // would otherwise disguise a class-to-itself generator cycle.
    path.add(`class:${parent.classId}`);
    // ACE WorldObject_Generators.InitializeGenerator repairs any max below a
    // positive init (including a negative max). Normalize before rejecting
    // remaining negative budgets; otherwise valid bounded parents disappear.
    let init = cls.init;
    let max = init > 0 ? Math.max(cls.max, init) : cls.max;
    if (init < 0 || max < 0) { note("unbounded-count"); return; }
    const profiles = cls.profiles.map(p => ({ ...p, probability: Math.fround(p.probability) }));
    const template = profiles[0];
    for (const link of links) {
      profiles.push({ ...template, ...link, appearanceOverride: false });
      if (template.probability === -1) { init += template.init; max += template.max; }
    }
    const active = profiles.filter(p => p.classId !== 3666 && p.max !== 0);
    if (init < 0 || max < 0) { note("unbounded-count"); return; }
    if (profiles.some(p => p.init < -1 || p.max < -1)) { note("invalid-profile-count"); return; }
    let used = 0;
    const created = new Map<SpawnProfile, number>();
    const isMaxed = (p: SpawnProfile) => p.max !== -1 && (created.get(p) ?? 0) >= p.max;
    // GetTotalProbability / GetAdjustedProbability: ordered cumulative
    // differences, resetting on decreases. Even maxed rows advance lastProbability.
    // Placeholders participate here (according to max), but never in selection.
    const probabilityThrough = (end: number, total: boolean): number => {
      let sum = 0, last = 0;
      for (let i = 0; i <= end; i++) {
        const p = profiles[i], probability = p.probability;
        if (probability === -1) {
          if (total && !isMaxed(p)) return 1;
          continue;
        }
        if (!isMaxed(p)) {
          if (last > probability) last = 0;
          sum = Math.fround(sum + Math.fround(probability - last));
        }
        last = probability;
      }
      return sum;
    };
    const random = options.random ?? createSpawnRandom(hashSpawnSeed(streamPath, seed));
    // ACE repeats selection until the parent's initial budget is reached;
    // each selection can enqueue init_Create, clamped by max, not parent init.
    // Its guard is checked after ++genLoopCount > 1000 (1001 attempts).
    let attempts = 0;
    while (used < init && used < max && active.some(p => !isMaxed(p))) {
      if (attempts++ > 1000) { note("selection-attempt-cap"); break; }
      const roll = random();
      if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error("invalid spawn random: expected [0, 1)");
      // ACE Next(float, float) scales NextDouble in double precision.
      const rng = roll * probabilityThrough(profiles.length - 1, true);
      for (const [index, p] of profiles.entries()) {
        if (p.classId === 3666 || isMaxed(p)) continue;
        // ACE.Server/WorldObjects/WorldObject_Generators.cs, SelectAProfile():
        // normalize Treasure before the probability check/enqueue, including
        // rows not ultimately selected. Do this after drawing, as ACE does.
        // Although we cannot render treasure, its queue still uses parent
        // slots: leaving init/max >1 would steal slots from supported sibling
        // profiles, while skipping treasure entirely would grant extra slots.
        if (p.where & 64) {
          if (p.init > 1) p.init = 1;
          if (p.max > 1) p.max = 1;
        }
        const probability = p.probability === -1 ? -1 : probabilityThrough(index, false);
        if (probability !== -1 && !(rng < probability)) continue;
        // ACE.Server/WorldObjects/WorldObject_Generators.cs,
        // GetSpawnObjectsForProfile(): either -1 sentinel explicitly produces
        // ONE per selection, not a negative batch or an infinite batch. With
        // max=-1, GeneratorProfile.IsMaxed never saturates the row; repeated
        // selections still spend finite parent slots and obey our hard caps.
        const batch = p.init === -1 || p.max === -1 ? 1 : p.init;
        const remaining = p.max === -1 ? Infinity : p.max - (created.get(p) ?? 0);
        const count = Math.min(batch, remaining, max - used);
        // A selected random row ends this roll even if init_Create is zero.
        if (count <= 0) { if (p.probability !== -1) break; else continue; }
        const firstOrdinal = created.get(p) ?? 0;
        const bounded = Math.min(count, limits.perGenerator - used);
        if (bounded < count) note("generator-cap");
        created.set(p, (created.get(p) ?? 0) + count);
        used += count;
        let frame: SpawnFrame | undefined;
        const mode = classifySpawnMode(p.where);
        if (mode === "treasure" || mode === "contain" || mode === "shop") note("inventory-or-treasure");
        else if (mode === "scatter" || mode === "unsupported") note("unsupported-location-mode");
        else if (p.appearanceOverride) note("appearance-override");
        else if (mode === "specific") {
          frame = specificSpawnFrame(parent, p, cls.generatorType === 1);
          if (!frame) note("cross-block-placement");
        } else {
          // ACE.Server/Entity/GeneratorProfile.cs, Spawn_Default() constructs
          // new Position(Generator.Location); applying profile offsets here
          // would invent a position ACE never uses. Copy only that frame, not
          // the parent's GUID: this is a newly generated object, not a link.
          const { cell, originX, originY, originZ, quatW, quatX, quatY, quatZ } = parent;
          frame = { cell, originX, originY, originZ, quatW, quatX, quatY, quatZ };
        }
        if (frame) {
          if (path.has(`class:${p.classId}`)) note("cycle");
          else for (let i = 0; i < bounded; i++) {
            const child = { ...frame, classId: p.classId };
            if (emit(child)) visit(child, depth + 1, path, `${streamPath}/profile:${index}/spawn:${firstOrdinal + i}`);
          }
        }
        if (used >= limits.perGenerator) { if (used < init) note("generator-cap"); return; }
        if (p.probability !== -1 || used >= init || used >= max) break;
      }
      // A null roll is not exhaustion: mixed guaranteed/random tables and
      // placeholders can leave gaps. Retry until stopped or the ACE guard fires.
    }
  };
  for (const root of roots) {
    if (placements.length >= limits.total) { note("total-cap"); break; }
    // Independent of root traversal order / block subset, except shared output
    // caps. Recursive profile indices and spawn ordinals separate siblings.
    visit(root, 0, new Set(), placementIdentity(root));
  }
  return { placements, skipped };
}
