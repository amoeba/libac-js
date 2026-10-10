import { Vec3 } from "../../BinaryReader";
import BinaryReader from "../../BinaryReader";

export interface Sphere {
  origin: Vec3;
  radius: number;
}

export const readSphere = function (reader: BinaryReader): Sphere {
  return {
    origin: reader.ReadVector3(),
    radius: reader.ReadSingle(),
  };
};
