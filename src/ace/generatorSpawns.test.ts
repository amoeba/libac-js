import assert from "node:assert";
import { DEFAULT_SPAWN_SEED, GENERATOR_LIMITS, classifySpawnMode, createSpawnRandom, hashSpawnSeed, resolveGeneratorSpawns, specificSpawnFrame, type SpawnClass, type SpawnFrame, type SpawnGraph, type SpawnPlacement, type SpawnProfile } from "./generatorSpawns.js";

const frame: SpawnFrame = { cell: 0xb34a0001, originX: 50, originY: 60, originZ: 7, quatW: 1, quatX: 0, quatY: 0, quatZ: 0 };
const root: SpawnPlacement = { ...frame, classId: 1, guid: 100 };
const profile = (patch: Partial<SpawnProfile> = {}): SpawnProfile => ({ ...frame, cell: 0, originX: 2, originY: 3, originZ: 4, classId: 2, probability: -1, init: 1, max: 1, where: 4, ...patch });
const cls = (profiles: SpawnProfile[], patch: Partial<SpawnClass> = {}): SpawnClass => ({ profiles, init: 1, max: 1, ...patch });
const graph = (c: SpawnClass, links: SpawnGraph["links"] = new Map()): SpawnGraph => ({ classes: new Map([[1, c]]), links });

test("Specific absolute frames require the same landblock", () => {
  const absolute = profile({ originX: 99, cell: frame.cell });
  assert.equal(specificSpawnFrame(frame, absolute, true)?.originX, 99);
  assert.equal(specificSpawnFrame(frame, { ...absolute, cell: 0xb34b0001 }, false), undefined);
});

test("Specific offsets use ACE default rotation and Relative orientation", () => {
  const s = Math.SQRT1_2;
  const parent = { ...frame, quatW: s, quatZ: s };
  const p = profile({ originX: 2, originY: 0, originZ: 1, quatW: s, quatX: s });
  const placed = specificSpawnFrame(parent, p, true)!;
  assert.ok(Math.abs(placed.originX - 50) < 1e-10);
  assert.ok(Math.abs(placed.originY - 62) < 1e-10);
  assert.equal(placed.originZ, 8);
  // profile X90 * parent Z90, deliberately noncommuting
  assert.ok(Math.abs(placed.quatY + 0.5) < 1e-10);
  assert.ok(Math.abs(placed.quatX - 0.5) < 1e-10);
  assert.equal(specificSpawnFrame(parent, p, false)?.quatX, s);
  assert.equal(specificSpawnFrame(frame, profile({ originX: 200 }), false), undefined);
});

test("generator outputs have no invented GUIDs; initial/max counts normalize and clamp", () => {
  const r = resolveGeneratorSpawns([root], graph(cls([profile({ init: 3, max: 5 })], { init: 4, max: 0 })));
  assert.equal(r.placements.length, 4);
  assert.ok(r.placements.every(p => p.guid === undefined));
  assert.equal(r.placements[0].originX, 52);
  assert.equal(resolveGeneratorSpawns([root], graph(cls([profile({ max: 0 })]))).placements.length, 0);
});

test("linked generator uses first template and placeholder does not spawn", () => {
  const child: SpawnPlacement = { ...frame, originX: 90, classId: 8, guid: 101 };
  const r = resolveGeneratorSpawns([root], graph(cls([profile({ classId: 3666, appearanceOverride: true })], { init: 0, max: 0 }), new Map([[100, [child]]])));
  assert.equal(r.placements.length, 1);
  assert.equal(r.placements[0].classId, 8);
  assert.equal(r.placements[0].originX, 90);
  assert.equal(r.placements[0].guid, undefined);
});

