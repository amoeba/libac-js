/**
 * Minimal surface required to decode an Asheron's Call style string from a
 * binary source. Both {@link BinaryReader} and the Node `SeekableFileReader`
 * satisfy this interface, so the decoding logic lives in exactly one place and
 * cannot drift between the two readers.
 */
export interface StringReadable {
  ReadUint8(): number;
  ReadUint8Array(length: number): Uint8Array;
}

/**
 * Read a string encoded as a 7-bit encoded length prefix followed by that many
 * UTF-8 bytes. This mirrors C# `BinaryReader.ReadString` / AC `read_ac_string`.
 *
 * Browser-safe: uses only `TextDecoder` and `Uint8Array`.
 */
export function readString(reader: StringReadable): string {
  // 7-bit encoded length prefix (C# BinaryReader.ReadString / AC read_ac_string)
  let len = 0;
  let shift = 0;
  for (;;) {
    const b = reader.ReadUint8();
    len |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  const bytes = reader.ReadUint8Array(len);
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(bytes);
}
