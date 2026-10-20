import BinaryReader, { type Vec3 } from "../../BinaryReader.js";
import { readFrame, type Frame } from "./Frame.js";

/**
 * Hook types from ACE `AnimationHookType`. Payloads (after the 8-byte
 * type+direction header) differ per type; {@link readAnimationHook} consumes
 * each exactly.
 */
export enum AnimationHookType {
  NoOp = 0,
  Sound = 1,
  SoundTable = 2,
  Attack = 3,
  AnimationDone = 4,
  ReplaceObject = 5,
  Ethereal = 6,
  TransparentPart = 7,
  Luminous = 8,
  LuminousPart = 9,
  Diffuse = 10,
  DiffusePart = 11,
  Scale = 12,
  CreateParticle = 13,
  DestroyParticle = 14,
  StopParticle = 15,
  NoDraw = 16,
  DefaultScript = 17,
  DefaultScriptPart = 18,
  CallPES = 19,
  Transparent = 20,
  SoundTweaked = 21,
  SetOmega = 22,
  TextureVelocity = 23,
  TextureVelocityPart = 24,
  SetLight = 25,
  CreateBlockingParticle = 26,
}

/**
 * A parsed animation hook. Only `type` and `direction` are always set; the
 * remaining fields are populated for the hook types the renderer may act on
 * (Transparent, Luminous, Diffuse, Scale, SetOmega, ReplaceObject, NoDraw,
 * CreateParticle) and left undefined for the rest — which are still
 * length-consumed.
 */
export interface AnimationHook {
  type: number;
  direction: number;
  /** Single id payload: Sound, SoundTable, DestroyParticle, StopParticle. */
  id?: number;
  /** Affected Setup part index: ReplaceObject (u16) and the Part hooks. */
  partIndex?: number;
  /** ReplaceObject replacement GfxObj DataID. */
  partId?: number;
  /** Scalar flag: Ethereal (`int`), NoDraw (`uint`), SetLight (LightsOn `int`). */
  value?: number;
  /** Triple-float payload: Luminous/Diffuse/Transparent colour or SetOmega. */
  vector?: Vec3;
  /** Scale: final scale and the seconds over which to reach it. */
  scale?: { end: number; time: number };
  /** TextureVelocity: U/V texture scroll speeds. */
  velocity?: { u: number; v: number };
  /** SoundTweaked: priority, probability and volume in addition to `id`. */
  sound?: { priority: number; probability: number; volume: number };
  /** CallPES pause duration. */
  pause?: number;
  /** CreateParticle embedded spawn frame. */
  frame?: Frame;
  /** CreateParticle emitter info + instance ids. */
  emitterInfoId?: number;
  emitterId?: number;
  /** Attack: part index plus the six AttackCone floats. */
  attack?: {
    partIndex: number;
    leftX: number;
    leftY: number;
    rightX: number;
    rightY: number;
    radius: number;
    height: number;
  };
}

/**
 * One `AnimationFrame` — a transform per Setup part plus the animation hooks
 * that fire while it is active. The per-part transforms are what a renderer
 * applies; hooks are consumed length-correctly so the frame stream never
 * desyncs, even when a hook is ignored.
 */
export class AnimationFrame {
  frames: Frame[] = [];
  hooks: AnimationHook[] = [];

  constructor(private numParts: number = 0) {}

  /** Read `numParts` Frame objects, then the hooks list. */
  unpack(reader: BinaryReader): void {
    const count = this.numParts || 0;
    for (let i = 0; i < count; i++) {
      this.frames.push({
        origin: reader.ReadVector3(),
        orientation: reader.ReadQuaternion(),
      });
    }

    const numHooks = reader.ReadUint32();
    for (let i = 0; i < numHooks; i++) {
      this.hooks.push(readAnimationHook(reader));
    }
  }
}

function readTriple(reader: BinaryReader): Vec3 {
  return reader.ReadVector3();
}

/**
 * Read one hook: `u32 type + i32 direction` header, then a type-specific
 * payload consumed exactly (ACE `AnimationHook.ReadHook`).
 *
 * Exported so other hook-bearing formats (`PhysicsScript` 0x33) can reuse the
 * one hook table.
 *
 * Unknown hook types throw: their payload length is unknowable, so silently
 * consuming zero bytes would desync every following frame/hook.
 */
