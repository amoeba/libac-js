import BinaryReader from "../../BinaryReader.js";
import { unpackPackedHashTable } from "../../PackedHashTable.js";
import { SpellSetTiers } from "./SpellSetTiers.js";
import { NumberDict } from "../file_types/SpellTable.js";
import { Unpackable } from "../../Unpackable.js";

export class SpellSet implements Unpackable {
  highest_tier: number | undefined
  tiers: NumberDict<SpellSetTiers> | undefined

  unpack(reader: BinaryReader) {
    this.tiers = unpackPackedHashTable<SpellSetTiers>(reader, SpellSetTiers);
  }
}
