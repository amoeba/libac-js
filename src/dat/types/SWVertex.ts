import BinaryReader, { Vec3 } from "../../BinaryReader.js";
import { Unpackable } from "../../Unpackable.js";

/** A vertex in a RenderMesh VertexArray (AC `SWVertex`). */
export class SWVertex implements Unpackable {
  origin: Vec3 = { x: 0, y: 0, z: 0 };
  normal: Vec3 = { x: 0, y: 0, z: 0 };
  uvs: { u: number; v: number }[] = [];

  unpack(reader: BinaryReader): void {
    const numUVs = reader.ReadUint16();
    this.origin = reader.ReadVector3();
    this.normal = reader.ReadVector3();
    for (let i = 0; i < numUVs; i++) {
      this.uvs.push({ u: reader.ReadSingle(), v: reader.ReadSingle() });
    }
  }
}
