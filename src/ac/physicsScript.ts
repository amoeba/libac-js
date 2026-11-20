import {
  readAnimationHook,
  type AnimationHook,
} from "../dat/types/AnimationFrame.js";
import BinaryReader from "../BinaryReader.js";

/**
 * One timed entry of a `PhysicsScript`: the hook fires once the script has
 * been playing for `startTime` seconds.
 */
export interface PhysicsScriptData {
  /** Seconds after script start at which `hook` fires. */
  startTime: number;
  hook: AnimationHook;
}

/**
 * Client portal-DAT `PhysicsScript` (0x33) — TypeScript parser.
 *
 * A timed list of animation hooks (same wire format as `Animation` hooks):
 * `CreateParticle` spawns an emitter, `CallPES` schedules another script,
 * sound hooks play audio. Reuses the single `readAnimationHook`
 * implementation so payload lengths stay correct in one place.
 *
 * Layout: `u32 id`, `u32 count`, then `count × { f64 startTime, hook }`.
 * See `research/particle-effects.md`.
 */
export class PhysicsScript {
  id = 0;
  script: PhysicsScriptData[] = [];

  static fromBuffer(data: Uint8Array | ArrayBuffer): PhysicsScript {
    return PhysicsScript.fromReader(new BinaryReader(data));
  }

  /** Parse from a positioned reader. Lets callers verify exact EOF consumption. */
  static fromReader(reader: BinaryReader): PhysicsScript {
    const script = new PhysicsScript();

    script.id = reader.ReadUint32();
    const count = reader.ReadUint32();
    for (let i = 0; i < count; i++) {
      const startTime = reader.ReadDouble();
      const hook = readAnimationHook(reader);
      script.script.push({ startTime, hook });
    }

    return script;
  }
}
