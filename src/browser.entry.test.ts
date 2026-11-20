/**
 * Entrypoint boundary tests.
 *
 * These import the SOURCE entrypoints directly (ts-jest compiles them) to guard
 * the split between the browser/universal entry and the Node entry.
 *
 * - `./index.js`      must stay browser-safe: no Node/DAT-traversal exports.
 * - `./node/index.js` must re-export the core plus the Node-only additions.
 */

import * as browserEntry from "./index.js";
import * as nodeEntry from "./node/index.js";
import * as runtimeEntry from "./runtime/index.js";
import * as aceEntry from "./ace/index.js";

const CORE_EXPORTS = [
  "BinaryReader",
  "GfxObj",
  "Setup",
  "parseMultipartMixed",
  "Texture",
] as const;

const NODE_ONLY_EXPORTS = ["DatDatabase", "DatReader", "SeekableFileReader"] as const;

const asRecord = (mod: object): Record<string, unknown> =>
  mod as unknown as Record<string, unknown>;

const browser = asRecord(browserEntry);
const node = asRecord(nodeEntry);

describe("browser entry (src/index.ts)", () => {
  test.each(NODE_ONLY_EXPORTS)("does not export %s", (name) => {
    expect(browser[name]).toBeUndefined();
  });

  test.each(CORE_EXPORTS)("exports core symbol %s", (name) => {
    expect(browser[name]).toBeDefined();
  });
});

describe("node entry (src/node/index.ts)", () => {
  test.each([...NODE_ONLY_EXPORTS, ...CORE_EXPORTS])("exports %s", (name) => {
    expect(node[name]).toBeDefined();
  });
});

describe("optional domain entrypoints", () => {
  test("the root entry stays independent of optional runtime and ACE modules", () => {
    expect(browser["resolveInitialNoDraw"]).toBeUndefined();
    expect(browser["resolveGeneratorSpawns"]).toBeUndefined();
  });

  test("runtime and ACE symbols are opt-in", () => {
    expect(runtimeEntry.resolveInitialNoDraw).toBeDefined();
    expect(runtimeEntry.samplePose).toBeDefined();
    expect(runtimeEntry.generateScenery).toBeDefined();
    expect(runtimeEntry.selectTerrainTextures).toBeDefined();
    expect(aceEntry.resolveGeneratorSpawns).toBeDefined();
    expect(aceEntry.selectInitialEquipment).toBeDefined();
  });
});
