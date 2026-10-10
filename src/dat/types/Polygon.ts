import BinaryReader from "../../BinaryReader";
import { Unpackable } from "../../Unpackable";

/** A polygon in a RenderMesh (AC `Polygon`).

 * The Polygon describes a convex polygon with an arbitrary number of
 * vertices (up to 255). Vertex IDs index into the parent GfxObj's
 * VertexArray by their uint16 keys.
 */
export class Polygon implements Unpackable {
  /** Number of vertices in this polygon (1 byte). */
  numVertices: number = 0;

  /** Stippling flags (1 byte): NoPos=0x01, NoNeg=0x02. */
  stippling: number = 0;

  /** Cull mode (i32): Clockwise, CounterClockwise, or None. */
  sidesType: number = 0;

  /** Surface ID for the front (positive) side. */
  posSurface: number = 0;

  /** Surface ID for the back (negative) side. */
  negSurface: number = 0;

  /** Vertex IDs indexing into the VertexArray. */
  vertexIds: number[] = [];

  /** UV index per vertex for the positive side (if !NoPos). */
  posUVIndices: number[] = [];

  /** UV index per vertex for the negative side (if Clockwise). */
  negUVIndices: number[] = [];

  unpack(reader: BinaryReader): void {
    this.numVertices = reader.ReadUint8();
    this.stippling = reader.ReadUint8();
    this.sidesType = reader.ReadInt32();
    this.posSurface = reader.ReadInt16();
    this.negSurface = reader.ReadInt16();

    for (let i = 0; i < this.numVertices; i++) {
      this.vertexIds.push(reader.ReadInt16());
    }

    // StipplingType: NoPos=0x04, NoNeg=0x08
    // CullMode: Clockwise=2
    const NO_POS = 0x04;
    if (!(this.stippling & NO_POS)) {
      for (let i = 0; i < this.numVertices; i++) {
        this.posUVIndices.push(reader.ReadUint8());
      }
    }

    const NO_NEG = 0x08;
    const CLOCKWISE = 2;
    if (!(this.stippling & NO_NEG) && this.sidesType === CLOCKWISE) {
      for (let i = 0; i < this.numVertices; i++) {
        this.negUVIndices.push(reader.ReadUint8());
      }
    }
  }

  /** Fan-triangulate this convex polygon into triangle indices. */
  getTriangleIndices(): number[] {
    const indices: number[] = [];
    for (let i = 1; i < this.numVertices - 1; i++) {
      // VertexIds are signed int16 but used as unsigned ushort keys
      indices.push(this.vertexIds[0] & 0xffff);
      indices.push(this.vertexIds[i] & 0xffff);
      indices.push(this.vertexIds[i + 1] & 0xffff);
    }
    return indices;
  }
}
