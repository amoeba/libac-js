import { Vec3 } from "../../BinaryReader.js";
import BinaryReader from "../../BinaryReader.js";

export interface Plane {
  normal: Vec3;
  distance: number;
}

export const readPlane = function (reader: BinaryReader): Plane {
  return {
    normal: reader.ReadVector3(),
    distance: reader.ReadSingle(),
  };
};
