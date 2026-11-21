import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BinaryReader, toExactArrayBuffer, EmitterType, ParticleEmitterInfo, ParticleType, PhysicsScript, PhysicsScriptTable, selectScript, AnimationHookType, type AnimationHook } from "../index.js";

/**
 * Real portal-DAT fixtures for PhysicsScript (0x33), PhysicsScriptTable (0x34)
 * and ParticleEmitterInfo (0x32), fetched from dats.treestats.net. Every parser
 * must consume the whole file exactly; the authored hook chain and byte offsets are asserted below.
 */
const FIXTURE_DIR = new URL("../__fixtures__/particles/", import.meta.url);

function bytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`${name}.bin`, FIXTURE_DIR)));
}

function parseScript(name: string): { script: PhysicsScript; remaining: number } {
  const reader = new BinaryReader(toExactArrayBuffer(bytes(name)));
  const script = PhysicsScript.fromReader(reader);
  return { script, remaining: reader.remaining };
}

function parseTable(name: string): {
  table: PhysicsScriptTable;
  remaining: number;
} {
  const reader = new BinaryReader(toExactArrayBuffer(bytes(name)));
  const table = PhysicsScriptTable.fromReader(reader);
  return { table, remaining: reader.remaining };
}

function parseEmitter(name: string): {
  emitter: ParticleEmitterInfo;
  remaining: number;
} {
  const reader = new BinaryReader(toExactArrayBuffer(bytes(name)));
  const emitter = ParticleEmitterInfo.fromReader(reader);
  return { emitter, remaining: reader.remaining };
}

const close = (actual: number, expected: number, epsilon = 1e-5): void => {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
};

function hookAt(script: PhysicsScript, index: number): AnimationHook {
  const hook = script.script[index]?.hook;
  assert.ok(hook, `script entry ${index} exists`);
  return hook;
}

test("PhysicsScript 0x3300067a (portal): two emitters, sound, CallPES", () => {
  const { script, remaining } = parseScript("0x3300067a");

  assert.equal(script.id, 0x3300067a);
  assert.equal(remaining, 0, "parser consumes the whole file");
  assert.equal(script.script.length, 4);

  const first = script.script[0];
  const second = script.script[1];
  assert.equal(first.startTime, 0);
  assert.equal(second.startTime, 0);

  const firstHook = hookAt(script, 0);
  assert.equal(firstHook.type, AnimationHookType.CreateParticle);
  assert.equal(firstHook.emitterInfoId, 0x320002cd);
  assert.equal(firstHook.partIndex, 0);
  assert.equal(firstHook.emitterId, 0);
  assert.ok(firstHook.frame);
  close(firstHook.frame.origin.z, 0.15);
  close(firstHook.frame.orientation.w, 1);

  const secondHook = hookAt(script, 1);
  assert.equal(secondHook.type, AnimationHookType.CreateParticle);
  assert.equal(secondHook.emitterInfoId, 0x320002d6);
  assert.equal(secondHook.partIndex, 0);
  assert.equal(secondHook.emitterId, 0);

  const soundHook = hookAt(script, 2);
  assert.equal(soundHook.type, AnimationHookType.SoundTweaked);
  assert.equal(soundHook.id, 0x0a00038e);

  const callPes = script.script[3];
  close(callPes.startTime, 2.7);
  const callPesHook = hookAt(script, 3);
  assert.equal(callPesHook.type, AnimationHookType.CallPES);
  assert.equal(callPesHook.id, 0x330006da);
  assert.equal(callPesHook.pause, 0);
});

