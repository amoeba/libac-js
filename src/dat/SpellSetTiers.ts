import BinaryReader from "../binary_reader";
import { Unpackable } from "../Unpackable";
import { unpackInt32Array } from "../unpackables";

export class SpellSetTiers implements Unpackable {
  spells: number[] | undefined

  unpack(reader: BinaryReader) {
    this.spells = unpackInt32Array(reader);
  }
}
