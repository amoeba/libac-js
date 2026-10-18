import BinaryReader from "../../BinaryReader.js";

export enum SurfaceType {
  Base1Image = 0x02,
  Base1ClipMap = 0x04,
  Translucent = 0x10,
  Diffuse = 0x20,
  Luminous = 0x40,
  Alpha = 0x100,
  InvAlpha = 0x200,
  Additive = 0x10000,
}

export class Surface {
  type = 0;
  textureId?: number;
  paletteId?: number;
  color = 0xffffffff;
  translucency = 0;
  luminosity = 0;
  diffuse = 1;

  static fromBuffer(data: Uint8Array | ArrayBuffer): Surface {
    const reader = new BinaryReader(data);
    const surface = new Surface();
    surface.type = reader.ReadUint32();
    if (surface.hasImage) {
      surface.textureId = reader.ReadUint32();
      surface.paletteId = reader.ReadUint32();
    } else {
      surface.color = reader.ReadUint32();
    }
    surface.translucency = reader.ReadSingle();
    surface.luminosity = reader.ReadSingle();
    surface.diffuse = reader.ReadSingle();
    return surface;
  }

  get hasImage(): boolean {
    return (this.type & (SurfaceType.Base1Image | SurfaceType.Base1ClipMap)) !== 0;
  }
}