test("non-generator links are authored world objects and recurse, not inventory", () => {
  const a = { ...frame, classId: 9, guid: 101 };
  const b = { ...frame, classId: 10, guid: 102 };
  const r = resolveGeneratorSpawns([root], { classes: new Map(), links: new Map([[100, [a]], [101, [b]], [102, [root]]]) });
  assert.deepEqual(r.placements.map(p => p.guid), [101, 102]);
  assert.equal(r.skipped.cycle, 1);
});

test("unsupported modes are reported, not guessed", () => {
  for (const where of [2, 8, 32, 64, 68, 72, 128, 132, -1, 4.5]) {
    const r = resolveGeneratorSpawns([root], graph(cls([profile({ where })])));
    assert.equal(r.placements.length, 0, String(where));
    assert.ok(Object.keys(r.skipped).length > 0);
  }
  for (const c of [cls([profile()], { gated: true }), cls([profile({ appearanceOverride: true })]), cls([profile({ max: -2 })])]) {
    const r = resolveGeneratorSpawns([root], graph(c));
    assert.equal(r.placements.length, 0);
    assert.ok(Object.keys(r.skipped).length > 0);
  }
});

test("shared mode classification matches ACE flag precedence and output WCID eligibility", () => {
  // All combinations of known flags: Treasure changes creation before any
  // placement dispatch, and Wield is deliberately NOT an inventory branch.
  for (let where = 0; where <= 127; where++) {
    const expected = where & 64 ? "treasure" : where & 4 ? "specific" : where & 2 ? "scatter" :
      where & 8 ? "contain" : where & 32 ? "shop" : "default";
    assert.equal(classifySpawnMode(where), expected, String(where));
    const r = resolveGeneratorSpawns([root], graph(cls([profile({ where })])));
    assert.equal(r.placements.length, expected === "specific" || expected === "default" ? 1 : 0, String(where));
  }
  for (const where of [-1, 128, 132, 0x100000004, 4.5, NaN, Infinity]) {
    assert.equal(classifySpawnMode(where), "unsupported", String(where));
  }
  for (const where of [4 | 2, 4 | 8, 4 | 16 | 32, 4 | 2 | 8 | 32]) {
    const r = resolveGeneratorSpawns([root], graph(cls([profile({ where })])));
    assert.equal(r.placements[0].originX, frame.originX + 2);
    assert.deepEqual(r.skipped, {});
  }
  assert.equal(classifySpawnMode(2 | 8 | 32), "scatter");
  assert.equal(classifySpawnMode(8 | 32), "contain");
  assert.equal(classifySpawnMode(16 | 32), "shop");
});

test("default, OnTop and source-faithful Wield copy the parent frame exactly, without GUID", () => {
  const parent = { ...root, cell: 0xb34a0123, quatW: 0.5, quatX: -0.5, quatY: 0.5, quatZ: 0.5 };
  const { guid: _guid, classId: _classId, ...parentFrame } = parent;
  for (const where of [0, 1, 16, 1 | 16]) {
    const p = profile({ where, cell: 0xb34b0001, originX: 900, originY: -900, originZ: -50, quatW: 0 });
    const g = graph(cls([p], { generatorType: 1 }));
    const before = structuredClone({ parent, p });
    const r = resolveGeneratorSpawns([parent], g);
    assert.deepEqual(r.placements, [{ ...parentFrame, classId: 2 }]);
    assert.deepEqual(r.skipped, {});
    assert.deepEqual({ parent, p }, before);
    assert.notEqual(r.placements[0], parent);
  }
});

