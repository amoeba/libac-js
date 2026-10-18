/**
 * Copy a possibly-view `Uint8Array`/`ArrayBuffer` into a standalone
 * `ArrayBuffer` so `DataView` offsets are always correct.
 *
 * Zero-copy when the view already spans its whole backing buffer; otherwise the
 * bytes are copied. `BinaryReader` runs every input through this, so callers may
 * pass a `Uint8Array` slice (a bundle/pack payload, an HTTP body view) directly.
 */
export function toExactArrayBuffer(
  data: ArrayBufferLike | ArrayBufferView,
): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
      return data.buffer as ArrayBuffer;
    }
    const copy = new Uint8Array(data.byteLength);
    copy.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return copy.buffer;
  }
  // SharedArrayBuffer and friends: copy into a plain ArrayBuffer.
  const copy = new Uint8Array(data.byteLength);
  copy.set(new Uint8Array(data as ArrayBufferLike));
  return copy.buffer;
}

export default class BinaryReader {
  buffer: ArrayBufferLike
  position: number

  constructor(buffer: ArrayBufferLike | ArrayBufferView) {
    this.buffer = toExactArrayBuffer(buffer);
    this.position = 0;
  }

  /** Number of bytes left to read. */
  get remaining(): number {
    return this.buffer.byteLength - this.position;
  }

  slice(start: number, end?: number): ArrayBufferLike {
    return this.buffer.slice(start, end);
  }

  read(length: number): ArrayBufferLike {
    const start = this.position;
    this.position += length;
    return this.buffer.slice(start, this.position);
  }

  ReadInt8(): number {
    let view = new DataView(this.buffer, this.position);
    this.position += 1;
    return view.getInt8(0);
  }

  ReadInt16(): number {
    let view = new DataView(this.buffer, this.position);
    this.position += 2;
    return view.getInt16(0, true);
  }

  ReadInt32(): number {
    let view = new DataView(this.buffer, this.position);
    this.position += 4;

    return view.getInt32(0, true);
  }

  ReadUint8(): number {
    let view = new DataView(this.buffer, this.position);
    this.position += 1;
    return view.getUint8(0);
  }

  ReadUint16(): number {
    let view = new DataView(this.buffer, this.position);
    this.position += 2;
    return view.getUint16(0, true);
  }

  ReadUint32(): number {
    let view = new DataView(this.buffer, this.position);
    this.position += 4;

    return view.getUint32(0, true);
  }

  ReadSingle(): number {
    let view = new DataView(this.buffer, this.position);
    this.position += 4;

    return view.getFloat32(0, true);
  }

  ReadDouble(): number {
    let view = new DataView(this.buffer, this.position);
    this.position += 8;

    return view.getFloat64(0, true);
  }

  ReadUint8Array(length: number): Uint8Array {
    const buf = this.read(length);
    const out = new Uint8Array(buf);

    return out;
  }

  ReadUint16Array(length: number): Uint16Array {
    const buf = this.read(length * 2);
    const out = new Uint16Array(buf);

    return out;
  }

  ReadUint32Array(length: number): Uint32Array {
    const buf = this.read(length * 4);
    const out = new Uint32Array(buf);

    return out;
  }

  AlignBoundary() {
    let alignDelta = this.position % 4;

    if (alignDelta != 0) {
      this.position += (4 - alignDelta);
    }
  }

  ReadObfuscatedString(): string {
    let stringlength = this.ReadUint16();
    let tokens = this.ReadUint8Array(stringlength);

    for (var i = 0; i < stringlength; i++)
      // flip the bytes in the string to undo the obfuscation: i.e. 0xAB => 0xBA
      tokens[i] = ((tokens[i] >> 4) | (tokens[i] << 4));

    const decoder = new TextDecoder('windows-1252');
    return decoder.decode(tokens);
  }

  // ─── Methods added for GfxObj / Setup parsing ─────────────────────────

  /// AC `ReadCompressedUInt32`: 1, 2, or 4 bytes depending on high bits.
  /// Mirrors asheron-rs `read_compressed_u32`.
  ReadCompressedUInt(): number {
    const b0 = this.ReadUint8();
    if ((b0 & 0x80) === 0) {
      return b0;
    }
    const b1 = this.ReadUint8();
    if ((b0 & 0x40) === 0) {
      return ((b0 & 0x7f) << 8) | b1;
    }
    const hi = this.ReadUint16();
    return (((((b0 & 0x3f) << 8) | b1) << 16) | hi) >>> 0;
  }

  ReadBytes(length: number): Uint8Array {
    return this.ReadUint8Array(length);
  }

  ReadString(): string {
    // 7-bit encoded length prefix (C# BinaryReader.ReadString / AC read_ac_string)
    let len = 0;
    let shift = 0;
    for (;;) {
      const b = this.ReadUint8();
      len |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    const bytes = this.ReadBytes(len);
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
  }

  /** AC aligned string: u16 byte length, Latin-1 bytes, then 4-byte alignment. */
  ReadPString(): string {
    const length = this.ReadUint16();
    const bytes = this.ReadBytes(length);
    this.AlignBoundary();
    // DAT strings are Latin-1; decode leniently so stray bytes never throw.
    return new TextDecoder('windows-1252').decode(bytes);
  }

  ReadVector3(): Vec3 {
    return {
      x: this.ReadSingle(),
      y: this.ReadSingle(),
      z: this.ReadSingle(),
    };
  }

  ReadQuaternion(): Quaternion {
    // AC binary store order is w, x, y, z (see DatBinReader.ReadQuaternion).
    const w = this.ReadSingle();
    const x = this.ReadSingle();
    const y = this.ReadSingle();
    const z = this.ReadSingle();
    return { x, y, z, w };
  }
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}
