import BinaryReader from "../../BinaryReader.js";

export class Palette {
  id = 0;
  colors: number[] = [];

  static fromBuffer(data: Uint8Array | ArrayBuffer): Palette {
    const reader = new BinaryReader(data);
    const palette = new Palette();
    palette.id = reader.ReadUint32();
    const count = reader.ReadUint32();
    for (let i = 0; i < count; i++) palette.colors.push(reader.ReadUint32());
    return palette;
  }
}
