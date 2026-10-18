import BinaryReader from "../../BinaryReader.js";
import { Unpackable } from "../../Unpackable.js";

/** Connection from one indoor EnvCell to another. */
export class CellPortal implements Unpackable {
  flags = 0;
  polygonId = 0;
  otherCellId = 0;
  otherPortalId = 0;

  unpack(reader: BinaryReader): void {
    this.flags = reader.ReadUint16();
    this.polygonId = reader.ReadUint16();
    this.otherCellId = reader.ReadUint16();
    this.otherPortalId = reader.ReadUint16();
  }
}
