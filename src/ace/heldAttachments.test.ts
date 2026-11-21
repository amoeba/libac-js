import assert from "node:assert/strict";
import { heldPlacement, validateAttachmentFrame } from "./heldAttachments.js";

test("ACE equip locations select authored hand and placement rules", () => {
  for (const mask of [0x100000, 0x1000000, 0x2000000]) {
    assert.deepEqual(heldPlacement(mask, 0, 0), { parentLocation: 1, placementId: 1 });
  }
  assert.deepEqual(heldPlacement(0x200000, 2, 0), { parentLocation: 3, placementId: 6 });
  assert.deepEqual(heldPlacement(0x200000, 0, 0), { parentLocation: 8, placementId: 2 });
  for (const style of [0x10, 0x20]) {
    assert.deepEqual(heldPlacement(0x400000, 0, style), { parentLocation: 2, placementId: 3 });
  }
  assert.deepEqual(heldPlacement(0x400000, 0, 0), { parentLocation: 1, placementId: 1 });
  assert.throws(() => heldPlacement(0x800000, 0, 0), /unsupported/);
  assert.throws(() => heldPlacement(0x300000, 0, 0), /unsupported/);
});

test("held-equipment frames require finite components and a nonzero quaternion", () => {
  const frame = { origin: {x: 1, y: 2, z: 3}, orientation: {x: 0, y: 0, z: 0, w: 1} };
  validateAttachmentFrame(frame);
  validateAttachmentFrame({...frame, orientation: {...frame.orientation, w: 2}});
  assert.throws(() => validateAttachmentFrame({...frame, orientation: {...frame.orientation, w: 0}}), /malformed/);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    for (const field of ["x", "y", "z"]) {
      assert.throws(() => validateAttachmentFrame({...frame, origin: {...frame.origin, [field]: invalid}}), /malformed/);
    }
    for (const field of ["x", "y", "z", "w"]) {
      assert.throws(() => validateAttachmentFrame({...frame, orientation: {...frame.orientation, [field]: invalid}}), /malformed/);
    }
  }
});
