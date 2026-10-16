import BinaryReader from "../../BinaryReader.js";
import { readPlane, Plane } from "./Plane.js";
import { readSphere, Sphere } from "./Sphere.js";

/** BSP tree categories — determines which fields appear in each node. */
export type BSPTreeType = "Physics" | "Drawing" | "Cell";

/** A parsed BSP node. We only retain InPolys (polygon IDs already held in the
 * GfxObj's Polygons dictionary) — the tree structure itself is not needed for
 * Three.js rendering, but we must consume it to advance the reader. */
export interface BSPNode {
  type: string;
  splittingPlane?: Plane;
  posNode?: BSPNode;
  negNode?: BSPNode;
  sphere?: Sphere;
  inPolys: number[];
}

/** Read a 4-byte ASCII type tag stored in little-endian (reversed) order. */
function readNodeType(reader: BinaryReader): string {
  const bytes = reader.ReadBytes(4);
  return String.fromCharCode(bytes[3], bytes[2], bytes[1], bytes[0]);
}

/** Skip a PortalPoly (DrawingBSPTree PORT nodes only — rare for GfxObj data). */
function skipPortalPoly(reader: BinaryReader): void {
  const numVerts = reader.ReadUint16();
  reader.ReadUint16(); // flags?
  reader.ReadUint16(); // sector?
  for (let i = 0; i < numVerts; i++) {
    reader.ReadVector3();
  }
  const numEdges = reader.ReadUint16();
  for (let i = 0; i < numEdges; i++) {
    reader.ReadInt32();  // edge
    reader.ReadInt16();  // forward
    reader.ReadInt16();  // backward
  }
}

/** Recursively parse a BSP node tree and collect InPolys.

 * Mirrors BSPNode::ReadNode / BSPNode::Unpack / BSPLeaf::Unpack /
 * BSPPortal::Unpack from the reference C# implementation.
 */
export function readBSPNode(
  reader: BinaryReader,
  treeType: BSPTreeType
): BSPNode {
  const type = readNodeType(reader);
  const node: BSPNode = { type, inPolys: [] };

  if (type === "LEAF") {
    // LeafIndex
    reader.ReadInt32();

    if (treeType === "Physics") {
      reader.ReadInt32(); // Solid
      readSphere(reader);  // Sphere
      const numPolys = reader.ReadUint32();
      for (let i = 0; i < numPolys; i++) {
        node.inPolys.push(reader.ReadUint16());
      }
    }
    // For Cell, leaves have no extra data after LeafIndex
    return node;
  }

  if (type === "PORT") {
    // BSPPortal: tag + Plane + PosNode + NegNode + [Drawing: Sphere + polys + portals]
    readPlane(reader); // SplittingPlane
    node.posNode = readBSPNode(reader, treeType);
    node.negNode = readBSPNode(reader, treeType);

    if (treeType === "Drawing") {
      readSphere(reader);
      const numPolys = reader.ReadUint32();
      const numPortals = reader.ReadUint32();
      for (let i = 0; i < numPolys; i++) {
        node.inPolys.push(reader.ReadUint16());
      }
      for (let i = 0; i < numPortals; i++) {
        skipPortalPoly(reader);
      }
    }
    // For Cell/Physics, PORT nodes have no additional data after children
    return node;
  }

  // Branch node — read splitting plane
  node.splittingPlane = readPlane(reader);

  // Each branch type encodes which children are present:
  //   "BPnn" / "BPIn" → PosNode only
  //   "BpIN" / "BpnN" → NegNode only
  //   "BPIN" / "BPnN" → both (PosNode first, then NegNode)
  const hasPos = type === "BPnn" || type === "BPIn" || type === "BPIN" || type === "BPnN";
  const hasNeg = type === "BpIN" || type === "BpnN" || type === "BPIN" || type === "BPnN";

  if (hasPos) {
    node.posNode = readBSPNode(reader, treeType);
  }
  if (hasNeg) {
    node.negNode = readBSPNode(reader, treeType);
  }

  if (treeType === "Cell") {
    return node;
  }

  // Sphere present for all non-Cell tree types
  node.sphere = readSphere(reader);

  if (treeType === "Physics") {
    return node;
  }

  // Drawing: read InPolys (list of polygon IDs)
  const numPolys = reader.ReadUint32();
  for (let i = 0; i < numPolys; i++) {
    node.inPolys.push(reader.ReadUint16());
  }

  return node;
}