test("profile -1 sentinels enqueue one per selection, including init zero with unlimited max", () => {
  for (const patch of [{ init: -1, max: 5 }, { init: 5, max: -1 },
    { init: -1, max: -1 }, { init: 0, max: -1 }]) {
    const r = rolled(cls([profile(patch)], { init: 3, max: 3 }), [0, 0, 0]);
    assert.deepEqual(r.ids, [2, 2, 2]);
    assert.equal(r.draws, 3);
    assert.deepEqual(r.skipped, {});
    // A sentinel is not an init_Create batch allowed to overshoot parent init.
    assert.equal(rolled(cls([profile(patch)], { init: 1, max: 5 }), [0]).ids.length, 1);
  }
  assert.deepEqual(rolled(cls([profile({ init: -1, max: 0 })]), []).ids, []);
  // Finite max saturates; unlimited max never renormalizes out of the table.
  const finite = cls([profile({ probability: 0.3, init: -1, max: 2 }),
    profile({ probability: 1, classId: 3, max: -1 })], { init: 4, max: 4 });
  assert.deepEqual(rolled(finite, [0, 0, 0, 0]).ids, [2, 2, 3, 3]);
  const unlimited = { ...finite, profiles: finite.profiles.map(p => ({ ...p, max: -1 })) };
  assert.deepEqual(rolled(unlimited, [0, 0, 0.99, 0]).ids, [2, 2, 3, 2]);
});

test("Treasure normalizes counts before selection/enqueue and still consumes parent slots", () => {
  for (const where of [64, 64 | 4, 64 | 2, 64 | 8, 64 | 16]) {
    const treasure = profile({ where, init: 8, max: 9, classId: 999 });
    const c = cls([treasure, profile({ classId: 3, init: 5, max: 5 })], { init: 3, max: 3 });
    const before = structuredClone(c);
    const r = rolled(c, [0]);
    assert.deepEqual(r.ids, [3, 3]);
    assert.equal(r.skipped["inventory-or-treasure"], 1);
    assert.deepEqual(c, before); // normalization is per generator, not graph mutation
    assert.deepEqual(rolled(c, [0]), r);
  }
  // Once the normalized max=1 is consumed, subsequent random rolls select
  // the supported alternative. The treasure table ID is never emitted.
  const c = cls([profile({ where: 68, probability: 0.3, init: 8, max: 9, classId: 999 }),
    profile({ classId: 3, probability: 1, max: 5 })], { init: 3, max: 3 });
  assert.deepEqual(rolled(c, [0, 0, 0]).ids, [3, 3]);
  // max=-1 survives Treasure normalization and consumes one slot per roll.
  const unlimited = rolled(cls([profile({ where: 64, init: 8, max: -1 })], { init: 3, max: 3 }), [0, 0, 0]);
  assert.deepEqual(unlimited.ids, []);
  assert.equal(unlimited.skipped["inventory-or-treasure"], 3);
});

function rolled(c: SpawnClass, rolls: number[]) {
  let draws = 0;
  const result = resolveGeneratorSpawns([root], graph(c), GENERATOR_LIMITS, { random: () => {
    assert.ok(draws < rolls.length, "unexpected extra random draw");
    return rolls[draws++];
  } });
  return { ...result, draws, ids: result.placements.map(p => p.classId) };
}

const alternatives = () => [profile({ probability: 0.3 }), profile({ probability: 1, classId: 3 })];

test("ordered .3/1 cumulative differences use strict float32 boundaries, not independent weights", () => {
  const c = cls(alternatives());
  for (const roll of [0, 0.3, Math.fround(0.3) - Number.EPSILON]) assert.deepEqual(rolled(c, [roll]).ids, [2]);
  for (const roll of [Math.fround(0.3), 0.5, 1 - Number.EPSILON]) assert.deepEqual(rolled(c, [roll]).ids, [3]);
  assert.deepEqual(rolled(cls([profile({ probability: 0.3 })]), [0.99]).ids, [2]);
  const r = resolveGeneratorSpawns([root], graph(c));
  assert.equal(r.placements.length, 1);
  assert.equal(r.skipped["random-profile-selection"], undefined);
});

