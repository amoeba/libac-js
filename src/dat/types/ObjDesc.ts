/** Native ObjDesc appearance operations embedded in CharGen and other records. */
export interface ObjDesc {
  /** Base Palette (0x04) selected before palette overrides. */
  paletteBaseId?: number;
  palettes: ObjDescPalette[];
  textures: ObjDescTexture[];
  parts: ObjDescPart[];
}

/** Palette replacement range; offset and length are measured in groups of 8 colors. */
export interface ObjDescPalette {
  paletteId: number;
  offset: number;
  /** A serialized zero length denotes all 256 groups and is expanded by parsing. */
  length: number;
}

export interface ObjDescTexture {
  partIndex: number;
  oldTextureId: number;
  newTextureId: number;
}

export interface ObjDescPart {
  partIndex: number;
  gfxObjId: number;
}
