import BinaryReader from "../../BinaryReader.js";
import { readItem } from "../../Unpackable.js";
import { Stab } from "../types/Stab.js";
import { BuildInfo } from "../types/BuildInfo.js";

/**
 * Cell DAT LandblockInfo (id `(blockId << 16) | 0xFFFE`): everything static
 * that sits on the landblock — placement stabs and buildings.
 *
 * Layout: id u32, numCells u32, objects (u32 count x Stab), numBuildings u16,
 * packMask u16, buildings (BuildInfo), then (if packMask & 1) a packed
 * hash-table of guid -> cell restriction pairs (housing barriers etc).
 */
export class LandblockInfo {
  id = 0;
  numCells = 0;
  /** Outdoor static objects (Stab: model id + placement frame). */
  objects: Stab[] = [];
  packMask = 0;
  /** Buildings / structures with interiors. */
  buildings: BuildInfo[] = [];
  /** guid -> cell (only present when packMask & 1). */
  restrictionTables = new Map<number, number>();

  static fromBuffer(data: Uint8Array | ArrayBuffer): LandblockInfo {
    const reader = new BinaryReader(data);
    const info = new LandblockInfo();

    info.id = reader.ReadUint32();
    info.numCells = reader.ReadUint32();

    const numObjects = reader.ReadUint32();
    for (let i = 0; i < numObjects; i++) {
      info.objects.push(readItem(reader, Stab));
    }

    const numBuildings = reader.ReadUint16();
    info.packMask = reader.ReadUint16();
    for (let i = 0; i < numBuildings; i++) {
      info.buildings.push(readItem(reader, BuildInfo));
    }

    if (info.packMask & 1) {
      const count = reader.ReadUint16();
      reader.ReadUint16(); // bucket size
      for (let i = 0; i < count; i++) {
        info.restrictionTables.set(reader.ReadUint32(), reader.ReadUint32());
      }
    }

    return info;
  }
}