import BinaryReader from "./binary_reader";

export interface Unpackable {
  unpack(reader: BinaryReader): void;
}
