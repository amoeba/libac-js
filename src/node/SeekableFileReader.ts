import * as fs from "fs";
import { ReaderBase } from "../Reader.js";

export default class SeekableFileReader extends ReaderBase {
  filePath: string;
  fd: any;

  constructor(filePath: string, position: number = 0) {
    super();
    this.filePath = filePath;
    this.fd = null;
    this.position = position;
  }

  open(): this {
    if (this.fd === null) {
      this.fd = fs.openSync(this.filePath, 'r');
    }

    return this;
  }

  seek(position: number): this {
    // Preserve lazy-open behavior: seeking opens the fd on demand.
    if (this.fd === null) {
      this.open();
    }
    this.position = position;
    return this;
  }

  protected readView(count: number): Uint8Array {
    if (count <= 0) {
      return new Uint8Array(0);
    }
    if (this.fd === null) {
      this.open();
    }

    const buffer = new Uint8Array(count);
    const bytesRead = fs.readSync(this.fd, buffer, 0, count, this.position);

    this.position += bytesRead;

    // Return only the bytes that were actually read
    return buffer.subarray(0, bytesRead);
  }

  close(): void {
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }
}
