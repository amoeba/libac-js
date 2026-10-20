import BinaryReader, { type Vec3 } from "../../BinaryReader.js";

/**
 * Portal-DAT `MotionTable` (0x09).
 *
 * A MotionTable maps a `MotionStance` + `MotionCommand` to the `Animation`
 * (0x03) files that play. It is referenced by a weenie's
 * `PropertyDataId.MotionTable` (not by the Setup: `Setup.defaultMotionTable` is
 * ~always zero in the client).
 */

/**
 * One animation reference inside a `MotionData` (ACE `AnimData`, 16 bytes).
 * A `MotionData` plays each of these in order.
 */
export interface AnimData {
  /** Animation (0x03) file id to play. */
  animId: number;
  /** First frame of the specified Animation to play. */
  lowFrame: number;
  /** Last frame to play; `-1` means play through to the end. */
  highFrame: number;
  /** Frames per second; a negative value plays the range in reverse. */
  framerate: number;
}

/** `MotionData.flags` bits (ACE `MotionFlags`). */
export enum MotionFlags {
  /** A trailing velocity `Vector3` is present. */
  HasVelocity = 0x1,
  /** A trailing angular-velocity `Vector3` is present. */
  HasOmega = 0x2,
}

/**
 * The animation data stored under one MotionTable dictionary key (ACE
 * `MotionData`): the animations to play plus the optional derivation velocity
 * and angular velocity used when the motion was generated from movement.
 */
export interface MotionData {
  numAnims: number;
  bitfield: number;
  flags: number;
  anims: AnimData[];
  /** Present when `flags & MotionFlags.HasVelocity`. */
  velocity?: Vec3;
  /** Present when `flags & MotionFlags.HasOmega`. */
  omega?: Vec3;
}

function readMotionData(reader: BinaryReader): MotionData {
  const numAnims = reader.ReadUint8();
  const bitfield = reader.ReadUint8();
  const flags = reader.ReadUint8();
  // The three u8 fields are padded to the reader's 4-byte boundary before the
  // fixed-size AnimData array begins (ACE `MotionData.Unpack` AlignBoundary).
  reader.AlignBoundary();

  const anims: AnimData[] = [];
  for (let i = 0; i < numAnims; i++) {
    anims.push({
      animId: reader.ReadUint32(),
      lowFrame: reader.ReadInt32(),
      highFrame: reader.ReadInt32(),
      framerate: reader.ReadSingle(),
    });
  }

  const data: MotionData = { numAnims, bitfield, flags, anims };
  if (flags & MotionFlags.HasVelocity) data.velocity = reader.ReadVector3();
  if (flags & MotionFlags.HasOmega) data.omega = reader.ReadVector3();
  return data;
}

/** AC dictionary: `u32 count`, then `count × (u32 key, MotionData)`. */
function readMotionDict(reader: BinaryReader): Map<number, MotionData> {
  const dict = new Map<number, MotionData>();
  const count = reader.ReadUint32();
  for (let i = 0; i < count; i++) {
    const key = reader.ReadUint32();
    dict.set(key, readMotionData(reader));
  }
  return dict;
}

/**
 * MotionTable dictionary key for a stance + command pair: `stance << 16 |
 * command & 0xFFFFF`. `MotionCommand` values carry high bits (e.g.
 * `On = 0x4000000B`) that the key masks off, while the stance contributes only
 * its low 16 bits (`NonCombat = 0x8000003D` -> `0x003D`).
 */
export function motionKey(stance: number, command: number): number {
  return (((stance << 16) >>> 0) | (command & 0xfffff)) >>> 0;
}

/**
 * Portal-DAT `MotionTable` (0x09): maps a `MotionStance` + `MotionCommand`
 * to the Animation(s) that play. `cycles` covers a command played on its own,
 * `modifiers` tweaks a cycle, and `links` chains one command into another
 * (e.g. a door's opening `On -> Off` transition). Keys encode the stance in
 * the high word and the command's low 20 bits (`stance << 16 | command & 0xFFFFF`)
 * because `MotionCommand` values carry high bits (ACE `MotionTable`); use
 * {@link motionKey} to build them.
 */
export class MotionTable {
  id = 0;
  /** Default `MotionStance` (e.g. 0x8000003D = NonCombat). */
  defaultStyle = 0;
  /** `MotionStance -> MotionCommand` resting defaults. */
  styleDefaults: Map<number, number> = new Map();
  /** Looping/idle animation per command key. */
  cycles: Map<number, MotionData> = new Map();
  /** Per-command animation modifiers. */
  modifiers: Map<number, MotionData> = new Map();
  /** Outer key = current command; inner key = target command -> MotionData. */
  links: Map<number, Map<number, MotionData>> = new Map();

  static fromBuffer(data: Uint8Array | ArrayBuffer): MotionTable {
    return MotionTable.fromReader(new BinaryReader(data));
  }

  /** Parse from a positioned reader. Lets callers verify exact EOF consumption. */
  static fromReader(reader: BinaryReader): MotionTable {
    const table = new MotionTable();

    table.id = reader.ReadUint32();
    table.defaultStyle = reader.ReadUint32();

    const numStyleDefaults = reader.ReadUint32();
    for (let i = 0; i < numStyleDefaults; i++) {
      const style = reader.ReadUint32();
      const command = reader.ReadUint32();
      table.styleDefaults.set(style, command);
    }

    table.cycles = readMotionDict(reader);
    table.modifiers = readMotionDict(reader);

    const numLinks = reader.ReadUint32();
    for (let i = 0; i < numLinks; i++) {
      const key = reader.ReadUint32();
      table.links.set(key, readMotionDict(reader));
    }

    return table;
  }
}