test("PhysicsScriptTable 0x3400002b: 17 keys and intensity selection", () => {
  const { table, remaining } = parseTable("0x3400002b");

  assert.equal(table.id, 0x3400002b);
  assert.equal(remaining, 0, "parser consumes the whole file");
  assert.equal(table.scripts.size, 17);

  assert.deepEqual(table.scripts.get(0x42), [
    { mod: 0, physicsScriptId: 0x330000d3 },
    { mod: 0.5, physicsScriptId: 0x330000d4 },
    { mod: 1, physicsScriptId: 0x330000d5 },
  ]);

  assert.equal(selectScript(table, 0x42), 0x330000d5, "default intensity 1.0");
  assert.equal(selectScript(table, 0x42, 0), 0x330000d3);
  assert.equal(selectScript(table, 0x42, 0.7), 0x330000d4);
  assert.equal(selectScript(table, 0x42, 2), 0x330000d5);
  assert.equal(selectScript(table, 0x999), undefined, "missing PlayScript key");
  // Key 0x58 only has a mod=1.0 variant.
  assert.equal(selectScript(table, 0x58, 0.5), undefined);
  assert.equal(selectScript(table, 0x58, 1), 0x33000719);
});

test("ParticleEmitterInfo 0x320002cd: portal hardware emitter fields", () => {
  const { emitter, remaining } = parseEmitter("0x320002cd");

  assert.equal(emitter.id, 0x320002cd);
  assert.equal(remaining, 0, "parser consumes the whole file");
  assert.equal(emitter.unknown, 0);
  assert.equal(emitter.emitterType, EmitterType.BirthratePerSec);
  assert.equal(emitter.particleType, ParticleType.ParabolicLVLALR);
  assert.equal(emitter.gfxObjId, 0);
  assert.equal(emitter.hwGfxObjId, 0x010016c8);
  close(emitter.birthrate, 1 / 6);
  assert.equal(emitter.maxParticles, 12);
  assert.equal(emitter.initialParticles, 0);
  assert.equal(emitter.totalParticles, 0);
  assert.equal(emitter.totalSeconds, 0);
  assert.equal(emitter.lifespan, 2);
  assert.equal(emitter.lifespanRand, 0);
  close(emitter.offsetDir.x, 0);
  close(emitter.offsetDir.y, -0.9987519979476929);
  close(emitter.offsetDir.z, 0.049937598407268524);
  close(emitter.minOffset, 0.1);
  close(emitter.maxOffset, 0.1);
  assert.equal(emitter.A.x, 0);
  close(emitter.A.y, 0.2);
  assert.equal(emitter.A.z, 0);
  close(emitter.minA, 0.7);
  close(emitter.maxA, 1.5);
  assert.deepEqual(emitter.B, { x: 0, y: 0, z: 0 });
  close(emitter.minB, 0.5);
  close(emitter.maxB, 1.5);
  assert.deepEqual(emitter.C, { x: 0, y: -0.5, z: 0 });
  close(emitter.minC, 0.5);
  close(emitter.maxC, 1.5);
  assert.equal(emitter.startScale, 5);
  close(emitter.finalScale, 0.1);
  close(emitter.scaleRand, 0.2);
  assert.equal(emitter.startTrans, 1);
  close(emitter.finalTrans, 0.4);
  assert.equal(emitter.transRand, 0);
  assert.equal(emitter.isParentLocal, 0);
});

test("ParticleEmitterInfo 0x320002d6 has only a software GfxObj id", () => {
  const { emitter, remaining } = parseEmitter("0x320002d6");

  assert.equal(emitter.id, 0x320002d6);
  assert.equal(remaining, 0);
  assert.equal(emitter.emitterType, EmitterType.BirthratePerSec);
  assert.equal(emitter.particleType, ParticleType.ParabolicLVGAGR);
  assert.equal(emitter.gfxObjId, 0x010016c9);
  assert.equal(emitter.hwGfxObjId, 0, "ACE/ACViewer skip this emitter");
  close(emitter.birthrate, 0.5);
  assert.equal(emitter.maxParticles, 4);
  assert.equal(emitter.startScale, 3);
  assert.equal(emitter.finalScale, 1);
  assert.equal(emitter.startTrans, 1);
  assert.equal(emitter.finalTrans, 0);
});

