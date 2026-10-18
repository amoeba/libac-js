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

/**
 * portal-DAT Region (0x13000000, a singleton). We keep the pieces needed to
 * texture the landscape (the non-linear height table plus the terrain type and
 * tex-merge tables) and to generate procedural scenery (the terrain scene-type
 * table and the SceneDesc tables). The sky/sound sections are parsed only to
 * stay aligned; their contents are discarded.
 */
export class Region {
  id = 0;
  regionNumber = 0;
  version = 0;
  regionName = "";
  partsMask = 0;
  /** 256-entry lookup: height byte -> world Z (see CellLandblock). */
  landHeightTable: number[] = [];
  terrainTypes: TerrainType[] = [];
  /** Procedural scenery tables (ACE SceneDesc): terrain scene-type -> Scene ids. */
  sceneTypes: SceneType[] = [];
  landSurf!: LandSurf;

  static fromBuffer(data: Uint8Array | ArrayBuffer): Region {
    const reader = new BinaryReader(data);
    const region = new Region();
    region.id = reader.ReadUint32();
    region.regionNumber = reader.ReadUint32();
    region.version = reader.ReadUint32();
    region.regionName = reader.ReadPString();
    reader.AlignBoundary();

    readLandDefs(reader, region);
    readGameTime(reader);

    region.partsMask = reader.ReadUint32();
    if ((region.partsMask & 0x10) !== 0) readSkyDesc(reader);
    if ((region.partsMask & 0x01) !== 0) readSoundDesc(reader);
    if ((region.partsMask & 0x02) !== 0) readSceneDesc(reader, region);

    readTerrainDesc(reader, region);

    return region;
  }
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

// ─── GameTime (skipped) ────────────────────────────────────────────────────

function readGameTime(reader: BinaryReader): void {
  reader.ReadDouble(); // zeroTimeOfYear
  reader.ReadUint32(); // zeroYear
  reader.ReadSingle(); // dayLength
  reader.ReadUint32(); // daysPerYear
  reader.ReadPString(); // yearSpec
  reader.AlignBoundary();

  const timesOfDay = reader.ReadUint32();
  for (let i = 0; i < timesOfDay; i++) {
    reader.ReadSingle(); // start
    reader.ReadUint32(); // isNight
    reader.ReadPString(); // name
    reader.AlignBoundary();
  }

  const daysOfWeek = reader.ReadUint32();
  for (let i = 0; i < daysOfWeek; i++) {
    reader.ReadPString();
    reader.AlignBoundary();
  }

  const seasons = reader.ReadUint32();
  for (let i = 0; i < seasons; i++) {
    reader.ReadUint32(); // startDate
    reader.ReadPString(); // name
    reader.AlignBoundary();
  }
}

// ─── Sky / Sound / Scene (parsed only to advance the reader) ────────────────

function readSkyDesc(reader: BinaryReader): void {
  reader.ReadDouble(); // tickSize
  reader.ReadDouble(); // lightTickSize
  reader.AlignBoundary();

  const dayGroups = reader.ReadUint32();
  for (let g = 0; g < dayGroups; g++) {
    reader.ReadSingle(); // chanceOfOccur
    reader.ReadPString(); // dayName
    reader.AlignBoundary();

    const skyObjects = reader.ReadUint32();
    for (let i = 0; i < skyObjects; i++) {
      reader.ReadSingle(); // beginTime
      reader.ReadSingle(); // endTime
      reader.ReadSingle(); // beginAngle
      reader.ReadSingle(); // endAngle
      reader.ReadSingle(); // texVelocityX
      reader.ReadSingle(); // texVelocityY
      reader.ReadUint32(); // defaultGFXObjectId
      reader.ReadUint32(); // defaultPESObjectId
      reader.ReadUint32(); // properties
      reader.AlignBoundary();
    }

    const skyTimes = reader.ReadUint32();
    for (let i = 0; i < skyTimes; i++) {
      reader.ReadSingle(); // begin
      reader.ReadSingle(); // dirBright
      reader.ReadSingle(); // dirHeading
      reader.ReadSingle(); // dirPitch
      reader.ReadUint32(); // dirColor
      reader.ReadSingle(); // ambBright
      reader.ReadUint32(); // ambColor
      reader.ReadSingle(); // minWorldFog
      reader.ReadSingle(); // maxWorldFog
      reader.ReadUint32(); // worldFogColor
      reader.ReadUint32(); // worldFog
      reader.AlignBoundary();

      const replaces = reader.ReadUint32();
      for (let j = 0; j < replaces; j++) {
        reader.ReadUint32(); // objectIndex
        reader.ReadUint32(); // gfxObjId
        reader.ReadSingle(); // rotate
        reader.ReadSingle(); // transparent
        reader.ReadSingle(); // luminosity
        reader.ReadSingle(); // maxBright
        reader.AlignBoundary();
      }
    }
  }
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
