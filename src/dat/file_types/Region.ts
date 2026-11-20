import BinaryReader from "../../BinaryReader.js";

/** A per-terrain-type surface: the base texture and how it tiles. */
export interface TerrainTex {
  /** Base Texture or SurfaceTexture id for this terrain type. */
  texGID: number;
  /** Tiles per landblock cell side (see ACE/ACViewer TerrainTex). */
  texTiling: number;
  detailTexGID: number;
  detailTexTiling: number;
}

/** A terrain type entry: display name, flat colour fallback, scene tables. */
export interface TerrainType {
  name: string;
  color: number;
  sceneTypes: number[];
}

/**
 * One entry of the Region's SceneDesc: a sound-table index plus the list of
 * Scene (0x12) ids that terrain-scenery generation picks from (ACE
 * Entity/SceneType). `TerrainType.sceneTypes[i]` indexes into this list.
 */
export interface SceneType {
  stbIndex: number;
  scenes: number[];
}

/** Corner/road alpha mask selected by a 4-bit terrain/road code. */
export interface TerrainAlphaMap {
  tCode: number;
  texGID: number;
}

export interface RoadAlphaMap {
  rCode: number;
  roadTexGID: number;
}

/** terrain-type -> TerrainTex lookup used to texture the landscape. */
export interface TMTerrainDesc {
  terrainType: number;
  terrainTex: TerrainTex;
}

/**
 * The terrain texture merge tables (ACE Entity/TexMerge).
 *
 * The client picks a base texture from `terrainDesc` and blends in neighbours
 * using the corner/side alpha masks plus the shared road texture.
 */
export interface TexMerge {
  baseTexSize: number;
  cornerTerrainMaps: TerrainAlphaMap[];
  sideTerrainMaps: TerrainAlphaMap[];
  roadMaps: RoadAlphaMap[];
  terrainDesc: TMTerrainDesc[];
}

export interface LandSurf {
  type: number;
  texMerge: TexMerge;
}

export interface RegionGameTime {
  zeroTimeOfYear: number;
  zeroYear: number;
  dayLength: number;
  daysPerYear: number;
  yearSpec: string;
  timesOfDay: Array<{ start: number; isNight: number; name: string }>;
  daysOfWeek: string[];
  seasons: Array<{ startDate: number; name: string }>;
}
export interface SkyObject {
  beginTime: number; endTime: number; beginAngle: number; endAngle: number;
  texVelocityX: number; texVelocityY: number; gfxId: number; pesId: number; properties: number;
}
export interface SkyReplacement {
  objectIndex: number; gfxId: number; rotate: number; transparent: number;
  luminosity: number; maxBright: number;
}
export interface SkyTime {
  begin: number; dirBright: number; dirHeading: number; dirPitch: number; dirColor: number;
  ambBright: number; ambColor: number; minFog: number; maxFog: number;
  fogColor: number; fog: number; replacements: SkyReplacement[];
}
export interface SkyDay { chance: number; name: string; objects: SkyObject[]; times: SkyTime[] }
export interface SkyDesc { tickSize: number; lightTickSize: number; days: SkyDay[] }
/** Compatibility projection for consumers that need the Region sky prefix only. */
export interface RegionSky extends SkyDesc { dayLength: number }

/**
 * portal-DAT Region (0x13000000, a singleton). We keep the pieces needed to
 * texture the landscape (the non-linear height table plus the terrain type and
 * tex-merge tables) and to generate procedural scenery (the terrain scene-type
 * table and the SceneDesc tables). Region owns its authored GameTime and SkyDesc.
 */
export class Region {
  id = 0;
  regionNumber = 0;
  version = 0;
  regionName = "";
  partsMask = 0;
  /** 256-entry lookup: height byte -> world Z (see CellLandblock). */
  landHeightTable: number[] = [];
  gameTime!: RegionGameTime;
  sky?: SkyDesc;
  terrainTypes: TerrainType[] = [];
  /** Procedural scenery tables (ACE SceneDesc): terrain scene-type -> Scene ids. */
  sceneTypes: SceneType[] = [];
  landSurf!: LandSurf;

  static fromBuffer(data: Uint8Array | ArrayBuffer): Region {
    const reader = new BinaryReader(data);
    const region = new Region();
    readRegionPrefix(reader, region);
    if ((region.partsMask & 0x01) !== 0) readSoundDesc(reader);
    if ((region.partsMask & 0x02) !== 0) readSceneDesc(reader, region);

    readTerrainDesc(reader, region);

    return region;
  }
}

