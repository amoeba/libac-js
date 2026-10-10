import BinaryReader from "../../BinaryReader";

/** CylSphere — a cylinder-shaped bounding volume (AC `CylSphere`). */
export interface CylSphere {
  origin: { x: number; y: number; z: number };
  radius: number;
  height: number;
}

export const readCylSphere = function (reader: BinaryReader): CylSphere {
  return {
    origin: reader.ReadVector3(),
    radius: reader.ReadSingle(),
    height: reader.ReadSingle(),
  };
};
