import { ReaderBase } from './Reader.js';

export type { Quaternion, Vec3 } from './Reader.js';

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

export default class BinaryReader extends ReaderBase {
  buffer: ArrayBufferLike

  constructor(buffer: ArrayBufferLike | ArrayBufferView) {
    super();
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

  /**
   * Return a zero-copy view of the next `count` bytes and advance `position` by
   * the number of bytes actually available (short at EOF).
   *
   * Note: this changes the historical `ArrayBufferLike` return type to
   * `Uint8Array` (issue #4); the view may sit at a non-zero `byteOffset`, which
   * is why `ReaderBase` always bounds its `DataView`s to the view (issue #7).
   */
  read(count: number): Uint8Array {
    const start = this.position;
    const offset = Math.min(start, this.buffer.byteLength);
    const end = Math.min(start + count, this.buffer.byteLength);
    const length = Math.max(0, end - offset);
    // Never move the cursor backwards (e.g. a seek past EOF then a read).
    this.position = Math.max(start, end);
    return new Uint8Array(this.buffer, offset, length);
  }
}
