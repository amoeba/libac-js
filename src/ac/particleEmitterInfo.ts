import BinaryReader, { type Vec3 } from "../BinaryReader.js";

/** How an emitter's `birthrate` is interpreted (ACE `EmitterType`). */
export enum EmitterType {
  Unknown = 0,
  /** `birthrate` is the interval in seconds between emissions. */
  BirthratePerSec = 1,
  /** `birthrate` is the interval in meters of emitter movement between emissions. */
  BirthratePerMeter = 2,
}

/** Particle motion model (ACE `ParticleType`, values 1..12). */
export enum ParticleType {
  Unknown = 0,
  Still = 1,
  LocalVelocity = 2,
  ParabolicLVGA = 3,
  ParabolicLVGAGR = 4,
  Swarm = 5,
  Explode = 6,
  Implode = 7,
  ParabolicLVLA = 8,
  ParabolicLVLALR = 9,
  ParabolicGVGA = 10,
  ParabolicGVGAGR = 11,
  GlobalVelocity = 12,
}

/**
 * Client portal-DAT `ParticleEmitterInfo` (0x32) — TypeScript parser.
 *
 * The emitter definition a `CreateParticle` hook instantiates: which GfxObj
 * to draw, how fast to emit, and the A/B/C velocity/acceleration ranges per
 * `ParticleType`. Referenced by `PhysicsScript` hooks and by weenie
 * `PropertyDataId.PhysicsScript` setups. See `research/particle-effects.md`.
 *
 * Note `hwGfxObjId`: ACE and ACViewer render only `hwGfxObjId` and skip
 * emitters where it is 0, even when `gfxObjId` is set. No fallback.
 */
export class ParticleEmitterInfo {
  id = 0;
  /** Observed 0 in portal data. */
  unknown = 0;
  emitterType: EmitterType = EmitterType.Unknown;
  particleType: ParticleType = ParticleType.Unknown;
  /** Software-renderer GfxObj id; unused by ACE/ACViewer hardware paths. */
  gfxObjId = 0;
  /** Hardware GfxObj id — the one that renders. 0 means "skip this emitter". */
  hwGfxObjId = 0;
  /** Interval seconds (`BirthratePerSec`) or meters (`BirthratePerMeter`). */
  birthrate = 0;
  maxParticles = 0;
  initialParticles = 0;
  totalParticles = 0;
  totalSeconds = 0;
  lifespan = 0;
  /** Random lifespan delta, ±`lifespanRand`. */
  lifespanRand = 0;
  offsetDir: Vec3 = { x: 0, y: 0, z: 0 };
  minOffset = 0;
  maxOffset = 0;
  /** Linear term; semantics depend on `particleType` (velocity/acceleration). */
  A: Vec3 = { x: 0, y: 0, z: 0 };
  minA = 0;
  maxA = 0;
  B: Vec3 = { x: 0, y: 0, z: 0 };
  minB = 0;
  maxB = 0;
  C: Vec3 = { x: 0, y: 0, z: 0 };
  minC = 0;
  maxC = 0;
  startScale = 0;
  finalScale = 0;
  scaleRand = 0;
  startTrans = 0;
  finalTrans = 0;
  transRand = 0;
  /** 1 = follow the parent part frame; 0 = capture it at spawn. */
  isParentLocal = 0;

  static fromBuffer(data: Uint8Array | ArrayBuffer): ParticleEmitterInfo {
    return ParticleEmitterInfo.fromReader(new BinaryReader(data));
  }

  /** Parse from a positioned reader. Lets callers verify exact EOF consumption. */
  static fromReader(reader: BinaryReader): ParticleEmitterInfo {
    const info = new ParticleEmitterInfo();

    info.id = reader.ReadUint32();
    info.unknown = reader.ReadUint32();
    info.emitterType = reader.ReadInt32();
    info.particleType = reader.ReadInt32();
    info.gfxObjId = reader.ReadUint32();
    info.hwGfxObjId = reader.ReadUint32();
    info.birthrate = reader.ReadDouble();
    info.maxParticles = reader.ReadInt32();
    info.initialParticles = reader.ReadInt32();
    info.totalParticles = reader.ReadInt32();
    info.totalSeconds = reader.ReadDouble();
    info.lifespan = reader.ReadDouble();
    info.lifespanRand = reader.ReadDouble();
    info.offsetDir = reader.ReadVector3();
    info.minOffset = reader.ReadSingle();
    info.maxOffset = reader.ReadSingle();
    info.A = reader.ReadVector3();
    info.minA = reader.ReadSingle();
    info.maxA = reader.ReadSingle();
    info.B = reader.ReadVector3();
    info.minB = reader.ReadSingle();
    info.maxB = reader.ReadSingle();
    info.C = reader.ReadVector3();
    info.minC = reader.ReadSingle();
    info.maxC = reader.ReadSingle();
    info.startScale = reader.ReadSingle();
    info.finalScale = reader.ReadSingle();
    info.scaleRand = reader.ReadSingle();
    info.startTrans = reader.ReadSingle();
    info.finalTrans = reader.ReadSingle();
    info.transRand = reader.ReadSingle();
    info.isParentLocal = reader.ReadInt32();

    return info;
  }
}
