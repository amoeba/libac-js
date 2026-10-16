import BinaryReader from "../../BinaryReader.js";
import { Frame } from "./Frame.js";
import { readColorARGB, ColorARGB } from "./ColorARGB.js";

/** LightInfo — a light attached to a Setup part (AC `LightInfo`). */
export interface LightInfo {
  viewSpaceLocation: Frame;
  color: ColorARGB;
  intensity: number;
  falloff: number;
  coneAngle: number;
}

export const readLightInfo = function (reader: BinaryReader): LightInfo {
  const viewSpaceLocation: Frame = {
    origin: reader.ReadVector3(),
    orientation: reader.ReadQuaternion(),
  };
  const color = readColorARGB(reader);
  return {
    viewSpaceLocation: viewSpaceLocation,
    color,
    intensity: reader.ReadSingle(),
    falloff: reader.ReadSingle(),
    coneAngle: reader.ReadSingle(),
  };
};
