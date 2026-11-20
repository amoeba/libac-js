import { LANDBLOCK_GRID, LANDBLOCK_TILE } from "../index.js";
import type { CellLandblock, ObjectDesc, Scene, Region, Quaternion, Vec3 } from "../index.js";

/**
 * Procedural landscape scenery (AC "Scene" 0x12 + Region scene tables).
 *
 * The retail client and server do not store every rock and tree. Instead each
 * terrain control point names a *scene type* (the 5-bit scenery field of the
 * terrain word); the Region maps that to a small list of Scene ids, and one is
 * selected from the list by a fixed-seed integer hash of the cell's global
 * coordinates. Each Scene lists ObjectDesc placement rules; another hash decides
 * whether a rule fires, where it sits, how it is rotated and how it is scaled.
 * Because the same hash runs on both sides, client and server agree on what
 * exists where without shipping a per-object list.
 *
 * This is a faithful port of ACViewer's `Landblock.get_land_scenes` and
 * `ObjectDesc.Displace/ScaleObj/RotateObj/ObjAlign/CheckSlope`. Those methods
 * mix `int`/`uint` in a way ACE's C# port widens to 64-bit `long`; the hashes,
 * however, are defined over 32-bit arithmetic (the shared `2.3283064e-10` is
 * exactly `2^-32`), so every product/subtraction below is kept in 32 bits with
 * `Math.imul` and sign- or zero-extended as the original does. The 32-bit
 * interpretation is what makes the four `quadrant` branches of `Displace`
 * equiprobable and keeps `scene_idx` in range.
 */

const TWO_32 = 4294967296;
/** `2.3283064e-10` is 1/2^32, the client's fixed-point -> fraction scale. */
const SCALE_2_32 = 2.3283064e-10;

/** Unsigned 32-bit value of a (possibly 64-bit-exact) integer expression. */
function unsigned32(v: number): number {
  return ((v % TWO_32) + TWO_32) % TWO_32;
}

/** The client's fixed-point hash fraction: `(uint)expr * 2^-32` in [0, 1). */
function unsignedFraction(v: number): number {
  return unsigned32(v) * SCALE_2_32;
}

/** `1813693831 * a - offset * (1360117743 * a * c + 1888038839) - 1109124029 * c`
 * (all 32-bit), the shared term behind displacement/scale/rotation. */
function shuffleTerm(a: number, c: number, offset: number): number {
  let inner = Math.imul(1360117743, a);
  inner = Math.imul(inner, c);
  inner = (inner + 1888038839) | 0;
  const product = Math.imul(offset, inner);
  let v = Math.imul(1813693831, a);
  v = (v - product) | 0;
  v = (v - Math.imul(1109124029, c)) | 0;
  return v;
}

/** `Displace`: pseudo-random local offset plus a quadrant rotation. */
export function displace(obj: ObjectDesc, ix: number, iy: number, iq: number): Vec3 {
  const loc = obj.baseLoc.origin;
  let x: number;
  let y: number;
  if (obj.displaceX <= 0) x = loc.x;
  else x = unsignedFraction(shuffleTerm(iy, ix, iq + 45773)) * obj.displaceX + loc.x;
  if (obj.displaceY <= 0) y = loc.y;
  else y = unsignedFraction(shuffleTerm(iy, ix, iq + 72719)) * obj.displaceY + loc.y;

  let q = Math.imul(1813693831, iy);
  let inner = Math.imul(1870387557, iy);
  inner = (inner + 1109124029) | 0;
  inner = Math.imul(ix, inner);
  q = (q - inner) | 0;
  q = (q - 402451965) | 0;
  const quadrant = unsignedFraction(q);

  if (quadrant >= 0.75) return { x: y, y: -x, z: loc.z };
  if (quadrant >= 0.5) return { x: -x, y: -y, z: loc.z };
  if (quadrant >= 0.25) return { x: -y, y: x, z: loc.z };
  return { x, y, z: loc.z };
}

/** `ScaleObj`: log-uniform scale in [minScale, maxScale]. */
export function scaleObj(obj: ObjectDesc, x: number, y: number, k: number): number {
  const { minScale, maxScale } = obj;
  if (minScale === maxScale) return maxScale;
  const exponent = unsignedFraction(shuffleTerm(y, x, k + 32593));
  return Math.pow(maxScale / minScale, exponent) * minScale;
}

/** `RotateObj` heading (degrees); 0 when `maxRotation` is unset. */
export function rotateObjHeading(obj: ObjectDesc, x: number, y: number, k: number): number {
  if (obj.maxRotation <= 0) return 0;
  return unsignedFraction(shuffleTerm(y, x, k + 63127)) * obj.maxRotation;
}

