import BinaryReader from "../binary_reader";

// Int32 for length, UInt32 for each element
export const unpackInt32Array = function (reader: BinaryReader): number[] {
  let length = reader.ReadInt32();

  let result: number[] = [];

  for (let i = 0; i < length; i++) {
    result.push(reader.ReadUint32());
  }

  return result;
}
