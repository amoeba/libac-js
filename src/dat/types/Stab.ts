import BinaryReader from "../../BinaryReader.js";
import { Unpackable } from "../../Unpackable.js";
import { readFrame, type Frame } from "./Frame.js";

/**
 * A "Stab" — a static model placement: a model id (0x01 GfxObj or 0x02 Setup,
 * occasionally 0x0D Environment) plus a placement frame. Both LandblockInfo
 * stabs and EnvCell stabs use landblock-local AC coordinates; an EnvCell's own
 * `position` locates its room mesh but does not parent its static objects.
 * Referenced wholesale by the client's CLandBlock/CLandCell.
 */
export class Stab implements Unpackable {
  id = 0;
  frame: Frame = { origin: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };

  unpack(reader: BinaryReader): void {
    this.id = reader.ReadUint32();
    this.frame = readFrame(reader);
  }
}