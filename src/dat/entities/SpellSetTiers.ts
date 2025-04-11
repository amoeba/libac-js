import BinaryReader from "../../BinaryReader";
import { Unpackable, unpackInt32Array } from "../../Unpackable";

export class SpellSetTiers implements Unpackable {
  spells: number[] | undefined

  unpack(reader: BinaryReader) {
    this.spells = unpackInt32Array(reader);
  }
}