/** `CheckSlope`: the walkable plane's normal Z must fall inside the range. */
export function checkSlope(obj: ObjectDesc, normalZ: number): boolean {
  return normalZ >= obj.minSlope && normalZ <= obj.maxSlope;
}

/** A yaw (heading, degrees) about AC's Z axis as a quaternion. */
function headingQuaternion(degrees: number): Quaternion {
  const half = (degrees * Math.PI) / 360;
  return { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };
}

/** Quaternion product `a * b` (apply b, then a). */
function multiplyQuaternion(a: Quaternion, b: Quaternion): Quaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

// ─── terrain sampling (AC triangle mesh, not the smooth rendered surface) ────

interface Tri {
  a: Vec3;
  b: Vec3;
  c: Vec3;
}

/** `LandblockStruct.ConstructPolygons` split direction for a global cell. */
export function cellCutIsNe(globalCellX: number, globalCellY: number): boolean {
  const seedA = unsigned32(Math.imul(globalCellX, 214614067));
  const seedB = unsigned32(Math.imul(globalCellX, 1109124029));
  const magicA = seedA + 1813693831;
  const value = globalCellY * magicA - seedB - 1369149221;
  // `(uint)value * 2^-32 < 0.5` -> SW-to-NE cut is the high half.
  return unsigned32(value) >= 2147483648;
}

/** ACE `Polygon.point_in_poly2D(point, Sidedness.Positive)`. */
function pointInPoly2D(v: Tri, px: number, py: number): boolean {
  const verts = [v.a, v.b, v.c];
  let prevIdx = 0;
  for (let i = verts.length - 1; i >= 0; i--) {
    const prev = verts[prevIdx];
    const cur = verts[i];
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const diffCross = dy * cur.x - dx * cur.y + dx * py - dy * px;
    if (diffCross > 0) return false;
    prevIdx = i;
  }
  return true;
}

/** The two terrain triangles of a cell, in ACE's polygon order. */
function cellTriangles(
  lb: CellLandblock,
  table: number[],
  cx: number,
  cy: number,
  ne: boolean,
): [Tri, Tri] {
  const tile = LANDBLOCK_TILE;
  const h = (ix: number, iy: number) => table[lb.height[ix * LANDBLOCK_GRID + iy]] ?? 0;
  const p00: Vec3 = { x: cx * tile, y: cy * tile, z: h(cx, cy) };
  const p10: Vec3 = { x: (cx + 1) * tile, y: cy * tile, z: h(cx + 1, cy) };
  const p01: Vec3 = { x: cx * tile, y: (cy + 1) * tile, z: h(cx, cy + 1) };
  const p11: Vec3 = { x: (cx + 1) * tile, y: (cy + 1) * tile, z: h(cx + 1, cy + 1) };
  // ACE AddPolygon calls: (v0, v1, v2) order determines the plane winding.
  if (!ne) return [{ a: p00, b: p10, c: p01 }, { a: p11, b: p01, c: p10 }];
  return [{ a: p00, b: p10, c: p11 }, { a: p00, b: p11, c: p01 }];
}

export interface TerrainSample {
  /** World Z on the walkable plane at the point. */
  z: number;
  /** Walkable plane normal (AC Z-up). `normal.z` is the slope. */
  normal: Vec3;
}

/**
 * The walkable terrain plane at a landblock-local (x, y), using the coarse AC
 * triangle mesh (`ConstructVertices`/`ConstructPolygons`) rather than the
 * smooth bilinear surface the renderer draws. Scenery is placed on this mesh so
 * its slope test and Z match the client and server exactly.
 */
export function sampleTerrain(
  lb: CellLandblock,
  table: number[],
  globalBlockX: number,
  globalBlockY: number,
  x: number,
  y: number,
): TerrainSample | undefined {
  const edge = 8 * LANDBLOCK_TILE; // 192
  if (x < 0 || y < 0 || x > edge || y > edge) return undefined;
  const cx = Math.min((x / LANDBLOCK_TILE) | 0, 7);
  const cy = Math.min((y / LANDBLOCK_TILE) | 0, 7);
  const ne = cellCutIsNe(globalBlockX * 8 + cx, globalBlockY * 8 + cy);
  for (const tri of cellTriangles(lb, table, cx, cy, ne)) {
    if (!pointInPoly2D(tri, x, y)) continue;
    const ax = tri.b.x - tri.a.x;
    const ay = tri.b.y - tri.a.y;
    const az = tri.b.z - tri.a.z;
    const bx = tri.c.x - tri.a.x;
    const by = tri.c.y - tri.a.y;
    const bz = tri.c.z - tri.a.z;
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const d = -(nx * tri.a.x + ny * tri.a.y + nz * tri.a.z);
    if (Math.abs(nz) < 1e-9) return { z: tri.a.z, normal: { x: nx, y: ny, z: nz } };
    return { z: -(x * nx + y * ny + d) / nz, normal: { x: nx, y: ny, z: nz } };
  }
  return undefined;
}

