import BinaryReader from "../../BinaryReader.js";
import { readItem } from "../../Unpackable.js";
import { CellStruct } from "../types/CellStruct.js";

/** Portal-DAT prefab geometry shared by one or more indoor EnvCells. */
export class Environment {
  id = 0;
  cells = new Map<number, CellStruct>();

  static fromBuffer(data: Uint8Array | ArrayBuffer): Environment {
    const reader = new BinaryReader(data);
    const environment = new Environment();
    environment.id = reader.ReadUint32();
    const count = reader.ReadUint32();
    for (let i = 0; i < count; i++) {
      const key = reader.ReadUint32();
      environment.cells.set(key, readItem(reader, CellStruct));
    }
    return environment;
  }
}
