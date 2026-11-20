import { PHYSICS_STATE_NO_DRAW, resolveInitialNoDraw } from "./physicsState.js";

describe("native AC PhysicsState NoDraw", () => {
  test("uses AC bit 0x20 and lets an authored property override it", () => {
    expect(PHYSICS_STATE_NO_DRAW).toBe(0x20);
    expect(resolveInitialNoDraw(undefined, 0x20)).toBe(true);
    expect(resolveInitialNoDraw(undefined, 0x04)).toBe(false);
    expect(resolveInitialNoDraw(false, 0x20)).toBe(false);
    expect(resolveInitialNoDraw(true, 0)).toBe(true);
  });
});
