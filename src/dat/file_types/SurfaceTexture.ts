import BinaryReader from "../../BinaryReader.js";

/**
 * A portal-DAT SurfaceTexture (0x05xxxxxx). A Surface's image reference points
 * here, not directly at a Texture: this is a small record listing one or more
 * base Texture (0x06xxxxxx) ids plus a layer blend mode.
 *
 * Layout (see ACE `FileTypes/SurfaceTexture.cs`):
 *   id u32 · unknown i32 · unknownByte u8 · count u32 · textures u32[count]
 */
export class SurfaceTexture {
  id = 0;
  unknown = 0;
  unknownByte = 0;
  /** Base Texture (0x06xxxxxx) ids selected by this reference. */
  textures: number[] = [];

  static fromBuffer(data: Uint8Array | ArrayBuffer): SurfaceTexture {
    const reader = new BinaryReader(data);
    const surfaceTexture = new SurfaceTexture();
    surfaceTexture.id = reader.ReadUint32();
    surfaceTexture.unknown = reader.ReadInt32();
    surfaceTexture.unknownByte = reader.ReadUint8();
    const count = reader.ReadUint32();
    for (let i = 0; i < count; i++) {
      surfaceTexture.textures.push(reader.ReadUint32());
    }
    return surfaceTexture;
  }
}
