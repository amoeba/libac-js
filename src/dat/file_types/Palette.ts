export class Palette {
  id = 0;
  colors: number[] = [];

  static fromBuffer(data: Uint8Array | ArrayBuffer): Palette {
    const palette = new Palette();
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    palette.id = view.getUint32(0, true);
    const count = view.getUint32(4, true);
    if (8 + count * 4 > bytes.byteLength) {
      // Match BinaryReader/DataView's historical truncated-input failure.
      throw new RangeError("Offset is outside the bounds of the DataView");
    }
    const colors = new Array<number>(count);
    for (let i = 0, offset = 8; i < count; i++, offset += 4) {
      colors[i] = view.getUint32(offset, true);
    }
    palette.colors = colors;
    return palette;
  }
}