// ─── road / building rejection ───────────────────────────────────────────────

/** ACE `Landblock.OnRoad`: a buffer around cells whose terrain word is a road. */
export function onRoad(lb: CellLandblock, x: number, y: number): boolean {
  const roadWidth = 5; // Landblock.RoadWidth
  const tile = LANDBLOCK_TILE;
  const xi = (x / tile) | 0;
  const yi = (y / tile) | 0;
  const rMin = roadWidth;
  const rMax = tile - roadWidth;
  const r0 = roadAt(lb, xi, yi);
  const r1 = roadAt(lb, xi, yi + 1);
  const r2 = roadAt(lb, xi + 1, yi);
  const r3 = roadAt(lb, xi + 1, yi + 1);
  if (r0 === 0 && r1 === 0 && r2 === 0 && r3 === 0) return false;

  const dx = x - xi * tile;
  const dy = y - yi * tile;

  if (r0 > 0) {
    if (r1 > 0) {
      if (r2 > 0) {
        if (r3 > 0) return true;
        return dx < rMin || dy < rMin;
      }
      if (r3 > 0) return dx < rMin || dy > rMax;
      return dx < rMin;
    }
    if (r2 > 0) {
      if (r3 > 0) return dx > rMax || dy < rMin;
      return dy < rMin;
    }
    if (r3 > 0) return Math.abs(dx - dy) < rMin;
    return dx + dy < rMin;
  }
  if (r1 > 0) {
    if (r2 > 0) {
      if (r3 > 0) return dx > rMax || dy > rMax;
      return Math.abs(dx + dy - tile) < rMin;
    }
    if (r3 > 0) return dy > rMax;
    return tile + dx - dy < rMin;
  }
  if (r2 > 0) {
    if (r3 > 0) return dx > rMax;
    return tile - dx + dy < rMin;
  }
  if (r3 > 0) return tile * 2 - dx - dy < rMin;
  return false;
}

/** `Landblock.GetRoad`: the low 2 bits (road code) of a terrain control word. */
function roadAt(lb: CellLandblock, ix: number, iy: number): number {
  const word = lb.terrain[ix * LANDBLOCK_GRID + iy] ?? 0;
  return word & 0x3;
}

// ─── generation ──────────────────────────────────────────────────────────────

export interface SceneryPlacement {
  objId: number;
  /** Landblock-local AC position. */
  origin: Vec3;
  orientation: Quaternion;
  scale: number;
}

/** Cells that contain a building origin; scenery never spawns in them. */
function buildingCells(
  buildings: { frame: { origin: Vec3 } }[],
): Set<number> {
  const cells = new Set<number>();
  for (const building of buildings) {
    const cx = Math.min((building.frame.origin.x / LANDBLOCK_TILE) | 0, 7);
    const cy = Math.min((building.frame.origin.y / LANDBLOCK_TILE) | 0, 7);
    cells.add(cx * 8 + cy);
  }
  return cells;
}

/**
 * The scene id selected for a terrain control point, or undefined when the
 * terrain type/scene type has no scenes.
 */
export function selectSceneId(
  region: Region,
  terrain: number,
  globalCellX: number,
  globalCellY: number,
): number | undefined {
  const terrainType = (terrain >> 2) & 0x1f;
  const sceneType = terrain >> 11;
  const terrainEntry = region.terrainTypes[terrainType];
  const sceneInfo = terrainEntry?.sceneTypes[sceneType];
  if (sceneInfo === undefined) return undefined;
  const sceneTypeEntry = region.sceneTypes[sceneInfo];
  if (!sceneTypeEntry || sceneTypeEntry.scenes.length === 0) return undefined;

  const cellMat =
    Math.imul(globalCellY, (Math.imul(712977289, globalCellX) + 1813693831) | 0) -
    Math.imul(1109124029, globalCellX) +
    2139937281;
  const offset = unsignedFraction(cellMat);
  let index = Math.trunc(sceneTypeEntry.scenes.length * offset);
  if (index >= sceneTypeEntry.scenes.length) index = 0;
  return sceneTypeEntry.scenes[index];
}