test("saturated profiles renormalize, but still advance lastProbability", () => {
  const ps = alternatives();
  ps[1].max = 2;
  assert.deepEqual(rolled(cls(ps, { init: 3, max: 3 }), [0, 0, 0.99]).ids, [2, 3, 3]);
  // The maxed .3 row leaves weights (.6-.3) and (1-.6), not .6 and .4.
  const c = cls([profile({ probability: 0.3, max: 0 }),
    profile({ probability: 0.6, classId: 3 }), profile({ probability: 1, classId: 4 })]);
  const a = Math.fround(Math.fround(0.6) - Math.fround(0.3));
  const total = Math.fround(a + Math.fround(1 - Math.fround(0.6)));
  assert.deepEqual(rolled(c, [a / total - Number.EPSILON]).ids, [3]);
  assert.deepEqual(rolled(c, [a / total]).ids, [4]);
  assert.deepEqual(rolled(c, [0.5]).ids, [4]);
});

test("decreases reset the cumulative baseline, including after maxed rows", () => {
  const c = cls([profile({ probability: 0.6 }), profile({ probability: 0.2, classId: 3 }),
    profile({ probability: 1, classId: 4 })]);
  const first = Math.fround(0.6);
  const second = Math.fround(first + Math.fround(0.2));
  const total = Math.fround(second + Math.fround(1 - Math.fround(0.2)));
  assert.deepEqual(rolled(c, [first / total - Number.EPSILON]).ids, [2]);
  assert.deepEqual(rolled(c, [first / total]).ids, [3]);
  assert.deepEqual(rolled(c, [second / total]).ids, [4]);
  const maxed = cls([profile({ probability: 0.8, max: 0 }), profile({ probability: 0.2, max: 0 }),
    profile({ probability: 0.5, classId: 3 }), profile({ probability: 1, classId: 4 })]);
  assert.deepEqual(rolled(maxed, [0.4]).ids, [4]);
  const resetAfterMax = cls([profile({ probability: 0.8, max: 0 }),
    profile({ probability: 0.2, classId: 3 }), profile({ probability: 1, classId: 4 })]);
  assert.deepEqual(rolled(resetAfterMax, [0.1]).ids, [3]);
  assert.deepEqual(rolled(resetAfterMax, [0.3]).ids, [4]);
});

test("guaranteed profiles force total 1 and process in order until random selection or parent init", () => {
  const c = cls([profile({ max: 2 }), profile({ probability: 0.3, classId: 3 }),
    profile({ classId: 4, max: 3 })], { init: 4, max: 4 });
  assert.deepEqual(rolled(c, [0.9, 0.2]).ids, [2, 4, 2, 3]);
  assert.deepEqual(rolled({ ...c, init: 1 }, [0.9]).ids, [2]);
  const randomFirst = cls([profile({ probability: 0.3 }), profile({ classId: 3 })]);
  assert.deepEqual(rolled(randomFirst, [0.2]).ids, [2]);
  assert.deepEqual(rolled(randomFirst, [0.8]).ids, [3]);
  // Selected batches clamp against parent max, not its smaller init budget.
  assert.equal(rolled(cls([profile({ init: 3, max: 4 })], { init: 1, max: 2 }), [0]).ids.length, 2);
});

test("null / zero-count rolls do not prematurely abort mixed guaranteed tables", () => {
  const c = cls([profile({ probability: 0.3, init: 0 }), profile({ classId: 3 })]);
  const r = rolled(c, [0, 0.9]);
  assert.deepEqual(r.ids, [3]);
  assert.equal(r.draws, 2);
});

