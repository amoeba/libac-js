import { readString } from './readString.js';

/**
 * A 3-component vector. Moved here from `BinaryReader` so both readers (and the
 * shared `ReaderBase`) can share a single definition.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * A quaternion. Moved here from `BinaryReader` so both readers (and the shared
 * `ReaderBase`) can share a single definition.
 */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * The single reader contract shared by the browser-safe in-memory
 * `BinaryReader` and the Node `SeekableFileReader`.
 *
 * Parsing code can be written against `Reader` and run over either backing
 * store. `read` is the one primitive every concrete reader must implement; all
 * typed accessors are provided by {@link ReaderBase}.
 */
export interface Reader {
  position: number;

  /** Read the next `count` bytes, advancing `position`. May be short at EOF. */
  read(count: number): Uint8Array;

  /** Move the read cursor to an absolute byte offset. */
  seek(position: number): this;

  /** Optional: open the underlying resource (no-op for in-memory readers). */
  open?(): this;

  /** Optional: release the underlying resource. */
  close?(): void;

  ReadInt8(): number;
  ReadInt16(): number;
  ReadInt32(): number;
  ReadUint8(): number;
  ReadUint16(): number;
  ReadUint32(): number;
  ReadSingle(): number;
  ReadDouble(): number;
  ReadUint8Array(count: number): Uint8Array;
  ReadUint16Array(count: number): Uint16Array;
  ReadUint32Array(count: number): Uint32Array;
  ReadBytes(count: number): Uint8Array;
  ReadString(): string;
  ReadObfuscatedString(): string;
  ReadPString(): string;
  ReadCompressedUInt(): number;
  ReadVector3(): Vec3;
  ReadQuaternion(): Quaternion;
  AlignBoundary(): void;
}

/**
 * Build a `DataView` that is correctly bounded to `view` even when `view` is a
 * zero-copy `subarray` at a non-zero `byteOffset` (issue #7).
 *
 * Never use `new DataView(view.buffer)` on a value returned by `read()`: the
 * view may not start at offset 0 of its backing buffer.
 */
function dataView(view: Uint8Array): DataView {
  return new DataView(view.buffer, view.byteOffset, view.byteLength);
}

/**
 * The single shared implementation of every typed read method, layered on the
 * one abstract primitive {@link ReaderBase.read}. Concrete readers differ only
 * in where the bytes come from.
 */
export abstract class ReaderBase implements Reader {
  position: number = 0;

  /**
   * Read the next `count` bytes and advance `position` by the number of bytes
   * actually available. Implementations may return a zero-copy view into their
   * backing store, and may return fewer than `count` bytes at EOF.
   */
  abstract read(count: number): Uint8Array;

  seek(position: number): this {
    this.position = position;
    return this;
  }

  ReadInt8(): number {
    return dataView(this.read(1)).getInt8(0);
  }

  ReadInt16(): number {
    return dataView(this.read(2)).getInt16(0, true);
  }

  ReadInt32(): number {
    return dataView(this.read(4)).getInt32(0, true);
  }

  ReadUint8(): number {
    return dataView(this.read(1)).getUint8(0);
  }

  ReadUint16(): number {
    return dataView(this.read(2)).getUint16(0, true);
  }

  ReadUint32(): number {
    return dataView(this.read(4)).getUint32(0, true);
  }

  ReadSingle(): number {
    return dataView(this.read(4)).getFloat32(0, true);
  }

  ReadDouble(): number {
    return dataView(this.read(8)).getFloat64(0, true);
  }

  ReadUint8Array(count: number): Uint8Array {
    // Copy so callers never hold a view into a reader's backing store.
    return this.read(count).slice();
  }

  ReadUint16Array(count: number): Uint16Array {
    const bytes = this.read(count * 2);
    const view = dataView(bytes);
    const out = new Uint16Array(count);
    // Alignment-safe, little-endian element copy (issue #5).
    const n = Math.min(count, Math.floor(bytes.byteLength / 2));
    for (let i = 0; i < n; i++) {
      out[i] = view.getUint16(i * 2, true);
    }
    return out;
  }

  ReadUint32Array(count: number): Uint32Array {
    const bytes = this.read(count * 4);
    const view = dataView(bytes);
    const out = new Uint32Array(count);
    // Alignment-safe, little-endian element copy (issue #5).
    const n = Math.min(count, Math.floor(bytes.byteLength / 4));
    for (let i = 0; i < n; i++) {
      out[i] = view.getUint32(i * 4, true);
    }
    return out;
  }

  AlignBoundary() {
    const alignDelta = this.position % 4;

    if (alignDelta != 0) {
      this.position += (4 - alignDelta);
    }
  }

  ReadObfuscatedString(): string {
    const stringlength = this.ReadUint16();
    const tokens = this.ReadUint8Array(stringlength);

    for (let i = 0; i < stringlength; i++)
      // flip the bytes in the string to undo the obfuscation: i.e. 0xAB => 0xBA
      tokens[i] = ((tokens[i] >> 4) | (tokens[i] << 4));

    const decoder = new TextDecoder('windows-1252');
    return decoder.decode(tokens);
  }

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
    return readString(this);
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
