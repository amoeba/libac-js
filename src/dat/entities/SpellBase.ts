import BinaryReader from "../../BinaryReader";
import { SpellTable } from "../file_types/SpellTable";
import { Unpackable } from "../../Unpackable";
import { MagicSchool } from "../enums/MagicSchool";
import { SpellType } from "../enums/SpellType";
import { SpellCategory } from "../enums/SpellCategory";

const HIGHEST_COMP_ID = 198;

export class SpellBase implements Unpackable {
  name: string | undefined
  description: string | undefined
  school: MagicSchool | undefined
  icon: number | undefined
  category: SpellCategory | undefined
  bitfield: number | undefined
  base_mana: number | undefined
  base_range_constant: number | undefined
  base_range_mod: number | undefined
  power: number | undefined
  spell_economy_mod: number | undefined
  formula_version: number | undefined
  component_loss: number | undefined
  meta_spell_type: SpellType | undefined
  meta_spell_id: number | undefined
  duration: number | undefined
  degrade_modifier: number | undefined
  degrade_limit: number | undefined
  portal_lifetime: number | undefined
  formula: number[] | undefined
  caster_effect: number | undefined
  target_effect: number | undefined
  fizzle_effect: number | undefined
  recovery_interval: number | undefined
  recovery_amount: number | undefined
  display_order: number | undefined
  non_component_target_type: number | undefined
  mana_mod: number | undefined

  unpack(reader: BinaryReader) {
    this.name = reader.ReadObfuscatedString();
    reader.AlignBoundary();
    this.description = reader.ReadObfuscatedString();
    reader.AlignBoundary();
    this.school = reader.ReadUint32();
    this.icon = reader.ReadUint32();
    this.category = reader.ReadUint32();
    this.bitfield = reader.ReadUint32();
    this.base_mana = reader.ReadUint32();
    this.base_range_constant = reader.ReadSingle();
    this.base_range_mod = reader.ReadSingle();
    this.power = reader.ReadUint32();
    this.spell_economy_mod = reader.ReadSingle();
    this.formula_version = reader.ReadUint32();
    this.component_loss = reader.ReadSingle();
    this.meta_spell_type = reader.ReadUint32();
    this.meta_spell_id = reader.ReadUint32();

    switch (this.meta_spell_type) {
      case SpellType.Enchantment:
      case SpellType.FellowEnchantment:
        this.duration = reader.ReadDouble();
        this.degrade_modifier = reader.ReadSingle();
        this.degrade_limit = reader.ReadSingle();
        break;
      case SpellType.PortalSummon:
        this.portal_lifetime = reader.ReadDouble();
        break;
    }

    let rawComps: number[] = [];

    for (let j = 0; j < 8; j++) {
      let comp = reader.ReadUint32();

      // ACE only adds under this condition so we do it too:
      if (comp > 0) {
        rawComps.push(comp);
      }
    }

    // Get the decryped component values
    this.formula = this.decrypt_formula(rawComps, this.name, this.description);

    this.caster_effect = reader.ReadUint32();
    this.target_effect = reader.ReadUint32();
    this.fizzle_effect = reader.ReadUint32();
    this.recovery_interval = reader.ReadDouble();
    this.recovery_amount = reader.ReadSingle();
    this.display_order = reader.ReadUint32();
    this.non_component_target_type = reader.ReadUint32();
    this.mana_mod = reader.ReadUint32();
  }

  decrypt_formula(raw_comps: number[], name: string, description: string): number[] {
    let comps: number[] = [];

    let nameHash = SpellTable.compute_hash(name);
    let descHash = SpellTable.compute_hash(description);

    let key = (nameHash % 0x12107680) + (descHash % 0xBEADCF45);

    for (let i = 0; i < raw_comps.length; i++) {
      let comp = (raw_comps[i] - key);

      if (comp > HIGHEST_COMP_ID) {
        comp = comp & 0xFF;
      }

      comps.push(comp);
    }

    return comps;
  }
}
