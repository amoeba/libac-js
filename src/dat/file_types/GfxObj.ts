import BinaryReader from "../../BinaryReader";
import { readItem } from "../../Unpackable";
import { SWVertex } from "../types/SWVertex";
import { Polygon } from "../types/Polygon";
import { VertexArray } from "../types/VertexArray";
import { readBSPNode, BSPTreeType } from "../types/BSPNode";

/** GfxObj flags (AC `GfxObjFlags`). */
export enum GfxObjFlags {
  HasPhysics = 0x01,
  HasDrawing = 0x02,
  Unknown = 0x04,
  HasDIDDegrade = 0x08,
}

/** A GraphicsObject (GfxObj) from the portal DAT.

 * GfxObj binaries contain the mesh geometry referenced by Setup part IDs.
 * Each GfxObj has a VertexArray (positions, normals, UVs) and a Polygons
 * dictionary (triangle definitions with surface/material references).
 */
export class GfxObj {
  /** DBObj header ID (0x0100XXXX). */
  id: number = 0;

  /** GfxObjFlags. */
  flags: number = 0;

  /** Surface IDs — texture references (0x05XXXXXX range). */
  surfaces: number[] = [];

  /** Vertex data keyed by uint16 ID. */
  vertexArray?: VertexArray;

  /** Physics polygons (keyed by ushort) — only present if HasPhysics. */
  physicsPolygons: Map<number, Polygon> = new Map();

  /** Drawing polygons (keyed by ushort) — only present if HasDrawing. */
  polygons: Map<number, Polygon> = new Map();

  /** Degrade DID — only present if HasDIDDegrade. */
  didDegrade: number = 0;

  /**
   * Parse a GfxObj binary. The binary begins with the DBObj header ID
   * (u32), followed by the GfxObj-specific data.
   *
   * Based on the C# `GfxObj.Unpack` reference in `DatReaderWriter.Generated`.
   */
  static fromBuffer(data: Uint8Array | ArrayBuffer): GfxObj {
    const reader = new BinaryReader(data);
    const gfxobj = new GfxObj();

    // DBObj header — Id (present because HasId flag is set on GfxObj)
    gfxobj.id = reader.ReadUint32();

    // Flags
    gfxobj.flags = reader.ReadUint32();

    // Surfaces
    const numSurfaces = reader.ReadCompressedUInt();
    for (let i = 0; i < numSurfaces; i++) {
      gfxobj.surfaces.push(reader.ReadUint32());
    }

    // VertexArray
    gfxobj.vertexArray = readItem(reader, VertexArray);

    // Physics polygons + PhysicsBSP (if HasPhysics)
    if (gfxobj.flags & GfxObjFlags.HasPhysics) {
      const numPhysicsPolys = reader.ReadCompressedUInt();
      for (let i = 0; i < numPhysicsPolys; i++) {
        const key = reader.ReadUint16();
        const poly = readItem(reader, Polygon);
        gfxobj.physicsPolygons.set(key, poly);
      }
      // Parse (and discard) the PhysicsBSPTree
      readBSPNode(reader, "Physics");
    }

    // SortCenter
    reader.ReadVector3();

    // Drawing polygons + DrawingBSP (if HasDrawing)
    if (gfxobj.flags & GfxObjFlags.HasDrawing) {
      const numPolys = reader.ReadCompressedUInt();
      for (let i = 0; i < numPolys; i++) {
        const key = reader.ReadUint16();
        const poly = readItem(reader, Polygon);
        gfxobj.polygons.set(key, poly);
      }
      // Parse (and discard) the DrawingBSPTree — we use the Polygons
      // dictionary directly for rendering.
      readBSPNode(reader, "Drawing");
    }

    // DIDDegrade (if HasDIDDegrade)
    if (gfxobj.flags & GfxObjFlags.HasDIDDegrade) {
      gfxobj.didDegrade = reader.ReadUint32();
    }

    return gfxobj;
  }

  /** True if this GfxObj has drawable geometry. */
  get hasDrawing(): boolean {
    return (this.flags & GfxObjFlags.HasDrawing) !== 0;
  }

  /** True if this GfxObj has physics data. */
  get hasPhysics(): boolean {
    return (this.flags & GfxObjFlags.HasPhysics) !== 0;
  }
}
