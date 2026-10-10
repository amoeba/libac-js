import BinaryReader from "../../BinaryReader";

/** Positioning information for a Setup part (AC `Frame`). */
export interface Frame {
  origin: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
}

// Re-export Vec3 and Quaternion types for convenience
export { Vec3, Quaternion } from "../../BinaryReader";
