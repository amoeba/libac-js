import { Vec3 } from "../../BinaryReader.js";
import BinaryReader from "../../BinaryReader.js";

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
