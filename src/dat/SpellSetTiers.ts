import BinaryReader from "../binary_reader";
import { unpackInt32Array } from "./unpackables";

export class SpellSetTiers {
  spells: number[] | undefined

  unpack(reader: BinaryReader) {
    this.spells = unpackInt32Array(reader);
  }
}
