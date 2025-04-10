import SeekableFileReader from "../seekable_file_reader";
import { unpackPackedHashTable } from "./PackedHashTable";
import { SpellBase } from "./SpellBase";

export interface NumberDict<T> {
  [key: number]: T
}

export class SpellTable {
  id: number | undefined
  spells: NumberDict<SpellBase> | undefined
  spell_set: NumberDict<SpellTable> | undefined

  unpack(reader: SeekableFileReader) {
    this.id = reader.ReadUint32();

    this.spells = unpackPackedHashTable<SpellBase>(reader, SpellBase);
    // this.spell_set: TODO
  }

  static compute_hash(input: string): number {
    let result = 0;

    if (input.length <= 0) {
      return result;
    }

    // Create and fill byte arry from string
    const str = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
      str[i] = input.charCodeAt(i) & 0xFF;
    }

    for (let i = 0; i < str.length; i++) {
      // Approximation of sbyte from C#
      let c = str[i];
      if (c > 127) {
        c = c - 256;
      }

      result = c + (result << 4);

      if ((result & 0xF0000000) !== 0) {
        result = (result ^ ((result & 0xF0000000) >> 24)) & 0x0FFFFFFF;
      }
    }

    return result >>> 0;
  }
}
