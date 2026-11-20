import BinaryReader from "./BinaryReader.js";

/** Internal bounded reader shared by strict variable-length native parsers. */
export class BoundedReader {
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private readonly reader: BinaryReader;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly label: string,
    private readonly maxBytes = 16 * 1024 * 1024,
    private readonly maxEntries = 65_536,
  ) {
    if (bytes.byteLength > maxBytes) throw new Error(`${label}: file exceeds size bound at byte 0`);
    this.reader = new BinaryReader(bytes);
  }

  private get at(): number { return this.reader.position; }

  fail(message: string): never {
    throw new Error(`${this.label}: ${message} at byte ${this.at}`);
  }
  need(count: number): void {
    if (count > this.bytes.byteLength - this.at) this.fail(`truncated (need ${count})`);
  }
  skip(count: number): void { this.need(count); this.reader.seek(this.at + count); }
  u8(): number { this.need(1); return this.reader.ReadUint8(); }
  u16(): number { this.need(2); return this.reader.ReadUint16(); }
  u32(): number { this.need(4); return this.reader.ReadUint32(); }
  align(): void { this.skip((4 - this.at % 4) % 4); }

  /** ACE BinaryReaderExtensions.ReadCompressedUInt32 (1, 2, or 4 bytes). */
  compressed(): number {
    this.need(1);
    // Reserve the maximum encoding width before invoking BinaryReader's
    // shared implementation so strict parser truncation behavior is retained.
    const first = this.bytes[this.at];
    this.need(!(first & 0x80) ? 1 : (first & 0x40) ? 4 : 2);
    return this.reader.ReadCompressedUInt();
  }

  /** Read ACE's compact DBObj ID encoding, retaining the supplied type byte. */
  did(type: number): number {
    const high = this.u16();
    const index = high & 0x8000 ? (high & 0x3fff) * 65536 + this.u16() : high;
    if (index > 0xffffff) this.fail("compressed DID exceeds type range");
    return type + index;
  }

  readCount(minBytes: number, encoding: "u32" | "packed-u16" | "compressed" = "u32"): number {
    let count: number;
    if (encoding === "packed-u16") {
      count = this.u16();
      this.u16(); // Serialized hash bucket count; no bucket storage follows.
    } else count = encoding === "compressed" ? this.compressed() : this.u32();
    if (count > this.maxEntries) this.fail(`count ${count} exceeds bound`);
    this.need(count * minBytes);
    return count;
  }

  array<T>(minBytes: number, read: () => T): T[] {
    return Array.from({ length: this.readCount(minBytes, "compressed") }, read);
  }
  words(): number[] { return this.array(4, () => this.u32()); }

  /** .NET BinaryReader string: 7-bit byte length and fatal UTF-8 decoding. */
  string(): string {
    let length = 0, shift = 0;
    for (;;) {
      const byte = this.u8();
      length += (byte & 0x7f) * 2 ** shift;
      if (length > this.maxEntries || shift > 28) this.fail("string length exceeds bound");
      if (!(byte & 0x80)) break;
      shift += 7;
    }
    this.need(length);
    const value = this.decoder.decode(this.bytes.subarray(this.at, this.at + length));
    this.reader.seek(this.at + length);
    return value;
  }

  finish(): void {
    if (this.at !== this.bytes.byteLength) this.fail("unexpected trailing bytes");
  }
}
