import BinaryReader from "../../BinaryReader.js";
import { Unpackable, unpackInt32Array } from "../../Unpackable.js";

export class SpellSetTiers implements Unpackable {
  spells: number[] | undefined

  unpack(reader: BinaryReader) {
    this.spells = unpackInt32Array(reader);
  }
}
