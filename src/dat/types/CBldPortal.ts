import BinaryReader from "../../BinaryReader.js";
import { Unpackable } from "../../Unpackable.js";

/**
 * A "building portal" — a door/window/portal polygon on a building shell.
 *
 * On-disk layout (from the client's CBldPortal::UnPack): flags u16,
 * otherCellId u16, otherPortalId u16, numStabs u16, stabs[numStabs] u16,
 * then (if numStabs is odd) a u16 padding to a 4-byte boundary. The
 * cell/stab ids are low-16 bits combined with the landblock mask.
 *
 * Not needed to render the shell — parsed so BuildInfo never desyncs.
 */
export class CBldPortal implements Unpackable {
  flags = 0;
  otherCellId = 0;
  otherPortalId = 0;
  numStabs = 0;
  /** Low-16 stabs (envcells visible through this portal). */
  stabs: number[] = [];

  unpack(reader: BinaryReader): void {
    this.flags = reader.ReadUint16();
    this.otherCellId = reader.ReadUint16();
    this.otherPortalId = reader.ReadUint16();
    this.numStabs = reader.ReadUint16();
    for (let i = 0; i < this.numStabs; i++) {
      this.stabs.push(reader.ReadUint16());
    }
    if (this.numStabs & 1) reader.ReadUint16(); // pad to 4 bytes
  }
}