import BinaryReader from "../binary_reader"
import { DatFileType, getFileType, getFileTypeName } from "./DatFileType"
import { Unpackable } from "../Unpackable"

export class DatFile implements Unpackable {
  BitFlags: number | undefined
  ObjectId: number | undefined
  FileOffset: number | undefined
  FileSize: number | undefined
  Date: number | undefined
  Iteration: number | undefined

  unpack(reader: BinaryReader) {
    this.BitFlags = reader.ReadUint32();
    this.ObjectId = reader.ReadUint32();
    this.FileOffset = reader.ReadUint32();
    this.FileSize = reader.ReadUint32();
    this.Date = reader.ReadUint32();
    this.Iteration = reader.ReadUint32();
  }

  type(): DatFileType {
    return getFileType(this.ObjectId || 0);
  }

  type_name(): string {
    return getFileTypeName(this.type());
  }
}
