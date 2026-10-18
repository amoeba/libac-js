import BinaryReader, { Vec3, Quaternion } from "../../BinaryReader.js";

/** Positioning information for a Setup part or a placed object (AC `Frame`). */
export interface Frame {
  origin: Vec3;
  orientation: Quaternion;
}

/** AC Frame binary layout: origin (3 f32) + quaternion stored w,x,y,z (4 f32). */
export function readFrame(reader: BinaryReader): Frame {
  return {
    origin: reader.ReadVector3(),
    orientation: reader.ReadQuaternion(),
  };
}

// Re-export Vec3 and Quaternion types for convenience
export { Vec3, Quaternion } from "../../BinaryReader.js";