/** Parse the Region header through SkyDesc, retaining the historical prefix-only contract. */
export function readRegionSky(data: Uint8Array | ArrayBuffer): RegionSky {
  const reader = new BinaryReader(data);
  const region = new Region();
  readRegionPrefix(reader, region);
  return {
    dayLength: region.gameTime.dayLength,
    tickSize: region.sky?.tickSize ?? 0,
    lightTickSize: region.sky?.lightTickSize ?? 0,
    days: region.sky?.days ?? [],
  };
}

function readRegionPrefix(reader: BinaryReader, region: Region): void {
  region.id = reader.ReadUint32();
  region.regionNumber = reader.ReadUint32();
  region.version = reader.ReadUint32();
  region.regionName = reader.ReadPString();
  reader.AlignBoundary();
  readLandDefs(reader, region);
  region.gameTime = readGameTime(reader);
  region.partsMask = reader.ReadUint32();
  if ((region.partsMask & 0x10) !== 0) region.sky = readSkyDesc(reader);
}

// ─── LandDefs ──────────────────────────────────────────────────────────────

function readLandDefs(reader: BinaryReader, region: Region): void {
  reader.ReadInt32(); // numBlockLength
  reader.ReadInt32(); // numBlockWidth
  reader.ReadSingle(); // squareLength
  reader.ReadInt32(); // lblockLength
  reader.ReadInt32(); // vertexPerCell
  reader.ReadSingle(); // maxObjHeight
  reader.ReadSingle(); // skyHeight
  reader.ReadSingle(); // roadWidth
  for (let i = 0; i < 256; i++) region.landHeightTable.push(reader.ReadSingle());
}

// ─── GameTime ──────────────────────────────────────────────────────────────

function readGameTime(reader: BinaryReader): RegionGameTime {
  const zeroTimeOfYear = reader.ReadDouble();
  const zeroYear = reader.ReadUint32();
  const dayLength = reader.ReadSingle();
  const daysPerYear = reader.ReadUint32();
  const yearSpec = reader.ReadPString();
  reader.AlignBoundary();

  const timesOfDay: RegionGameTime["timesOfDay"] = [];
  const timeCount = reader.ReadUint32();
  for (let i = 0; i < timeCount; i++) {
    const start = reader.ReadSingle();
    const isNight = reader.ReadUint32();
    const name = reader.ReadPString();
    reader.AlignBoundary();
    timesOfDay.push({ start, isNight, name });
  }
  const daysOfWeek: string[] = [];
  const dayCount = reader.ReadUint32();
  for (let i = 0; i < dayCount; i++) {
    daysOfWeek.push(reader.ReadPString());
    reader.AlignBoundary();
  }
  const seasons: RegionGameTime["seasons"] = [];
  const seasonCount = reader.ReadUint32();
  for (let i = 0; i < seasonCount; i++) {
    const startDate = reader.ReadUint32();
    const name = reader.ReadPString();
    reader.AlignBoundary();
    seasons.push({ startDate, name });
  }
  return { zeroTimeOfYear, zeroYear, dayLength, daysPerYear, yearSpec, timesOfDay, daysOfWeek, seasons };
}

// ─── Sky / Sound / Scene ───────────────────────────────────────────────────

function readSkyDesc(reader: BinaryReader): SkyDesc {
  const tickSize = reader.ReadDouble();
  const lightTickSize = reader.ReadDouble();
  reader.AlignBoundary();

  const days: SkyDay[] = [];
  const dayGroups = reader.ReadUint32();
  for (let g = 0; g < dayGroups; g++) {
    const chance = reader.ReadSingle();
    const name = reader.ReadPString();
    reader.AlignBoundary();

    const objects: SkyObject[] = [];
    const skyObjects = reader.ReadUint32();
    for (let i = 0; i < skyObjects; i++) {
      const object: SkyObject = {
        beginTime: reader.ReadSingle(), endTime: reader.ReadSingle(),
        beginAngle: reader.ReadSingle(), endAngle: reader.ReadSingle(),
        texVelocityX: reader.ReadSingle(), texVelocityY: reader.ReadSingle(),
        gfxId: reader.ReadUint32(), pesId: reader.ReadUint32(), properties: reader.ReadUint32(),
      };
      reader.AlignBoundary();
      objects.push(object);
    }

    const times: SkyTime[] = [];
    const skyTimes = reader.ReadUint32();
    for (let i = 0; i < skyTimes; i++) {
      const time: SkyTime = {
        begin: reader.ReadSingle(), dirBright: reader.ReadSingle(), dirHeading: reader.ReadSingle(), dirPitch: reader.ReadSingle(),
        dirColor: reader.ReadUint32(), ambBright: reader.ReadSingle(), ambColor: reader.ReadUint32(),
        minFog: reader.ReadSingle(), maxFog: reader.ReadSingle(), fogColor: reader.ReadUint32(), fog: reader.ReadUint32(),
        replacements: [],
      };
      reader.AlignBoundary();

      const replaces = reader.ReadUint32();
      for (let j = 0; j < replaces; j++) {
        time.replacements.push({ objectIndex: reader.ReadUint32(), gfxId: reader.ReadUint32(),
          rotate: reader.ReadSingle(), transparent: reader.ReadSingle(),
          luminosity: reader.ReadSingle(), maxBright: reader.ReadSingle() });
        reader.AlignBoundary();
      }
      times.push(time);
    }
    times.sort((a, b) => a.begin - b.begin);
    days.push({ chance, name, objects, times });
  }
  return { tickSize, lightTickSize, days };
}

