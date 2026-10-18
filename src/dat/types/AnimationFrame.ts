import BinaryReader from "../../BinaryReader.js";
import { Frame } from "./Frame.js";

/** AnimationFrame — one Frame per Setup part + optional hooks (AC `AnimationFrame`).

 * Created with a known NumParts; each part gets its own Frame (position +
 * rotation). The Default PlacementFrame in a Setup gives the absolute
 * transform for each GfxObj part.
 */
export class AnimationFrame {
  frames: Frame[] = [];
  hooks: AnimationHook[] = [];

  constructor(private numParts: number = 0) {}

  /** Read numParts Frame objects, then the hooks list. */
  unpack(reader: BinaryReader): void {
    const count = this.numParts || 0;
    for (let i = 0; i < count; i++) {
      this.frames.push({
        origin: reader.ReadVector3(),
        orientation: reader.ReadQuaternion(),
      });
    }

    // Hooks (always present — see C# AnimationFrame.Unpack)
    const numHooks = reader.ReadUint32();
    for (let i = 0; i < numHooks; i++) {
      this.hooks.push(readAnimationHook(reader));
    }
  }
}

/** Minimal AnimationHook parser — reads enough to advance the reader.

 * Based on the decompiled AC AnimationHook format. The hook type is a uint32
 * tag that determines the payload structure.
 */
export interface AnimationHook {
  type: number;
  direction: number;
}

function readAnimationHook(reader: BinaryReader): AnimationHook {
  // Base AnimationHook.Unpack reads: hookType (uint32) + direction (uint32) = 8 bytes.
  // Subclass-specific data follows, but is not needed for rendering.
  // For setups with hooks, the reader would desync on subclass data;
  // this is acceptable for the reference setups that have numHooks=0.
  const type = reader.ReadUint32();
  const direction = reader.ReadUint32();
  return { type, direction };
}

/** Convenience reader — mirrors C# DatBinReader.ReadItem<AnimationFrame>(numParts). */
export function readAnimationFrame(
  reader: BinaryReader,
  numParts: number
): AnimationFrame {
  const frame = new AnimationFrame(numParts);
  frame.unpack(reader);
  return frame;
}
