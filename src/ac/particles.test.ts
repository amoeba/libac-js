import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import BinaryReader from "../BinaryReader.js";
import { AnimationHookType, EmitterType, ParticleEmitterInfo, ParticleType, PhysicsScript, PhysicsScriptTable, RenderTexture, selectScript } from "../index.js";

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(
  new URL(`../__fixtures__/particles/${name}.bin`, import.meta.url),
));

test("ParticleEmitterInfo and PhysicsScript parse native portal records", () => {
  const emitter = ParticleEmitterInfo.fromBuffer(fixture("0x320002cd"));
  assert.equal(emitter.id, 0x320002cd);
  assert.equal(emitter.emitterType, EmitterType.BirthratePerSec);
  assert.equal(emitter.particleType, ParticleType.ParabolicLVLALR);
  assert.equal(emitter.hwGfxObjId, 0x010016c8);
  assert.equal(emitter.birthrate, 1 / 6);

  const bytes = fixture("0x3300067a");
  const reader = new BinaryReader(bytes);
  const script = PhysicsScript.fromReader(reader);
  assert.equal(reader.remaining, 0);
  assert.equal(script.id, 0x3300067a);
  assert.equal(script.script.length, 4);
  assert.equal(script.script[0].hook.type, AnimationHookType.CreateParticle);
  assert.equal(script.script[2].hook.type, AnimationHookType.SoundTweaked);
  assert.equal(PhysicsScript.fromBuffer(bytes).script.length, 4);
});

test("PhysicsScriptTable intensity selection and RenderTexture references", () => {
  const table = PhysicsScriptTable.fromBuffer(fixture("0x3400002b"));
  assert.equal(table.scripts.size, 17);
  assert.equal(selectScript(table, 0x42), 0x330000d5);
  assert.equal(selectScript(table, 0x42, 0.7), 0x330000d4);
  assert.equal(selectScript(table, 0x999), undefined);

  const bytes = new Uint8Array(17);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x15000001, true); view.setUint32(4, 7, true);
  view.setUint8(8, 2); view.setUint32(9, 2, true);
  view.setUint32(13, 0x05000011, true);
  // The second texture ID is deliberately absent: the parser reports truncation.
  assert.throws(() => RenderTexture.fromBuffer(bytes), RangeError);
  const full = new Uint8Array(17);
  new DataView(full.buffer).setUint32(0, 0x15000001, true);
  new DataView(full.buffer).setUint32(4, 7, true);
  new DataView(full.buffer).setUint8(8, 2);
  new DataView(full.buffer).setUint32(9, 1, true);
  new DataView(full.buffer).setUint32(13, 0x05000011, true);
  const texture = RenderTexture.fromBuffer(full);
  assert.deepEqual(texture.textures, [0x05000011]);
});