function readSoundDesc(reader: BinaryReader): void {
  const stbDescs = reader.ReadUint32();
  for (let i = 0; i < stbDescs; i++) {
    reader.ReadUint32(); // stbId
    const sounds = reader.ReadUint32();
    for (let j = 0; j < sounds; j++) {
      reader.ReadUint32(); // sType
      reader.ReadSingle(); // volume
      reader.ReadSingle(); // baseChance
      reader.ReadSingle(); // minRate
      reader.ReadSingle(); // maxRate
    }
  }
}

function readSceneDesc(reader: BinaryReader, region: Region): void {
  const sceneTypes = reader.ReadUint32();
  for (let i = 0; i < sceneTypes; i++) {
    const stbIndex = reader.ReadUint32();
    const scenes = reader.ReadInt32();
    const ids: number[] = [];
    for (let j = 0; j < scenes; j++) ids.push(reader.ReadUint32());
    region.sceneTypes.push({ stbIndex, scenes: ids });
  }
}

// ─── TerrainDesc ───────────────────────────────────────────────────────────

function readTerrainDesc(reader: BinaryReader, region: Region): void {
  const terrainTypes = reader.ReadUint32();
  for (let i = 0; i < terrainTypes; i++) {
    const terrainType: TerrainType = { name: "", color: 0, sceneTypes: [] };
    terrainType.name = reader.ReadPString();
    reader.AlignBoundary();
    terrainType.color = reader.ReadUint32();
    const sceneTypes = reader.ReadInt32();
    for (let j = 0; j < sceneTypes; j++) terrainType.sceneTypes.push(reader.ReadUint32());
    region.terrainTypes.push(terrainType);
  }

  const type = reader.ReadUint32(); // LandSurf.type, always 0
  if (type === 1) throw new Error("Region: PalShift land surfaces are not supported");
  region.landSurf = { type, texMerge: readTexMerge(reader) };
}

function readTexMerge(reader: BinaryReader): TexMerge {
  const baseTexSize = reader.ReadUint32();

  const cornerTerrainMaps: TerrainAlphaMap[] = [];
  const corners = reader.ReadUint32();
  for (let i = 0; i < corners; i++) {
    cornerTerrainMaps.push({ tCode: reader.ReadUint32(), texGID: reader.ReadUint32() });
  }

  const sideTerrainMaps: TerrainAlphaMap[] = [];
  const sides = reader.ReadUint32();
  for (let i = 0; i < sides; i++) {
    sideTerrainMaps.push({ tCode: reader.ReadUint32(), texGID: reader.ReadUint32() });
  }

  const roadMaps: RoadAlphaMap[] = [];
  const roads = reader.ReadUint32();
  for (let i = 0; i < roads; i++) {
    roadMaps.push({ rCode: reader.ReadUint32(), roadTexGID: reader.ReadUint32() });
  }

  const terrainDesc: TMTerrainDesc[] = [];
  const descs = reader.ReadUint32();
  for (let i = 0; i < descs; i++) {
    const terrainType = reader.ReadUint32();
    const terrainTex: TerrainTex = {
      texGID: reader.ReadUint32(),
      texTiling: reader.ReadUint32(),
      detailTexGID: 0,
      detailTexTiling: 0,
    };
    reader.ReadUint32(); // maxVertBright
    reader.ReadUint32(); // minVertBright
    reader.ReadUint32(); // maxVertSaturate
    reader.ReadUint32(); // minVertSaturate
    reader.ReadUint32(); // maxVertHue
    reader.ReadUint32(); // minVertHue
    terrainTex.detailTexTiling = reader.ReadUint32();
    terrainTex.detailTexGID = reader.ReadUint32();
    terrainDesc.push({ terrainType, terrainTex });
  }

  return { baseTexSize, cornerTerrainMaps, sideTerrainMaps, roadMaps, terrainDesc };
}
