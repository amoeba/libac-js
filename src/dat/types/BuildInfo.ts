import BinaryReader from "../../BinaryReader.js";
import { Unpackable, readItem } from "../../Unpackable.js";
import { readFrame, type Frame } from "./Frame.js";
import { CBldPortal } from "./CBldPortal.js";

/** A building / structure-with-interior on a landblock (0x01/0x02 model). */
export class BuildInfo implements Unpackable {
  modelId = 0;
  frame: Frame = { origin: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };
  numLeaves = 0;
  portals: CBldPortal[] = [];

  unpack(reader: BinaryReader): void {
    this.modelId = reader.ReadUint32();
    this.frame = readFrame(reader);
    this.numLeaves = reader.ReadUint32();
    const numPortals = reader.ReadUint32();
    for (let i = 0; i < numPortals; i++) {
      this.portals.push(readItem(reader, CBldPortal));
    }
  }
}