import { Vec3 } from "../../BinaryReader";
import BinaryReader from "../../BinaryReader";

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
