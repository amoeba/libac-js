import BinaryReader from "../../BinaryReader.js";

/** ColorARGB — a 32-bit color (AC `ColorARGB`). */
export interface ColorARGB {
  blue: number;
  green: number;
  red: number;
  alpha: number;
}

export const readColorARGB = function (reader: BinaryReader): ColorARGB {
  return {
    blue: reader.ReadUint8(),
    green: reader.ReadUint8(),
    red: reader.ReadUint8(),
    alpha: reader.ReadUint8(),
  };
};
