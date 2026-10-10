import BinaryReader from "./BinaryReader";

export interface Unpackable {
  unpack(reader: BinaryReader): void;
}

/** Instantiate a type and call .unpack() — mirrors C# DatBinReader.ReadItem<T>(). */
export const readItem = function <T extends Unpackable>(
  reader: BinaryReader,
  Type: new () => T
): T {
  const instance = new Type();
  instance.unpack(reader);
  return instance;
};

export const unpackInt32Array = function (reader: BinaryReader): number[] {
  let length = reader.ReadInt32();

  let result: number[] = [];

  for (let i = 0; i < length; i++) {
    result.push(reader.ReadUint32());
  }

  return result;
}
