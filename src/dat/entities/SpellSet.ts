import BinaryReader from "../../BinaryReader";
import { unpackPackedHashTable } from "../../PackedHashTable";
import { SpellSetTiers } from "./SpellSetTiers";
import { NumberDict } from "../file_types/SpellTable";
import { Unpackable } from "../../Unpackable";

export class SpellSet implements Unpackable {
  highest_tier: number | undefined
  tiers: NumberDict<SpellSetTiers> | undefined

  unpack(reader: BinaryReader) {
    this.tiers = unpackPackedHashTable<SpellSetTiers>(reader, SpellSetTiers);
  }
}