/**
 * Generate every scenery placement for one landblock. `readScene` resolves
 * Scene ids (usually a handful per block); it is called once per distinct id.
 * Returned positions are landblock-local AC coordinates ready for the same
 * placement path as LandblockInfo stabs.
 */
export async function generateScenery(
  region: Region,
  lb: CellLandblock,
  globalBlockX: number,
  globalBlockY: number,
  buildings: { frame: { origin: Vec3 } }[],
  readScene: (id: number) => Promise<Scene>,
): Promise<SceneryPlacement[]> {
  const blockX = globalBlockX * 8;
  const blockY = globalBlockY * 8;
  const buildings_ = buildingCells(buildings);

  // Pass 1: pick the scene for each of the 81 control points and read the
  // distinct scenes once (concurrently).
  const picks: { i: number; globalCellX: number; globalCellY: number; sceneId: number }[] = [];
  const distinct = new Set<number>();
  for (let i = 0; i < 81; i++) {
    const globalCellX = blockX + ((i / 9) | 0);
    const globalCellY = blockY + (i % 9);
    const sceneId = selectSceneId(region, lb.terrain[i], globalCellX, globalCellY);
    if (sceneId === undefined) continue;
    picks.push({ i, globalCellX, globalCellY, sceneId });
    distinct.add(sceneId);
  }
  const scenes = new Map<number, Scene>();
  await Promise.all(
    [...distinct].map(async (id) => {
      scenes.set(id, await readScene(id));
    }),
  );

  // Pass 2: walk each scene's rules and materialize the ones that fire.
  const placements: SceneryPlacement[] = [];
  for (const { i, globalCellX, globalCellY, sceneId } of picks) {
    const scene = scenes.get(sceneId);
    if (!scene) continue;
    const cellX = (i / 9) | 0;
    const cellY = i % 9;

    // `cellMat` is reassigned before the object loop (ACE line 220).
    const cellXMat = Math.imul(-1109124029, globalCellX);
    const cellYMat = Math.imul(1813693831, globalCellY);
    const cellMat =
      Math.imul(Math.imul(1360117743, globalCellX), globalCellY) + 1888038839;

    for (let j = 0; j < scene.objects.length; j++) {
      const obj = scene.objects[j];
      const noise = unsignedFraction(cellXMat + cellYMat - Math.imul(cellMat, (23399 + j) | 0));
      if (!(noise < obj.freq && obj.weenieObj === 0)) continue;

      const position = displace(obj, globalCellX, globalCellY, j);
      const lx = cellX * LANDBLOCK_TILE + position.x;
      const ly = cellY * LANDBLOCK_TILE + position.y;
      if (lx < 0 || ly < 0 || lx >= 192 || ly >= 192 || onRoad(lb, lx, ly)) continue;

      const cellKey = Math.min((lx / LANDBLOCK_TILE) | 0, 7) * 8 +
        Math.min((ly / LANDBLOCK_TILE) | 0, 7);
      if (buildings_.has(cellKey)) continue;

      const sample = sampleTerrain(lb, region.landHeightTable, globalBlockX, globalBlockY, lx, ly);
      if (!sample || !checkSlope(obj, sample.normal.z)) continue;

      let heading: number;
      if (obj.align !== 0) {
        // `ObjAlign`: face along the horizontal projection of -plane.Normal.
        heading = headingFromNormal(sample.normal);
      } else {
        heading = rotateObjHeading(obj, globalCellX, globalCellY, j);
      }
      const orientation = obj.maxRotation > 0 || obj.align !== 0
        ? multiplyQuaternion(obj.baseLoc.orientation, headingQuaternion(heading))
        : obj.baseLoc.orientation;

      placements.push({
        objId: obj.objId,
        origin: { x: lx, y: ly, z: sample.z },
        orientation,
        scale: scaleObj(obj, globalCellX, globalCellY, j),
      });
    }
  }
  return placements;
}

/**
 * `Vector3Extensions.get_heading()` of `-plane.Normal`: the AC heading of the
 * horizontal projection of the negated (downward) plane normal.
 */
function headingFromNormal(normal: Vec3): number {
  const nx = -normal.x;
  const ny = -normal.y;
  const length = Math.hypot(nx, ny);
  if (length < 1e-9) return 0;
  const degrees = (450 - (Math.atan2(ny / length, nx / length) * 180) / Math.PI) % 360;
  return degrees;
}
