import { readFileSync } from "node:fs";
import BinaryReader from "./BinaryReader.js";
import { readItem } from "./Unpackable.js";
import { Environment } from "./dat/file_types/Environment.js";
import { CellStruct } from "./dat/types/CellStruct.js";
import { readBSPNode } from "./dat/types/BSPNode.js";

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));

function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

function f32(view: DataView, offset: number, value: number): void {
  view.setFloat32(offset, value, true);
}

function appendTag(bytes: number[], tag: string): void {
  bytes.push(...[...tag].reverse().map((char) => char.charCodeAt(0)));
}

function appendU32(bytes: number[], value: number): void {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value, true);
  bytes.push(...new Uint8Array(buffer));
}

function appendF32(bytes: number[], value: number): void {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, value, true);
  bytes.push(...new Uint8Array(buffer));
}

function appendPlane(bytes: number[], normal: [number, number, number], distance: number): void {
  for (const value of [...normal, distance]) appendF32(bytes, value);
}

function appendCellStruct(bytes: number[], rootIndex: number): void {
  // Empty polygon/physics-polygon/portal counts and empty VertexArray.
  for (const value of [0, 0, 0, 0, 0]) appendU32(bytes, value);
  // Cell tree: a PORT's retained plane and two LEAF children.
  appendTag(bytes, "PORT");
  appendPlane(bytes, [0, 0, 1], -1.25);
  appendTag(bytes, "LEAF");
  appendU32(bytes, rootIndex);
  appendTag(bytes, "LEAF");
  appendU32(bytes, rootIndex + 1);
  // Empty Physics tree leaf (LeafIndex, Solid, Sphere, polygon count).
  appendTag(bytes, "LEAF");
  appendU32(bytes, rootIndex + 2);
  appendU32(bytes, 0);
  for (const value of [0, 0, 0, 0]) appendF32(bytes, value);
  appendU32(bytes, 0);
  // No Drawing BSP.
  appendU32(bytes, 0);
  while (bytes.length % 4) bytes.push(0);
}

function syntheticEnvironment(): Uint8Array {
  const bytes: number[] = [];
  appendU32(bytes, 0x0d000001);
  appendU32(bytes, 2);
  appendU32(bytes, 0);
  appendCellStruct(bytes, 10);
  appendU32(bytes, 1);
  appendCellStruct(bytes, 20);
  return Uint8Array.from(bytes);
}

test("CellStruct retains Cell BSP PORT planes and leaf indices without shifting the next record", () => {
  const data = syntheticEnvironment();
  const reader = new BinaryReader(data);
  expect(reader.ReadUint32()).toBe(0x0d000001);
  expect(reader.ReadUint32()).toBe(2);

  expect(reader.ReadUint32()).toBe(0);
  const first = readItem(reader, CellStruct);
  expect(first.cellBsp?.type).toBe("PORT");
  expect(first.cellBsp?.splittingPlane).toEqual({
    normal: { x: 0, y: 0, z: 1 },
    distance: -1.25,
  });
  expect(first.cellBsp?.posNode?.leafIndex).toBe(10);
  expect(first.cellBsp?.negNode?.leafIndex).toBe(11);
  expect(reader.ReadUint32()).toBe(1);

  const second = readItem(reader, CellStruct);
  expect(second.cellBsp?.splittingPlane?.distance).toBe(-1.25);
  expect(second.cellBsp?.posNode?.leafIndex).toBe(20);
  expect(reader.position).toBe(data.byteLength);
  expect(Environment.fromBuffer(data).cells.get(1)?.cellBsp?.negNode?.leafIndex).toBe(21);
});

test("real Meeting Hall Environment retains its Cell BSP plane chain", () => {
  const environment = Environment.fromBuffer(fixture("environment-0x0d000104.bin"));
  const structure = environment.cells.get(0);
  expect(environment.id).toBe(0x0d000104);
  expect(structure?.portalPolygons).toEqual(new Set([20, 22, 21]));

  const planes = [];
  let node = structure?.cellBsp;
  while (node) {
    if (node.splittingPlane) planes.push(node.splittingPlane);
    node = node.posNode;
  }
  expect(planes).toHaveLength(6);
  expect(planes[0]).toEqual({ normal: { x: 0, y: 0, z: -1 }, distance: expect.closeTo(3.002, 3) });
  expect(planes.map((plane) => plane.normal)).toEqual([
    { x: 0, y: 0, z: -1 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: -1, y: 0, z: 0 },
  ]);
});

test("readBSPNode retains PORT planes and LEAF index", () => {
  const data = new Uint8Array(4 + 16 + 8 + 8);
  const view = new DataView(data.buffer);
  data.set([0x54, 0x52, 0x4f, 0x50], 0); // reversed "PORT"
  f32(view, 4, 1);
  f32(view, 8, 0);
  f32(view, 12, 0);
  f32(view, 16, 0.5);
  data.set([0x46, 0x41, 0x45, 0x4c], 20); // reversed "LEAF"
  u32(view, 24, 7);
  data.set([0x46, 0x41, 0x45, 0x4c], 28);
  u32(view, 32, 8);
  const reader = new BinaryReader(data);
  const portal = readBSPNode(reader, "Cell");
  expect(portal.type).toBe("PORT");
  expect(portal.splittingPlane?.distance).toBe(0.5);
  expect(portal.posNode?.leafIndex).toBe(7);
  expect(portal.negNode?.leafIndex).toBe(8);
  expect(reader.position).toBe(data.byteLength);
});
