import BinaryReader from "../../BinaryReader.js";
import { Unpackable } from "../../Unpackable.js";

/** AC `SurfacePixelFormat` tags (the `format` field of a Texture). */
export enum SurfacePixelFormat {
  R8G8B8 = 20,
  A8R8G8B8 = 21,
  R5G6B5 = 23,
  A1R5G5B5 = 25,
  A4R4G4B4 = 26,
  A8 = 28,
  P8 = 41,
  Index16 = 101,
  CustomLscapeR8G8B8 = 243,
  CustomLscapeAlpha = 244,
  CustomRawJpeg = 500,
  Dxt1 = 0x31545844,
  Dxt3 = 0x33545844,
  Dxt5 = 0x35545844,
}

/** A portal-DAT Texture (0x06xxxxxx): raw pixel data plus its format.
 *
 * Layout: id u32 · form u32 · width i32 · height i32 · format u32 ·
 * length i32 · data[length], then (only for indexed formats) a default
 * palette id u32.
 */
export class Texture implements Unpackable {
  id = 0;
  width = 0;
  height = 0;
  format = SurfacePixelFormat.R8G8B8;
  sourceData: Uint8Array = new Uint8Array();
  defaultPaletteId?: number;

  unpack(reader: BinaryReader): void {
    this.id = reader.ReadUint32();
    reader.ReadInt32(); // form / unknown
    this.width = reader.ReadInt32();
    this.height = reader.ReadInt32();
    this.format = reader.ReadUint32();
    this.sourceData = reader.ReadBytes(reader.ReadInt32());
    if (
      this.format === SurfacePixelFormat.Index16 ||
      this.format === SurfacePixelFormat.P8
    ) {
      this.defaultPaletteId = reader.ReadUint32();
    }
  }

  static fromBuffer(data: Uint8Array | ArrayBuffer): Texture {
    const reader = new BinaryReader(data);
    const texture = new Texture();
    texture.unpack(reader);
    return texture;
  }
}
