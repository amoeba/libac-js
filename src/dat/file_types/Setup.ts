import BinaryReader from "../../BinaryReader.js";
import { readAnimationFrame, AnimationFrame } from "../types/AnimationFrame.js";
import { readCylSphere, CylSphere } from "../types/CylSphere.js";
import { readSphere, Sphere } from "../types/Sphere.js";
import { readLightInfo, LightInfo } from "../types/LightInfo.js";
import { readLocationType, LocationType } from "../types/LocationType.js";
import { Vec3 } from "../../BinaryReader.js";

/** Setup flags (AC `SetupFlags`). */
export enum SetupFlags {
  HasParent = 0x01,
  HasDefaultScale = 0x02,
  AllowFreeHeading = 0x04,
  HasPhysicsBSP = 0x08,
}

/** Placement key values (AC `Placement` enum). */
export enum Placement {
    Default = 0x00000000,
    RightHandCombat = 0x00000001,
    RightHandNonCombat = 0x00000002,
    LeftHand = 0x00000003,
    Belt = 0x00000004,
    Quiver = 0x00000005,
    Shield = 0x00000006,
    LeftWeapon = 0x00000007,
    LeftUnarmed = 0x00000008,
    /** Rest pose used for world-placed objects (decorations, buildings, items). */
    Resting = 0x00000065,
}

/**
 * A portal DAT Setup (0x02XXXXXX) — an assembly configuration that references
 * multiple GfxObj parts with placement transforms.
 *
 * Based on the C# `Setup.Unpack` reference in `DatReaderWriter.Generated`.
 */
export class Setup {
  /** DBObj header ID (0x0200XXXX). */
  id: number = 0;

  /** SetupFlags. */
  flags: number = 0;

  /** Number of parts (GfxObj references). */
  numParts: number = 0;

  /** GfxObj IDs referenced by this setup. */
  parts: number[] = [];

  /** Parent index for each part (-1 = root). Only present if HasParent. */
  parentIndex: number[] = [];

  /** Default scale for each part. Only present if HasDefaultScale. */
  defaultScale: Vec3[] = [];

  /** Holding locations keyed by ParentLocation enum. */
  holdingLocations: Map<number, LocationType> = new Map();

  /** Connection points keyed by ParentLocation enum. */
  connectionPoints: Map<number, LocationType> = new Map();

  /** Placement frames keyed by Placement enum — the transforms. */
  placementFrames: Map<number, AnimationFrame> = new Map();

  /** Cylinder bounding volumes. */
  cylSpheres: CylSphere[] = [];

  /** Sphere bounding volumes. */
  spheres: Sphere[] = [];

  height: number = 0;
  radius: number = 0;
  stepUpHeight: number = 0;
  stepDownHeight: number = 0;
  sortingSphere: Sphere | undefined;
  selectionSphere: Sphere | undefined;

  /** Lights keyed by integer ID. */
  lights: Map<number, LightInfo> = new Map();

  defaultAnimation: number = 0;
  defaultScript: number = 0;
  defaultMotionTable: number = 0;
  defaultSoundTable: number = 0;
  defaultScriptTable: number = 0;

  /**
   * Parse a Setup binary. The binary begins with the DBObj header ID (u32).
   */
  static fromBuffer(data: Uint8Array | ArrayBuffer): Setup {
    const reader = new BinaryReader(data);
    const setup = new Setup();

    // DBObj header — Id (present because HasId flag is set on Setup)
    setup.id = reader.ReadUint32();

    // Flags
    setup.flags = reader.ReadUint32();

    // NumParts + Parts
    setup.numParts = reader.ReadUint32();
    for (let i = 0; i < setup.numParts; i++) {
      setup.parts.push(reader.ReadUint32());
    }

    // ParentIndex (if HasParent)
    if (setup.flags & SetupFlags.HasParent) {
      for (let i = 0; i < setup.numParts; i++) {
        setup.parentIndex.push(reader.ReadUint32());
      }
    }

    // DefaultScale (if HasDefaultScale)
    if (setup.flags & SetupFlags.HasDefaultScale) {
      for (let i = 0; i < setup.numParts; i++) {
        setup.defaultScale.push(reader.ReadVector3());
      }
    }

    // HoldingLocations
    const numHoldingLocations = reader.ReadInt32();
    for (let i = 0; i < numHoldingLocations; i++) {
      const key = reader.ReadInt32();
      const val = readLocationType(reader);
      setup.holdingLocations.set(key, val);
    }

    // ConnectionPoints
    const numConnectionPoints = reader.ReadInt32();
    for (let i = 0; i < numConnectionPoints; i++) {
      const key = reader.ReadInt32();
      const val = readLocationType(reader);
      setup.connectionPoints.set(key, val);
    }

    // PlacementFrames — the key data for rendering transforms
    const numPlacements = reader.ReadInt32();
    for (let i = 0; i < numPlacements; i++) {
      const key = reader.ReadUint32();
      const val = readAnimationFrame(reader, setup.numParts);
      setup.placementFrames.set(key, val);
    }

    // CylSpheres
    const numCylSpheres = reader.ReadUint32();
    for (let i = 0; i < numCylSpheres; i++) {
      setup.cylSpheres.push(readCylSphere(reader));
    }

    // Spheres
    const numSpheres = reader.ReadUint32();
    for (let i = 0; i < numSpheres; i++) {
      setup.spheres.push(readSphere(reader));
    }

    // Height, Radius, StepUpHeight, StepDownHeight
    setup.height = reader.ReadSingle();
    setup.radius = reader.ReadSingle();
    setup.stepUpHeight = reader.ReadSingle();
    setup.stepDownHeight = reader.ReadSingle();

    // SortingSphere, SelectionSphere
    setup.sortingSphere = readSphere(reader);
    setup.selectionSphere = readSphere(reader);

    // Lights
    const numLights = reader.ReadInt32();
    for (let i = 0; i < numLights; i++) {
      const key = reader.ReadInt32();
      const val = readLightInfo(reader);
      setup.lights.set(key, val);
    }

    // Default DIDs
    setup.defaultAnimation = reader.ReadUint32();
    setup.defaultScript = reader.ReadUint32();
    setup.defaultMotionTable = reader.ReadUint32();
    setup.defaultSoundTable = reader.ReadUint32();
    setup.defaultScriptTable = reader.ReadUint32();

    return setup;
  }

  /** The default placement frame — absolute transform for each part. */
  getDefaultFrames(): AnimationFrame | undefined {
    return this.placementFrames.get(Placement.Default);
  }

  /** The placement frame a world-placed object uses — absolute transform for
   * each part. Prefers `Resting` (0x65), falling back to `Default` (0), to
   * match ACE's `PartArray.SetPlacementFrame(0x65)` and ACViewer's lookup. */
  getPlacementFrames(): AnimationFrame | undefined {
    return (
      this.placementFrames.get(Placement.Resting) ??
      this.placementFrames.get(Placement.Default)
    );
  }

  /** True if this Setup has parent-child hierarchy data. */
  get hasParent(): boolean {
    return (this.flags & SetupFlags.HasParent) !== 0;
  }

  /** True if this Setup has per-part default scales. */
  get hasDefaultScale(): boolean {
    return (this.flags & SetupFlags.HasDefaultScale) !== 0;
  }
}
