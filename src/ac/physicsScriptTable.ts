import BinaryReader from "../BinaryReader.js";

/**
 * One intensity variant inside a `PhysicsScriptTable` entry: when the entry
 * is selected at intensity `mod`, this variant's script plays.
 */
export interface ScriptAndModData {
  /** Minimum intensity this variant covers (selection: greatest `mod` ≤ requested). */
  mod: number;
  /** PhysicsScript (0x33) file id. */
  physicsScriptId: number;
}

/**
 * Client portal-DAT `PhysicsScriptTable` (0x34) — TypeScript parser.
 *
 * Maps a `PlayScript` enum value (from a weenie's
 * `PropertyDataId.PhysicsScript`, e.g. 0x42) to one or more intensity
 * variants of a `PhysicsScript`. See `research/particle-effects.md`.
 *
 * Layout: `u32 id`, `u32 count`, then
 * `count × { u32 playScript, u32 variantCount, variantCount × { f32 mod, u32 physicsScriptId } }`.
 */
export class PhysicsScriptTable {
  id = 0;
  /** PlayScript key -> intensity variants, in file order. */
  scripts: Map<number, ScriptAndModData[]> = new Map();

  static fromBuffer(data: Uint8Array | ArrayBuffer): PhysicsScriptTable {
    return PhysicsScriptTable.fromReader(new BinaryReader(data));
  }

  /** Parse from a positioned reader. Lets callers verify exact EOF consumption. */
  static fromReader(reader: BinaryReader): PhysicsScriptTable {
    const table = new PhysicsScriptTable();

    table.id = reader.ReadUint32();
    const count = reader.ReadUint32();
    for (let i = 0; i < count; i++) {
      const playScript = reader.ReadUint32();
      const variantCount = reader.ReadUint32();
      const variants: ScriptAndModData[] = [];
      for (let j = 0; j < variantCount; j++) {
        variants.push({
          mod: reader.ReadSingle(),
          physicsScriptId: reader.ReadUint32(),
        });
      }
      table.scripts.set(playScript, variants);
    }

    return table;
  }
}

/**
 * Pick the `PhysicsScript` id for a `PlayScript` key at a given intensity:
 * the variant with the greatest `mod` ≤ the requested intensity wins
 * (ACViewer/ParticleViewer rule). `intensity` defaults to 1.0 — every
 * intensity in the current world data is 1.0. Returns `undefined` when the
 * key is absent or no variant's `mod` is low enough.
 */
export function selectScript(
  table: PhysicsScriptTable,
  playScript: number,
  intensity = 1.0,
): number | undefined {
  const variants = table.scripts.get(playScript);
  if (!variants) return undefined;

  let best: ScriptAndModData | undefined;
  for (const variant of variants) {
    if (variant.mod <= intensity && (best === undefined || variant.mod > best.mod)) {
      best = variant;
    }
  }
  return best?.physicsScriptId;
}
