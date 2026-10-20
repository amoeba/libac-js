import BinaryReader from "../../BinaryReader.js";
import { readFrame, type Frame } from "../types/Frame.js";
import {
  readAnimationFrame,
  type AnimationFrame,
} from "../types/AnimationFrame.js";

/** `Animation.flags` bits (ACE `AnimationFlags`). */
export enum AnimationFlags {
  /** A `Frame[numFrames]` posFrames table precedes the part frames. */
  PosFrames = 0x1,
}

/**
 * Portal-DAT `Animation` (0x03).
 *
 * `numFrames` keyframes, each holding one transform per Setup part plus hooks.
 * Played by a `MotionTable` cycle or link. `numParts` should match the Setup it
 * animates (mismatches fall back to the Setup's Resting pose in a renderer).
 */
export class Animation {
  id = 0;
  flags = 0;
  numParts = 0;
  numFrames = 0;
  /** Present when `flags & AnimationFlags.PosFrames`. */
  posFrames?: Frame[];
  partFrames: AnimationFrame[] = [];

  static fromBuffer(data: Uint8Array | ArrayBuffer): Animation {
    return Animation.fromReader(new BinaryReader(data));
  }

  /** Parse from a positioned reader. Lets callers verify exact EOF consumption. */
  static fromReader(reader: BinaryReader): Animation {
    const animation = new Animation();

    animation.id = reader.ReadUint32();
    animation.flags = reader.ReadUint32();
    animation.numParts = reader.ReadUint32();
    animation.numFrames = reader.ReadUint32();

    if (animation.flags & AnimationFlags.PosFrames) {
      const posFrames: Frame[] = [];
      for (let i = 0; i < animation.numFrames; i++) {
        posFrames.push(readFrame(reader));
      }
      animation.posFrames = posFrames;
    }

    for (let i = 0; i < animation.numFrames; i++) {
      animation.partFrames.push(readAnimationFrame(reader, animation.numParts));
    }

    return animation;
  }
}