export function readAnimationHook(reader: BinaryReader): AnimationHook {
  const hookOffset = reader.position;
  const type = reader.ReadUint32();
  const direction = reader.ReadInt32();
  const hook: AnimationHook = { type, direction };

  switch (type) {
    case AnimationHookType.Sound:
    case AnimationHookType.SoundTable:
    case AnimationHookType.DestroyParticle:
    case AnimationHookType.StopParticle:
      hook.id = reader.ReadUint32();
      break;

    case AnimationHookType.Attack: {
      // u32 part + AttackCone: LeftX, LeftY, RightX, RightY, Radius, Height.
      hook.attack = {
        partIndex: reader.ReadUint32(),
        leftX: reader.ReadSingle(),
        leftY: reader.ReadSingle(),
        rightX: reader.ReadSingle(),
        rightY: reader.ReadSingle(),
        radius: reader.ReadSingle(),
        height: reader.ReadSingle(),
      };
      break;
    }

    case AnimationHookType.ReplaceObject: {
      hook.partIndex = reader.ReadUint16();
      // DataID field: OR in the GfxObj type tag when the high word is absent
      // (ACE ReadAsDataIDOfKnownType(0x01000000)).
      let partId = reader.ReadUint32();
      if ((partId & 0xffff0000) === 0) partId = (partId | 0x01000000) >>> 0;
      hook.partId = partId;
      break;
    }

    case AnimationHookType.Ethereal:
    case AnimationHookType.SetLight:
      hook.value = reader.ReadInt32();
      break;

    case AnimationHookType.NoDraw:
      hook.value = reader.ReadUint32();
      break;

    case AnimationHookType.TransparentPart:
    case AnimationHookType.LuminousPart:
    case AnimationHookType.DiffusePart:
      hook.partIndex = reader.ReadUint32();
      hook.vector = readTriple(reader);
      break;

    case AnimationHookType.Luminous:
    case AnimationHookType.Diffuse:
    case AnimationHookType.Transparent:
      hook.vector = readTriple(reader);
      break;

    case AnimationHookType.Scale:
      hook.scale = { end: reader.ReadSingle(), time: reader.ReadSingle() };
      break;

    case AnimationHookType.CreateParticle:
    case AnimationHookType.CreateBlockingParticle:
      // u32 emitterInfoId + u32 partIndex + Frame + u32 emitterId.
      // ACE subclasses CreateBlockingParticle from CreateParticleHook, so both
      // carry the same 40-byte payload.
      hook.emitterInfoId = reader.ReadUint32();
      hook.partIndex = reader.ReadUint32();
      hook.frame = readFrame(reader);
      hook.emitterId = reader.ReadUint32();
      break;

    case AnimationHookType.DefaultScriptPart:
      hook.partIndex = reader.ReadUint32();
      break;

    case AnimationHookType.CallPES:
      hook.id = reader.ReadUint32();
      hook.pause = reader.ReadSingle();
      break;

    case AnimationHookType.SoundTweaked:
      hook.id = reader.ReadUint32();
      hook.sound = {
        priority: reader.ReadSingle(),
        probability: reader.ReadSingle(),
        volume: reader.ReadSingle(),
      };
      break;

    case AnimationHookType.SetOmega:
      hook.vector = reader.ReadVector3();
      break;

    case AnimationHookType.TextureVelocity:
      hook.velocity = { u: reader.ReadSingle(), v: reader.ReadSingle() };
      break;

    case AnimationHookType.TextureVelocityPart:
      hook.partIndex = reader.ReadUint32();
      hook.velocity = { u: reader.ReadSingle(), v: reader.ReadSingle() };
      break;

    case AnimationHookType.NoOp:
    case AnimationHookType.AnimationDone:
    case AnimationHookType.DefaultScript:
      // No payload.
      break;

    default:
      throw new Error(
        `Unknown animation hook type ${type} (0x${type.toString(16)}) ` +
          `at offset 0x${hookOffset.toString(16)}: payload length unknown, ` +
          `cannot continue the frame stream`,
      );
  }

  return hook;
}

/** Convenience reader — mirrors C# `DatBinReader.ReadItem<AnimationFrame>(numParts)`. */
export function readAnimationFrame(
  reader: BinaryReader,
  numParts: number,
): AnimationFrame {
  const frame = new AnimationFrame(numParts);
  frame.unpack(reader);
  return frame;
}
