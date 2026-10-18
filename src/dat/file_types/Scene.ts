import BinaryReader from "../../BinaryReader.js";
import { readFrame, type Frame } from "../types/Frame.js";

/**
 * One procedural scenery placement rule (ACE DatLoader Entity/ObjectDesc).
 *
 * Generation picks a Scene for a terrain control point, then walks its
 * `objects`. Each rule contributes one object at a pseudo-randomly displaced
 * location when a deterministic noise value falls under `freq`. The `min*`/
 * `max*` fields clamp the generated rotation, scale and walkable terrain slope.
 */
export interface ObjectDesc {
  /** GfxObj (0x01) or Setup (0x02) model id. */
  objId: number;
  baseLoc: Frame;
  /** Probability [0,1] that this rule places its object. */
  freq: number;
  displaceX: number;
  displaceY: number;
  minScale: number;
  maxScale: number;
  /** Maximum random yaw in degrees; 0 keeps the base orientation. */
  maxRotation: number;
  /** Allowed terrain-slope range, measured as the walkable plane normal Z. */
  minSlope: number;
  maxSlope: number;
  /** Non-zero: align the object's heading to the terrain plane normal. */
  align: number;
  orient: number;
  /** Non-zero marks a server-side/spawned object the client does not draw. */
  weenieObj: number;
}

/**
 * Portal-DAT Scene (0x12): a list of scenery placement rules terrain scenery
 * generation samples from. See `src/render/scenery.ts` for the seeded algorithm
 * that turns a Scene + terrain grid into concrete objects.
 */
export class Scene {
  id = 0;
  objects: ObjectDesc[] = [];

  static fromBuffer(data: Uint8Array | ArrayBuffer): Scene {
    const reader = new BinaryReader(data);
    const scene = new Scene();
    scene.id = reader.ReadUint32();

    const count = reader.ReadUint32();
    for (let i = 0; i < count; i++) {
      const objId = reader.ReadUint32();
      const baseLoc = readFrame(reader);
      const freq = reader.ReadSingle();
      const displaceX = reader.ReadSingle();
      const displaceY = reader.ReadSingle();
      const minScale = reader.ReadSingle();
      const maxScale = reader.ReadSingle();
      const maxRotation = reader.ReadSingle();
      const minSlope = reader.ReadSingle();
      const maxSlope = reader.ReadSingle();
      const align = reader.ReadUint32();
      const orient = reader.ReadUint32();
      const weenieObj = reader.ReadUint32();
      scene.objects.push({
        objId,
        baseLoc,
        freq,
        displaceX,
        displaceY,
        minScale,
        maxScale,
        maxRotation,
        minSlope,
        maxSlope,
        align,
        orient,
        weenieObj,
      });
    }
    return scene;
  }
}
