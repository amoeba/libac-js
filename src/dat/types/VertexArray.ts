import BinaryReader from "../../BinaryReader.js";
import { Unpackable, readItem } from "../../Unpackable.js";
import { SWVertex } from "./SWVertex.js";

/** A vertex array in a RenderMesh (AC `RenderMeshVerticesArray` / `VertexArray`).

 * Contains keyed SWVertex entries. The uint16 keys match the VertexIds
 * referenced by Polygons.
 */
export class VertexArray implements Unpackable {
  /** 0 = CSWVertexType (the only known value in AC data). */
  vertexType: number = 0;

  /** Vertices keyed by their uint16 ID (matches Polygon.VertexIds). */
  vertices: Map<number, SWVertex> = new Map();

  unpack(reader: BinaryReader): void {
    this.vertexType = reader.ReadInt32();
    const numVertices = reader.ReadUint32();

    for (let i = 0; i < numVertices; i++) {
      const key = reader.ReadUint16();
      const vertex = readItem(reader, SWVertex);
      this.vertices.set(key, vertex);
    }
  }

  /** Look up a vertex by ID, returning undefined if not present. */
  getVertex(id: number): SWVertex | undefined {
    return this.vertices.get(id);
  }
}