test("placeholders never select but influence both probability helpers according to their max", () => {
  const endPlaceholder = cls([profile({ probability: 0.3 }), profile({ probability: 1, classId: 3666 })]);
  const r = rolled(endPlaceholder, [0.8, 0.1]);
  assert.deepEqual(r.ids, [2]);
  assert.equal(r.draws, 2); // first roll fell into the unselectable placeholder tail
  assert.deepEqual(rolled(cls([profile({ probability: 0.3 }),
    profile({ probability: 1, classId: 3666, max: 0 })]), [0.99]).ids, [2]);
  // An available guaranteed placeholder forces total 1 even though skipped.
  assert.equal(rolled(cls([profile({ probability: 0.3 }), profile({ classId: 3666 })]), [0.9, 0]).draws, 2);
  // IsMaxed treats max=-1 as infinite even for placeholders; it must not be
  // mistaken for a zero/negative saturated row or trigger our real-row skip.
  assert.equal(rolled(cls([profile({ probability: 0.3 }),
    profile({ classId: 3666, max: -1 })]), [0.9, 0]).draws, 2);
  assert.equal(rolled(cls([profile({ probability: 0.3 }),
    profile({ probability: 1, classId: 3666, max: -1 })]), [0.9, 0]).draws, 2);
  // A leading placeholder contributes to the adjusted threshold of the real row.
  assert.deepEqual(rolled(cls([profile({ probability: 0.8, classId: 3666 }),
    profile({ probability: 1 })]), [0.1]).ids, [2]);
  assert.equal(rolled(cls([profile({ classId: 3666 })]), []).draws, 0);
});

test("zero-count stalls and placeholder null rolls stop at ACE's >1000 guard", () => {
  for (const profiles of [[profile({ init: 0 })], [profile({ probability: 1, init: 0 })],
    [profile({ probability: 0.1 }), profile({ classId: 3666 })]]) {
    let draws = 0;
    const r = resolveGeneratorSpawns([root], graph(cls(profiles)), GENERATOR_LIMITS,
      { random: () => { draws++; return 0.9; } });
    assert.equal(draws, 1001);
    assert.equal(r.placements.length, 0);
    assert.equal(r.skipped["selection-attempt-cap"], 1);
  }
  assert.deepEqual(rolled(cls([profile({ max: 0 })]), []).skipped, {});
});

test("unsupported alternatives consume selected slots without reweighting or invented output", () => {
  for (const patch of [{ where: 8 }, { where: 2 }, { where: 128 }, { appearanceOverride: true }, { cell: 0xb34b0001 }]) {
    const c = cls([profile({ probability: 0.3, ...patch }), profile({ probability: 1, classId: 3 })]);
    assert.deepEqual(rolled(c, [0]).ids, []);
    assert.deepEqual(rolled(c, [0.9]).ids, [3]);
  }
  const c = cls([profile({ probability: 0.3, where: 8 }), profile({ probability: 1, classId: 3 })], { init: 2, max: 2 });
  assert.deepEqual(rolled(c, [0, 0]).ids, [3]);
});

test("positive parent init repairs negative max before budget validation, matching ACE", () => {
  for (const max of [-2, -1, 0, 1]) {
    const r = rolled(cls([profile({ max: -1 })], { init: 2, max }), [0, 0]);
    assert.deepEqual(r.ids, [2, 2]);
    assert.equal(r.skipped["unbounded-count"], undefined);
  }
});

test("unrepaired negative parent counts and profile negatives other than -1 remain unsupported", () => {
  for (const c of [cls(alternatives(), { init: -1 }), cls(alternatives(), { init: -1, max: -1 }),
    cls(alternatives(), { init: 0, max: -1 }), cls(alternatives(), { init: -2, max: 2 })]) {
    const r = rolled(c, []);
    assert.deepEqual(r.ids, []);
    assert.equal(r.skipped["unbounded-count"], 1);
  }
  for (const patch of [{ init: -2 }, { max: -2 }, { init: -2, max: -1 }, { init: -1, max: -2 }, { init: -2, max: 0 }]) {
    const r = rolled(cls([profile(patch), profile({ probability: 1 })]), []);
    assert.deepEqual(r.ids, []);
    assert.equal(r.skipped["invalid-profile-count"], 1);
  }
});

