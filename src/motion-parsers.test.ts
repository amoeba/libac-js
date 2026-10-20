import { readFileSync } from "node:fs";
import BinaryReader, { toExactArrayBuffer } from "./BinaryReader.js";
import { MotionTable, MotionFlags, motionKey } from "./dat/file_types/MotionTable.js";
import { Animation } from "./dat/file_types/Animation.js";
import {
  AnimationHookType,
  readAnimationFrame,
} from "./dat/types/AnimationFrame.js";

/**
 * Real portal-DAT fixtures for the MotionTable (0x09) + Animation (0x03)
 * system, fetched from https://dats.treestats.net. Every fixture must parse
 * with no trailing bytes — the hook reader's length-correctness is what keeps
 * the Animation frame stream aligned.
 */
const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));

function parseMotionTable(name: string): { table: MotionTable; remaining: number } {
  const reader = new BinaryReader(toExactArrayBuffer(fixture(name)));
  const table = MotionTable.fromReader(reader);
  return { table, remaining: reader.remaining };
}

function parseAnimation(name: string): { animation: Animation; remaining: number } {
  const reader = new BinaryReader(toExactArrayBuffer(fixture(name)));
  const animation = Animation.fromReader(reader);
  return { animation, remaining: reader.remaining };
}

// ─── MotionTable ─────────────────────────────────────────────────────

test("MotionTable 0x09000016 (door): defaultStyle, styleDefaults, cycles, links", () => {
  const { table, remaining } = parseMotionTable("motion-0x09000016.bin");

  expect(table.id).toBe(0x09000016);
  expect(table.defaultStyle).toBe(0x8000003d);
  expect(table.styleDefaults.get(0x8000003d)).toBe(0x4000000c);

  expect(table.cycles.size).toBe(2); // On + Off
  expect([...table.cycles.keys()].sort((a, b) => a - b)).toEqual([
    0x003d000b, 0x003d000c,
  ]);
  expect(table.links.size).toBe(2); // open + close

  expect(remaining).toBe(0); // parser consumes the whole file
});

test("MotionTable 0x09000003 (portal): Ready cycle plays animation 0x03000235", () => {
  const { table, remaining } = parseMotionTable("motion-0x09000003.bin");

  expect(table.cycles.size).toBe(1);
  const cycle = table.cycles.get(0x003d0003);
  expect(cycle).toBeDefined();
  expect(cycle!.anims).toEqual([
    { animId: 0x03000235, lowFrame: 0, highFrame: -1, framerate: 15 },
  ]);
  expect(remaining).toBe(0);
});

test("MotionTable 0x0900019b (fountain): 13 cycles, 6 links", () => {
  const { table, remaining } = parseMotionTable("motion-0x0900019b.bin");
  expect(table.cycles.size).toBe(13);
  expect(table.links.size).toBe(6);
  expect(remaining).toBe(0);
});

test("motionKey masks command high bits and keeps the stance low word", () => {
  // NonCombat 0x8000003D, On 0x4000000B / Off 0x4000000C -> 0x003D000B/C.
  expect(motionKey(0x8000003d, 0x4000000b)).toBe(0x003d000b);
  expect(motionKey(0x8000003d, 0x4000000c)).toBe(0x003d000c);
});

test("MotionData reads velocity and omega after its 4-byte-aligned header", () => {
  const out: number[] = [];
  const u8 = (value: number): void => void out.push(value & 0xff);
  const u32 = (value: number): void => {
    out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
  };
  const f32 = (value: number): void => {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value, true);
    for (let i = 0; i < 4; i++) out.push(view.getUint8(i));
  };

  u32(0x09000001); // id
  u32(0x8000003d); // defaultStyle
  u32(1); // numStyleDefaults
  u32(0x8000003d);
  u32(0x4000000c);

  u32(1); // cycles
  u32(0x003d000c); // key
  u8(1); // numAnims
  u8(0); // bitfield
  u8(MotionFlags.HasVelocity | MotionFlags.HasOmega);
  u8(0); // pad to 4
  u32(0x03000559); // animId
  f32(0); // lowFrame
  f32(-1); // highFrame
  f32(30); // framerate
  f32(1);
  f32(2);
  f32(3); // velocity
  f32(4);
  f32(5);
  f32(6); // omega

  u32(0); // modifiers
  u32(0); // links

  const reader = new BinaryReader(toExactArrayBuffer(Uint8Array.from(out)));
  const table = MotionTable.fromReader(reader);
  const cycle = table.cycles.get(0x003d000c);
  expect(reader.remaining).toBe(0);
  expect(cycle).toBeDefined();
  expect(cycle!.velocity).toEqual({ x: 1, y: 2, z: 3 });
  expect(cycle!.omega).toEqual({ x: 4, y: 5, z: 6 });
  expect(cycle!.anims[0].framerate).toBe(30);
});

