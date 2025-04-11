import BinaryReader from "../../BinaryReader";
import SeekableFileReader from "../../SeekableFileReader";
import { Unpackable } from "../../Unpackable";

export class Texture implements Unpackable {
  form: number | undefined
  width: number | undefined
  height: number | undefined
  format: number | undefined
  length: number | undefined
  buffer: Buffer | undefined

  unpack(reader: BinaryReader) {
    // ID?
    reader.ReadUint32();

    // TODO: What is this?
    reader.ReadUint32();

    // Form? What is form?
    this.form = reader.ReadUint32();

    this.width = reader.ReadUint32();
    this.height = reader.ReadUint32();
    this.format = reader.ReadUint32();
    this.length = reader.ReadUint32();

    this.buffer = Buffer.alloc(this.length);

    for (let i = 0; i < this.length; i++) {
      this.buffer[i] = reader.ReadUint8()
    }
  }

  // TODO: This isn't right yet
  getRGBAImage() {
    console.log("getRGBAImage");

    if (!this.length || !this.buffer) {
      return;
    }

    console.log(this.buffer);
  }

  // TODO: This isn't right yet
  getRGBImage() {
    console.log("getRGBImage");

    if (!this.length || !this.buffer) {
      return;
    }

    console.log(this.buffer);
  }
}
