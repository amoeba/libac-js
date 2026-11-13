import BinaryReader from "../../BinaryReader.js";
import { Unpackable, readItem } from "../../Unpackable.js";
import { readBSPNode, type BSPNode } from "./BSPNode.js";
import { Polygon } from "./Polygon.js";
import { VertexArray } from "./VertexArray.js";

/** Reusable mesh data for one room shape in a portal-DAT Environment. */
export class CellStruct implements Unpackable {
  vertexArray = new VertexArray();
  polygons = new Map<number, Polygon>();
  /** Polygon IDs used as openings to adjacent EnvCells, not solid surfaces. */
  portalPolygons = new Set<number>();
  /** Cell-containment BSP in structure-local coordinates, when present. */
  cellBsp?: BSPNode;

  unpack(reader: BinaryReader): void {
    const numPolygons = reader.ReadUint32();
    const numPhysicsPolygons = reader.ReadUint32();
    const numPortals = reader.ReadUint32();

    this.vertexArray.unpack(reader);
    for (let i = 0; i < numPolygons; i++) {
      const key = reader.ReadUint16();
      this.polygons.set(key, readItem(reader, Polygon));
    }
    for (let i = 0; i < numPortals; i++) {
      this.portalPolygons.add(reader.ReadUint16());
    }
    if (reader.position % 4 !== 0) reader.position += 4 - (reader.position % 4);

    // Retain the Cell tree rather than only consuming it. Physics uses these
    // local splitting planes for point-in-cell tests. See the pinned ACE
    // implementation: Physics/BSP/BSPNode.point_inside_cell_bsp.
    this.cellBsp = readBSPNode(reader, "Cell");

    for (let i = 0; i < numPhysicsPolygons; i++) {
      reader.ReadUint16();
      readItem(reader, Polygon);
    }
    readBSPNode(reader, "Physics");

    if (reader.ReadUint32() !== 0) readBSPNode(reader, "Drawing");
    if (reader.position % 4 !== 0) reader.position += 4 - (reader.position % 4);
  }

}