test("seed and injected random validation reject values outside their explicit contracts", () => {
  for (const seed of [-1, 0x100000000, 0.5, NaN, Infinity]) {
    assert.throws(() => resolveGeneratorSpawns([], graph(cls([])), GENERATOR_LIMITS, { seed }), /uint32/);
    assert.throws(() => createSpawnRandom(seed), /uint32/);
    assert.throws(() => hashSpawnSeed("root", seed), /uint32/);
  }
  for (const roll of [-Number.EPSILON, 1, 2, NaN, Infinity, -Infinity]) {
    assert.throws(() => rolled(cls(alternatives()), [roll]), /\[0, 1\)/);
  }
  // Validation happens on every draw, not just when constructing the stream.
  assert.throws(() => rolled(cls([profile({ init: 0 })]), [0, NaN]), /invalid spawn random/);
  for (const seed of [0, 0xffffffff]) assert.equal(resolveGeneratorSpawns([root], graph(cls(alternatives())), GENERATOR_LIMITS, { seed }).placements.length, 1);
});

test("offline PRNG/hash are stable, uint32 and repeatable (not .NET Random)", () => {
  assert.equal(DEFAULT_SPAWN_SEED, 0);
  assert.equal(hashSpawnSeed("hello"), 0x4f9f2cab);
  const random = createSpawnRandom(0);
  assert.deepEqual(Array.from({ length: 3 }, () => random()), [0.26642920868471265, 0.0003297457005828619, 0.2232720274478197]);
  for (const seed of [0, 1, 0xffffffff]) {
    const a = createSpawnRandom(seed), b = createSpawnRandom(seed);
    for (let i = 0; i < 100; i++) {
      const value = a();
      assert.equal(value, b());
      assert.ok(value >= 0 && value < 1);
    }
  }
  assert.notEqual(hashSpawnSeed("root", 0), hashSpawnSeed("root", 1));
});

test("seeded roots repeat, vary by seed and retain choices across root order / block subsets", () => {
  const c = cls(alternatives().map(p => ({ ...p, max: 32 })), { init: 24, max: 24 });
  const g = graph(c);
  const roots = [root, { ...root, guid: 101, originX: 80 }, { ...root, guid: 102, cell: 0xb34b0001 }];
  const run = (rs: SpawnPlacement[], seed = 0) => resolveGeneratorSpawns(rs, g, GENERATOR_LIMITS, { seed });
  const a = run(roots);
  assert.deepEqual(a, run(roots));
  assert.deepEqual(a, resolveGeneratorSpawns(roots, g));
  assert.notDeepEqual(a.placements, run(roots, 1).placements);
  for (const r of roots) {
    const forRoot = (ps: SpawnPlacement[]) => ps.filter(p => p.cell === r.cell && p.originX === r.originX + 2);
    assert.deepEqual(forRoot(a.placements), run([r]).placements);
    assert.deepEqual(forRoot(a.placements), forRoot(run([...roots].reverse()).placements));
  }
  assert.notDeepEqual(run([roots[0]]).placements.map(p => p.classId), run([roots[1]]).placements.map(p => p.classId));
  assert.ok(a.placements.every(p => p.guid === undefined));
});

test("recursive sibling streams are distinct and nested draws do not perturb their parent", () => {
  const branching = cls([profile({ probability: 0.5, classId: 3, max: 20 }),
    profile({ probability: 1, classId: 4, max: 20 })], { init: 12, max: 12 });
  const classes = new Map([[1, cls([profile({ init: 2, max: 2 })], { init: 2, max: 2 })], [2, branching]]);
  const g: SpawnGraph = { classes, links: new Map() };
  const a = resolveGeneratorSpawns([root], g);
  const ids = a.placements.filter(p => p.classId !== 2).map(p => p.classId);
  assert.notDeepEqual(ids.slice(0, 12), ids.slice(12));
  classes.set(3, cls([profile({ probability: 0.5, classId: 5, max: 20 }),
    profile({ probability: 1, classId: 6, max: 20 })], { init: 4, max: 4 }));
  const b = resolveGeneratorSpawns([root], g);
  assert.deepEqual(b.placements.filter(p => p.classId <= 4), a.placements);
  assert.deepEqual(b, resolveGeneratorSpawns([root], g));
  const leaves = b.placements.filter(p => p.classId >= 5).map(p => p.classId);
  assert.ok(new Set(Array.from({ length: leaves.length / 4 }, (_, i) => leaves.slice(i * 4, i * 4 + 4).join())).size > 1);
});