// ─── Animation ───────────────────────────────────────────────────────

test("Animation 0x03000559 (door): 32 frames with hooks land exactly at EOF", () => {
  const { animation, remaining } = parseAnimation("motion-0x03000559.bin");

  expect(animation.id).toBe(0x03000559);
  expect(animation.numParts).toBe(3);
  expect(animation.numFrames).toBe(32);
  expect(animation.flags).toBe(0x2); // no PosFrames
  expect(animation.partFrames.length).toBe(32);
  expect(remaining).toBe(0); // all 32 frames + hooks consumed exactly

  // The fixture carries hooks (SoundTable + Ethereal); if the reader were short
  // by even one byte the later frames would be garbage.
  const hooks = animation.partFrames.flatMap((frame) => frame.hooks);
  expect(hooks.length).toBe(5);
  expect([...new Set(hooks.map((hook) => hook.type))].sort((a, b) => a - b)).toEqual([
    AnimationHookType.SoundTable,
    AnimationHookType.Ethereal,
  ]);
});

test("Animation 0x03000235 (portal ring) parses to EOF", () => {
  const { animation, remaining } = parseAnimation("motion-0x03000235.bin");
  expect(animation.numParts).toBe(3);
  expect(animation.partFrames.length).toBe(animation.numFrames);
  expect(remaining).toBe(0);
});

// ─── hook reader length-correctness ──────────────────────────────────

