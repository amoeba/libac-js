const fs = require('fs');

export default class SeekableFileReader {
  filePath: string;
  fd: any;
  position: number

  constructor(filePath: string, position: number = 0) {
    this.filePath = filePath;
    this.fd = null;
    this.position = position;
  }

  open() {
    if (this.fd === null) {
      this.fd = fs.openSync(this.filePath, 'r');
    }

    return this;
  }

  seek(position: number) {
    if (this.fd === null) {
      this.open();
    }
    this.position = position;
    return this;
  }

  read(count: number) {
    if (this.fd === null) {
      this.open();
    }

    const buffer = Buffer.alloc(count);
    const bytesRead = fs.readSync(this.fd, buffer, 0, count, this.position);

    this.position += bytesRead;

    // Return only the bytes that were actually read
    return buffer.subarray(0, bytesRead);
  }

  close() {
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }

  ReadInt8(): number {
    const buf = this.read(1);
    const view = new DataView(buf.buffer);

    return view.getInt8(0);
  }

  ReadInt16(): number {
    const buf = this.read(2);
    const view = new DataView(buf.buffer);

    return view.getInt16(0, true);
  }

  ReadInt32(): number {
    const buf = this.read(4);
    const view = new DataView(buf.buffer);

    return view.getInt32(0, true);
  }

  ReadUint8(): number {
    const buf = this.read(1);
    const view = new DataView(buf.buffer);

    return view.getUint8(0);
  }

  ReadUint16(): number {
    const buf = this.read(2);
    const view = new DataView(buf.buffer);

    return view.getUint16(0, true);
  }

  ReadUint32(): number {
    const buf = this.read(4);
    const view = new DataView(buf.buffer);

    return view.getUint32(0, true);
  }

  ReadUint8Array(count: number): Uint8Array {
    const buf = this.read(count);
    const out = new Uint8Array(buf);

    return out;
  }

  ReadUint16Array(count: number): Uint16Array {
    const buf = this.read(count * 2);
    const out = new Uint16Array(buf);

    return out;
  }

  ReadUint32Array(count: number): Uint32Array {
    const buf = this.read(count * 4);
    const out = new Uint32Array(buf);

    return out;
  }

  ReadSingle(): number {
    const buf = this.read(4);
    const view = new DataView(buf.buffer);

    return view.getFloat32(0, true);
  }

  ReadDouble(): number {
    const buf = this.read(8);
    const view = new DataView(buf.buffer);

    return view.getFloat64(0, true);
  }

  // TODO
  ReadString(): string {
    return "TODO";
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
}
