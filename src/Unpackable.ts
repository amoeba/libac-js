import BinaryReader from "./BinaryReader";

export interface Unpackable {
  unpack(reader: BinaryReader): void;
}

export const unpackInt32Array = function (reader: BinaryReader): number[] {
  let length = reader.ReadInt32();

  let result: number[] = [];

  for (let i = 0; i < length; i++) {
    result.push(reader.ReadUint32());
  }

  return result;
}
