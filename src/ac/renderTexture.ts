import BinaryReader from "../BinaryReader.js";

/** ACE RenderTexture (0x15): console texture references, not animation frames.
 * https://github.com/ACEmulator/ACE/blob/master/Source/ACE.DatLoader/FileTypes/RenderTexture.cs
 */
export class RenderTexture {
  id = 0;
  dataCategory = 0;
  textureType = 0;
  textures: number[] = [];

  static fromBuffer(data: Uint8Array | ArrayBuffer): RenderTexture {
    const reader = new BinaryReader(data);
    const result = new RenderTexture();
    result.id = reader.ReadUint32();
    result.dataCategory = reader.ReadUint32();
    result.textureType = reader.ReadUint8();
    const count = reader.ReadUint32();
    for (let i = 0; i < count; i++) result.textures.push(reader.ReadUint32());
    return result;
  }
}