test("recursive class cycles and depth are bounded, repeatable, and roots remain untouched", () => {
  const g: SpawnGraph = { classes: new Map([[1, cls([profile()])], [2, cls([profile({ classId: 1 })])]]), links: new Map() };
  const before = structuredClone(root);
  const r = resolveGeneratorSpawns([root], g);
  assert.ok(r.placements.length <= GENERATOR_LIMITS.depth);
  assert.equal(r.skipped.cycle, 1);
  assert.deepEqual(r, resolveGeneratorSpawns([root], g));
  assert.deepEqual(root, before);
  assert.equal(resolveGeneratorSpawns([root], g, { ...GENERATOR_LIMITS, depth: 0 }).skipped["depth-cap"], 1);
});

test("sentinel profiles remain bounded by generator/block/total/attempt caps and cycles", () => {
  const g = graph(cls([profile({ init: -1, max: -1, where: 1 })], { init: 1000000, max: 1000000 }));
  const limits = { depth: 4, perGenerator: 5, perBlock: 3, total: 2 };
  const r = resolveGeneratorSpawns([root], g, limits);
  assert.equal(r.placements.length, 2);
  assert.ok(r.skipped["total-cap"]);
  assert.ok(r.skipped["generator-cap"]);
  const b = resolveGeneratorSpawns([root], g, { ...limits, total: 10 });
  assert.equal(b.placements.length, 3);
  assert.ok(b.skipped["block-cap"]);
  assert.ok(b.skipped["generator-cap"]);
  assert.deepEqual(b, resolveGeneratorSpawns([root], g, { ...limits, total: 10 }));
  const attempts = resolveGeneratorSpawns([root], g, { ...GENERATOR_LIMITS, perGenerator: 2000 });
  assert.equal(attempts.placements.length, 1001);
  assert.equal(attempts.skipped["selection-attempt-cap"], 1);
  const cyclic = graph(cls([profile({ init: -1, max: -1, classId: 1, where: 1 })], { init: 3, max: 3 }));
  const cycle = resolveGeneratorSpawns([root], cyclic);
  assert.deepEqual(cycle.placements, []);
  assert.equal(cycle.skipped.cycle, 3); // skipped outputs still consume slots
  const chain: SpawnGraph = { classes: new Map([[1, cls([profile({ init: -1, max: -1 })])],
    [2, cls([profile({ classId: 3, init: -1, max: -1 })])]]), links: new Map() };
  const depth = resolveGeneratorSpawns([root], chain, { ...GENERATOR_LIMITS, depth: 1 });
  assert.deepEqual(depth.placements.map(p => p.classId), [2]);
  assert.equal(depth.skipped["depth-cap"], 1);
});

test("per-generator, block and total caps bound large multiplicities", () => {
  const g = graph(cls([profile({ init: 100000000, max: 100000000 })], { init: 100000000, max: 100000000 }));
  const limits = { depth: 4, perGenerator: 5, perBlock: 3, total: 2 };
  const r = resolveGeneratorSpawns([root], g, limits);
  assert.equal(r.placements.length, 2);
  assert.ok(r.skipped["total-cap"]);
  assert.ok(r.skipped["generator-cap"]);
  const b = resolveGeneratorSpawns([root], g, { ...limits, total: 10 });
  assert.equal(b.placements.length, 3);
  assert.ok(b.skipped["block-cap"]);
  assert.throws(() => resolveGeneratorSpawns([root], g, { ...limits, depth: Infinity }));
});
