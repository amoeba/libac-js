import BinaryReader from "../BinaryReader"
import { DatFile } from "./DatFile"
import { Unpackable } from "../Unpackable"

export class DatDirectoryHeader implements Unpackable {
  branches: Uint32Array
  entryCount: number
  entries: DatFile[]

  constructor() {
    this.branches = new Uint32Array(62);
    this.entryCount = 0;
    this.entries = [];
  }

  unpack(reader: BinaryReader) {
    for (let i = 0; i < this.branches.length; i++) {
      this.branches[i] = reader.ReadUint32();
    }

    this.entryCount = reader.ReadUint32();

    for (let i = 0; i < this.entryCount; i++) {
      this.entries[i] = new DatFile();
      this.entries[i].unpack(reader);
    }
  }
}
