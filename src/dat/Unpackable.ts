import SeekableFileReader from "../seekable_file_reader";

export interface Unpackable {
  unpack(reader: SeekableFileReader): void;
}
