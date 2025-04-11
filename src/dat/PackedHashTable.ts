import BinaryReader from "../binary_reader";
import { NumberDict } from "./SpellTable";
import { Unpackable } from "./Unpackable";

export const unpackPackedHashTable = function <T extends Unpackable>(reader: BinaryReader, constructor: new () => T): NumberDict<T> {
  let result: NumberDict<T> = {};

  let total_objects = reader.ReadUint16();
  let bucket_size = reader.ReadUint16();

  for (let i = 0; i < total_objects; i++) {
    var key = reader.ReadUint32();

    var item = new constructor();
    item.unpack(reader);
    result[key] = item;
  }

  return result;
}