function pushU16(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushU32(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function pushF32(out: number[], value: number): void {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  for (let i = 0; i < 4; i++) out.push(view.getUint8(i));
}

/** Payload writer per hook type (after the 8-byte type+direction header). */
const HOOK_PAYLOADS: Array<{ type: number; write: (out: number[]) => void }> = [
  { type: 0, write: () => {} },
  { type: 1, write: (o) => pushU32(o, 0x11) },
  { type: 2, write: (o) => pushU32(o, 0x22) },
  { type: 3, write: (o) => { pushU32(o, 1); for (let i = 0; i < 6; i++) pushF32(o, i); } },
  { type: 4, write: () => {} },
  { type: 5, write: (o) => { pushU16(o, 3); pushU32(o, 0x1234); } },
  { type: 6, write: (o) => pushU32(o, 0xfffffffe) },
  { type: 7, write: (o) => { pushU32(o, 1); pushF32(o, 1); pushF32(o, 2); pushF32(o, 3); } },
  { type: 8, write: (o) => { pushF32(o, 1); pushF32(o, 2); pushF32(o, 3); } },
  { type: 9, write: (o) => { pushU32(o, 1); pushF32(o, 1); pushF32(o, 2); pushF32(o, 3); } },
  { type: 10, write: (o) => { pushF32(o, 1); pushF32(o, 2); pushF32(o, 3); } },
  { type: 11, write: (o) => { pushU32(o, 1); pushF32(o, 1); pushF32(o, 2); pushF32(o, 3); } },
  { type: 12, write: (o) => { pushF32(o, 1); pushF32(o, 2); } },
  { type: 13, write: (o) => {
    pushU32(o, 0x33); pushU32(o, 2);
    for (let i = 0; i < 7; i++) pushF32(o, i);
    pushU32(o, 0x44);
  } },
  { type: 14, write: (o) => pushU32(o, 0x55) },
  { type: 15, write: (o) => pushU32(o, 0x66) },
  { type: 16, write: (o) => pushU32(o, 1) },
  { type: 17, write: () => {} },
  { type: 18, write: (o) => pushU32(o, 2) },
  { type: 19, write: (o) => { pushU32(o, 0x77); pushF32(o, 0.5); } },
  { type: 20, write: (o) => { pushF32(o, 1); pushF32(o, 2); pushF32(o, 3); } },
  { type: 21, write: (o) => { pushU32(o, 0x88); pushF32(o, 1); pushF32(o, 2); pushF32(o, 3); } },
  { type: 22, write: (o) => { pushF32(o, 1); pushF32(o, 2); pushF32(o, 3); } },
  { type: 23, write: (o) => { pushF32(o, 1); pushF32(o, 2); } },
  { type: 24, write: (o) => { pushU32(o, 1); pushF32(o, 1); pushF32(o, 2); } },
  { type: 25, write: (o) => pushU32(o, 1) },
  { type: 26, write: (o) => {
    // Same 40-byte payload as CreateParticle (ACE subclasses it).
    pushU32(o, 0x99); pushU32(o, 1);
    for (let i = 0; i < 7; i++) pushF32(o, i);
    pushU32(o, 0xaa);
  } },
];

test("readAnimationFrame consumes every hook type exactly", () => {
  const out: number[] = [];

  // numParts = 2 frames (7 f32 each: origin + w,x,y,z quaternion).
  for (let part = 0; part < 2; part++) {
    for (let i = 0; i < 7; i++) pushF32(out, part + i);
  }

  // Then every hook type in order, with direction = index.
  pushU32(out, HOOK_PAYLOADS.length);
  HOOK_PAYLOADS.forEach((hook, index) => {
    pushU32(out, hook.type);
    pushU32(out, index);
    hook.write(out);
  });

  const reader = new BinaryReader(toExactArrayBuffer(Uint8Array.from(out)));
  const frame = readAnimationFrame(reader, 2);

  expect(reader.remaining).toBe(0); // no byte left over after all hooks
  expect(frame.frames.length).toBe(2);
  expect(frame.hooks.map((hook) => hook.type)).toEqual(
    HOOK_PAYLOADS.map((hook) => hook.type),
  );
  expect(frame.hooks.map((hook) => hook.direction)).toEqual(
    HOOK_PAYLOADS.map((_, index) => index),
  );
});

test("unknown hook type throws a descriptive error instead of desyncing", () => {
  const out: number[] = [];
  pushU32(out, 1); // one hook
  pushU32(out, 99); // unknown type
  pushU32(out, 0); // direction

  const reader = new BinaryReader(toExactArrayBuffer(Uint8Array.from(out)));
  expect(() => readAnimationFrame(reader, 0)).toThrow(
    /Unknown animation hook type 99 \(0x63\) at offset 0x4/,
  );
});

test("ReplaceObject applies the GfxObj DataID type tag when the high word is absent", () => {
  const withTag: number[] = [];
  pushU32(withTag, 1); // one hook
  pushU32(withTag, AnimationHookType.ReplaceObject);
  pushU32(withTag, 0);
  pushU16(withTag, 3);
  pushU32(withTag, 0x00001234); // no high word -> GfxObj id

  const withTagReader = new BinaryReader(toExactArrayBuffer(Uint8Array.from(withTag)));
  const tagged = readAnimationFrame(withTagReader, 0).hooks[0];
  expect(tagged.partIndex).toBe(3);
  expect(tagged.partId).toBe(0x01001234);
  expect(withTagReader.remaining).toBe(0);

  const withHighWord: number[] = [];
  pushU32(withHighWord, 1);
  pushU32(withHighWord, AnimationHookType.ReplaceObject);
  pushU32(withHighWord, 0);
  pushU16(withHighWord, 1);
  pushU32(withHighWord, 0x02000001); // already a typed DataID
  const highWordReader = new BinaryReader(
    toExactArrayBuffer(Uint8Array.from(withHighWord)),
  );
  expect(readAnimationFrame(highWordReader, 0).hooks[0].partId).toBe(0x02000001);
});
