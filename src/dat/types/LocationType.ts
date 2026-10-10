import BinaryReader from "../../BinaryReader";

/** A part reference + transform frame (AC `LocationType`).

 * Used in Setup's HoldingLocations and ConnectionPoints dictionaries.
 */
export class LocationType {
  partId: number = 0;
  frame: { origin: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } } = {
    origin: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
  };

  unpack(reader: BinaryReader): void {
    this.partId = reader.ReadInt32();
    this.frame = {
      origin: reader.ReadVector3(),
      orientation: reader.ReadQuaternion(),
    };
  }
}

export const readLocationType = function (reader: BinaryReader): LocationType {
  const instance = new LocationType();
  instance.unpack(reader);
  return instance;
};
