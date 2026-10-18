import BinaryReader from "../../BinaryReader.js";
import { readItem } from "../../Unpackable.js";
import { CellPortal } from "../types/CellPortal.js";
import { readFrame, type Frame } from "../types/Frame.js";
import { Stab } from "../types/Stab.js";

export enum EnvCellFlags {
  HasStaticObjects = 0x02,
  HasRestrictionObject = 0x08,
}

/** Indoor cell from client_cell.dat: dungeon room prefab plus world frame. */
export class EnvCell {
  id = 0;
  flags = 0;
  environmentId = 0;
  cellStructure = 0;
  position: Frame = {
    origin: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
  };
  portals: CellPortal[] = [];
  visibleCells: number[] = [];
  /** Surface IDs are stored as the low 16 bits of portal-DAT surface IDs. */
  surfaces: number[] = [];
  staticObjects: Stab[] = [];
  restrictionObject?: number;

  static fromBuffer(data: Uint8Array | ArrayBuffer): EnvCell {
    const reader = new BinaryReader(data);
    const cell = new EnvCell();
    cell.id = reader.ReadUint32();
    cell.flags = reader.ReadUint32();
    reader.ReadUint32(); // duplicate CellId
    const numSurfaces = reader.ReadUint8();
    const numPortals = reader.ReadUint8();
    const numVisibleCells = reader.ReadUint16();
    for (let i = 0; i < numSurfaces; i++) {
      cell.surfaces.push(0x08000000 | reader.ReadUint16());
    }
    cell.environmentId = 0x0d000000 | reader.ReadUint16();
    cell.cellStructure = reader.ReadUint16();
    cell.position = readFrame(reader);
    for (let i = 0; i < numPortals; i++) {
      cell.portals.push(readItem(reader, CellPortal));
    }
    for (let i = 0; i < numVisibleCells; i++) cell.visibleCells.push(reader.ReadUint16());
    if (cell.flags & EnvCellFlags.HasStaticObjects) {
      const count = reader.ReadUint32();
      for (let i = 0; i < count; i++) {
        cell.staticObjects.push(readItem(reader, Stab));
      }
    }
    if (cell.flags & EnvCellFlags.HasRestrictionObject) {
      cell.restrictionObject = reader.ReadUint32();
    }
    return cell;
  }
}
