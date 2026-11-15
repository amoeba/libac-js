import BinaryReader from "../../BinaryReader.js";
import { readPlane, Plane } from "./Plane.js";
import { readSphere, Sphere } from "./Sphere.js";

/** BSP tree categories — determines which fields appear in each node. */
export type BSPTreeType = "Physics" | "Drawing" | "Cell";

/** A Drawing BSP PORT node's opening link and associated polygon. */
export interface BSPPortalPoly {
  portalIndex: number;
  polygonId: number;
}

/** Parsed BSP node. CellStruct exposes its Cell and Drawing BSP trees; parsing
 * them retains topology but does not implement a query or culling policy. */
export interface BSPNode {
  type: string;
  splittingPlane?: Plane;
  /** Present on LEAF nodes (including Cell BSP leaves). */
  leafIndex?: number;
  posNode?: BSPNode;
  negNode?: BSPNode;
  sphere?: Sphere;
  inPolys: number[];
  /** Present on Drawing PORT nodes; pairs read from BSPPortal.InPortals. */
  inPortals?: BSPPortalPoly[];
}

/** Read a 4-byte ASCII type tag stored in little-endian (reversed) order. */
function readNodeType(reader: BinaryReader): string {
  const bytes = reader.ReadBytes(4);
  return String.fromCharCode(bytes[3], bytes[2], bytes[1], bytes[0]);
}

/** Read a PortalPoly (DrawingBSPTree PORT nodes), two int16s:
 * PortalIndex + PolygonId (see ACE PortalPoly.cs). */
function readPortalPoly(reader: BinaryReader): BSPPortalPoly {
  return { portalIndex: reader.ReadInt16(), polygonId: reader.ReadInt16() };
}

/** Recursively parse a BSP node tree and collect InPolys.

 * Mirrors BSPNode::ReadNode / BSPNode::Unpack / BSPLeaf::Unpack /
 * BSPPortal::Unpack from ACEmulator/ACViewer at c5c54fb3318cd956a330a920c105a0109aaeb3fd
 * (ACE/Source/ACE.DatLoader/Entity). Cell containment semantics live in the
 * corresponding Physics/BSP/BSPNode.point_inside_cell_bsp implementation;
 * retaining the tree here does not itself implement that query.
 */
export function readBSPNode(
  reader: BinaryReader,
  treeType: BSPTreeType
): BSPNode {
  const type = readNodeType(reader);
  const node: BSPNode = { type, inPolys: [] };

  if (type === "LEAF") {
    // LeafIndex
    node.leafIndex = reader.ReadInt32();

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
    node.splittingPlane = readPlane(reader);
    node.posNode = readBSPNode(reader, treeType);
    node.negNode = readBSPNode(reader, treeType);

    if (treeType === "Drawing") {
      readSphere(reader);
      const numPolys = reader.ReadUint32();
      const numPortals = reader.ReadUint32();
      for (let i = 0; i < numPolys; i++) {
        node.inPolys.push(reader.ReadUint16());
      }
      node.inPortals = [];
      for (let i = 0; i < numPortals; i++) {
        node.inPortals.push(readPortalPoly(reader));
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
